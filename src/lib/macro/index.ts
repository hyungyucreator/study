import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { fetchUsdKrw } from "@/lib/quotes/yahoo";

import { fetchEcos } from "./ecos";
import { fetchSeries, type Observation } from "./fred";

/**
 * 시장 상황 — 4지표 (PRODUCT.md §4-A-1).
 *
 * DB 컬럼명은 briefings.temperature_json 그대로 둔다. 화면 표기만 바뀐 것이고,
 * 컬럼 이름을 바꾸려면 마이그레이션이 필요한데 얻는 게 없다.
 * 미 기준금리 · 원달러 환율 · VIX · 미 10년물. **지표 확장은 딥다이브에서 다룬 뒤에만.**
 *
 * 해석 문구는 코드가 만든다. 모델에게 맡기면 매일 표현이 흔들리고
 * 없는 연결고리를 지어낸다 (CLAUDE.md §5).
 */

export type Gauge = {
  key: "fed_rate" | "usdkrw" | "vix" | "us10y";
  label: string;
  /** 화면·프롬프트에 그대로 쓰는 값. 단위 포함. */
  display: string;
  value: number;
  /** 직전 관측 대비 변화. 없으면 null. */
  change: number | null;
  /** 기준 대비 서술 한 조각. 없으면 null. */
  note: string | null;
  asOf: string;
  source: string;
};

export type Temperature = {
  gauges: Gauge[];
  /** 값을 못 구한 지표. 브리핑 본문에 "수집 실패"로 명시한다 (ARCHITECTURE §3-2). */
  failed: string[];
};

/** 최근 1년 관측치 안에서 현재 값의 위치. 0 = 최저, 1 = 최고. */
function percentile(history: number[], value: number): number | null {
  if (history.length < 30) return null;
  const below = history.filter((item) => item <= value).length;
  return below / history.length;
}

function rangeNote(history: number[], value: number): string | null {
  const p = percentile(history, value);
  if (p === null) return null;
  if (p >= 0.9) return "최근 1년 최고 수준";
  if (p >= 0.7) return "최근 1년 중 높은 편";
  if (p <= 0.1) return "최근 1년 최저 수준";
  if (p <= 0.3) return "최근 1년 중 낮은 편";
  return "최근 1년 중간 수준";
}

/** VIX만 통용되는 구간 해석이 있다. 나머지 지표에 임의 구간을 만들지 않는다. */
function vixNote(value: number): string {
  if (value < 15) return "낮음, 시장 평온";
  if (value < 20) return "보통";
  if (value < 30) return "높음, 경계";
  return "매우 높음, 공포";
}

function round(value: number, digits: number) {
  return Number(value.toFixed(digits));
}

/** 표시용. 자릿수를 고정해 "3.5%"와 "3.50%"가 섞이지 않게 한다. */
function fixed(value: number, digits: number) {
  return value.toFixed(digits);
}

type Collected = {
  gauges: Gauge[];
  failed: string[];
  rows: {
    symbol: string;
    kind: string;
    value: number;
    as_of: string;
    source: string;
  }[];
};

function isoOf(date: string) {
  return new Date(`${date}T00:00:00Z`).toISOString();
}

