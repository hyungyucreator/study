/**
 * 뉴스 사전 필터링 — 모델에 넘길 20건 내외를 코드로 추린다 (ARCHITECTURE.md §4-4).
 *
 * 이 파일은 순수 함수만 둔다. DB·네트워크를 모르게 해야 입력을 손으로 넣어
 * 선별 결과를 튜닝할 수 있다.
 *
 * 핵심 신호는 **다수 매체 동시 보도**다 (§2 "뉴스 교차 확인").
 * 같은 사건을 여러 매체가 쓰면 그날의 중요한 사건이라는 뜻이다.
 */

import { regionOf, type Region } from "./region";

export type Candidate = {
  id: string;
  source: string;
  url: string;
  title: string;
  lead: string | null;
  published_at: string;
  category: string;
};

export type Cluster = {
  /** 대표 기사. 통신사 우선, 그다음 리드문이 긴 것. */
  lead_item: Candidate;
  /** 같은 사건을 다룬 다른 기사들. */
  others: Candidate[];
  /** 이 사건을 보도한 매체 수. 중요도 신호. */
  sourceCount: number;
  score: number;
  part: 1 | 2;
  /** 사건의 무대. 매체 국적이 아니다 (region.ts). */
  region: Region;
};

export type Selection = {
  part1: Cluster[];
  part2: Cluster[];
};

/** 국내/글로벌 어느 한쪽이 한 부를 다 차지하지 않게 반씩 확보한 뒤 점수로 채운다. */
function balanceRegions(
  pool: Cluster[],
  limit: number,
  maxPerCategory: number,
  minPerCategory = 0,
): Cluster[] {
  const half = Math.ceil(limit / 2);
  const picked = new Set<Cluster>();

  for (const region of ["kr", "global"] as const) {
    const side = pool.filter((item) => item.region === region);
    for (const item of withQuota(side, half, maxPerCategory, minPerCategory)) {
      picked.add(item);
    }
  }

  // 한쪽이 부족하면 남은 자리를 점수 순으로 채운다.
  for (const item of pool) {
    if (picked.size >= limit) break;
    picked.add(item);
  }

  const chosen = pool.filter((item) => picked.has(item)).slice(0, limit);
  // 국내 먼저, 그 안에서 점수 순. 화면 순서와 프롬프트 순서를 맞춘다.
  return chosen.sort((a, b) => {
    if (a.region !== b.region) return a.region === "kr" ? -1 : 1;
    return b.score - a.score;
  });
}

const PART1_CATEGORIES = new Set(["market", "economy"]);

/** 통신사 스트레이트는 사실 레이어의 축이다 (ARCHITECTURE §3-2). */
const WIRE_SOURCES = ["연합뉴스"];

/**
 * 주제 가중치. 브리핑이 다뤄야 할 축에 가깝다는 뜻일 뿐,
 * 이 목록에 없다고 버리지는 않는다.
 */
const PART1_KEYWORDS = [
  "금리", "연준", "FOMC", "기준금리", "물가", "인플레", "CPI", "환율", "달러",
  "국채", "채권", "증시", "코스피", "코스닥", "나스닥", "S&P", "다우",
  "실적", "어닝", "반도체", "유가", "원유", "금값", "관세", "무역",
  "GDP", "성장률", "고용", "실업", "수출", "수입", "경기", "침체",
  "연금", "ETF", "배당", "외국인", "기관", "공매도", "IPO", "상장",
  // 영문 매체(BBC·CNBC)가 한국어 키워드에 하나도 안 걸려 항상 0점을 받던 문제.
  "rate", "fed", "inflation", "cpi", "tariff", "trade", "stock", "market",
  "bond", "yield", "oil", "earnings", "gdp", "jobs", "dollar", "recession",
  "chip", "semiconductor", "treasury", "economy", "export", "import",
];

