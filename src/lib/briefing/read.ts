import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Gauge } from "@/lib/macro";

import type { AssetOutlook } from "./asset-classes";
import { SECTIONS, type SectionKey, type TopStat } from "./schema";

/**
 * 화면용 브리핑 조회.
 *
 * 저장된 마크다운(body_md)을 파싱하지 않고 briefing_news를 그대로 읽는다.
 * 마크다운 렌더러 의존성이 없고, 구조를 디자인 규칙대로 직접 그릴 수 있다.
 * body_md는 아카이브와 알림 채널용으로 남겨둔다.
 */

export type ItemThread = {
  id: string;
  title: string;
  entries: number;
};

export type TermCard = {
  term: string;
  summary: string | null;
};

/** 같은 사건을 다룬 다른 매체 기사. */
export type RelatedNews = {
  title: string;
  source: string;
  url: string;
};

export type BriefingItem = {
  headline: string | null;
  /** 내용. 문장체 문단 (2026-08-26 개편). 옛 브리핑은 비어 있다. */
  body: string[];
  /** 인사이트 불렛. 옛 브리핑에서는 개조식 본문이 여기 온다. */
  points: string[];
  section: SectionKey;
  sourceUrl: string;
  sourceName: string | null;
  /** 경제 섹션 */
  surprise: string | null;
  /** 정치·사회 섹션 */
  context: string | null;
  outlook: string | null;
  investmentNote: string | null;
  /** 이 항목이 속한 이슈. 브리핑에 기억을 붙이는 장치다. */
  thread: ItemThread | null;
  /** 본문에 밑줄을 그을 용어와 그 설명. */
  cards: TermCard[];
  /** 오늘의 톱 여부. 하루 한 건. */
  top: boolean;
  /** 톱을 대표하는 숫자. 톱이 아니면 null. */
  stat: TopStat | null;
  /** 함께 보도한 다른 매체 기사. */
  related: RelatedNews[];
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
  /** 브리핑 전체를 종합한 자산군 방향. */
  outlook: AssetOutlook[];
  /** 전체 기사 수. */
  count: number;
  /** 오늘 움직인 이슈. 전개가 2회 이상인 것부터. */
  threads: ItemThread[];
  /** 오늘의 톱. 옛 브리핑에는 없다. */
  top: BriefingItem | null;
};

type NewsRow = {
  headline: string | null;
  points: string[] | null;
  section: string | null;
  thread_id: string | null;
  terms: string[] | null;
  fact: string;
  surprise: string | null;
  source_url: string;
  position: number;
  implication_json: {
    section?: string;
    part?: number;
    region?: "kr" | "global";
    source_name?: string;
    context?: string;
    outlook?: string;
    investment_note?: string | null;
    top?: boolean;
    top_stat?: TopStat | null;
    related?: RelatedNews[];
    body?: string[];
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

function toItem(
  row: NewsRow,
  threads: Map<string, ItemThread>,
  cards: Map<string, TermCard>,
): BriefingItem {
  const meta = row.implication_json ?? {};
  // points가 없는 옛 행은 fact를 줄 단위로 쪼갠다.
  const points =
    row.points && row.points.length > 0
      ? row.points
      : row.fact.split("\n").filter(Boolean);

  return {
    headline: row.headline,
    body: Array.isArray(meta.body) ? meta.body.filter(Boolean) : [],
    points,
    section: sectionOf(row),
    sourceUrl: row.source_url,
    sourceName: meta.source_name ?? null,
    surprise: row.surprise,
    context: meta.context ?? null,
    outlook: meta.outlook ?? null,
    investmentNote: meta.investment_note ?? null,
    thread: row.thread_id ? (threads.get(row.thread_id) ?? null) : null,
    // 카드가 없는 용어는 밑줄을 긋지 않는다. 눌러도 보여줄 게 없다.
    cards: (row.terms ?? [])
      .map((term) => cards.get(term))
      .filter((card): card is TermCard => card !== undefined),
    top: meta.top === true,
    stat: meta.top === true ? (meta.top_stat ?? null) : null,
    related: Array.isArray(meta.related) ? meta.related.slice(0, 3) : [],
  };
}

/** date를 주면 그 날짜, 없으면 가장 최근 daily 브리핑. */
export async function loadBriefing(
  supabase: SupabaseClient,
  date?: string,
): Promise<BriefingView | null> {
  let query = supabase
    .from("briefings")
    .select("id, date, temperature_json, asset_outlook")
    .eq("type", "daily");

  query = date
    ? query.eq("date", date)
    : query.order("date", { ascending: false }).limit(1);

  const { data: briefing } = await query.maybeSingle();
  if (!briefing) return null;

  const { data: news } = await supabase
    .from("briefing_news")
    .select(
      "headline, points, section, thread_id, terms, fact, surprise, source_url, position, implication_json",
    )
    .eq("briefing_id", briefing.id)
    .order("position");

  const rows = (news ?? []) as unknown as NewsRow[];

  // 이슈와 용어 카드를 한 번에 당겨온다.
  const threadIds = [
    ...new Set(rows.map((row) => row.thread_id).filter(Boolean)),
  ] as string[];
  const termList = [...new Set(rows.flatMap((row) => row.terms ?? []))];

  const [threadRows, cardRows] = await Promise.all([
    threadIds.length > 0
      ? supabase
          .from("threads")
          .select("id, title, entries")
          .in("id", threadIds)
      : Promise.resolve({ data: [] }),
    termList.length > 0
      ? supabase
          .from("concept_cards")
          .select("term, summary")
          .in("term", termList)
      : Promise.resolve({ data: [] }),
  ]);

  const threads = new Map(
    ((threadRows.data ?? []) as ItemThread[]).map((thread) => [
      thread.id,
      thread,
    ]),
  );
  const cards = new Map(
    ((cardRows.data ?? []) as TermCard[]).map((card) => [card.term, card]),
  );

  const items = rows.map((row) => toItem(row, threads, cards));
  const temperature = briefing.temperature_json as {
    gauges?: Gauge[];
    failed?: string[];
  } | null;

  const sections = SECTIONS.map((section) => ({
    key: section.key,
    label: section.label,
    items: items.filter((item) => item.section === section.key),
  })).filter((section) => section.items.length > 0);

  // 오늘 여러 건이 붙었거나, 며칠에 걸쳐 이어진 이슈.
  // 전개 횟수만 보면 첫날에는 아무것도 안 보인다.
  const todayCount = new Map<string, number>();
  for (const item of items) {
    if (!item.thread) continue;
    todayCount.set(
      item.thread.id,
      (todayCount.get(item.thread.id) ?? 0) + 1,
    );
  }

  const todayThreads = [...threads.values()]
    .filter(
      (thread) =>
        thread.entries >= 2 || (todayCount.get(thread.id) ?? 0) >= 2,
    )
    .sort(
      (a, b) =>
        b.entries - a.entries ||
        (todayCount.get(b.id) ?? 0) - (todayCount.get(a.id) ?? 0),
    );

  return {
    id: briefing.id as string,
    date: briefing.date as string,
    gauges: temperature?.gauges ?? [],
    failedGauges: temperature?.failed ?? [],
    sections,
    outlook: (briefing.asset_outlook ?? []) as AssetOutlook[],
    count: items.length,
    threads: todayThreads,
    top: items.find((item) => item.top) ?? null,
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
