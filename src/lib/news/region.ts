/**
 * 국내 / 글로벌 판정.
 *
 * 기준은 **매체 국적이 아니라 사건의 무대**다.
 * 연합뉴스가 쓴 미중 관세 기사는 글로벌이고,
 * "美반도체 찬바람에 코스피 하락"은 무대가 한국 증시이므로 국내다.
 */

export type Region = "kr" | "global";

/** 사건의 무대가 한국임을 알리는 말. 하나라도 있으면 국내로 본다. */
const KR_ANCHORS = [
  "코스피", "코스닥", "국내", "한국", "우리나라", "원화", "원/달러",
  "한국은행", "금통위", "기준금리 동결", "기재부", "금융위", "국회",
  "정부·여당", "당정", "여당", "야당", "국민의힘", "더불어민주당",
  "대통령실", "서울", "경기도", "검찰", "경찰청", "헌재", "공정위",
  "삼성", "현대차", "SK하이닉스", "LG", "네이버", "카카오", "포스코",
  "국민연금", "코스피200", "증권가", "국고채",
];

/** 무대가 해외임을 알리는 말. 국내 앵커가 없을 때만 본다. */
const GLOBAL_ANCHORS = [
  "美", "미국", "中", "중국", "日", "일본", "유럽", "EU", "독일", "프랑스",
  "영국", "러시아", "우크라이나", "이스라엘", "이란", "대만", "인도",
  "트럼프", "시진핑", "푸틴", "연준", "Fed", "FOMC", "ECB", "월가",
  "뉴욕증시", "나스닥", "다우", "S&P", "엔비디아", "애플", "테슬라",
  "OPEC", "WTO", "IMF", "백악관", "펜타곤", "브뤼셀",
];

function hits(haystack: string, words: string[]): boolean {
  return words.some((word) => haystack.includes(word));
}

/**
 * @param category raw_news.category
 * @param isEnglish 제목이 영문인지. 영문 매체는 전부 글로벌이다.
 */
export function regionOf(options: {
  category: string;
  title: string;
  lead: string | null;
  isEnglish: boolean;
}): Region {
  if (options.isEnglish) return "global";
  // world 분류는 매체가 이미 국제면으로 분류한 것이다.
  if (options.category === "world") return "global";

  const haystack = `${options.title} ${options.lead ?? ""}`;

  // 한국 무대가 확인되면 해외 고유명사가 섞여 있어도 국내다.
  if (hits(haystack, KR_ANCHORS)) return "kr";
  if (hits(haystack, GLOBAL_ANCHORS)) return "global";

  return "kr";
}