async function buildGauges(): Promise<Collected> {
  const gauges: Gauge[] = [];
  const failed: string[] = [];
  const rows: Collected["rows"] = [];

  const [fedUpper, fedLower, us10y, vix, usdKrwLive, usdKrwHistory, krBase] =
    await Promise.allSettled([
      fetchSeries("DFEDTARU", 400),
      fetchSeries("DFEDTARL", 400),
      fetchSeries("DGS10", 400),
      fetchSeries("VIXCLS", 400),
      fetchUsdKrw(),
      fetchSeries("DEXKOUS", 400),
      fetchEcos("722Y001", "M", "0101000"),
    ]);

  const value = <T>(result: PromiseSettledResult<T>): T | null =>
    result.status === "fulfilled" ? result.value : null;

  // --- 미 기준금리 (정책금리 목표 범위) ---
  const upper = value(fedUpper);
  const lower = value(fedLower);
  if (upper?.length && lower?.length) {
    const top = upper[0];
    const bottom = lower[0];
    // 마지막으로 상단이 바뀐 날짜 = 최근 인상·인하 시점.
    const changedAt = upper.find((item) => item.value !== top.value);
    const direction = changedAt
      ? changedAt.value < top.value
        ? "인상"
        : "인하"
      : null;

    gauges.push({
      key: "fed_rate",
      label: "미 기준금리",
      display: `${fixed(bottom.value, 2)}–${fixed(top.value, 2)}%`,
      value: top.value,
      // 정책금리는 매일 움직이지 않는다. 전일 대비 대신 마지막 변경을 note로 말한다.
      change: null,
      // "2025-12-10 인하 후 동결" — 두 정보를 한 줄에 담아 좁은 칸에서 안 깨지게.
      note: direction ? `${changedAt!.date} ${direction} 후 동결` : null,
      asOf: isoOf(top.date),
      source: "fred",
    });

    rows.push(
      { symbol: "US_FED_UPPER", kind: "rate", value: top.value, as_of: isoOf(top.date), source: "fred" },
      { symbol: "US_FED_LOWER", kind: "rate", value: bottom.value, as_of: isoOf(bottom.date), source: "fred" },
    );
  } else {
    failed.push("미 기준금리");
  }

  // --- 원달러 환율 ---
  const live = value(usdKrwLive);
  const krwHistory = value(usdKrwHistory) ?? [];
  if (live !== null) {
    // 야후는 실시간, FRED(DEXKOUS)는 전 영업일 종가다. 변화량은 그 둘의 차.
    const prevClose = krwHistory[0]?.value ?? null;
    gauges.push({
      key: "usdkrw",
      label: "원달러",
      display: `${live.toLocaleString("ko-KR", { maximumFractionDigits: 1 })}원`,
      value: live,
      change: prevClose === null ? null : round(live - prevClose, 1),
      note: rangeNote(
        krwHistory.slice(0, 260).map((item) => item.value),
        live,
      ),
      asOf: new Date().toISOString(),
      source: "yahoo",
    });
    rows.push({
      symbol: "USDKRW",
      kind: "fx",
      value: live,
      as_of: new Date().toISOString(),
      source: "yahoo",
    });
  } else {
    failed.push("원달러");
  }

  // --- 미 10년물 ---
  const ten = value(us10y);
  if (ten?.length) {
    const history = ten.slice(0, 260).map((item) => item.value);
    gauges.push({
      key: "us10y",
      label: "미 10년물",
      display: `${fixed(ten[0].value, 2)}%`,
      value: ten[0].value,
      change: ten[1] ? round(ten[0].value - ten[1].value, 2) : null,
      note: rangeNote(history, ten[0].value),
      asOf: isoOf(ten[0].date),
      source: "fred",
    });
    rows.push({ symbol: "US10Y", kind: "rate", value: ten[0].value, as_of: isoOf(ten[0].date), source: "fred" });
  } else {
    failed.push("미 10년물");
  }

  // --- VIX ---
  const vixData = value(vix);
  if (vixData?.length) {
    gauges.push({
      key: "vix",
      label: "VIX",
      display: `${fixed(vixData[0].value, 2)}`,
      value: vixData[0].value,
      change: vixData[1] ? round(vixData[0].value - vixData[1].value, 2) : null,
      note: vixNote(vixData[0].value),
      asOf: isoOf(vixData[0].date),
      source: "fred",
    });
    rows.push({ symbol: "VIX", kind: "index", value: vixData[0].value, as_of: isoOf(vixData[0].date), source: "fred" });
  } else {
    failed.push("VIX");
  }

  // 한국 기준금리는 화면에 띄우지 않는다 (온도는 4지표 고정, PRODUCT §4-A-1).
  // 브리핑 본문에서 참조할 수 있게 적재만 해둔다.
  const kr = value(krBase);
  if (kr?.length) {
    const latest = kr[kr.length - 1];
    rows.push({
      symbol: "KR_BASE_RATE",
      kind: "rate",
      value: latest.value,
      as_of: isoOf(`${latest.time.slice(0, 4)}-${latest.time.slice(4, 6)}-01`),
      source: "ecos",
    });
  }

  return { gauges, failed, rows };
}

/** 온도 4지표를 수집해 raw_market에 적재하고 스냅샷을 돌려준다. */
export async function collectMacro(): Promise<Temperature> {
  const { gauges, failed, rows } = await buildGauges();

  if (rows.length > 0) {
    const admin = createAdminClient();
    const { error } = await admin
      .from("raw_market")
      .upsert(rows, {
        onConflict: "symbol,kind,as_of,source",
        ignoreDuplicates: true,
      });
    if (error) throw new Error(`raw_market 저장 실패: ${error.message}`);
  }

  const order: Gauge["key"][] = ["fed_rate", "us10y", "vix", "usdkrw"];
  gauges.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));

  return { gauges, failed };
}

export type { Observation };
