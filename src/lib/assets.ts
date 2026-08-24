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

/**
 * 버킷 = 계좌 성격. 목표 비중 계산은 core + tilt만 대상으로 하고,
 * experiment(소액 개별주 실험)는 비중에서 빼고 따로 본다.
 * null은 "아직 정하지 않음" — KIS에서 새로 들어온 종목은 최초 1회 물어본다.
 */
export const BUCKETS = [
  { value: "core", label: "코어", hint: "자산배분의 골격. 목표 비중 대상." },
  { value: "tilt", label: "틸트", hint: "국면 판단을 표현하는 조정분. 목표 비중 대상." },
  {
    value: "experiment",
    label: "실험",
    hint: "소액 개별주 실험. 비중 계산과 리밸런싱에서 제외.",
  },
] as const;

export type Bucket = (typeof BUCKETS)[number]["value"];

const BUCKET_VALUES = BUCKETS.map((item) => item.value) as string[];

export function isBucket(value: string): value is Bucket {
  return BUCKET_VALUES.includes(value);
}

export function bucketLabel(value: string | null) {
  if (!value) return "미지정";
  return BUCKETS.find((item) => item.value === value)?.label ?? value;
}

/** 목표 비중·리밸런싱 대상 여부. */
export function countsTowardAllocation(bucket: string | null) {
  return bucket === "core" || bucket === "tilt";
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
  bucket: Bucket | null;
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
