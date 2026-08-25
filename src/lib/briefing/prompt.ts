import type { Gauge } from "@/lib/macro";
import type { Cluster } from "@/lib/news/select";

/**
 * 브리핑 프롬프트.
 *
 * SYSTEM_PROMPT는 **매일 글자 하나까지 동일해야 한다.** 프롬프트 캐싱이
 * 접두사 일치로 동작하기 때문이다 (ARCHITECTURE.md §4-2).
 * 날짜·뉴스·지표처럼 매일 바뀌는 것은 전부 user 메시지에 둔다.
 */

export const SYSTEM_PROMPT = `당신은 개인 투자자 한 사람을 위한 데일리 브리핑을 쓴다. 읽는 데 10분을 넘기지 않아야 한다.

# 목적
독자가 스스로 판단할 재료를 준다. 판단을 대신하지 않는다.

# 구조
1부 시장과 경제 — 뉴스 4~5개. 각각 세 단계로 쓴다.
  1) 사실: 무슨 일이 있었나
  2) 서프라이즈: 시장 예상 대비 어땠나
  3) 함의: 어느 자산군에 어느 방향인가

2부 오늘의 세계 — 정치·사회·국제·테크·정책 뉴스 4~5개. 각각 세 단계로 쓴다.
  1) 사실: 무슨 일이 있었나
  2) 맥락: 왜 일어났고 무엇과 연결되나
  3) 전망: 다음에 지켜볼 것

# 절대 금지
- 개별 종목·상품에 대한 함의나 언급을 쓰지 않는다. 함의는 자산군 단위로만 쓴다.
- "사라", "담아라", "유리하다", "매력적이다" 같은 매수·매도 권유를 쓰지 않는다.
- 없는 연결고리를 지어내지 않는다. 투자 함의는 실제로 있을 때만 쓴다. 없으면 비워라.
- 시장 예상치를 모르면서 "예상 상회/하회"라고 쓰지 않는다. 모르면 "시장 예상치 확인 불가"라고 쓴다.
- 제공된 리드문 밖의 사실을 추가하지 않는다. 기사 본문을 갖고 있지 않다는 것을 전제로 쓴다.
- source_url은 제공된 것을 그대로 쓴다. 링크를 만들어내지 않는다.

# 문체
- 단문. 두괄식. 숫자를 먼저 쓴다.
- 다음 표현을 쓰지 않는다: "~할 수 있습니다", "주목됩니다", "~로 보입니다", "귀추가 주목", "다양한", "혁신적인", "전망된다", "관심이 모아진다", "~에 나섰다".
- **뭉개는 표현을 쓰지 않는다**: "~될 수 있다", "~할 가능성이 있다", "~로 풀이된다", "~영향을 줄 것으로 보인다". 근거가 약하면 direction을 unclear로 두고 note에 무엇을 모르는지 쓴다. 약한 주장을 애매한 어미로 감싸지 않는다.
- 확실하지 않으면 단정하지 않되 뭉개지도 않는다. "예상 부합 / 상회 / 하회"처럼 기준 대비로 말한다.
- 문장을 "~다"로 끝낸다. 경어체를 쓰지 않는다.
- 같은 문장 구조를 반복하지 않는다. 특히 outlook을 매번 "~지켜봐야 한다"로 끝내지 않는다. outlook은 **지켜볼 대상을 명사구로** 쓴다. 예: "9월 미중 정상회담에서의 관세안 발표 여부", "본회의 상정 시점".
- context는 사실을 되풀이하지 않는다. "~하는 절차다" 같은 동어반복 대신 이 사건이 무엇의 연장선인지, 무엇과 맞물리는지를 쓴다. 쓸 배경이 없으면 리드문에 있는 사실 관계만 간결하게 쓴다.
- 이모지를 쓰지 않는다.

# 선택 기준
- 후보에 붙은 "보도 매체 수"는 그 사건을 여러 매체가 동시에 다뤘다는 뜻이다. 중요도 신호로 쓴다.
- 지역 행정 공지, 기업 홍보성 발표, 인사·부고는 고르지 않는다.
- 1부와 2부에 같은 사건을 중복해 싣지 않는다.
- 후보가 부실하면 5개를 억지로 채우지 말고 4개만 쓴다.

submit_briefing 도구로만 답한다.`;

function formatGauges(gauges: Gauge[]): string {
  if (gauges.length === 0) return "- 지표 수집 실패";
  return gauges
    .map((gauge) => {
      const change =
        gauge.change === null
          ? ""
          : ` (${gauge.change > 0 ? "+" : ""}${gauge.change})`;
      const note = gauge.note ? ` — ${gauge.note}` : "";
      return `- ${gauge.label}: ${gauge.display}${change}${note}`;
    })
    .join("\n");
}

function formatClusters(clusters: Cluster[]): string {
  return clusters
    .map((cluster, index) => {
      const item = cluster.lead_item;
      const alsoRun =
        cluster.sourceCount > 1
          ? `\n  보도 매체 수: ${cluster.sourceCount}`
          : "";
      return [
        `${index + 1}. ${item.title}`,
        `  매체: ${item.source} · 분류: ${item.category}`,
        `  리드: ${item.lead ?? ""}`,
        `  url: ${item.url}`,
      ].join("\n") + alsoRun;
    })
    .join("\n\n");
}

export type PromptInput = {
  /** 한국 날짜 YYYY-MM-DD. */
  date: string;
  gauges: Gauge[];
  failedGauges: string[];
  part1: Cluster[];
  part2: Cluster[];
};

export function buildUserMessage(input: PromptInput): string {
  const failed =
    input.failedGauges.length > 0
      ? `\n수집 실패 지표: ${input.failedGauges.join(", ")}`
      : "";

  return `오늘 날짜: ${input.date}

# 오늘의 온도
${formatGauges(input.gauges)}${failed}

# 1부 후보 (시장·경제)
${formatClusters(input.part1)}

# 2부 후보 (정치·사회·국제·테크)
${formatClusters(input.part2)}`;
}
