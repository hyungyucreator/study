import type { Gauge } from "@/lib/macro";

import { assetLabel, directionLabel } from "./asset-classes";
import {
  isEconomySection,
  SECTIONS,
  type BriefingPayload,
  type EconomyItem,
  type PoliticsItem,
} from "./schema";

/**
 * 구조화 결과 → 마크다운 본문.
 *
 * 본문 조립을 모델에 맡기지 않는 이유: 형식이 매일 흔들리고,
 * 제목 수준·구분선·순서 같은 것이 프롬프트로는 안정되지 않는다.
 *
 * 이 마크다운은 화면용이 아니라 아카이브와 알림 채널용이다.
 * 화면은 briefing_news를 직접 읽어 그린다 (read.ts).
 */

function renderGauges(gauges: Gauge[], failed: string[]): string {
  if (gauges.length === 0) return "지표를 수집하지 못했다";

  const lines = gauges.map((gauge) => {
    const change =
      gauge.change === null
        ? ""
        : ` ${gauge.change > 0 ? "+" : ""}${gauge.change}`;
    const note = gauge.note ? ` (${gauge.note})` : "";
    return `- **${gauge.label}** ${gauge.display}${change}${note}`;
  });

  if (failed.length > 0) {
    lines.push(`- ${failed.join(", ")} 수집 실패`);
  }

  return lines.join("\n");
}

function renderPoints(points: string[]): string {
  return points.map((point) => `- ${point}`).join("\n");
}

/**
 * 자산군 종합. 브리핑 전체를 놓고 한 번만 쓴다.
 * 항목마다 붙이던 때는 한 브리핑에 "채권 상방"과 "채권 하방"이 함께 실렸다.
 */
function renderOutlook(payload: BriefingPayload): string {
  if (payload.asset_outlook.length === 0) {
    return "오늘 뉴스로 방향을 말할 수 있는 자산군이 없다";
  }

  return payload.asset_outlook
    .map((item) => {
      const head = `${assetLabel(item.asset_class)} ${directionLabel(
        item.asset_class,
        item.direction,
      )}`;
      return [`- **${head}**`, `  ${item.note}`].join("\n");
    })
    .join("\n");
}

function renderEconomy(items: EconomyItem[]): string {
  return items
    .map((item, index) =>
      [
        `#### ${index + 1}. ${item.headline}`,
        "",
        renderPoints(item.points),
        "",
        `- 예상 대비: ${item.surprise}`,
        `- 출처: [${item.source_name}](${item.source_url})`,
      ].join("\n"),
    )
    .join("\n\n");
}

function renderPolitics(items: PoliticsItem[]): string {
  return items
    .map((item, index) => {
      const lines = [
        `#### ${index + 1}. ${item.headline}`,
        "",
        renderPoints(item.points),
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

export function renderBriefing(options: {
  date: string;
  gauges: Gauge[];
  failedGauges: string[];
  payload: BriefingPayload;
}): string {
  const { date, gauges, failedGauges, payload } = options;

  const sections = SECTIONS.flatMap((section) => {
    const items = payload[section.key];
    if (!items || items.length === 0) return [];
    const body = isEconomySection(section.key)
      ? renderEconomy(items as EconomyItem[])
      : renderPolitics(items as PoliticsItem[]);
    return [`## ${section.label}`, "", body, ""];
  });

  return [
    `# ${date} 브리핑`,
    "",
    "## 시장 지표",
    "",
    renderGauges(gauges, failedGauges),
    "",
    ...sections,
    "## 오늘의 자산군",
    "",
    renderOutlook(payload),
    "",
  ].join("\n");
}
