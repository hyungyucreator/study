import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { AssetClass } from "@/lib/assets";

import { fetchBalance } from "./balance";

/**
 * 국내 ETF는 잔고 응답만으로 주식과 구분되지 않는다. 상품명 앞의 브랜드로 추정한다.
 * 추정이 틀리면 사용자가 화면에서 고칠 수 있고, 고친 값은 다음 동기화 때 덮어쓰지 않는다.
 */
const ETF_BRANDS = [
  "KODEX",
  "TIGER",
  "ACE",
  "SOL",
  "RISE",
  "PLUS",
  "KBSTAR",
  "ARIRANG",
  "HANARO",
  "KOSEF",
  "TIMEFOLIO",
  "KIWOOM",
  "히어로즈",
  "마이티",
  "파워",
];

function guessDomesticAssetClass(name: string): AssetClass {
  const upper = name.toUpperCase();
  return ETF_BRANDS.some((brand) => upper.startsWith(brand))
    ? "etf"
    : "kr_equity";
}

export type SyncResult = {
  synced: number;
  removed: number;
};

/**
 * KIS 잔고를 holdings(source='kis')에 반영한다.
 * - 사용자가 손댈 수 있는 값(asset_class)은 기존 행이 있으면 유지한다.
 * - KIS에서 사라진 종목(전량 매도)은 kis 소스 행만 지운다. 수동 입력 행은 건드리지 않는다.
 */
export async function syncKisHoldings(
  supabase: SupabaseClient,
  userId: string,
): Promise<SyncResult> {
  const balance = await fetchBalance();

  const { data: existing } = await supabase
    .from("holdings")
    .select("symbol, asset_class")
    .eq("user_id", userId)
    .eq("source", "kis");

  const previousAssetClass = new Map<string, string>(
    (existing ?? []).map((row) => [row.symbol, row.asset_class]),
  );

  const keep = (symbol: string, fallback: AssetClass) =>
    (previousAssetClass.get(symbol) as AssetClass | undefined) ?? fallback;

  const rows = [
    ...balance.domestic.map((position) => ({
      user_id: userId,
      source: "kis" as const,
      symbol: position.symbol,
      name: position.name,
      asset_class: keep(
        position.symbol,
        guessDomesticAssetClass(position.name),
      ),
      qty: position.qty,
      avg_price: position.avgPrice,
      currency: "KRW",
      updated_at: new Date().toISOString(),
    })),
    ...balance.overseas.map((position) => ({
      user_id: userId,
      source: "kis" as const,
      symbol: position.symbol,
      name: position.name,
      asset_class: keep(position.symbol, "intl_equity" as AssetClass),
      qty: position.qty,
      avg_price: position.avgPrice,
      currency: position.currency,
      updated_at: new Date().toISOString(),
    })),
  ];

  // 예수금도 자산배분 비중에 들어가야 하므로 현금 자산으로 넣는다.
  if (balance.cashKrw > 0) {
    rows.push({
      user_id: userId,
      source: "kis" as const,
      symbol: "KRW-CASH",
      name: "예수금",
      asset_class: keep("KRW-CASH", "cash" as AssetClass),
      qty: balance.cashKrw,
      avg_price: 1,
      currency: "KRW",
      updated_at: new Date().toISOString(),
    });
  }

  if (rows.length > 0) {
    const { error } = await supabase
      .from("holdings")
      .upsert(rows, { onConflict: "user_id,source,symbol" });
    if (error) throw new Error(`동기화 저장 실패: ${error.message}`);
  }

  const currentSymbols = new Set(rows.map((row) => row.symbol));
  const stale = [...previousAssetClass.keys()].filter(
    (symbol) => !currentSymbols.has(symbol),
  );

  if (stale.length > 0) {
    await supabase
      .from("holdings")
      .delete()
      .eq("user_id", userId)
      .eq("source", "kis")
      .in("symbol", stale);
  }

  return { synced: rows.length, removed: stale.length };
}
