import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

import { FEEDS } from "./feeds";
import { fetchFeed, type NewsItem } from "./rss";

/**
 * RSS 수집 → raw_news 저장 (ARCHITECTURE.md §3-3: 가공 전 원본 저장).
 * 저장 범위는 제목 + 리드문 + 링크 + 메타데이터뿐이다.
 */

/** 이보다 오래된 기사는 담지 않는다. 하루 한 번 도는 것을 전제로 여유를 둔 값. */
const WINDOW_HOURS = 36;

/** 소스가 이 건수 미만이면 피드가 멈췄다고 본다 (§3-4 헬스체크). */
const MIN_PER_SOURCE = 1;

export type SourceReport = {
  source: string;
  fetched: number;
  /** 수집 창 안에 든 건수. */
  recent: number;
  ok: boolean;
};

export type CollectResult = {
  /** 새로 저장된 건수 (중복 제외). */
  inserted: number;
  /** 수집 창 안에서 중복 제거 후 남은 건수. */
  candidates: number;
  sources: SourceReport[];
  /** 건수 미달이거나 응답이 없던 소스. */
  unhealthy: string[];
};

export async function collectNews(): Promise<CollectResult> {
  const cutoff = Date.now() - WINDOW_HOURS * 60 * 60 * 1000;

  const results = await Promise.all(
    FEEDS.map(async (feed) => ({ feed, items: await fetchFeed(feed) })),
  );

  const sources: SourceReport[] = [];
  const byUrl = new Map<string, NewsItem>();

  for (const { feed, items } of results) {
    const recent = items.filter(
      (item) => new Date(item.published_at).getTime() >= cutoff,
    );

    for (const item of recent) {
      // 같은 기사가 여러 피드에 실리면 먼저 만난 소스로 남긴다.
      if (!byUrl.has(item.url)) byUrl.set(item.url, item);
    }

    sources.push({
      source: feed.source,
      fetched: items.length,
      recent: recent.length,
      ok: recent.length >= MIN_PER_SOURCE,
    });
  }

  const candidates = [...byUrl.values()];

  let inserted = 0;
  if (candidates.length > 0) {
    const supabase = createAdminClient();
    // url unique. 이미 있는 기사는 건너뛴다 (멱등 재시도, §3-5).
    const { data, error } = await supabase
      .from("raw_news")
      .upsert(candidates, { onConflict: "url", ignoreDuplicates: true })
      .select("id");

    if (error) throw new Error(`raw_news 저장 실패: ${error.message}`);
    inserted = data?.length ?? 0;
  }

  return {
    inserted,
    candidates: candidates.length,
    sources,
    unhealthy: sources.filter((item) => !item.ok).map((item) => item.source),
  };
}
