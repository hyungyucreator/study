/**
 * 수집 대상 RSS 피드 (ARCHITECTURE.md §2).
 *
 * 원칙:
 * - 카테고리당 2~3개. 많이 넣을수록 노이즈와 토큰이 늘 뿐 품질은 안 오른다.
 * - 정치·사회는 성향이 다른 매체를 섞는다. 단일 매체 프레이밍이 요약을 거치며
 *   중립적으로 보이는 것을 막기 위함 (§3-2).
 * - 통신사(연합) 스트레이트 보도를 사실 레이어의 축으로 둔다.
 * - **리드문과 발행시각이 없는 피드는 쓰지 않는다.** 제목만으로는 해석 재료가 안 되고,
 *   발행시각이 없으면 "직전 브리핑 이후"를 자를 수 없다 (PRODUCT.md §4-A).
 *
 * 제외한 곳 (실측 결과):
 * - 한국경제: RSS가 403으로 봇을 막는다. 크롤링으로 우회하지 않는다 (CLAUDE.md §2-4).
 * - Reuters: 공개 RSS 폐지(404). BBC·CNBC로 대체.
 * - 조선일보: description이 비어 제목만 온다.
 * - 한겨레: pubDate가 없고 description은 이미지 태그뿐이다.
 */

export type NewsCategory =
  | "market"
  | "economy"
  | "politics"
  | "society"
  | "world"
  | "tech"
  | "policy";

export type Feed = {
  /** raw_news.source에 그대로 들어간다. */
  source: string;
  url: string;
  /** 피드 전체의 기본 분류. itemCategory가 있으면 그쪽이 우선한다. */
  category: NewsCategory;
  /** 브리핑 1부(시장·경제) / 2부(오늘의 세계). */
  part: 1 | 2;
  /**
   * 종합 피드용. 기사에 붙은 자체 분류를 우리 분류로 옮긴다.
   * null을 돌려주면 그 기사는 버린다 (스포츠·연예 등).
   */
  itemCategory?: (raw: string) => NewsCategory | null;
};

/** 경향신문 종합 피드의 자체 분류 화이트리스트. 여기 없는 것은 버린다. */
const KHAN_CATEGORIES: [string, NewsCategory][] = [
  ["정치", "politics"],
  ["국회", "politics"],
  ["대통령", "politics"],
  ["사회", "society"],
  ["노동", "society"],
  ["교육", "society"],
  ["법조", "society"],
  ["사건", "society"],
  ["경제", "economy"],
  ["산업", "economy"],
  ["부동산", "economy"],
  ["금융", "market"],
  ["증권", "market"],
  ["국제", "world"],
  ["IT", "tech"],
  ["과학", "tech"],
];

function khanCategory(raw: string): NewsCategory | null {
  for (const [keyword, category] of KHAN_CATEGORIES) {
    if (raw.includes(keyword)) return category;
  }
  return null;
}

export const FEEDS: Feed[] = [
  // --- 1부. 시장과 경제 ---
  { source: "연합뉴스 경제", url: "https://www.yna.co.kr/rss/economy.xml", category: "economy", part: 1 },
  { source: "매일경제 증권", url: "https://www.mk.co.kr/rss/50200011/", category: "market", part: 1 },
  { source: "BBC Business", url: "https://feeds.bbci.co.uk/news/business/rss.xml", category: "market", part: 1 },
  { source: "CNBC", url: "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100003114", category: "market", part: 1 },

  // --- 2부. 오늘의 세계 (정치·사회) ---
  // 연합(통신사) = 사실 축. 동아(보수)·경향(진보) = 프레이밍 대조.
  { source: "연합뉴스 정치", url: "https://www.yna.co.kr/rss/politics.xml", category: "politics", part: 2 },
  { source: "연합뉴스 사회", url: "https://www.yna.co.kr/rss/society.xml", category: "society", part: 2 },
  { source: "동아일보 정치", url: "https://rss.donga.com/politics.xml", category: "politics", part: 2 },
  { source: "경향신문", url: "https://www.khan.co.kr/rss/rssdata/total_news.xml", category: "politics", part: 2, itemCategory: khanCategory },

  // --- 2부. 국제 ---
  { source: "연합뉴스 국제", url: "https://www.yna.co.kr/rss/international.xml", category: "world", part: 2 },
  { source: "BBC World", url: "https://feeds.bbci.co.uk/news/world/rss.xml", category: "world", part: 2 },

  // --- 2부. 테크 ---
  { source: "전자신문", url: "https://rss.etnews.com/Section901.xml", category: "tech", part: 2 },
  { source: "Ars Technica", url: "https://feeds.arstechnica.com/arstechnica/index", category: "tech", part: 2 },
];

/** 링크나 제목에 이 조각이 있으면 버린다. 종합 피드에 섞여 오는 연성 기사 차단. */
export const DROP_PATTERNS = [
  "/sports/",
  "/entertainments/",
  "/entertain/",
  "/culture/",
  "/travel/",
  "/food/",
  "/cartoon/",
  "/photo/",
  "/horoscope/",
];
