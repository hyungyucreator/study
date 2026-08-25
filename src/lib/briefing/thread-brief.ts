import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

import { callWithTool } from "./anthropic";

/**
 * 이슈 브리프.
 *
 * 이슈에 서사를 붙인다. 타임라인만 있으면 기사 목록일 뿐이다.
 * "이게 무엇이고, 지금까지 어떻게 흘렀고, 다음에 무엇을 볼 것인가"가 있어야 이슈다.
 *
 * 전개가 붙은 이슈만 다시 쓴다. 하루 3~5개라 비용이 크지 않고,
 * 항상 최신 상태를 유지한다.
 */

export type ThreadBrief = {
  /** 이 이슈가 무엇인가. */
  what: string[];
  /** 지금까지 어떻게 흘렀나. */
  so_far: string[];
  /** 다음 분기점. */
  next: string[];
  /** 이 이슈가 마무리됐는가. */
  closed: boolean;
};

const SYSTEM_PROMPT = `당신은 진행 중인 이슈를 한 장으로 정리한다.

# 목적
독자가 이 이슈 화면을 처음 열었을 때, 지금까지의 흐름을 5분 안에 따라잡게 한다.
기사 목록은 이미 아래에 있다. 당신은 그것들을 꿰는 실을 쓴다.

# 세 부분
- what: 이 이슈가 무엇인가. 2~3개. 배경과 시작점.
- so_far: 지금까지 어떻게 흘렀나. 3~5개. 시간 순서. **각 항목에 날짜를 앞에 쓴다.**
- next: 다음에 무엇을 볼 것인가. 2~3개. 확정된 일정이나 분기점.

# 쓰는 법
- **개조식. 각 40자 이내. 온점을 찍지 않는다.**
- 숫자와 날짜를 앞에 쓴다
- 명사구나 "~함"으로 끝낸다
- so_far는 기사 제목을 나열하지 말고 **무엇이 달라졌는지**를 쓴다

# 종결 판정
closed는 이 이슈가 실제로 마무리됐을 때만 true다.
협상 타결, 법안 통과, 선거 종료, 실적 발표 완료 같은 것.
"당분간 조용할 것 같다"는 종결이 아니다. 판단이 서지 않으면 false.

# 절대 금지
- 제공된 기록 밖의 사실을 추가하지 않는다. 기억으로 채우지 말 것.
- 매수·매도 권유, 종목 추천.
- 대시(—, –)로 문장 잇기.
- "~할 수 있다", "~가능성이 높다" 같은 뭉개는 표현.
- 경어체, 이모지.

submit_brief 도구로만 답한다.`;

const BRIEF_TOOL = {
  name: "submit_brief",
  description: "이슈 브리프를 제출한다.",
  input_schema: {
    type: "object" as const,
    properties: {
      what: {
        type: "array",
        minItems: 2,
        maxItems: 3,
        items: { type: "string" },
      },
      so_far: {
        type: "array",
        minItems: 2,
        maxItems: 5,
        description: "시간 순서. 각 항목 앞에 날짜(예: 8.26)를 쓴다.",
        items: { type: "string" },
      },
      next: {
        type: "array",
        minItems: 1,
        maxItems: 3,
        items: { type: "string" },
      },
      closed: { type: "boolean" },
    },
    required: ["what", "so_far", "next", "closed"],
  },
};

type Entry = {
  date: string;
  headline: string | null;
  points: string[] | null;
};

/**
 * 한 이슈의 브리프를 다시 쓴다.
 * 실패해도 브리핑 생성을 막지 않는다. 브리프가 낡을 뿐이다.
 */
export async function refreshBrief(
  threadId: string,
  title: string,
  today: string,
): Promise<boolean> {
  const supabase = createAdminClient();

  const { data } = await supabase
    .from("briefing_news")
    .select("headline, points, briefings(date)")
    .eq("thread_id", threadId)
    .order("position");

  const entries = ((data ?? []) as unknown as (Entry & {
    briefings: { date: string } | null;
  })[])
    .map((entry) => ({ ...entry, date: entry.briefings?.date ?? "" }))
    .filter((entry) => entry.date)
    .sort((a, b) => a.date.localeCompare(b.date));

  if (entries.length === 0) return false;

  const record = entries
    .map(
      (entry) =>
        `[${entry.date}] ${entry.headline}\n${(entry.points ?? [])
          .map((point) => `  - ${point}`)
          .join("\n")}`,
    )
    .join("\n\n");

  try {
    const { data: brief } = await callWithTool<ThreadBrief>({
      system: SYSTEM_PROMPT,
      userMessage: `이슈: ${title}
오늘 날짜: ${today}

# 지금까지의 브리핑 기록
${record}`,
      tool: BRIEF_TOOL,
      maxTokens: 2000,
    });

    const trim = (list: string[] | undefined) =>
      (list ?? []).map((line) => line.trim().replace(/\.$/, "")).filter(Boolean);

    await supabase
      .from("threads")
      .update({
        brief_json: {
          what: trim(brief.what),
          so_far: trim(brief.so_far),
          next: trim(brief.next),
        },
        brief_updated_on: today,
        closed_on: brief.closed ? today : null,
      })
      .eq("id", threadId);

    return true;
  } catch {
    return false;
  }
}
