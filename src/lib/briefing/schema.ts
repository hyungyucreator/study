/**
 * 브리핑 구조화 출력 스키마.
 *
 * 모델에게 마크다운을 통째로 쓰게 하지 않는다. 구조만 받고 본문은 코드가 조립한다
 * (render.ts). 그래야 형식과 문체가 매일 흔들리지 않고, 각 뉴스를
 * briefing_news에 3단 구조 그대로 저장할 수 있다.
 */

/** 자산군은 holdings와 같은 값을 쓴다. 개별 종목은 여기에 올 수 없다. */
export const IMPLICATION_ASSET_CLASSES = [
  "kr_equity",
  "intl_equity",
  "bond",
  "commodity",
  "currency",
  "cash",
] as const;

export type ImplicationAssetClass =
  (typeof IMPLICATION_ASSET_CLASSES)[number];

export type Implication = {
  asset_class: ImplicationAssetClass;
  /** 방향. 근거가 약하면 unclear를 쓰게 한다. */
  direction: "up" | "down" | "unclear";
  note: string;
};

export type Part1Item = {
  headline: string;
  fact: string;
  /** 시장 예상 대비. 예상치를 모르면 그렇게 적는다. */
  surprise: string;
  implications: Implication[];
  source_url: string;
  source_name: string;
};

export type Part2Item = {
  headline: string;
  fact: string;
  context: string;
  outlook: string;
  /** 실제로 있을 때만. 없으면 null. */
  investment_note: string | null;
  source_url: string;
  source_name: string;
};

export type BriefingPayload = {
  part1: Part1Item[];
  part2: Part2Item[];
};

/** Anthropic tool의 input_schema. 모델이 이 모양으로만 답하게 강제한다. */
export const BRIEFING_TOOL = {
  name: "submit_briefing",
  description: "오늘의 브리핑을 구조화해 제출한다.",
  input_schema: {
    type: "object" as const,
    properties: {
      part1: {
        type: "array",
        minItems: 4,
        maxItems: 5,
        description: "1부 시장·경제 뉴스. 중요한 순서대로.",
        items: {
          type: "object",
          properties: {
            headline: {
              type: "string",
              description: "한 줄 제목. 20자 내외. 기사 제목을 베끼지 말 것.",
            },
            fact: {
              type: "string",
              description:
                "무슨 일이 있었는지. 1~2문장. 숫자가 있으면 숫자를 먼저 쓴다.",
            },
            surprise: {
              type: "string",
              description:
                "시장 예상 대비 어땠는지. '예상 부합 / 상회 / 하회' 형태로. 예상치를 알 수 없으면 '시장 예상치 확인 불가'라고 쓴다. 지어내지 말 것.",
            },
            implications: {
              type: "array",
              maxItems: 3,
              description:
                "자산군 단위 함의. 실제로 있을 때만. 억지로 채우지 말 것. 없으면 빈 배열.",
              items: {
                type: "object",
                properties: {
                  asset_class: {
                    type: "string",
                    enum: IMPLICATION_ASSET_CLASSES,
                  },
                  direction: { type: "string", enum: ["up", "down", "unclear"] },
                  note: {
                    type: "string",
                    description:
                      "개조식으로 한 줄, 40자 이내. '~함'이나 명사구로 끝낸다. 대시로 잇지 않는다.",
                  },
                },
                required: ["asset_class", "direction", "note"],
              },
            },
            source_url: {
              type: "string",
              description: "제공된 후보의 url을 그대로. 만들어내지 말 것.",
            },
            source_name: { type: "string" },
          },
          required: [
            "headline",
            "fact",
            "surprise",
            "implications",
            "source_url",
            "source_name",
          ],
        },
      },
      part2: {
        type: "array",
        minItems: 4,
        maxItems: 5,
        description: "2부 오늘의 세계. 정치·사회·국제·테크·정책.",
        items: {
          type: "object",
          properties: {
            headline: { type: "string", description: "한 줄 제목. 20자 내외." },
            fact: { type: "string", description: "무슨 일이 있었는지. 1~2문장." },
            context: {
              type: "string",
              description:
                "왜 일어났고 무엇과 연결되나. 1~2문장. 배경 설명이지 의견이 아니다.",
            },
            outlook: {
              type: "string",
              description: "다음에 지켜볼 것. 1문장. 예언하지 말 것.",
            },
            investment_note: {
              type: ["string", "null"],
              description:
                "투자 함의. 실제로 있을 때만 한 문장. 없으면 null. 억지 연결 금지.",
            },
            source_url: { type: "string" },
            source_name: { type: "string" },
          },
          required: [
            "headline",
            "fact",
            "context",
            "outlook",
            "investment_note",
            "source_url",
            "source_name",
          ],
        },
      },
    },
    required: ["part1", "part2"],
  },
};