const PART2_KEYWORDS = [
  "대통령", "국회", "정부", "법안", "개정", "판결", "검찰", "경찰", "재판",
  "외교", "정상회담", "회담", "제재", "규제", "정책", "예산", "세제",
  "안보", "국방", "전쟁", "휴전", "협상", "선거", "여당", "야당",
  "AI", "인공지능", "플랫폼", "빅테크", "데이터", "개인정보", "보안",
  "기후", "에너지", "원전", "노동", "파업", "교육", "의료", "부동산",
  "election", "president", "parliament", "court", "sanction", "war",
  "ceasefire", "treaty", "summit", "regulation", "policy", "privacy",
  "climate", "energy", "strike", "security", "military", "immigration",
];

/**
 * 보도자료·공지 기사. 브리핑 재료가 아니다.
 * 제목 앞 대괄호 태그는 매체가 스스로 "이건 기사가 아니다"라고 붙인 표식이다.
 */
const NOISE_TAGS = [
  "게시판", "부고", "인사", "동정", "신간", "알림", "특징주", "바이오스냅",
  "표", "포토", "영상", "사진", "오늘의", "운세", "주간", "재송",
  // 시그널·헤드라인 묶음 기사. 앞의 것은 개별 종목 매수신호라 특히 실으면 안 된다.
  "시그널", "헤드라인", "브리핑", "차트", "포착",
];

/** 지역 행정 공지에 흔한 말. 단독 보도일 때만 걸러낸다. */
const ANNOUNCEMENT_WORDS = [
  "모집", "채용박람회", "공모전", "설명회", "간담회", "시상식", "위촉",
  "임명", "기념식", "축제", "체험행사", "캠페인 전개", "업무협약",
  "출범식", "개소", "선포", "발대식",
];

/**
 * 영문 매체의 서비스·컬럼 기사. 사건 보도가 아니라 안내문이다.
 * "How to get a low auto loan rate", "Tuesday's big stock stories" 류.
 */
const EN_NOISE = [
  /^\s*(how to|here'?s|here is|what to|why you|when to|should you)\b/i,
  /\b(big stock stories|stocks to watch|what to watch|things to know)\b/i,
  /\b(best|top)\s+\d+\b/i,
  /\b(deals?|discount|sale|gift guide|review):/i,
];

function isServicePiece(title: string): boolean {
  return EN_NOISE.some((pattern) => pattern.test(title));
}

function noiseTag(title: string): boolean {
  const match = title.match(/^\s*[[<【]([^\]>】]{1,12})[\]>】]/);
  if (!match) return false;
  const tag = match[1].replace(/\s/g, "");
  return NOISE_TAGS.some((noise) => tag.includes(noise));
}

function isAnnouncement(title: string): boolean {
  return ANNOUNCEMENT_WORDS.some((word) => title.includes(word));
}

/**
 * 장중 시황 중계. 통신사는 같은 장을 하루에 여러 번 고쳐 쓴다
 * ("장초반 2%대 하락" → "1~2%대 하락세" → "2~3%대 하락(종합)").
 * 제목이 매번 달라 지문으로는 안 묶인다. 규칙으로 접는다.
 */
const RECAP_SUBJECTS = ["코스피", "코스닥", "증시", "환율", "국고채", "원/달러"];
const RECAP_MOVES = [
  "하락", "상승", "급락", "급등", "마감", "출발", "약세", "강세",
  "보합", "낙폭", "상승폭", "반등", "휘청",
];

function isMarketRecap(title: string): boolean {
  return (
    RECAP_SUBJECTS.some((word) => title.includes(word)) &&
    RECAP_MOVES.some((word) => title.includes(word))
  );
}

/** 시황 중계는 하루치 중 하나만 남긴다. "(종합)"이 붙은 최종본을 우선한다. */
function collapseRecaps(clusters: Cluster[]): Cluster[] {
  const recaps = clusters.filter((item) => isMarketRecap(item.lead_item.title));
  if (recaps.length <= 1) return clusters;

  const keeper = [...recaps].sort((a, b) => {
    const summary =
      Number(b.lead_item.title.includes("종합")) -
      Number(a.lead_item.title.includes("종합"));
    if (summary !== 0) return summary;
    return b.lead_item.published_at.localeCompare(a.lead_item.published_at);
  })[0];

  const dropped = new Set(recaps.filter((item) => item !== keeper));
  // 접힌 중계본도 대표 묶음에 붙여 둔다. 몇 번 고쳐 썼는지가 곧 그날의 변동성이다.
  keeper.others = [
    ...keeper.others,
    ...[...dropped].map((item) => item.lead_item),
  ];

  return clusters.filter((item) => !dropped.has(item));
}

