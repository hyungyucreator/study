import "server-only";

import { kisGet, toNumber } from "@/lib/kis/request";

/**
 * 국내주식·ETF 현재가 (ARCHITECTURE.md §2: 국내 시세 = KIS OpenAPI).
 * 조회 전용 TR이다.
 */

const TR_DOMESTIC_PRICE = "FHKST01010100";

// KIS는 초당 요청 수를 제한한다. 한 번에 몰아치지 않는다.
const CONCURRENCY = 4;

/** 종목코드 하나의 현재가. 실패하면 null (한 종목 때문에 화면 전체가 죽지 않게). */
async function fetchOne(symbol: string): Promise<number | null> {
  try {
    const { body } = await kisGet(
      "/uapi/domestic-stock/v1/quotations/inquire-price",
      TR_DOMESTIC_PRICE,
      {
        FID_COND_MRKT_DIV_CODE: "J", // 주식·ETF·ETN
        FID_INPUT_ISCD: symbol,
      },
    );

    const price = toNumber(body.output?.stck_prpr);
    return price > 0 ? price : null;
  } catch {
    return null;
  }
}

/** 여러 종목의 현재가. 값을 못 받은 종목은 Map에서 빠진다. */
export async function fetchKisPrices(
  symbols: string[],
): Promise<Map<string, number>> {
  const result = new Map<string, number>();

  for (let i = 0; i < symbols.length; i += CONCURRENCY) {
    const batch = symbols.slice(i, i + CONCURRENCY);
    const prices = await Promise.all(batch.map(fetchOne));
    batch.forEach((symbol, index) => {
      const price = prices[index];
      if (price !== null) result.set(symbol, price);
    });
  }

  return result;
}
