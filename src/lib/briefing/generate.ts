import "server-only";

import { collectMacro } from "@/lib/macro";
import { fetchArticleTexts } from "@/lib/news/article";
import { selectNews, type Cluster } from "@/lib/news/select";
import { briefingWindow, loadCandidates } from "@/lib/news/window";
import { createAdminClient } from "@/lib/supabase/admin";

import { ensureCards } from "@/lib/concepts/generate";

import { callWithTool, type Usage } from "./anthropic";
import { buildUserMessage, SYSTEM_PROMPT } from "./prompt";
import { renderBriefing } from "./render";
import {
  activeThreads,
  backfillTimeline,
  formatThreads,
  resolveThreads,
  touchThreads,
} from "./threads";
import { refreshBrief } from "./thread-brief";
import { BRIEFING_ASSET_VALUES } from "./asset-classes";
import {
  BRIEFING_TOOL,
  SECTIONS,
  type BriefingItemPayload,
  type BriefingPayload,
} from "./schema";

export type GenerateResult = {
  date: string;
  skipped: boolean;
  bodyMd: string;
  payload: BriefingPayload;
  usage: Usage | null;
  /** 모델이 만들어냈거나 후보에 없던 링크. 비어 있어야 정상이다. */
  droppedUrls: string[];
  briefingId: string | null;
  /** 붙은 이슈 수와 새로 만든 용어 카드 수. 검증용. */
  threads: { total: number; created: number };
  terms: number;
  /** 본문을 가져온 기사 수 / 전체 선별 수. 추출기 건강 신호다. */
  bodies: string;
};

function kstDate(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
}

const ASSET_CLASS_SET = new Set<string>(BRIEFING_ASSET_VALUES);

type SourceRef = { id: string; source: string; title: string };

function emptyPayload(): BriefingPayload {
  return {
    kr_economy: [],
    global_economy: [],
    kr_politics: [],
    global_politics: [],
    asset_outlook: [],
    top: { source_url: "", stat: null },
  };
}

/** 끝 온점을 떼어낸다. 개조식은 프롬프트로만 강제되지 않는다. */
function trimPoint(text: string) {
  return text.trim().replace(/\.$/, "");
}

/**
 * 모델 출력 검증.
 * - 후보에 없던 url은 지어낸 것이므로 그 항목을 통째로 버린다.
 *   출처 링크는 해석을 검증할 유일한 경로라 틀린 링크를 실으면 안 된다.
 * - 매체명은 모델이 쓴 것을 버리고 후보의 값으로 덮어쓴다.
 *   첫 실행에서 "경향신문"을 "경향신점"으로 쓴 적이 있다. 받아쓸 이유가 없는 값이다.
 * - 같은 기사가 두 섹션에 중복해 실리는 것을 막는다.
 */
