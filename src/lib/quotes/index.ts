import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createAdminClient } from "@/lib/supabase/admin";

import { fetchKisPrices } from "./kis";
import type { FxRate, Quote, QuoteSource } from "./types";
import { fetchUsdKrw, fetchYahooQuote } from "./yahoo";

export type { FxRate, Quote, QuoteSource } from "./types";

/** 이보다 오래된 관측치는 다시 받아온다. */
const STALE_MS = 10 * 60 * 1000;

/** 새로 못 받았을 때 폴백으로 쓸 수 있는 최대 나이. 이보다 오래되면 없는 것으로 친다. */
const FALLBACK_MS = 7 * 24 * 60 * 60 * 1000;

/** 환율은 raw_market에 이 심볼로 쌓는다. */
const FX_SYMBOL = "USDKRW";

export type QuoteTarget = {
  symbol: string;
  currency: string;
  asset_class: string;
};

export type Quotes = {
  quotes: Map<string, Quote>;
  fx: FxRate | null;
  /** 시세를 못 구한 종목. 화면에서 "일부 미반영"을 알리는 데 쓴다. */
  missing: string[];
};

type CacheRow = {
  symbol: string;
  kind: string;
  value: number;
  as_of: string;
  source: string;
};

function isCash(target: QuoteTarget) {
  return target.asset_class === "cash";
}

/** 6자리 숫자면 국내 종목코드다. 그 외는 해외 티커로 본다. */
function isDomesticCode(symbol: string) {
  return /^\d{6}$/.test(symbol);
}

async function readCache(
  supabase: SupabaseClient,
  symbols: string[],
): Promise<Map<string, CacheRow>> {
  const latest = new Map<string, CacheRow>();
  if (symbols.length === 0) return latest;

  const cutoff = new Date(Date.now() - FALLBACK_MS).toISOString();

  // raw_market은 인증 유저 읽기 허용 (0001_init.sql: raw_market_read).
  const { data } = await supabase
    .from("raw_market")
    .select("symbol, kind, value, as_of, source")
    .in("symbol", symbols)
    .in("kind", ["price", "fx"])
    .gte("as_of", cutoff)
    .order("as_of", { ascending: false });

  for (const row of (data ?? []) as CacheRow[]) {
    // 내림차순이므로 처음 만난 것이 최신이다.
    if (!latest.has(row.symbol)) latest.set(row.symbol, row);
  }

  return latest;
}

/**
 * 관측치를 raw_market에 쌓는다. 쓰기는 service_role만 가능하다.
 * 실패해도 화면은 그대로 보여준다 — 시세 표시가 캐시 저장에 의존하면 안 된다.
 */
async function writeCache(
  rows: { symbol: string; kind: string; value: number; as_of: string; source: string }[],
) {
  if (rows.length === 0) return;
  try {
    const admin = createAdminClient();
    await admin
      .from("raw_market")
      .upsert(rows, {
        onConflict: "symbol,kind,as_of,source",
        ignoreDuplicates: true,
      });
  } catch {
    // 무시한다.
  }
}

function fresh(row: CacheRow | undefined, now: number) {
  if (!row) return false;
  return now - new Date(row.as_of).getTime() < STALE_MS;
}

/**
 * 보유 종목의 현재가와 원달러 환율을 돌려준다.
 *
 * 순서: raw_market 캐시(10분) → 국내는 KIS·해외는 야후 조회 → 실패 시 오래된 캐시로 폴백.
 * 어느 단계에서도 값을 못 구하면 그 종목은 missing에 담고 평가금액에서 뺀다.
 * 없는 값을 매입가로 메우지 않는다 — 손익 0으로 보이는 착시가 생긴다.
 */
