import "server-only";

import { collectMacro } from "@/lib/macro";
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
import {
  BRIEFING_TOOL,
  IMPLICATION_ASSET_CLASSES,
  isEconomySection,
  SECTIONS,
  type BriefingPayload,
  type EconomyItem,
  type PoliticsItem,
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
};

function kstDate(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
}

const ASSET_CLASS_SET = new Set<string>(IMPLICATION_ASSET_CLASSES);

type SourceRef = { id: string; source: string; title: string };

function emptyPayload(): BriefingPayload {
  return {
    kr_economy: [],
    global_economy: [],
    kr_politics: [],
    global_politics: [],
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
    const items = (payload[section.key] ?? []) as (
      | EconomyItem
      | PoliticsItem
    )[];

    const cleaned = items.filter(keep).map((item) => ({
      ...item,
      source_name: allowed.get(item.source_url)!.source,
      headline: trimPoint(item.headline ?? ""),
      points: (item.points ?? []).map(trimPoint).filter(Boolean),
    }));

    if (isEconomySection(section.key)) {
      result[section.key as "kr_economy" | "global_economy"] = cleaned.map(
        (item) => {
          const economy = item as EconomyItem;
          return {
            ...economy,
            surprise: trimPoint(economy.surprise ?? ""),
            implications: (economy.implications ?? [])
              .filter((implication) =>
                ASSET_CLASS_SET.has(implication.asset_class),
              )
              .map((implication) => ({
                ...implication,
                note: trimPoint(implication.note ?? ""),
              })),
          };
        },
      );
    } else {
      result[section.key as "kr_politics" | "global_politics"] = cleaned.map(
        (item) => {
          const politics = item as PoliticsItem;
          return {
            ...politics,
            context: trimPoint(politics.context ?? ""),
            outlook: trimPoint(politics.outlook ?? ""),
            investment_note: politics.investment_note?.trim()
              ? trimPoint(politics.investment_note)
              : null,
          };
        },
      );
    }
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
    }),
    tool: BRIEFING_TOOL,
    maxTokens: 12000,
  });

  const allowed = urlMap(allClusters);
  const { payload, dropped } = validate(data, allowed);

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
    (payload[section.key] as (EconomyItem | PoliticsItem)[]).map((item) => ({
      key: item.source_url,
      assignment: item.thread ?? {},
      date,
    })),
  );
  const threadMap = await resolveThreads(assignments);

  // 새로 만든 스레드는 과거 기사를 붙여 타임라인의 시작점을 만든다.
  let created = 0;
  for (const section of SECTIONS) {
    for (const item of payload[section.key] as (EconomyItem | PoliticsItem)[]) {
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
    (payload[section.key] as (EconomyItem | PoliticsItem)[]).flatMap(
      (item) => item.terms ?? [],
    ),
  );
  const cards = await ensureCards(allTerms);
  const termCount = cards.length;

  // position은 섹션별 100번대로 나눈다. 정렬 순서가 곧 섹션 순서다.
  const rows = SECTIONS.flatMap((section, sectionIndex) =>
    (payload[section.key] as (EconomyItem | PoliticsItem)[]).map(
      (item, index) => {
        const economy = isEconomySection(section.key);
        const asEconomy = item as EconomyItem;
        const asPolitics = item as PoliticsItem;

        return {
          briefing_id: briefingId,
          raw_news_id: allowed.get(item.source_url)?.id ?? null,
          section: section.key,
          thread_id: threadMap.get(item.source_url)?.id ?? null,
          terms: item.terms ?? [],
          headline: item.headline,
          points: item.points,
          // fact는 not null이다. 불렛을 줄바꿈으로 이어 붙여 채운다.
          fact: item.points.join("\n"),
          surprise: economy ? asEconomy.surprise : null,
          implication_json: economy
            ? {
                section: section.key,
                implications: asEconomy.implications,
                source_name: item.source_name,
              }
            : {
                section: section.key,
                context: asPolitics.context,
                outlook: asPolitics.outlook,
                investment_note: asPolitics.investment_note,
                source_name: item.source_name,
              },
          source_url: item.source_url,
          position: sectionIndex * 100 + index,
        };
      },
    ),
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
      (payload[section.key] as (EconomyItem | PoliticsItem)[]).flatMap(
        (item) => {
          const thread = threadMap.get(item.source_url);
          return thread ? [{ id: thread.id, date, summary: item.headline }] : [];
        },
      ),
    ),
  );

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
  };
}
