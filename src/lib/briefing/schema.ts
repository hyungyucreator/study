/**
 * 브리핑 구조화 출력 스키마.
 *
 * 모델에게 마크다운을 통째로 쓰게 하지 않는다. 구조만 받고 본문은 코드가 조립한다
 * (render.ts). 그래야 형식과 문체가 매일 흔들리지 않는다.
 *
 * 섹션을 4개 배열로 나눈 이유: 국내와 국제, 경제와 정치·사회의 균형을
 * 프롬프트 부탁이 아니라 구조로 강제하기 위해서다. 하나의 배열로 두고
 * "골고루 골라라"라고 쓰면 모델이 한쪽으로 쏠린다.
 */

import {
  BRIEFING_ASSET_VALUES,
  type AssetOutlook,
} from "./asset-classes";

export type { AssetOutlook };

export const SECTIONS = [
  { key: "kr_economy", label: "국내 경제", kind: "economy" },
  { key: "global_economy", label: "국제 경제", kind: "economy" },
  { key: "kr_politics", label: "국내 정치·사회", kind: "politics" },
  { key: "global_politics", label: "국제 정치·사회", kind: "politics" },
] as const;

export type SectionKey = (typeof SECTIONS)[number]["key"];

export function sectionLabel(key: string) {
  return SECTIONS.find((section) => section.key === key)?.label ?? key;
}

/** 오늘의 톱을 대표하는 숫자 하나. */
export type TopStat = {
  value: string;
  label: string;
  direction: "up" | "down" | "flat";
};

/** 오늘의 톱. 하루 전체에서 단 한 건. 화면 위계의 정점이다. */
export type TopPick = {
  source_url: string;
  stat: TopStat | null;
};

/** 모델이 돌려주는 이슈 배정. 기존이면 id, 새 흐름이면 new_title. */
export type ThreadRef = {
  id?: string | null;
  new_title?: string;
};

/**
 * 항목 하나. 경제·정치 구분 없이 같은 골격이다 (2026-08-26 통합).
 * 구조가 항목마다 다르면 화면이 항목마다 달라진다.
 * 예상 대비·맥락·지켜볼 것은 전부 insights로 통합됐다.
 */
export type BriefingItemPayload = {
  headline: string;
  /** 내용. 문장체 문단 2~3개. 이것이 본문이다. */
  body: string[];
  /** 인사이트. 개조식 불렛 1~4개. 왜 중요한가, 무엇과 연결되나. */
  insights: string[];
  /** 이 항목이 속한 이슈. 브리핑에 기억을 붙이는 장치다. */
  thread: ThreadRef;
  /** 초보자가 모를 만한 용어 0~3개. 개념 카드로 이어진다. */
  terms: string[];
  source_url: string;
  source_name: string;
};

export type BriefingPayload = {
  kr_economy: BriefingItemPayload[];
  global_economy: BriefingItemPayload[];
  kr_politics: BriefingItemPayload[];
  global_politics: BriefingItemPayload[];
  /** 브리핑 전체를 종합한 자산군 방향. 항목별로 흩어두지 않는다. */
  asset_outlook: AssetOutlook[];
  /** 오늘의 톱. 실린 항목 중 단 한 건. */
  top: TopPick;
};

export function isEconomySection(key: string) {
  return key === "kr_economy" || key === "global_economy";
}

const headline = {
  type: "string",
  description:
    "한 줄 제목. 20자 내외. 온점을 찍지 않는다. 기사 제목을 그대로 베끼지 말 것.",
};

const body = {
  type: "array",
  minItems: 2,
  maxItems: 3,
  description:
    "내용. 문장체 문단 2~3개, 각 2~4문장. 신문 스트레이트 기사처럼 사실을 서술한다. 제공된 본문·리드의 구체 정보(숫자·기관·일정·인물·발언·배경)를 빠뜨리지 말고 담아, 이것만 읽어도 사건이 이해되게 쓴다. 단문, 온점 사용, 경어체 금지. 첫 문단이 핵심 사건, 다음 문단이 배경과 반응이다.",
  items: { type: "string" },
};

const insights = {
  type: "array",
  minItems: 1,
  maxItems: 4,
  description:
    "인사이트. 개조식 불렛 1~4개, 각 50자 이내, 온점 없음. 이 사건이 왜 중요한가, 무엇과 연결되나, 다음 분기점은 무엇인가. 경제 항목은 시장 예상 대비를 **확인 가능할 때만** 포함한다(모르면 쓰지 않는다). 정치·사회 항목은 맥락과 지켜볼 것을 여기에 담는다. 내용의 사실을 되풀이하지 않는다. 내용에 없는 새 사실을 추가하지 않는다. 개별 종목 언급 금지.",
  items: { type: "string" },
};

const source_url = {
  type: "string",
  description: "제공된 후보의 url을 그대로. 만들어내지 말 것.",
};

