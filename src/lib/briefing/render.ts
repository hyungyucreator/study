import { assetClassLabel } from "@/lib/assets";
import type { Gauge } from "@/lib/macro";

import type { BriefingPayload, Implication, Part1Item, Part2Item } from "./schema";

/**
 * 구조화 결과 → 마크다운 본문.
 *
 * 본문 조립을 모델에 맡기지 않는 이유: 형식이 매일 흔들리고,
 * 제목 수준·구분선·순서 같은 것이 프롬프트로는 안정되지 않는다.
 *
 * 각 부는 국내/해외로 나눠 쓴다. 구분 축은 코드가 정한다 (news/region.ts).
 */

const DIRECTION_LABEL: Record<Implication["direction"], string> = {
  up: "상방",
  down: "하방",
  unclear: "불확실",
};

export type RegionMap = Map<string, "kr" | "global">;

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

function renderPart1(items: Part1Item[]): string {
  return items
    .map((item, index) => {
      const implications = renderImplications(item.implications);
      return [
        `#### ${index + 1}. ${item.headline}`,
        "",
        item.fact,
        "",
        `- 서프라이즈: ${item.surprise}`,
        implications ? `- 자산군 함의:\n${implications}` : "- 자산군 함의: 없음",
        `- 출처: [${item.source_name}](${item.source_url})`,
      ].join("\n");
    })
    .join("\n\n");
}

function renderPart2(items: Part2Item[]): string {
  return items
    .map((item, index) => {
      const lines = [
        `#### ${index + 1}. ${item.headline}`,
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
}

/** 한 부를 국내/해외로 나눈다. 비어 있는 쪽은 그리지 않는다. */
function bySection<T extends { source_url: string }>(
  items: T[],
  globalLabel: string,
  regions: RegionMap,
  render: (subset: T[]) => string,
): string {
  const kr = items.filter((item) => (regions.get(item.source_url) ?? "kr") === "kr");
  const global = items.filter(
    (item) => regions.get(item.source_url) === "global",
  );

  return [
    kr.length > 0 ? `### 국내\n\n${render(kr)}` : "",
    global.length > 0 ? `### ${globalLabel}\n\n${render(global)}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function renderBriefing(options: {
  date: string;
  gauges: Gauge[];
  failedGauges: string[];
  payload: BriefingPayload;
  /** url별 국내/해외. 코드가 정한 값이다 (news/region.ts). */
  regions: RegionMap;
}): string {
  const { date, gauges, failedGauges, payload, regions } = options;

  return [
    `# ${date} 브리핑`,
    "",
    "## 시장 상황",
    "",
    renderGauges(gauges, failedGauges),
    "",
    "## 1부. 시장과 경제",
    "",
    bySection(payload.part1, "해외", regions, renderPart1),
    "",
    "## 2부. 오늘의 세계",
    "",
    bySection(payload.part2, "국제", regions, renderPart2),
    "",
  ].join("\n");
}
