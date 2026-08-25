import { assetClassLabel } from "@/lib/assets";
import type { Gauge } from "@/lib/macro";

import type { BriefingPayload, Implication } from "./schema";

/**
 * 구조화 결과 → 마크다운 본문.
 *
 * 본문 조립을 모델에 맡기지 않는 이유: 형식이 매일 흔들리고,
 * 제목 수준·구분선·순서 같은 것이 프롬프트로는 안정되지 않는다.
 */

const DIRECTION_LABEL: Record<Implication["direction"], string> = {
  up: "상방",
  down: "하방",
  unclear: "불확실",
};

function renderGauges(gauges: Gauge[], failed: string[]): string {
  if (gauges.length === 0) return "지표를 수집하지 못했다.";

  const lines = gauges.map((gauge) => {
    const change =
      gauge.change === null
        ? ""
        : ` ${gauge.change > 0 ? "+" : ""}${gauge.change}`;
    const note = gauge.note ? ` — ${gauge.note}` : "";
    return `- **${gauge.label}** ${gauge.display}${change}${note}`;
  });

  if (failed.length > 0) {
    lines.push(`- ${failed.join(", ")}: 오늘 데이터 수집 실패`);
  }

  return lines.join("\n");
}

function renderImplications(implications: Implication[]): string {
  if (implications.length === 0) return "";
  return implications
    .map(
      (item) =>
        `  - ${assetClassLabel(item.asset_class)} ${DIRECTION_LABEL[item.direction]} — ${item.note}`,
    )
    .join("\n");
}

export function renderBriefing(options: {
  date: string;
  gauges: Gauge[];
  failedGauges: string[];
  payload: BriefingPayload;
}): string {
  const { date, gauges, failedGauges, payload } = options;

  const part1 = payload.part1
    .map((item, index) => {
      const implications = renderImplications(item.implications);
      return [
        `### ${index + 1}. ${item.headline}`,
        "",
        item.fact,
        "",
        `- 서프라이즈: ${item.surprise}`,
        implications ? `- 자산군 함의:\n${implications}` : "- 자산군 함의: 없음",
        `- 출처: [${item.source_name}](${item.source_url})`,
      ].join("\n");
    })
    .join("\n\n");

  const part2 = payload.part2
    .map((item, index) => {
      const lines = [
        `### ${index + 1}. ${item.headline}`,
        "",
        item.fact,
        "",
        `- 맥락: ${item.context}`,
        `- 지켜볼 것: ${item.outlook}`,
      ];
      if (item.investment_note) {
        lines.push(`- 투자 함의: ${item.investment_note}`);
      }
      lines.push(`- 출처: [${item.source_name}](${item.source_url})`);
      return lines.join("\n");
    })
    .join("\n\n");

  return [
    `# ${date} 브리핑`,
    "",
    "## 오늘의 온도",
    "",
    renderGauges(gauges, failedGauges),
    "",
    "## 1부. 시장과 경제",
    "",
    part1,
    "",
    "## 2부. 오늘의 세계",
    "",
    part2,
    "",
  ].join("\n");
}
