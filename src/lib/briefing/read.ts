import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Gauge } from "@/lib/macro";

import { SECTIONS, type Implication, type SectionKey } from "./schema";

/**
 * 화면용 브리핑 조회.
 *
 * 저장된 마크다운(body_md)을 파싱하지 않고 briefing_news를 그대로 읽는다.
 * 마크다운 렌더러 의존성이 없고, 구조를 디자인 규칙대로 직접 그릴 수 있다.
 * body_md는 아카이브와 알림 채널용으로 남겨둔다.
 */

export type BriefingItem = {
  headline: string | null;
  /** 개조식 불렛. 이것이 본문이다. */
  points: string[];
  section: SectionKey;
  sourceUrl: string;
  sourceName: string | null;
  /** 경제 섹션 */
  surprise: string | null;
  implications: Implication[];
  /** 정치·사회 섹션 */
  context: string | null;
  outlook: string | null;
  investmentNote: string | null;
};

export type BriefingSection = {
  key: SectionKey;
  label: string;
  items: BriefingItem[];
};

export type BriefingView = {
  id: string;
  date: string;
  gauges: Gauge[];
  failedGauges: string[];
  sections: BriefingSection[];
  /** 전체 기사 수. */
  count: number;
};

type NewsRow = {
  headline: string | null;
  points: string[] | null;
  section: string | null;
  fact: string;
  surprise: string | null;
  source_url: string;
  position: number;
  implication_json: {
    section?: string;
    part?: number;
    region?: "kr" | "global";
    source_name?: string;
    implications?: Implication[];
    context?: string;
    outlook?: string;
    investment_note?: string | null;
  } | null;
};

const SECTION_KEYS = new Set<string>(SECTIONS.map((section) => section.key));

/** 0008 이전 행은 section이 없다. part와 region으로 역산한다. */
function sectionOf(row: NewsRow): SectionKey {
  const stored = row.section ?? row.implication_json?.section;
  if (stored && SECTION_KEYS.has(stored)) return stored as SectionKey;

  const economy = (row.implication_json?.part ?? 1) === 1;
  const global = row.implication_json?.region === "global";
  if (economy) return global ? "global_economy" : "kr_economy";
  return global ? "global_politics" : "kr_politics";
}

function toItem(row: NewsRow): BriefingItem {
  const meta = row.implication_json ?? {};
  // points가 없는 옛 행은 fact를 줄 단위로 쪼갠다.
  const points =
    row.points && row.points.length > 0
      ? row.points
      : row.fact.split("\n").filter(Boolean);

  return {
    headline: row.headline,
    points,
    section: sectionOf(row),
    sourceUrl: row.source_url,
    sourceName: meta.source_name ?? null,
    surprise: row.surprise,
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
    .select(
      "headline, points, section, fact, surprise, source_url, position, implication_json",
    )
    .eq("briefing_id", briefing.id)
    .order("position");

  const items = ((news ?? []) as NewsRow[]).map(toItem);
  const temperature = briefing.temperature_json as {
    gauges?: Gauge[];
    failed?: string[];
  } | null;

  const sections = SECTIONS.map((section) => ({
    key: section.key,
    label: section.label,
    items: items.filter((item) => item.section === section.key),
  })).filter((section) => section.items.length > 0);

  return {
    id: briefing.id as string,
    date: briefing.date as string,
    gauges: temperature?.gauges ?? [],
    failedGauges: temperature?.failed ?? [],
    sections,
    count: items.length,
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
