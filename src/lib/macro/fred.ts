import "server-only";

/** FRED 시계열 조회 (ARCHITECTURE.md §2: 미국 매크로 = FRED API). */

const BASE = "https://api.stlouisfed.org/fred/series/observations";

export type Observation = { date: string; value: number };

function getKey() {
  const key = process.env.FRED_API_KEY;
  if (!key) throw new Error("FRED_API_KEY가 없다.");
  return key;
}

/**
 * 최근 관측치를 최신순으로 돌려준다.
 * FRED는 결측치를 "."으로 준다. 그대로 두면 0으로 읽혀 가짜 급락이 된다.
 */
export async function fetchSeries(
  seriesId: string,
  limit = 260,
): Promise<Observation[]> {
  const params = new URLSearchParams({
    series_id: seriesId,
    api_key: getKey(),
    file_type: "json",
    sort_order: "desc",
    limit: String(limit),
  });

  // 네트워크가 한 번 튀었다고 지표 하나를 통째로 잃지 않는다.
  let response: Response | null = null;
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      response = await fetch(`${BASE}?${params}`, { cache: "no-store" });
      if (response.ok) break;
      lastError = new Error(`HTTP ${response.status}`);
      response = null;
    } catch (error) {
      lastError = error;
      response = null;
    }
  }

  if (!response) {
    throw new Error(
      `FRED 조회 실패 (${seriesId}): ${
        lastError instanceof Error ? lastError.message : "알 수 없는 오류"
      }`,
    );
  }

  const body = (await response.json()) as {
    observations?: { date: string; value: string }[];
  };

  return (body.observations ?? [])
    .filter((item) => item.value !== ".")
    .map((item) => ({ date: item.date, value: Number(item.value) }))
    .filter((item) => Number.isFinite(item.value));
}
