import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Gauge } from "@/lib/macro";

import type { Implication } from "./schema";

/**
 * 화면용 브리핑 조회.
 *
 * 저장된 마크다운(body_md)을 파싱하지 않고 briefing_news를 그대로 읽는다.
 * 마크다운 렌더러 의존성이 없고, 3단 구조를 디자인 규칙대로 직접 그릴 수 있다.
 * body_md는 아카이브·재생성·알림 채널용으로 남겨둔다.
 */

export type BriefingItem = {
  headline: string | null;
  /** 사건의 무대. 화면에서 국내/해외를 나누는 축이다. */
  region: "kr" | "global";
  /** 매체명. 출처 링크에 함께 보여 신뢰 경로를 만든다. */
  sourceName: string | null;
  fact: string;
  surprise: string | null;
  sourceUrl: string;
  part: 1 | 2;
  implications: Implication[];
  context: string | null;
  outlook: string | null;
  investmentNote: string | null;
};

export type BriefingView = {
  id: string;
  date: string;
  gauges: Gauge[];
  failedGauges: string[];
  part1: BriefingItem[];
  part2: BriefingItem[];
};

type NewsRow = {
  headline: string | null;
  fact: string;
  surprise: string | null;
  source_url: string;
  position: number;
  implication_json: {
    part?: number;
    region?: "kr" | "global";
    source_name?: string;
    implications?: Implication[];
    context?: string;
    outlook?: string;
    investment_note?: string | null;
  } | null;
};

function toItem(row: NewsRow): BriefingItem {
  const meta = row.implication_json ?? {};
  return {
    headline: row.headline,
    region: meta.region === "global" ? "global" : "kr",
    sourceName: meta.source_name ?? null,
    fact: row.fact,
    surprise: row.surprise,
    sourceUrl: row.source_url,
    part: meta.part === 2 ? 2 : 1,
    implications: meta.implications ?? [],
    context: meta.context ?? null,
    outlook: meta.outlook ?? null,
    investmentNote: meta.investment_note ?? null,
  };
}

/** date를 주면 그 날짜, 없으면 가장 최근 daily 브리핑. */
export async function loadBriefing(
  supabase: SupabaseClient,
  date?: string,
): Promise<BriefingView | null> {
  let query = supabase
    .from("briefings")
    .select("id, date, temperature_json")
    .eq("type", "daily");

  query = date
    ? query.eq("date", date)
    : query.order("date", { ascending: false }).limit(1);

  const { data: briefing } = await query.maybeSingle();
  if (!briefing) return null;

  const { data: news } = await supabase
    .from("briefing_news")
    .select("headline, fact, surprise, source_url, position, implication_json")
    .eq("briefing_id", briefing.id)
    .order("position");

  const items = ((news ?? []) as NewsRow[]).map(toItem);
  const temperature = briefing.temperature_json as {
    gauges?: Gauge[];
    failed?: string[];
  } | null;

  return {
    id: briefing.id as string,
    date: briefing.date as string,
    gauges: temperature?.gauges ?? [],
    failedGauges: temperature?.failed ?? [],
    part1: items.filter((item) => item.part === 1),
    part2: items.filter((item) => item.part === 2),
  };
}

/** 아카이브 목록. 날짜만 있으면 된다. */
export async function listBriefingDates(
  supabase: SupabaseClient,
  limit = 30,
): Promise<string[]> {
  const { data } = await supabase
    .from("briefings")
    .select("date")
    .eq("type", "daily")
    .order("date", { ascending: false })
    .limit(limit);

  return ((data ?? []) as { date: string }[]).map((row) => row.date);
}
