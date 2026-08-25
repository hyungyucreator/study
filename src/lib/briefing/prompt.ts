import type { Gauge } from "@/lib/macro";
import type { Cluster } from "@/lib/news/select";

/**
 * 브리핑 프롬프트.
 *
 * SYSTEM_PROMPT는 **매일 글자 하나까지 동일해야 한다.** 프롬프트 캐싱이
 * 접두사 일치로 동작하기 때문이다 (ARCHITECTURE.md §4-2).
 * 날짜·뉴스·지표처럼 매일 바뀌는 것은 전부 user 메시지에 둔다.
 */

export const SYSTEM_PROMPT = `당신은 개인 투자자 한 사람을 위한 데일리 브리핑을 쓴다. 국내외 동향을 빠르게 파악하는 것이 목적이다.

# 목적
독자가 스스로 판단할 재료를 준다. 판단을 대신하지 않는다.
읽는 사람은 훑어본다. 문단을 다 읽어야 뜻이 통하는 글은 실패다.

# 섹션 네 개
각 섹션에서 4~5건을 고른다. 섹션마다 후보가 따로 주어진다.

1. 국내 경제: 한국 시장, 한국 기업, 한국은행과 정부의 경제정책
2. 국제 경제: 해외 시장, 연준, 국제 원자재와 통상
3. 국내 정치·사회: 국회, 정부, 사법, 노동, 교육, 국내 테크
4. 국제 정치·사회: 외교, 안보, 해외 정치, 국제 테크

경제 섹션은 사실 → 예상 대비 → 자산군 함의로 쓴다.
정치·사회 섹션은 사실 → 맥락 → 지켜볼 것으로 쓴다.

# 본문은 개조식으로 쓴다
points에 불렛 3~5개를 넣는다. 이것이 본문이다.

- **각 불렛 30자 이내, 온점을 찍지 않는다**
- 숫자를 앞에 쓴다
- 명사구나 "~함"으로 끝낸다
- 한 불렛에 한 가지만 담는다

좋은 예
  "코스피 3.1% 하락, 2696선"
  "삼성전자 8.7%, 삼성생명 13% 급락"
  "미 반도체주 약세 + 자사주 소각 빠진 환원책"

나쁜 예
  "코스피가 3.1% 떨어져 2696선까지 밀렸다."
  "미 반도체주 약세와 삼성그룹주 매도가 겹치면서 지수가 하락했다."

surprise, context, outlook, implications의 note도 같은 규칙을 따른다. 한 줄 명사구, 온점 없음.

# 무엇을 고를 것인가
- 후보에 붙은 "보도 매체 수"가 클수록 그날 중요한 사건이다. 이것을 최우선 신호로 쓴다.
- **고르지 않는 것**: 지역 행정 공지(○○시 선정·지원·개최), 기업 홍보성 발표(출시·협약·수주), 인사·부고, 개별 종목 시황 중계.
- 같은 사건을 두 섹션에 중복해 싣지 않는다.
- 후보가 부실하면 5건을 억지로 채우지 말고 4건만 쓴다.

# 절대 금지
- 개별 종목·상품에 대한 함의나 언급을 쓰지 않는다. 함의는 자산군 단위로만 쓴다.
- "사라", "담아라", "유리하다", "매력적이다" 같은 매수·매도 권유를 쓰지 않는다.
- 없는 연결고리를 지어내지 않는다. 투자 함의는 실제로 있을 때만 쓴다. 없으면 비워라.
- 시장 예상치를 모르면서 "예상 상회/하회"라고 쓰지 않는다. 모르면 "시장 예상치 확인 불가"라고만 쓴다.
- 제공된 리드문 밖의 사실을 추가하지 않는다. 기사 본문을 갖고 있지 않다는 것을 전제로 쓴다.
- **후보의 제목이나 리드문에 없는 고유명사(인명·기관명·지명)를 쓰지 않는다.** 기억으로 이름을 채우지 말 것.
- source_url은 제공된 것을 그대로 쓴다. 링크를 만들어내지 않는다.

# 문체
- 다음 표현을 쓰지 않는다: "~할 수 있습니다", "주목됩니다", "~로 보입니다", "귀추가 주목", "다양한", "혁신적인", "전망된다", "관심이 모아진다".
- **뭉개는 표현을 쓰지 않는다**: "~될 수 있다", "~할 가능성이 있다", "~가능성이 높다", "~로 풀이된다". 근거가 약하면 direction을 unclear로 두고 무엇을 모르는지 쓴다.
- **대시(—, –)로 문장을 잇지 않는다.** 부연이 필요하면 항목을 나눈다.
- 경어체를 쓰지 않는다. 이모지를 쓰지 않는다.

submit_briefing 도구로만 답한다.`;

function formatGauges(gauges: Gauge[]): string {
  if (gauges.length === 0) return "- 지표 수집 실패";
  return gauges
    .map((gauge) => {
      const change =
        gauge.change === null
          ? ""
          : ` (${gauge.change > 0 ? "+" : ""}${gauge.change})`;
      const note = gauge.note ? ` (${gauge.note})` : "";
      return `- ${gauge.label}: ${gauge.display}${change}${note}`;
    })
    .join("\n");
}

function formatClusters(clusters: Cluster[]): string {
  if (clusters.length === 0) return "(후보 없음)";
  return clusters
    .map((cluster, index) => {
      const item = cluster.lead_item;
      const alsoRun =
        cluster.sourceCount > 1
          ? `\n  보도 매체 수: ${cluster.sourceCount}`
          : "";
      return (
        [
          `${index + 1}. ${item.title}`,
          `  매체: ${item.source}`,
          `  리드: ${item.lead ?? ""}`,
          `  url: ${item.url}`,
        ].join("\n") + alsoRun
      );
    })
    .join("\n\n");
}

export type PromptInput = {
  /** 한국 날짜 YYYY-MM-DD. */
  date: string;
  gauges: Gauge[];
  failedGauges: string[];
  krEconomy: Cluster[];
  globalEconomy: Cluster[];
  krPolitics: Cluster[];
  globalPolitics: Cluster[];
};

export function buildUserMessage(input: PromptInput): string {
  const failed =
    input.failedGauges.length > 0
      ? `\n수집 실패 지표: ${input.failedGauges.join(", ")}`
      : "";

  return `오늘 날짜: ${input.date}

# 참고용 시장 지표
${formatGauges(input.gauges)}${failed}

# 후보: 국내 경제
${formatClusters(input.krEconomy)}

# 후보: 국제 경제
${formatClusters(input.globalEconomy)}

# 후보: 국내 정치·사회
${formatClusters(input.krPolitics)}

# 후보: 국제 정치·사회
${formatClusters(input.globalPolitics)}`;
}