function validate(
  payload: BriefingPayload,
  allowed: Map<string, SourceRef>,
): { payload: BriefingPayload; dropped: string[] } {
  const dropped: string[] = [];
  const seen = new Set<string>();
  const result = emptyPayload();

  const keep = (item: { source_url: string }): boolean => {
    if (!allowed.has(item.source_url)) {
      dropped.push(item.source_url);
      return false;
    }
    if (seen.has(item.source_url)) return false;
    seen.add(item.source_url);
    return true;
  };

  for (const section of SECTIONS) {
    const items = (payload[section.key] ?? []) as BriefingItemPayload[];

    // 경제·정치 구분 없이 같은 골격이다 (2026-08-26 통합).
    result[section.key] = items.filter(keep).map((item) => ({
      ...item,
      source_name: allowed.get(item.source_url)!.source,
      headline: trimPoint(item.headline ?? ""),
      // 내용은 문장체라 온점을 떼지 않는다. 인사이트만 개조식 정리.
      body: (item.body ?? []).map((text) => text.trim()).filter(Boolean),
      insights: (item.insights ?? []).map(trimPoint).filter(Boolean),
    }));
  }

  // 자산군 종합은 브리핑 단위라 섹션 루프 밖에서 정리한다.
  // 같은 자산군이 두 번 오면 첫 것만 남긴다. 모순을 화면에 싣지 않는다.
  const usedClasses = new Set<string>();
  result.asset_outlook = (payload.asset_outlook ?? [])
    .filter((item) => ASSET_CLASS_SET.has(item.asset_class))
    .filter((item) => {
      if (usedClasses.has(item.asset_class)) return false;
      usedClasses.add(item.asset_class);
      return true;
    })
    .map((item) => ({
      ...item,
      note: trimPoint(item.note ?? ""),
      // 근거는 실제로 실린 기사만 남긴다.
      evidence: (item.evidence ?? []).filter((url) => seen.has(url)),
    }))
    .filter((item) => item.evidence.length > 0);

  // 오늘의 톱은 실제 실린 기사여야 한다. 아니면 첫 경제 항목으로 대체한다.
  // 대체됐으면 stat도 버린다. 다른 기사의 숫자를 달고 나가면 안 된다.
  const firstItem =
    result.global_economy[0] ??
    result.kr_economy[0] ??
    result.kr_politics[0] ??
    result.global_politics[0] ??
    null;
  const pickedUrl = payload.top?.source_url;
  if (pickedUrl && seen.has(pickedUrl)) {
    result.top = { source_url: pickedUrl, stat: payload.top?.stat ?? null };
  } else {
    result.top = { source_url: firstItem?.source_url ?? "", stat: null };
  }

  return { payload: result, dropped };
}

function urlMap(clusters: Cluster[]): Map<string, SourceRef> {
  const map = new Map<string, SourceRef>();
  for (const cluster of clusters) {
    for (const item of [cluster.lead_item, ...cluster.others]) {
      map.set(item.url, {
        id: item.id,
        source: item.source,
        title: item.title,
      });
    }
  }
  return map;
}

export type GenerateOptions = {
  /** true면 모델만 부르고 저장하지 않는다. 프롬프트 튜닝용. */
  dryRun?: boolean;
  /** 이미 오늘 브리핑이 있어도 다시 만든다. */
  force?: boolean;
};

