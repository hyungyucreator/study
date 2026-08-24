import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { AssetClass, Bucket } from "@/lib/assets";

import { fetchBalance } from "./balance";
import { guessAssetClass, isEtfName, loadSymbolMap } from "./classify";

export type SyncResult = {
  synced: number;
  removed: number;
};

type Row = {
  user_id: string;
  source: "kis";
  symbol: string;
  name: string;
  asset_class: AssetClass;
  is_etf: boolean;
  bucket: Bucket | null;
  qty: number;
  avg_price: number;
  currency: string;
  updated_at: string;
};

/**
 * KIS 잔고를 holdings(source='kis')에 반영한다.
 * - 분류는 symbol_map(사실) > 기존 holdings 값(사용자 수정) > 이름 추정 순.
 * - KIS에서 사라진 종목은 source='kis' 행만 지운다. 수동 입력 행은 건드리지 않는다.
 */
export async function syncKisHoldings(
  supabase: SupabaseClient,
  userId: string,
): Promise<SyncResult> {
  const balance = await fetchBalance();
  const now = new Date().toISOString();

  const { data: existing } = await supabase
    .from("holdings")
    .select("symbol, asset_class, is_etf, bucket")
    .eq("user_id", userId)
    .eq("source", "kis");

  const previous = new Map(
    (existing ?? []).map((row) => [
      row.symbol,
      {
        asset_class: row.asset_class as AssetClass,
        is_etf: row.is_etf,
        bucket: (row.bucket as Bucket | null) ?? null,
      },
    ]),
  );

  const symbols = [
    ...balance.domestic.map((p) => p.symbol),
    ...balance.overseas.map((p) => p.symbol),
    "KRW-CASH",
  ];
  const mapped = await loadSymbolMap(symbols);

  // 버킷은 추정하지 않는다. 모르면 null로 두고 화면에서 최초 1회 물어본다.
  const classify = (
    symbol: string,
    name: string,
    fallback: AssetClass,
  ): { asset_class: AssetClass; is_etf: boolean; bucket: Bucket | null } => {
    const known = mapped.get(symbol) ?? previous.get(symbol);
    if (known) {
      return {
        ...known,
        bucket:
          mapped.get(symbol)?.bucket ?? previous.get(symbol)?.bucket ?? null,
      };
    }
    return {
      asset_class: guessAssetClass(name) || fallback,
      is_etf: isEtfName(name),
      bucket: null,
    };
  };

  const rows: Row[] = [
    ...balance.domestic.map((position) => ({
      user_id: userId,
      source: "kis" as const,
      symbol: position.symbol,
      name: position.name,
      ...classify(position.symbol, position.name, "kr_equity"),
      qty: position.qty,
      avg_price: position.avgPrice,
      currency: "KRW",
      updated_at: now,
    })),
    ...balance.overseas.map((position) => ({
      user_id: userId,
      source: "kis" as const,
      symbol: position.symbol,
      name: position.name,
      ...classify(position.symbol, position.name, "intl_equity"),
      qty: position.qty,
      avg_price: position.avgPrice,
      currency: position.currency,
      updated_at: now,
    })),
  ];

  // 예수금도 자산배분 비중에 들어가야 하므로 현금 자산으로 넣는다.
  if (balance.cashKrw > 0) {
    rows.push({
      user_id: userId,
      source: "kis",
      symbol: "KRW-CASH",
      name: "예수금",
      asset_class: previous.get("KRW-CASH")?.asset_class ?? "cash",
      is_etf: false,
      bucket: mapped.get("KRW-CASH")?.bucket ?? previous.get("KRW-CASH")?.bucket ?? "core",
      qty: balance.cashKrw,
      avg_price: 1,
      currency: "KRW",
      updated_at: now,
    });
  }

  if (rows.length > 0) {
    const { error } = await supabase
      .from("holdings")
      .upsert(rows, { onConflict: "user_id,source,symbol" });
    if (error) throw new Error(`동기화 저장 실패: ${error.message}`);
  }

  const currentSymbols = new Set(rows.map((row) => row.symbol));
  const stale = [...previous.keys()].filter(
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