const thread = {
  type: "object",
  description:
    "이 항목이 속한 이슈. 제공된 '진행 중인 이슈' 목록에 해당하는 것이 있으면 반드시 그 id를 쓴다. 없을 때만 new_title로 새 이슈를 만든다.",
  properties: {
    id: {
      type: ["string", "null"],
      description: "기존 이슈의 id. 목록에 있는 값을 그대로 쓴다.",
    },
    new_title: {
      type: "string",
      description:
        "새 이슈 제목. **id가 null이면 반드시 채운다. 비워두지 않는다.** 사건이 아니라 흐름을 가리킨다. 몇 주 뒤 후속 기사가 나와도 같은 제목 아래 묶일 수 있어야 한다. 좋은 예: '미국 통상 압박', '엔비디아 실적과 AI 투자', '한국은행 통화정책'. 나쁜 예: '협상단 철수', '25일 코스피 급락'.",
    },
  },
  required: ["id", "new_title"],
};

const terms = {
  type: "array",
  maxItems: 3,
  description:
    "이 항목에서 **투자를 막 시작한 사람이 모를 만한 용어** 0~3개. 본문에 나온 표기를 그대로 쓴다. 일반 상식어(금리, 주가, 정부)는 넣지 않는다. 없으면 빈 배열. 좋은 예: '국채 바이백', '잭슨홀', '인적분할', '유상증자'.",
  items: { type: "string" },
};

/** 항목 스키마. 경제·정치 공통이다. 섹션별 지침은 insights 설명과 시스템 프롬프트에 있다. */
const item = {
  type: "object",
  properties: {
    headline,
    body,
    insights,
    thread,
    terms,
    source_url,
    source_name: { type: "string" },
  },
  required: [
    "headline",
    "body",
    "insights",
    "thread",
    "terms",
    "source_url",
    "source_name",
  ],
};

const assetOutlook = {
  type: "array",
  maxItems: 5,
  description:
    "브리핑 전체를 놓고 본 자산군 방향. **항목마다 붙이지 말고 여기서 한 번만 종합한다.** 오늘 뉴스로 방향을 말할 수 있는 자산군만 넣는다. 2~4개가 보통이고, 억지로 채우면 안 된다. 같은 자산군을 두 번 넣지 않는다. 모순되는 근거가 있으면 unclear로 두고 무엇이 엇갈리는지 쓴다.",
  items: {
    type: "object",
    properties: {
      asset_class: { type: "string", enum: BRIEFING_ASSET_VALUES },
      direction: { type: "string", enum: ["up", "down", "unclear"] },
      note: {
        type: "string",
        description:
          "왜 그 방향인지. 개조식 한 줄, 50자 이내, 온점 없음.",
      },
      evidence: {
        type: "array",
        minItems: 1,
        maxItems: 3,
        description:
          "근거가 된 기사의 source_url. 위 섹션에서 고른 기사 중에서만 쓴다.",
        items: { type: "string" },
      },
    },
    required: ["asset_class", "direction", "note", "evidence"],
  },
};

const top = {
  type: "object",
  description:
    "오늘의 톱. 네 섹션에서 고른 항목 중 **가장 파장이 큰 단 한 건**. 그 항목의 source_url을 그대로 쓴다.",
  properties: {
    source_url,
    stat: {
      type: ["object", "null"],
      description:
        "오늘을 대표하는 숫자 하나. **그 항목의 불렛에 이미 쓴 숫자만 쓴다.** 마땅한 숫자가 없으면 null. 지어내지 말 것.",
      properties: {
        value: {
          type: "string",
          description: "숫자와 단위만. 예: '4.74%', '1,383원', '-3.1%'",
        },
        label: {
          type: "string",
          description: "무슨 숫자인지. 10자 이내 명사구. 예: '미 10년물', '코스피'",
        },
        direction: {
          type: "string",
          enum: ["up", "down", "flat"],
          description: "상승 up, 하락 down, 수준 자체가 뉴스면 flat",
        },
      },
      required: ["value", "label", "direction"],
    },
  },
  required: ["source_url", "stat"],
};

function section(description: string, items: object) {
  return {
    type: "array",
    minItems: 4,
    maxItems: 5,
    description,
    items,
  };
}

/** Anthropic tool의 input_schema. 모델이 이 모양으로만 답하게 강제한다. */
export const BRIEFING_TOOL = {
  name: "submit_briefing",
  description: "오늘의 브리핑을 4개 섹션으로 나눠 제출한다.",
  input_schema: {
    type: "object" as const,
    properties: {
      kr_economy: section(
        "국내 경제. 한국 시장, 한국 기업, 한국은행과 정부의 경제정책.",
        item,
      ),
      global_economy: section(
        "국제 경제. 해외 시장, 연준, 국제 원자재와 통상.",
        item,
      ),
      kr_politics: section(
        "국내 정치·사회. 국회, 정부, 사법, 노동, 교육, 국내 테크.",
        item,
      ),
      global_politics: section(
        "국제 정치·사회. 외교, 안보, 해외 정치, 국제 테크.",
        item,
      ),
      asset_outlook: assetOutlook,
      top,
    },
    required: [
      "kr_economy",
      "global_economy",
      "kr_politics",
      "global_politics",
      "asset_outlook",
      "top",
    ],
  },
};
