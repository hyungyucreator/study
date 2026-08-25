import "server-only";

import { callWithTool } from "@/lib/briefing/anthropic";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * 개념 카드.
 *
 * 브리핑이 짚은 용어를 초보자가 읽을 수 있게 설명한다.
 * "채권 하방, 장기금리 추가 상승 베팅"은 금리와 채권 가격의 역관계를
 * 이미 아는 사람에게만 정보다. 모르면 암호다.
 *
 * **한 번 만들면 영구 저장한다** (ARCHITECTURE.md §4-4).
 * 같은 용어를 다시 만들지 않으므로 며칠 지나면 호출이 거의 사라진다.
 *
 * 모델은 Sonnet을 쓴다. ARCHITECTURE §4-1은 개념 카드를 Haiku로 적어뒀지만
 * 개정했다. 재생성이 없어 하루 몇 건뿐이라 비용 차이가 미미하고,
 * 초보자에게 개념을 정확히 설명하는 일은 요약보다 어렵다.
 * 값싼 모델로 틀린 설명을 영구 저장하는 쪽이 더 비싸다.
 */

export type ConceptCard = {
  id: string;
  term: string;
  summary: string | null;
  body_md: string;
};

const SYSTEM_PROMPT = `당신은 투자를 막 시작한 사람에게 경제·금융 용어를 설명한다.

# 독자
주식 계좌를 만든 지 얼마 안 됐다. 뉴스를 읽고 싶지만 용어에서 막힌다.

# 쓰는 법
- summary: 2~3문장. 이 용어가 무엇인지, 그래서 무엇이 달라지는지.
- body_md: 4~6문장. summary를 반복하지 말고 한 겹 더 들어간다.
  왜 그렇게 되는지, 어떤 상황에서 등장하는지, 무엇과 헷갈리기 쉬운지.

# 원칙
- **설명에 또 다른 어려운 용어를 쓰지 않는다.** 꼭 필요하면 그 자리에서 풀어 쓴다.
- 인과를 밝힌다. "금리가 오르면 채권 가격이 내린다"로 끝내지 말고 왜 그런지 한 줄 붙인다.
- 숫자나 예시가 이해를 돕는다면 쓴다. 다만 특정 종목을 예로 들지 않는다.
- 지금 시점의 시세나 뉴스를 넣지 않는다. 이 카드는 몇 달 뒤에도 읽힌다.

# 절대 금지
- 매수·매도 권유, 종목·상품 추천.
- "~할 수 있습니다", "주목됩니다", "다양한", "혁신적인" 같은 상투어.
- 대시(—, –)로 문장 잇기.
- 이모지.
- 경어체. 문장을 "~다"로 끝낸다.

submit_cards 도구로만 답한다.`;

const CARDS_TOOL = {
  name: "submit_cards",
  description: "용어 설명 카드를 제출한다.",
  input_schema: {
    type: "object" as const,
    properties: {
      cards: {
        type: "array",
        items: {
          type: "object",
          properties: {
            term: {
              type: "string",
              description: "요청받은 용어를 그대로. 바꾸지 말 것.",
            },
            summary: {
              type: "string",
              description: "2~3문장. 툴팁에 들어간다.",
            },
            body_md: {
              type: "string",
              description: "4~6문장. summary를 반복하지 않는다.",
            },
          },
          required: ["term", "summary", "body_md"],
        },
      },
    },
    required: ["cards"],
  },
};

/** 이미 있는 카드를 용어로 찾는다. */
export async function loadCards(terms: string[]): Promise<ConceptCard[]> {
  if (terms.length === 0) return [];
  const supabase = createAdminClient();

  const { data } = await supabase
    .from("concept_cards")
    .select("id, term, summary, body_md")
    .in("term", terms);

  return (data ?? []) as ConceptCard[];
}

/**
 * 없는 용어만 골라 한 번의 호출로 만들고 저장한다.
 * 실패해도 브리핑 생성을 막지 않는다. 카드가 없으면 용어에 밑줄이 안 그어질 뿐이다.
 */
export async function ensureCards(terms: string[]): Promise<ConceptCard[]> {
  const unique = [...new Set(terms.map((term) => term.trim()).filter(Boolean))];
  if (unique.length === 0) return [];

  const existing = await loadCards(unique);
  const known = new Set(existing.map((card) => card.term));
  const missing = unique.filter((term) => !known.has(term));

  if (missing.length === 0) return existing;

  try {
    const { data } = await callWithTool<{
      cards: { term: string; summary: string; body_md: string }[];
    }>({
      system: SYSTEM_PROMPT,
      userMessage: `다음 용어를 설명한다.\n\n${missing
        .map((term) => `- ${term}`)
        .join("\n")}`,
      tool: CARDS_TOOL,
      maxTokens: 4000,
    });

    const rows = (data.cards ?? [])
      // 요청하지 않은 용어를 만들어 오면 버린다.
      .filter((card) => missing.includes(card.term))
      .map((card) => ({
        term: card.term,
        summary: card.summary,
        body_md: card.body_md,
      }));

    if (rows.length === 0) return existing;

    const supabase = createAdminClient();
    // term unique. 동시 실행으로 겹치면 기존 것을 유지한다.
    await supabase
      .from("concept_cards")
      .upsert(rows, { onConflict: "term", ignoreDuplicates: true });

    return [...existing, ...(await loadCards(missing))];
  } catch {
    // 카드 생성 실패로 브리핑을 잃지 않는다.
    return existing;
  }
}
