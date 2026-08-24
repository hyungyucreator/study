import "server-only";

import type { AssetClass } from "@/lib/assets";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * 종목 분류. 우선순위:
 *   1) symbol_map 테이블 (한 번 정해두면 그대로) — 사실
 *   2) 이름 키워드 추정 — 새 종목의 첫 분류용
 * 추정이 틀리면 사용자가 화면에서 고치고, 고친 값은 symbol_map에 기록돼 다음부터 재사용된다.
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

// 순서가 중요하다. "미국30년국채"는 '미국'보다 '국채'가 먼저 걸려야 채권이 된다.
const KEYWORD_RULES: { keywords: string[]; assetClass: AssetClass }[] = [
  {
    keywords: ["국채", "채권", "회사채", "크레딧", "하이일드", "통안", "TIPS"],
    assetClass: "bond",
  },
  {
    keywords: ["골드", "금현물", "은선물", "원유", "WTI", "천연가스", "구리", "원자재", "농산물"],
    assetClass: "commodity",
  },
  { keywords: ["달러", "엔화", "유로", "위안"], assetClass: "currency" },
  {
    keywords: [
      "미국", "나스닥", "S&P", "글로벌", "선진국", "신흥국", "차이나", "중국",
      "일본", "베트남", "인도", "유럽", "필라델피아",
    ],
    assetClass: "intl_equity",
  },
];

export function isEtfName(name: string) {
  const upper = name.toUpperCase();
  return ETF_BRANDS.some((brand) => upper.startsWith(brand));
}

/** 이름만으로 추정. 확실치 않으면 국내주식으로 둔다. */
export function guessAssetClass(name: string): AssetClass {
  const upper = name.toUpperCase();
  for (const rule of KEYWORD_RULES) {
    if (rule.keywords.some((keyword) => upper.includes(keyword.toUpperCase()))) {
      return rule.assetClass;
    }
  }
  return "kr_equity";
}

export type SymbolInfo = { asset_class: AssetClass; is_etf: boolean };

/** symbol_map에서 여러 종목을 한 번에 읽는다. */
export async function loadSymbolMap(symbols: string[]) {
  if (symbols.length === 0) return new Map<string, SymbolInfo>();

  const admin = createAdminClient();
  const { data } = await admin
    .from("symbol_map")
    .select("symbol, asset_class, is_etf")
    .in("symbol", symbols);

  return new Map<string, SymbolInfo>(
    (data ?? []).map((row) => [
      row.symbol,
      { asset_class: row.asset_class as AssetClass, is_etf: row.is_etf },
    ]),
  );
}

/**
 * 사용자가 화면에서 고친 분류를 사실 테이블에 남긴다.
 * symbol_map은 service_role만 쓸 수 있으므로 서버에서 대신 기록한다.
 */
export async function rememberClassification(input: {
  symbol: string;
  name: string;
  assetClass: AssetClass;
  isEtf: boolean;
}) {
  const admin = createAdminClient();
  await admin.from("symbol_map").upsert({
    symbol: input.symbol,
    name: input.name,
    asset_class: input.assetClass,
    is_etf: input.isEtf,
    updated_at: new Date().toISOString(),
  });
}
