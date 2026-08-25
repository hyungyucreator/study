/**
 * 자산군은 "상품 형태"가 아니라 "실질 노출" 기준이다 (0003_asset_class_exposure.sql).
 * 금 ETF는 원자재, 미국채 ETF는 채권, S&P500 ETF는 해외주식으로 분류한다.
 * ETF 여부는 자산군이 아니라 is_etf 플래그로 표시한다.
 * DB CHECK 제약과 값이 일치해야 한다.
 */

export const ASSET_CLASSES = [
  { value: "kr_equity", label: "국내주식" },
  { value: "intl_equity", label: "해외주식" },
  { value: "bond", label: "채권" },
  { value: "commodity", label: "원자재" },
  { value: "currency", label: "통화" },
  { value: "cash", label: "현금" },
  { value: "other", label: "기타" },
] as const;

export type AssetClass = (typeof ASSET_CLASSES)[number]["value"];

const ASSET_CLASS_VALUES = ASSET_CLASSES.map((item) => item.value) as string[];

export function isAssetClass(value: string): value is AssetClass {
  return ASSET_CLASS_VALUES.includes(value);
}

export function assetClassLabel(value: string) {
  return ASSET_CLASSES.find((item) => item.value === value)?.label ?? value;
}

export const CURRENCIES = [
  { value: "KRW", label: "원 (KRW)" },
  { value: "USD", label: "달러 (USD)" },
] as const;

export type Currency = (typeof CURRENCIES)[number]["value"];

const CURRENCY_VALUES = CURRENCIES.map((item) => item.value) as string[];

export function isCurrency(value: string): value is Currency {
  return CURRENCY_VALUES.includes(value);
}

export type Holding = {
  id: string;
  source: "kis" | "manual";
  symbol: string;
  name: string;
  asset_class: AssetClass;
  is_etf: boolean;
  qty: number;
  avg_price: number;
  currency: Currency;
  updated_at: string;
};

/** 매입금액 = 수량 × 평단. 통화 환산은 하지 않는다. */
export function bookValue(holding: Pick<Holding, "qty" | "avg_price">) {
  return holding.qty * holding.avg_price;
}

/** 통화 단위를 붙인 금액. 원화는 소수점 없이, 달러는 두 자리. */
export function formatMoney(value: number, currency: Currency) {
  if (currency === "USD") {
    return `$${value.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }
  return `${Math.round(value).toLocaleString("ko-KR")}원`;
}

/** 수량. 소수점 뒤 불필요한 0은 버린다 (해외주식 소수점 매수 대응). */
export function formatQty(value: number) {
  return value.toLocaleString("ko-KR", { maximumFractionDigits: 8 });
}

/** 평가금액 = 수량 × 현재가. 통화 환산은 하지 않는다. */
export function marketValue(
  holding: Pick<Holding, "qty">,
  price: number,
) {
  return holding.qty * price;
}

/** 평가손익 (표시통화 기준). 평단이 0이면 손익 개념이 없다. */
export function profit(
  holding: Pick<Holding, "qty" | "avg_price">,
  price: number,
) {
  if (holding.avg_price <= 0) return 0;
  return (price - holding.avg_price) * holding.qty;
}

/** 수익률. 평단이 0(현금 등)이면 null — 0%로 표시하면 착시가 생긴다. */
export function returnRate(
  holding: Pick<Holding, "avg_price">,
  price: number,
): number | null {
  if (holding.avg_price <= 0) return null;
  return (price - holding.avg_price) / holding.avg_price;
}

/** 표시통화 금액을 원화로 환산한다. 환율이 없으면 null. */
export function toKrw(
  value: number,
  currency: Currency,
  usdKrw: number | null,
): number | null {
  if (currency === "KRW") return value;
  if (usdKrw === null) return null;
  return value * usdKrw;
}

/** 부호를 붙인 퍼센트. 소수 첫째 자리까지. */
export function formatPercent(rate: number) {
  const sign = rate > 0 ? "+" : "";
  return `${sign}${(rate * 100).toFixed(1)}%`;
}

/** 부호를 붙인 금액. */
export function formatSignedMoney(value: number, currency: Currency) {
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}${formatMoney(Math.abs(value), currency)}`;
}

/**
 * 손익 색. 이 제품에서 적색은 수익, 청색은 손실이다 (DESIGN.md).
 * 보합은 색을 쓰지 않는다.
 */
export function pnlClass(value: number) {
  if (value > 0) return "text-gain";
  if (value < 0) return "text-loss";
  return "";
}

/** "14:32 기준"처럼 관측 시각을 짧게. */
export function formatAsOf(iso: string) {
  return new Date(iso).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
