import "server-only";

import { collectMacro } from "@/lib/macro";
import { selectNews, type Cluster } from "@/lib/news/select";
import { briefingWindow, loadCandidates } from "@/lib/news/window";
import { createAdminClient } from "@/lib/supabase/admin";

import { callWithTool, type Usage } from "./anthropic";
import { buildUserMessage, SYSTEM_PROMPT } from "./prompt";
import { renderBriefing } from "./render";
import {
  BRIEFING_TOOL,
  IMPLICATION_ASSET_CLASSES,
  type BriefingPayload,
  type Part1Item,
  type Part2Item,
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
};

function kstDate(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
}

const ASSET_CLASS_SET = new Set<string>(IMPLICATION_ASSET_CLASSES);

type SourceRef = { id: string; source: string };

/**
 * 모델 출력 검증.
 * - 후보에 없던 url은 지어낸 것이므로 그 항목을 통째로 버린다.
 *   출처 링크는 해석을 검증할 유일한 경로라 틀린 링크를 실으면 안 된다.
 * - 매체명은 모델이 쓴 것을 버리고 후보의 값으로 덮어쓴다.
 *   첫 실행에서 "경향신문"을 "경향신점"으로 쓴 적이 있다. 받아쓸 이유가 없는 값이다.
 */
function validate(
  payload: BriefingPayload,
  allowed: Map<string, SourceRef>,
): { payload: BriefingPayload; dropped: string[] } {
  const dropped: string[] = [];

  const keep = <T extends { source_url: string }>(item: T): boolean => {
    if (allowed.has(item.source_url)) return true;
    dropped.push(item.source_url);
    return false;
  };

  const part1: Part1Item[] = (payload.part1 ?? []).filter(keep).map((item) => ({
    ...item,
    source_name: allowed.get(item.source_url)!.source,
    implications: (item.implications ?? []).filter((implication) =>
      ASSET_CLASS_SET.has(implication.asset_class),
    ),
  }));

  const part2: Part2Item[] = (payload.part2 ?? []).filter(keep).map((item) => ({
    ...item,
    source_name: allowed.get(item.source_url)!.source,
    investment_note: item.investment_note?.trim() ? item.investment_note : null,
  }));

  return { payload: { part1, part2 }, dropped };
}

function urlMap(clusters: Cluster[]): Map<string, SourceRef> {
  const map = new Map<string, SourceRef>();
  for (const cluster of clusters) {
    for (const item of [cluster.lead_item, ...cluster.others]) {
      map.set(item.url, { id: item.id, source: item.source });
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
        payload: { part1: [], part2: [] },
        usage: null,
        droppedUrls: [],
        briefingId: existing.id as string,
      };
    }
  }

  const [temperature, window] = await Promise.all([
    collectMacro(),
    briefingWindow(),
  ]);

  const candidates = await loadCandidates(window);
  const selection = selectNews(candidates);

  if (selection.part1.length === 0 && selection.part2.length === 0) {
    throw new Error("뉴스 후보가 없다. 수집이 먼저 돌았는지 확인할 것.");
  }

  const { data, usage } = await callWithTool<BriefingPayload>({
    system: SYSTEM_PROMPT,
    userMessage: buildUserMessage({
      date,
      gauges: temperature.gauges,
      failedGauges: temperature.failed,
      part1: selection.part1,
      part2: selection.part2,
    }),
    tool: BRIEFING_TOOL,
  });

  const allowed = urlMap([...selection.part1, ...selection.part2]);
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

  const rows = [
    ...payload.part1.map((item, index) => ({
      briefing_id: briefingId,
      raw_news_id: allowed.get(item.source_url)?.id ?? null,
      fact: item.fact,
      surprise: item.surprise,
      implication_json: { part: 1, implications: item.implications },
      source_url: item.source_url,
      position: index,
    })),
    ...payload.part2.map((item, index) => ({
      briefing_id: briefingId,
      raw_news_id: allowed.get(item.source_url)?.id ?? null,
      fact: item.fact,
      surprise: null,
      implication_json: {
        part: 2,
        context: item.context,
        outlook: item.outlook,
        investment_note: item.investment_note,
      },
      source_url: item.source_url,
      position: 100 + index,
    })),
  ];

  if (rows.length > 0) {
    const { error: newsError } = await supabase
      .from("briefing_news")
      .insert(rows);
    if (newsError) throw new Error(`브리핑 뉴스 저장 실패: ${newsError.message}`);
  }

  return {
    date,
    skipped: false,
    bodyMd,
    payload,
    usage,
    droppedUrls: dropped,
    briefingId,
  };
}