/**
 * 제목 지문. 언어에 따라 다르게 만든다.
 *
 * 한국어는 글자 2-gram이 형태소 분석 없이도 잘 듣는다.
 * 영어에 같은 방법을 쓰면 "th", "in", "er" 같은 흔한 조각 때문에
 * 무관한 기사끼리 다 비슷해진다 — 실제로 관세 기사와 이란 기사가 한 묶음이 됐다.
 * 영어는 단어 단위로 비교한다.
 */
type Fingerprint = { lang: "ko" | "en"; set: Set<string> };

const EN_STOPWORDS = new Set([
  "the", "and", "for", "with", "from", "that", "this", "are", "was", "were",
  "has", "have", "had", "will", "would", "can", "could", "says", "say", "said",
  "after", "over", "into", "out", "its", "his", "her", "their", "but", "not",
  "new", "how", "why", "what", "who", "amid", "than", "then", "more", "most",
]);

function bigrams(text: string): Set<string> {
  const grams = new Set<string>();
  for (let i = 0; i < text.length - 1; i += 1) {
    grams.add(text.slice(i, i + 2));
  }
  return grams;
}

function fingerprint(title: string): Fingerprint | null {
  const stripped = title
    .replace(/\[[^\]]{1,20}\]/g, " ")
    .replace(/\([^)]{1,30}\)/g, " ")
    .replace(/<[^>]{1,30}>/g, " ")
    // 숫자를 지운다. "코스피 1~2%대 하락"과 "코스피 2~3%대 하락"은 같은 사건인데
    // 수치를 남기면 지문이 갈라진다.
    .replace(/[\d.,%↑↓]+/g, " ");

  if (/[가-힣]/.test(stripped)) {
    const set = bigrams(stripped.replace(/[^\p{L}]+/gu, "").toLowerCase());
    return set.size === 0 ? null : { lang: "ko", set };
  }

  const set = new Set(
    stripped
      .toLowerCase()
      .split(/[^a-z]+/)
      .filter((word) => word.length >= 3 && !EN_STOPWORDS.has(word)),
  );
  return set.size === 0 ? null : { lang: "en", set };
}

/**
 * 조각마다 무게를 다르게 준다 (IDF).
 *
 * 맨 자카드는 "하락", "정부" 같은 흔한 조각을 고유명사와 똑같이 센다.
 * 그래서 임계값을 낮추면 무관한 기사가 붙고, 높이면 같은 사건이 갈라졌다.
 * 그날 후보 전체에서 드물게 나오는 조각일수록 크게 세면 그 딜레마가 풀린다.
 */
type Weights = Map<string, number>;

function buildWeights(prints: Fingerprint[]): Weights {
  const df = new Map<string, number>();
  for (const print of prints) {
    for (const token of print.set) {
      df.set(token, (df.get(token) ?? 0) + 1);
    }
  }

  const total = Math.max(prints.length, 1);
  const weights: Weights = new Map();
  for (const [token, count] of df) {
    weights.set(token, Math.log(total / count) + 0.1);
  }
  return weights;
}

function weightedJaccard(
  a: Set<string>,
  b: Set<string>,
  weights: Weights,
): number {
  let shared = 0;
  let union = 0;
  for (const token of a) {
    const weight = weights.get(token) ?? 1;
    union += weight;
    if (b.has(token)) shared += weight;
  }
  for (const token of b) {
    if (!a.has(token)) union += weights.get(token) ?? 1;
  }
  return union === 0 ? 0 : shared / union;
}

