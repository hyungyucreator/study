import "server-only";

/**
 * 해외 시세와 원달러 환율 (ARCHITECTURE.md §2: 해외 시세 = yfinance).
 * yfinance 파이썬 라이브러리가 호출하는 것과 같은 JSON 엔드포인트를 직접 쓴다.
 * HTML을 긁지 않는다 (CLAUDE.md §2-4).
 */

const CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart";

// 기본 fetch UA는 종종 429로 막힌다.
const HEADERS = {
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36",
  accept: "application/json",
};

type ChartResponse = {
  chart?: {
    result?: {
      meta?: {
        regularMarketPrice?: number;
        currency?: string;
      };
    }[];
    error?: { description?: string } | null;
  };
};

export type YahooQuote = { price: number; currency: string };

/**
 * 야후 티커 하나의 현재가. 값이 없으면 null을 돌려준다.
 * 시세 한 종목이 비어도 화면 전체가 죽지 않아야 하므로 던지지 않는다.
 */
export async function fetchYahooQuote(
  yahooSymbol: string,
): Promise<YahooQuote | null> {
  try {
    const response = await fetch(
      `${CHART_URL}/${encodeURIComponent(yahooSymbol)}?interval=1d&range=1d`,
      { headers: HEADERS, cache: "no-store" },
    );
    if (!response.ok) return null;

    const body = (await response.json()) as ChartResponse;
    const meta = body.chart?.result?.[0]?.meta;
    const price = meta?.regularMarketPrice;

    if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) {
      return null;
    }

    return { price, currency: (meta?.currency ?? "USD").toUpperCase() };
  } catch {
    return null;
  }
}

/** 원달러 환율. 야후 FX 티커는 `USDKRW=X`. */
export async function fetchUsdKrw(): Promise<number | null> {
  const quote = await fetchYahooQuote("USDKRW=X");
  return quote?.price ?? null;
}