export async function getQuotes(
  supabase: SupabaseClient,
  targets: QuoteTarget[],
): Promise<Quotes> {
  const now = Date.now();
  const nowIso = new Date(now).toISOString();

  const quotes = new Map<string, Quote>();
  const missing: string[] = [];

  // 현금은 조회 대상이 아니다. 1원(1달러) 단가로 두면 금액 = 수량이 된다.
  const priced = targets.filter((target) => !isCash(target));
  for (const target of targets) {
    if (!isCash(target)) continue;
    quotes.set(target.symbol, {
      symbol: target.symbol,
      price: 1,
      currency: target.currency,
      asOf: nowIso,
      source: "cash",
    });
  }

  const needsFx = targets.some((target) => target.currency !== "KRW");
  const lookupSymbols = [
    ...new Set(priced.map((target) => target.symbol)),
    ...(needsFx ? [FX_SYMBOL] : []),
  ];

  const cache = await readCache(supabase, lookupSymbols);

  const domestic: string[] = [];
  const overseas: QuoteTarget[] = [];

  for (const target of priced) {
    if (quotes.has(target.symbol)) continue;

    const cached = cache.get(target.symbol);
    if (fresh(cached, now)) {
      quotes.set(target.symbol, {
        symbol: target.symbol,
        price: Number(cached!.value),
        currency: target.currency,
        asOf: cached!.as_of,
        source: cached!.source as QuoteSource,
      });
      continue;
    }

    if (isDomesticCode(target.symbol)) domestic.push(target.symbol);
    else overseas.push(target);
  }

  const fxCached = cache.get(FX_SYMBOL);
  const needsFxFetch = needsFx && !fresh(fxCached, now);

  const [kisPrices, overseasQuotes, usdKrw] = await Promise.all([
    domestic.length > 0 ? fetchKisPrices(domestic) : new Map<string, number>(),
    Promise.all(
      overseas.map(async (target) => ({
        target,
        quote: await fetchYahooQuote(target.symbol),
      })),
    ),
    needsFxFetch ? fetchUsdKrw() : Promise.resolve(null),
  ]);

  const toWrite: {
    symbol: string;
    kind: string;
    value: number;
    as_of: string;
    source: string;
  }[] = [];

  const settle = (
    target: QuoteTarget,
    price: number | null | undefined,
    source: QuoteSource,
  ) => {
    if (typeof price === "number" && Number.isFinite(price) && price > 0) {
      quotes.set(target.symbol, {
        symbol: target.symbol,
        price,
        currency: target.currency,
        asOf: nowIso,
        source,
      });
      toWrite.push({
        symbol: target.symbol,
        kind: "price",
        value: price,
        as_of: nowIso,
        source,
      });
      return;
    }

    // 조회 실패. 오래된 관측치라도 있으면 그것으로 버틴다.
    const cached = cache.get(target.symbol);
    if (cached) {
      quotes.set(target.symbol, {
        symbol: target.symbol,
        price: Number(cached.value),
        currency: target.currency,
        asOf: cached.as_of,
        source: cached.source as QuoteSource,
      });
      return;
    }

    missing.push(target.symbol);
  };

  for (const target of priced) {
    if (quotes.has(target.symbol)) continue;
    if (isDomesticCode(target.symbol)) {
      settle(target, kisPrices.get(target.symbol) ?? null, "kis");
    }
  }

  for (const { target, quote } of overseasQuotes) {
    settle(target, quote?.price ?? null, "yahoo");
  }

  let fx: FxRate | null = null;
  if (needsFx) {
    if (usdKrw !== null) {
      fx = { usdKrw, asOf: nowIso, source: "yahoo" };
      toWrite.push({
        symbol: FX_SYMBOL,
        kind: "fx",
        value: usdKrw,
        as_of: nowIso,
        source: "yahoo",
      });
    } else if (fxCached) {
      fx = {
        usdKrw: Number(fxCached.value),
        asOf: fxCached.as_of,
        source: fxCached.source as QuoteSource,
      };
    }
  }

  await writeCache(toWrite);

  return { quotes, fx, missing };
}