/** 같은 사건 판정 기준. 지문 방식이 달라 언어별로 값이 다르다. */
export const SAME_EVENT: Record<Fingerprint["lang"], number> = {
  ko: 0.18,
  en: 0.24,
};

function similarity(
  a: Fingerprint,
  b: Fingerprint,
  weights: Weights,
): number {
  // 언어가 다르면 같은 사건이어도 지문을 맞출 수 없다. 비교하지 않는다.
  if (a.lang !== b.lang) return 0;
  return weightedJaccard(a.set, b.set, weights);
}

function isWire(source: string) {
  return WIRE_SOURCES.some((wire) => source.startsWith(wire));
}

function partOf(category: string): 1 | 2 {
  return PART1_CATEGORIES.has(category) ? 1 : 2;
}

function keywordHits(item: Candidate, part: 1 | 2): number {
  // 소문자로 맞춘다. 한글은 영향받지 않고, 영문은 대소문자 때문에 놓치지 않는다.
  const haystack = `${item.title} ${item.lead ?? ""}`.toLowerCase();
  const words = part === 1 ? PART1_KEYWORDS : PART2_KEYWORDS;
  let hits = 0;
  for (const word of words) if (haystack.includes(word.toLowerCase())) hits += 1;
  return Math.min(hits, 4);
}

/** 대표 기사 고르기: 통신사 > 리드문이 충실한 것 > 최신. */
function pickLead(items: Candidate[]): Candidate {
  return [...items].sort((a, b) => {
    const wire = Number(isWire(b.source)) - Number(isWire(a.source));
    if (wire !== 0) return wire;
    const lead = (b.lead?.length ?? 0) - (a.lead?.length ?? 0);
    if (lead !== 0) return lead;
    return b.published_at.localeCompare(a.published_at);
  })[0];
}

/**
 * 같은 사건끼리 묶는다.
 * 최신순으로 훑으며 기존 묶음과 겹치면 합치고, 아니면 새 묶음을 만든다.
 */
function cluster(items: Candidate[], scale = 1): Candidate[][] {
  const prints = new Map<Candidate, Fingerprint>();
  for (const item of items) {
    const print = fingerprint(item.title);
    if (print) prints.set(item, print);
  }

  const weights = buildWeights([...prints.values()]);
  const groups: { print: Fingerprint; items: Candidate[] }[] = [];

  for (const item of items) {
    const print = prints.get(item);
    if (!print) continue;

    // 첫 매치가 아니라 가장 많이 겹치는 묶음에 붙인다.
    let hit: (typeof groups)[number] | null = null;
    let best = SAME_EVENT[print.lang] * scale;
    for (const group of groups) {
      const overlap = similarity(group.print, print, weights);
      if (overlap >= best) {
        best = overlap;
        hit = group;
      }
    }

    if (hit) {
      hit.items.push(item);
      // 묶음의 지문은 처음 것을 유지한다. 계속 합치면 주제가 흘러간다.
    } else {
      groups.push({ print, items: [item] });
    }
  }

  return groups.map((group) => group.items);
}

function hoursAgo(iso: string, now: number): number {
  return (now - new Date(iso).getTime()) / 3600000;
}

/**
 * 카테고리 한쪽이 목록을 다 차지하지 않게 한다.
 * 정치 기사가 많다고 2부가 전부 정치가 되면 "오늘의 세계"가 아니다.
 */
/**
 * 카테고리 배분.
 * - 최소 보장: 후보가 있는 카테고리는 최소 minPerCategory건을 먼저 확보한다.
 *   그러지 않으면 정치 기사가 많은 날 2부가 통째로 정치가 되고,
 *   국제·테크가 매일 0~1건으로 밀린다.
 * - 상한: 한 카테고리가 목록을 다 차지하지 못하게 막는다.
 * - 남은 자리는 점수 순으로 채운다.
 */
