/**
 * 브리핑 전용 자산군.
 *
 * holdings의 자산군과 **일부러 분리했다.** 포트폴리오는 "내가 무엇을 갖고 있나"를
 * 담고, 브리핑은 "오늘 시장이 어느 쪽으로 움직였나"를 담는다. 목적이 다르다.
 *
 * 특히 통화와 채권을 쪼갠 이유가 있다. 이전에는 둘 다 코드가 하나뿐이라
 * 한 브리핑 안에 "채권 상방"(국고채)과 "채권 하방"(미 국채)이 함께 실렸고,
 * "원화 약세"와 "약달러"가 같은 currency로 뭉쳐 서로 반대인데 같은 말로 보였다.
 */

export const BRIEFING_ASSET_CLASSES = [
  { value: "kr_equity", label: "국내주식", kind: "asset" },
  { value: "intl_equity", label: "해외주식", kind: "asset" },
  { value: "kr_bond", label: "국내채권", kind: "asset" },
  { value: "intl_bond", label: "해외채권", kind: "asset" },
  { value: "commodity", label: "원자재", kind: "asset" },
  { value: "krw", label: "원화", kind: "currency" },
  { value: "usd", label: "달러", kind: "currency" },
] as const;

export type BriefingAssetClass =
  (typeof BRIEFING_ASSET_CLASSES)[number]["value"];

export const BRIEFING_ASSET_VALUES = BRIEFING_ASSET_CLASSES.map(
  (item) => item.value,
);

const BY_VALUE = new Map(
  BRIEFING_ASSET_CLASSES.map((item) => [item.value as string, item]),
);

export function assetLabel(value: string) {
  return BY_VALUE.get(value)?.label ?? value;
}

export type OutlookDirection = "up" | "down" | "unclear";

/**
 * 방향 표기. 통화는 "상방·하방"이 어색하다.
 * 원화가 오른다는 말이 환율이 오른다는 뜻인지 원화 가치가 오른다는 뜻인지
 * 헷갈리므로 통화에는 강세·약세를 쓴다.
 */
export function directionLabel(
  value: string,
  direction: OutlookDirection,
): string {
  const currency = BY_VALUE.get(value)?.kind === "currency";
  if (direction === "unclear") return "불확실";
  if (currency) return direction === "up" ? "강세" : "약세";
  return direction === "up" ? "상방" : "하방";
}

export function directionClass(direction: OutlookDirection) {
  if (direction === "up") return "text-gain";
  if (direction === "down") return "text-loss";
  return "";
}

export type AssetOutlook = {
  asset_class: BriefingAssetClass;
  direction: OutlookDirection;
  /** 개조식 한 줄. */
  note: string;
  /** 근거 기사의 source_url. 화면에서 그 기사로 이어준다. */
  evidence: string[];
};

/** 화면 정렬 순서. 정의된 순서를 그대로 쓴다. */
export function sortOutlook(items: AssetOutlook[]): AssetOutlook[] {
  const order = new Map(
    BRIEFING_ASSET_VALUES.map((value, index) => [value as string, index]),
  );
  return [...items].sort(
    (a, b) =>
      (order.get(a.asset_class) ?? 99) - (order.get(b.asset_class) ?? 99),
  );
}