export async function generateBriefing(
  options: GenerateOptions = {},
): Promise<GenerateResult> {
  const supabase = createAdminClient();
  const date = kstDate();

  // 멱등 재시도: 같은 날짜의 daily 브리핑은 하나만 (ARCHITECTURE §3-5).
  if (!options.dryRun && !options.force) {
    const { data: existing } = await supabase
      .from("briefings")
      .select("id, body_md")
      .eq("date", date)
      .eq("type", "daily")
      .maybeSingle();

    if (existing) {
      return {
        date,
        skipped: true,
        bodyMd: existing.body_md as string,
        payload: emptyPayload(),
        usage: null,
        droppedUrls: [],
        briefingId: existing.id as string,
        threads: { total: 0, created: 0 },
        terms: 0,
        bodies: "0/0",
      };
    }
  }

  const [temperature, window] = await Promise.all([
    collectMacro(),
    // 기준은 오늘 이전 브리핑이다. 오늘 것을 포함하면 재생성 시 구간이 빈다.
    briefingWindow(date),
  ]);

  const candidates = await loadCandidates(window);
  const selection = selectNews(candidates);
  const openThreads = await activeThreads(supabase);
  const allClusters = [
    ...selection.krEconomy,
    ...selection.globalEconomy,
    ...selection.krPolitics,
    ...selection.globalPolitics,
  ];

  if (allClusters.length === 0) {
    throw new Error("뉴스 후보가 없다. 수집이 먼저 돌았는지 확인할 것.");
  }

  // 선별된 기사에 한해 본문을 일시 수집한다. 모델 재료로만 쓰고 저장하지 않는다
  // (CLAUDE.md §2-3 개정, 2026-08-26: 표시·저장 금지 유지, 생성 시점 수집 허용).
  // 실패한 기사는 리드문 폴백이라 브리핑이 죽는 일은 없다.
  const bodies = await fetchArticleTexts(
    allClusters.map((cluster) => cluster.lead_item.url),
  );

  const { data, usage } = await callWithTool<BriefingPayload>({
    system: SYSTEM_PROMPT,
    userMessage: buildUserMessage({
      date,
      gauges: temperature.gauges,
      failedGauges: temperature.failed,
      threads: formatThreads(openThreads),
      krEconomy: selection.krEconomy,
      globalEconomy: selection.globalEconomy,
      krPolitics: selection.krPolitics,
      globalPolitics: selection.globalPolitics,
      bodies,
    }),
    tool: BRIEFING_TOOL,
    maxTokens: 12000,
  });

  const allowed = urlMap(allClusters);
  const { payload, dropped } = validate(data, allowed);

  // 같은 사건을 다룬 다른 매체 기사. 카드의 "함께 보도"가 된다.
  // 리드문만으로 부족할 때 독자가 넓혀 볼 경로다. 제목+링크만 싣는다 (§2-3).
  const clusterOf = new Map<string, Cluster>();
  for (const cluster of allClusters) {
    for (const entry of [cluster.lead_item, ...cluster.others]) {
      clusterOf.set(entry.url, cluster);
    }
  }
  const relatedOf = (url: string) => {
    const cluster = clusterOf.get(url);
    if (!cluster) return [];
    return [cluster.lead_item, ...cluster.others]
      .filter((entry) => entry.url !== url)
      .slice(0, 3)
      .map((entry) => ({
        title: entry.title,
        source: entry.source,
        url: entry.url,
      }));
  };

  const bodyMd = renderBriefing({
    date,
    gauges: temperature.gauges,
    failedGauges: temperature.failed,
    payload,
  });

  if (options.dryRun) {
    return {
      date,
      skipped: false,
      bodyMd,
      payload,
      usage,
      droppedUrls: dropped,
      briefingId: null,
      threads: { total: 0, created: 0 },
      terms: 0,
      bodies: `${bodies.size}/${allClusters.length}`,
    };
  }

  const row = {
    date,
    type: "daily" as const,
    body_md: bodyMd,
    temperature_json: {
      gauges: temperature.gauges,
      failed: temperature.failed,
    },
    asset_outlook: payload.asset_outlook,
  };

  // daily의 유일 제약은 부분 인덱스(where type='daily')라 upsert의 onConflict로
  // 지정할 수 없다. 있으면 update, 없으면 insert로 직접 처리한다.
  const { data: current } = await supabase
    .from("briefings")
    .select("id")
    .eq("date", date)
    .eq("type", "daily")
    .maybeSingle();

  const saved = current
    ? await supabase
        .from("briefings")
        .update(row)
        .eq("id", current.id)
        .select("id")
        .single()
    : await supabase.from("briefings").insert(row).select("id").single();

  if (saved.error) throw new Error(`브리핑 저장 실패: ${saved.error.message}`);
  const briefingId = saved.data.id as string;

  // 재생성 시 이전 뉴스 행을 지우고 새로 넣는다. position unique 충돌을 피한다.
  await supabase.from("briefing_news").delete().eq("briefing_id", briefingId);

  // 이슈 배정을 실제 스레드 id로 바꾼다. 없으면 만들고, 비슷하면 기존 것에 붙인다.
  const knownIds = new Set(openThreads.map((thread) => thread.id));
  const assignments = SECTIONS.flatMap((section) =>
    (payload[section.key] as BriefingItemPayload[]).map((item) => ({
      key: item.source_url,
      assignment: item.thread ?? {},
      date,
    })),
  );
  const threadMap = await resolveThreads(assignments);

  // 새로 만든 스레드는 과거 기사를 붙여 타임라인의 시작점을 만든다.
  let created = 0;
  for (const section of SECTIONS) {
    for (const item of payload[section.key] as BriefingItemPayload[]) {
      const thread = threadMap.get(item.source_url);
      if (!thread || knownIds.has(thread.id)) continue;
      knownIds.add(thread.id);
      created += 1;
      // 헤드라인은 모델이 새로 쓴 문장이라 원문 어휘와 다르다.
      // 과거 기사를 찾을 때는 실제 기사 제목으로 맞춰야 걸린다.
      const seed = allowed.get(item.source_url)?.title ?? item.headline;
      await backfillTimeline(thread.id, seed);
    }
  }

  const threadStats = { total: threadMap.size, created };

  // 용어 카드를 확보한다. 없는 것만 한 번의 호출로 만든다.
  const allTerms = SECTIONS.flatMap((section) =>
    (payload[section.key] as BriefingItemPayload[]).flatMap(
      (item) => item.terms ?? [],
    ),
  );
  const cards = await ensureCards(allTerms);
  const termCount = cards.length;

  // position은 섹션별 100번대로 나눈다. 정렬 순서가 곧 섹션 순서다.
  const rows = SECTIONS.flatMap((section, sectionIndex) =>
    (payload[section.key] as BriefingItemPayload[]).map((item, index) => ({
      briefing_id: briefingId,
      raw_news_id: allowed.get(item.source_url)?.id ?? null,
      section: section.key,
      thread_id: threadMap.get(item.source_url)?.id ?? null,
      terms: item.terms ?? [],
      headline: item.headline,
      // points 컬럼에는 인사이트를 둔다 (2026-08-26 내용·인사이트 개편).
      points: item.insights,
      // fact는 not null이다. 내용 문단을 이어 붙여 채운다.
      fact: item.body.join("\n\n"),
      surprise: null,
      implication_json: {
        section: section.key,
        source_name: item.source_name,
        // 내용은 여기. 옛 행(body 없음)은 화면이 points 불렛으로 폴백한다.
        body: item.body,
        // 오늘의 톱 표시. 별도 컬럼 대신 여기 둔다. 하루 한 건뿐이다.
        ...(payload.top.source_url === item.source_url
          ? { top: true, top_stat: payload.top.stat }
          : {}),
        related: relatedOf(item.source_url),
      },
      source_url: item.source_url,
      position: sectionIndex * 100 + index,
    })),
  );

  if (rows.length > 0) {
    const { error: newsError } = await supabase
      .from("briefing_news")
      .insert(rows);
    if (newsError)
      throw new Error(`브리핑 뉴스 저장 실패: ${newsError.message}`);
  }

  // 전개 횟수와 최근 상태를 갱신한다. 요약은 그 이슈의 첫 항목 헤드라인을 쓴다.
  await touchThreads(
    SECTIONS.flatMap((section) =>
      (payload[section.key] as BriefingItemPayload[]).flatMap(
        (item) => {
          const thread = threadMap.get(item.source_url);
          return thread ? [{ id: thread.id, date, summary: item.headline }] : [];
        },
      ),
    ),
  );

  // 오늘 전개가 붙은 이슈만 브리프를 다시 쓴다. 하루 3~5개다.
  // 이슈 화면에 서사가 없으면 기사 목록일 뿐이다.
  const touched = new Map<string, string>();
  for (const thread of threadMap.values()) {
    if (!touched.has(thread.id)) touched.set(thread.id, thread.title);
  }
  for (const [id, title] of touched) {
    await refreshBrief(id, title, date);
  }

  return {
    date,
    skipped: false,
    bodyMd,
    payload,
    usage,
    droppedUrls: dropped,
    briefingId,
    threads: threadStats,
    terms: termCount,
    bodies: `${bodies.size}/${allClusters.length}`,
  };
}