function withQuota(
  clusters: Cluster[],
  limit: number,
  maxPerCategory: number,
  minPerCategory = 0,
) {
  const picked = new Set<Cluster>();
  const counts = new Map<string, number>();

  const take = (item: Cluster) => {
    picked.add(item);
    const category = item.lead_item.category;
    counts.set(category, (counts.get(category) ?? 0) + 1);
  };

  if (minPerCategory > 0) {
    const categories = new Set(
      clusters.map((item) => item.lead_item.category),
    );
    for (const category of categories) {
      const pool = clusters.filter(
        (item) => item.lead_item.category === category,
      );
      for (const item of pool.slice(0, minPerCategory)) {
        if (picked.size >= limit) break;
        take(item);
      }
    }
  }

  for (const item of clusters) {
    if (picked.size >= limit) break;
    if (picked.has(item)) continue;
    if ((counts.get(item.lead_item.category) ?? 0) >= maxPerCategory) continue;
    take(item);
  }

  for (const item of clusters) {
    if (picked.size >= limit) break;
    if (!picked.has(item)) take(item);
  }

  // 점수 순서를 되살린다. 앞에서 카테고리별로 뽑느라 흐트러졌다.
  return clusters.filter((item) => picked.has(item));
}

export type SelectOptions = {
  /** 1부에 넘길 묶음 수. */
  part1Limit?: number;
  /** 2부에 넘길 묶음 수. */
  part2Limit?: number;
  /** 기준 시각. 테스트에서 고정하기 위해 받는다. */
  now?: number;
  /** 같은 사건 임계값 배율. 1보다 크면 덜 묶이고 작으면 더 묶인다. 튜닝용. */
  scale?: number;
};

/**
 * 후보를 사건 단위로 묶고 점수를 매겨 1부·2부로 나눠 돌려준다.
 * 합산 20건 내외가 기본값이다 (ARCHITECTURE §4-4).
 */
export function selectNews(
  candidates: Candidate[],
  options: SelectOptions = {},
): Selection {
  const {
    part1Limit = 10,
    part2Limit = 10,
    now = Date.now(),
    scale = 1,
  } = options;

  const sorted = [...candidates]
    // 매체가 기사가 아니라고 표시한 것은 바로 뺀다.
    .filter((item) => !noiseTag(item.title) && !isServicePiece(item.title))
    .sort((a, b) => b.published_at.localeCompare(a.published_at));

  const clusters: Cluster[] = cluster(sorted, scale).map((items) => {
    const leadItem = pickLead(items);
    const part = partOf(leadItem.category);
    const sourceCount = new Set(items.map((item) => item.source)).size;

    // 다수 매체 보도가 가장 강한 신호. 그다음이 주제 적합성.
    const crossSource = Math.min(sourceCount, 4) * 3;
    const topical = keywordHits(leadItem, part) * 1.5;
    const freshness = Math.max(0, 6 - hoursAgo(leadItem.published_at, now) / 4);
    // 리드문이 없으면 해석 재료가 없다 (PRODUCT §4-A).
    const usable = (leadItem.lead?.length ?? 0) >= 40 ? 2 : 0;

    return {
      lead_item: leadItem,
      others: items.filter((item) => item.id !== leadItem.id),
      sourceCount,
      score: crossSource + topical + freshness + usable,
      part,
      region: regionOf({
        category: leadItem.category,
        title: leadItem.title,
        lead: leadItem.lead,
        isEnglish: fingerprint(leadItem.title)?.lang === "en",
      }),
    };
  });

  const usable = collapseRecaps(clusters).filter(
    // 여러 매체가 쓴 공지는 실제 사건일 수 있다. 단독 공지만 버린다.
    (item) => !(item.sourceCount === 1 && isAnnouncement(item.lead_item.title)),
  );

  usable.sort((a, b) => b.score - a.score);

  return {
    part1: balanceRegions(
      usable.filter((item) => item.part === 1),
      part1Limit,
      Math.ceil(part1Limit * 0.7),
    ),
    part2: balanceRegions(
      usable.filter((item) => item.part === 2),
      part2Limit,
      Math.ceil(part2Limit * 0.4),
      1,
    ),
  };
}
