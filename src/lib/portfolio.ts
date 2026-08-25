import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  ASSET_CLASSES,
  bookValue,
  marketValue,
  toKrw,
  type AssetClass,
  type Holding,
} from "@/lib/assets";
import { getQuotes, type Quote } from "@/lib/quotes";

export type ClassSlice = {
  value: AssetClass;
  label: string;
  krw: number;
  weight: number;
};

export type Portfolio = {
  holdings: Holding[];
  quotes: Map<string, Quote>;
  usdKrw: number | null;
  /** 원화 환산 평가액 합계. */
  totalKrw: number;
  /** 원화 환산 매입원가 합계. */
  bookKrw: number;
  profitKrw: number;
  /** 매입원가가 0이면 수익률이 정의되지 않는다. */
  rate: number | null;
  byClass: ClassSlice[];
  /** 시세·환율이 없어 합계에서 뺀 종목 수. */
  excluded: number;
  missing: string[];
  /** 관측치 중 가장 오래된 시각. 이 화면 숫자의 신뢰 한계다. */
  asOf: string | undefined;
};

/** 보유 자산에 시세를 붙여 원화 기준으로 집계한다. */
export async function loadPortfolio(
  supabase: SupabaseClient,
): Promise<Portfolio> {
  const { data } = await supabase
    .from("holdings")
    .select(
      "id, source, symbol, name, asset_class, is_etf, qty, avg_price, currency, updated_at",
    )
    .order("asset_class")
    .order("name");

  const holdings = (data ?? []) as Holding[];
  const { quotes, fx, missing } = await getQuotes(supabase, holdings);
  const usdKrw = fx?.usdKrw ?? null;

  let totalKrw = 0;
  let bookKrw = 0;
  let excluded = 0;
  const classTotals = new Map<AssetClass, number>();

  for (const holding of holdings) {
    const price = quotes.get(holding.symbol)?.price;
    if (price === undefined) {
      excluded += 1;
      continue;
    }
    const mv = toKrw(marketValue(holding, price), holding.currency, usdKrw);
    const bv = toKrw(bookValue(holding), holding.currency, usdKrw);
    if (mv === null || bv === null) {
      excluded += 1;
      continue;
    }
    totalKrw += mv;
    bookKrw += bv;
    classTotals.set(
      holding.asset_class,
      (classTotals.get(holding.asset_class) ?? 0) + mv,
    );
  }

  const byClass: ClassSlice[] = ASSET_CLASSES.map((item) => ({
    value: item.value,
    label: item.label,
    krw: classTotals.get(item.value) ?? 0,
  }))
    .filter((slice) => slice.krw > 0)
    .map((slice) => ({
      ...slice,
      weight: totalKrw > 0 ? slice.krw / totalKrw : 0,
    }))
    .sort((a, b) => b.krw - a.krw);

  const asOf = [...quotes.values()]
    .filter((quote) => quote.source !== "cash")
    .map((quote) => quote.asOf)
    .sort()[0];

  const profitKrw = totalKrw - bookKrw;

  return {
    holdings,
    quotes,
    usdKrw,
    totalKrw,
    bookKrw,
    profitKrw,
    rate: bookKrw > 0 ? profitKrw / bookKrw : null,
    byClass,
    excluded,
    missing,
    asOf,
  };
}

/** 스냅샷 기준일은 한국 날짜다. */
function kstDate(offsetDays = 0) {
  const now = new Date(Date.now() + offsetDays * 86400000);
  return now.toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
}

export type Snapshot = {
  date: string;
  total_krw: number;
  book_krw: number;
};

/**
 * 오늘 스냅샷을 갱신하고, 비교용으로 이전 스냅샷을 돌려준다.
 * 하루에 한 행이며 그날 마지막 조회 값으로 덮어쓴다.
 * 시세를 하나도 못 구했으면 기록하지 않는다 — 0원짜리 가짜 저점이 남는다.
 */
export async function recordSnapshot(
  supabase: SupabaseClient,
  userId: string,
  portfolio: Portfolio,
): Promise<Snapshot | null> {
  if (portfolio.holdings.length === 0 || portfolio.totalKrw <= 0) return null;

  const today = kstDate();

  const byClass = Object.fromEntries(
    portfolio.byClass.map((slice) => [slice.value, Math.round(slice.krw)]),
  );

  await supabase.from("portfolio_snapshots").upsert(
    {
      user_id: userId,
      date: today,
      total_krw: Math.round(portfolio.totalKrw),
      book_krw: Math.round(portfolio.bookKrw),
      by_class: byClass,
    },
    { onConflict: "user_id,date" },
  );

  const { data } = await supabase
    .from("portfolio_snapshots")
    .select("date, total_krw, book_krw")
    .eq("user_id", userId)
    .lt("date", today)
    .order("date", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (data as Snapshot | null) ?? null;
}
