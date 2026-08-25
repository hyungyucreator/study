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

/** 모델이 돌려주는 이슈 배정. 기존이면 id, 새 흐름이면 new_title. */
export type ThreadRef = {
  id?: string | null;
  new_title?: string;
};

type BaseItem = {
  headline: string;
  /** 개조식 불렛. 이것이 본문이다. */
  points: string[];
  /** 이 항목이 속한 이슈. 브리핑에 기억을 붙이는 장치다. */
  thread: ThreadRef;
  /** 초보자가 모를 만한 용어 0~3개. 개념 카드로 이어진다. */
  terms: string[];
  source_url: string;
  source_name: string;
};

export type EconomyItem = BaseItem & {
  /** 시장 예상 대비. 한 줄 명사구. */
  surprise: string;
};

export type PoliticsItem = BaseItem & {
  /** 왜 일어났고 무엇과 연결되나. 한 줄 명사구. */
  context: string;
  /** 다음에 지켜볼 것. 한 줄 명사구. */
  outlook: string;
  /** 실제로 있을 때만. 없으면 null. */
  investment_note: string | null;
};

export type BriefingItemPayload = EconomyItem | PoliticsItem;

export type BriefingPayload = {
  kr_economy: EconomyItem[];
  global_economy: EconomyItem[];
  kr_politics: PoliticsItem[];
  global_politics: PoliticsItem[];
  /** 브리핑 전체를 종합한 자산군 방향. 항목별로 흩어두지 않는다. */
  asset_outlook: AssetOutlook[];
};

export function isEconomySection(key: string) {
  return key === "kr_economy" || key === "global_economy";
}

const headline = {
  type: "string",
  description:
    "한 줄 제목. 20자 내외. 온점을 찍지 않는다. 기사 제목을 그대로 베끼지 말 것.",
};

const points = {
  type: "array",
  minItems: 3,
  maxItems: 5,
  description:
    "본문. 개조식 불렛 3~5개. 각 30자 이내. **온점을 찍지 않는다.** 숫자를 앞에 쓰고 명사구나 '~함'으로 끝낸다. 좋은 예: '코스피 3.1% 하락, 2696선'. 나쁜 예: '코스피가 3.1% 떨어져 2696선까지 밀렸다.'",
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

const economyItem = {
  type: "object",
  properties: {
    headline,
    points,
    thread,
    terms,
    surprise: {
      type: "string",
      description:
        "시장 예상 대비. 한 줄 명사구, 온점 없음. '예상 부합', '예상 상회' 형태로 시작한다. 예상치를 알 수 없으면 '시장 예상치 확인 불가'라고만 쓴다. 지어내지 말 것.",
    },
    source_url,
    source_name: { type: "string" },
  },
  required: [
    "headline",
    "points",
    "thread",
    "terms",
    "surprise",
    "source_url",
    "source_name",
  ],
};

const politicsItem = {
  type: "object",
  properties: {
    headline,
    points,
    thread,
    terms,
    context: {
      type: "string",
      description:
        "무엇의 연장선이고 무엇과 맞물리나. 한 줄 명사구, 온점 없음. 사실을 되풀이하지 말 것.",
    },
    outlook: {
      type: "string",
      description:
        "다음에 지켜볼 대상. 명사구로만, 온점 없음. 예: '9월 미중 정상회담에서의 관세안 확정 여부'. 예언하지 말 것.",
    },
    investment_note: {
      type: ["string", "null"],
      description:
        "투자 함의. 실제로 있을 때만 한 줄 명사구. 없으면 null. 억지 연결 금지.",
    },
    source_url,
    source_name: { type: "string" },
  },
  required: [
    "headline",
    "points",
    "thread",
    "terms",
    "context",
    "outlook",
    "investment_note",
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
        economyItem,
      ),
      global_economy: section(
        "국제 경제. 해외 시장, 연준, 국제 원자재와 통상.",
        economyItem,
      ),
      kr_politics: section(
        "국내 정치·사회. 국회, 정부, 사법, 노동, 교육, 국내 테크.",
        politicsItem,
      ),
      global_politics: section(
        "국제 정치·사회. 외교, 안보, 해외 정치, 국제 테크.",
        politicsItem,
      ),
      asset_outlook: assetOutlook,
    },
    required: [
      "kr_economy",
      "global_economy",
      "kr_politics",
      "global_politics",
      "asset_outlook",
    ],
  },
};
