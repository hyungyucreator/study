import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

import type { Candidate } from "./select";

/**
 * 브리핑이 다룰 뉴스 구간 (PRODUCT.md §4-A).
 * 직전 브리핑 생성 시각 이후 발행분만. 한국시간 0시로 자르면
 * 간밤 미국장 뉴스가 통째로 빠지므로 그렇게 하지 않는다.
 */

/** 직전 브리핑이 없을 때 되짚어볼 시간. */
const DEFAULT_LOOKBACK_HOURS = 24;

export type Window = { since: string; until: string };

export async function briefingWindow(): Promise<Window> {
  const supabase = createAdminClient();
  const until = new Date().toISOString();

  const { data } = await supabase
    .from("briefings")
    .select("created_at")
    .eq("type", "daily")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const since =
    (data?.created_at as string | undefined) ??
    new Date(Date.now() - DEFAULT_LOOKBACK_HOURS * 3600000).toISOString();

  return { since, until };
}

/** 구간 안에 발행된 기사를 가져온다. 리드문이 없는 기사는 제외한다. */
export async function loadCandidates(window: Window): Promise<Candidate[]> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("raw_news")
    .select("id, source, url, title, lead, published_at, category")
    .gte("published_at", window.since)
    .lte("published_at", window.until)
    .order("published_at", { ascending: false })
    .limit(1000);

  if (error) throw new Error(`raw_news 조회 실패: ${error.message}`);

  // 리드문 없이는 사실·맥락을 세울 수 없다 (PRODUCT §4-A).
  return ((data ?? []) as Candidate[]).filter(
    (item) => (item.lead?.length ?? 0) >= 40,
  );
}
