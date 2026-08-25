import "server-only";

/** 한국은행 ECOS 조회 (ARCHITECTURE.md §2: 국내 매크로 = ECOS API). */

const BASE = "https://ecos.bok.or.kr/api/StatisticSearch";

export type EcosRow = { time: string; value: number };

function getKey() {
  const key = process.env.ECOS_API_KEY;
  if (!key) throw new Error("ECOS_API_KEY가 없다.");
  return key;
}

function yyyymm(offsetMonths: number) {
  const now = new Date();
  now.setUTCMonth(now.getUTCMonth() + offsetMonths);
  return `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * 통계표 하나를 조회해 최신순으로 돌려준다.
 * ECOS는 오류를 HTTP 200 + RESULT 객체로 준다. 상태코드만 보면 놓친다.
 */
export async function fetchEcos(
  statCode: string,
  cycle: "D" | "M",
  itemCode: string,
  months = 14,
): Promise<EcosRow[]> {
  const start = cycle === "M" ? yyyymm(-months) : `${yyyymm(-months)}01`;
  const end = cycle === "M" ? yyyymm(1) : `${yyyymm(0)}31`;

  const url = `${BASE}/${getKey()}/json/kr/1/1000/${statCode}/${cycle}/${start}/${end}/${itemCode}`;
  let response: Response | null = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      response = await fetch(url, { cache: "no-store" });
      break;
    } catch {
      response = null;
    }
  }
  if (!response) throw new Error(`ECOS 조회 실패: ${statCode} 응답 없음`);

  const body = (await response.json()) as {
    RESULT?: { CODE?: string; MESSAGE?: string };
    StatisticSearch?: { row?: { TIME: string; DATA_VALUE: string }[] };
  };

  if (body.RESULT) {
    throw new Error(
      `ECOS 조회 실패 (${body.RESULT.CODE}): ${body.RESULT.MESSAGE ?? ""}`,
    );
  }

  return (body.StatisticSearch?.row ?? [])
    .map((row) => ({ time: row.TIME, value: Number(row.DATA_VALUE) }))
    .filter((row) => Number.isFinite(row.value))
    .reverse();
}
