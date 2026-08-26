import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { kstToday, recentRuns, type RunRow } from "./run-log";

/**
 * 파이프라인 건강 상태.
 *
 * 화면이 말해야 하는 것은 하나다. "어제 파이프라인이 돌았는가."
 * 안 돌았으면 그날 뉴스는 영영 없다. RSS가 과거를 주지 않기 때문이다.
 */

export type Health = {
  /** 문제가 있는 날짜와 사유. 비어 있으면 정상. */
  problems: { date: string; note: string }[];
  /** 마지막으로 성공한 실행 날짜. 기록이 없으면 null. */
  lastOk: string | null;
};

const STEP_LABEL: Record<string, string> = {
  "collect-news": "뉴스 수집",
  "collect-macro": "지표 수집",
  "generate-briefing": "브리핑 생성",
};

function daysBefore(today: string, n: number): string[] {
  const base = new Date(`${today}T00:00:00Z`).getTime();
  return Array.from({ length: n }, (_, i) =>
    new Date(base - (i + 1) * 86400000).toISOString().slice(0, 10),
  );
}

/**
 * 최근 이틀을 본다. 오늘은 아직 크론 시각(06:30 KST) 전일 수 있어 제외한다.
 *
 * 기록이 하나도 없으면 아직 자동화를 붙이기 전이므로 아무 말도 하지 않는다.
 * 켜지 않은 기능을 고장으로 보고하면 배너가 늘 켜져 있게 되고, 그러면 안 읽힌다.
 */
export async function pipelineHealth(supabase: SupabaseClient): Promise<Health> {
  const runs = await recentRuns(supabase, 3);
  if (runs.length === 0) return { problems: [], lastOk: null };

  const today = kstToday();
  const byDate = new Map<string, RunRow[]>();
  for (const run of runs) {
    byDate.set(run.date, [...(byDate.get(run.date) ?? []), run]);
  }

  // 기록이 시작된 날 이전은 묻지 않는다.
  const first = runs.reduce(
    (min, run) => (run.date < min ? run.date : min),
    runs[0].date,
  );

  const problems: Health["problems"] = [];

  for (const date of daysBefore(today, 2)) {
    if (date < first) continue;
    const rows = byDate.get(date);

    if (!rows || rows.length === 0) {
      problems.push({ date, note: "실행 기록 없음" });
      continue;
    }

    // 같은 단계를 여러 번 돌렸으면 마지막 결과만 본다.
    const latest = new Map<string, RunRow>();
    for (const row of [...rows].sort((a, b) =>
      a.started_at.localeCompare(b.started_at),
    )) {
      latest.set(row.step, row);
    }

    const broken = [...latest.values()]
      .filter((row) => row.status === "failed")
      .map((row) => STEP_LABEL[row.step] ?? row.step);

    if (broken.length > 0) {
      problems.push({ date, note: `${broken.join(" · ")} 실패` });
    }
  }

  const lastOk =
    runs.find(
      (run) => run.step === "generate-briefing" && run.status === "ok",
    )?.date ?? null;

  return { problems, lastOk };
}
