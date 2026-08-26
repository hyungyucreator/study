import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * 파이프라인 실행 기록.
 *
 * 자동화의 위험은 실패가 아니라 조용한 실패다. 내가 직접 돌릴 때는 응답을 봤지만
 * 크론은 아무 말도 하지 않는다. 놓친 날의 뉴스는 RSS가 다시 주지 않으므로 복구가 없다.
 * 그래서 성공도 남긴다. "어제 돌았다"를 화면이 말할 수 있어야 한다.
 */

export type StepStatus = "ok" | "failed" | "skipped";

export type RunRow = {
  date: string;
  step: string;
  status: StepStatus;
  detail: Record<string, unknown> | null;
  duration_ms: number | null;
  started_at: string;
};

/** KST 기준 오늘 날짜(YYYY-MM-DD). */
export function kstToday(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
}

/**
 * 한 단계를 실행하고 결과를 남긴다.
 *
 * 기록 자체가 실패해도 본 작업을 막지 않는다. 로그 때문에 파이프라인이
 * 멈추는 것이 더 나쁘다.
 */
export async function runStep<T>(
  date: string,
  step: string,
  fn: () => Promise<T>,
  /** 성공했지만 실제로 한 일이 없는 경우. status를 skipped로 남긴다. */
  wasSkipped?: (result: T) => boolean,
): Promise<{ status: StepStatus; result: T | null; error: string | null }> {
  const startedAt = new Date();
  const supabase = createAdminClient();

  try {
    const result = await fn();
    // 건너뛴 것과 새로 만든 것을 status로 구분한다.
    // detail을 파고들어야 알 수 있으면 나중에 추적할 때 걸린다.
    const status: StepStatus = wasSkipped?.(result) ? "skipped" : "ok";
    await record(supabase, {
      date,
      step,
      status,
      detail: summarize(result),
      startedAt,
    });
    return { status, result, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : "알 수 없는 실패";
    await record(supabase, {
      date,
      step,
      status: "failed",
      detail: { error: message },
      startedAt,
    });
    return { status: "failed", result: null, error: message };
  }
}

/** 기록 실패는 삼킨다. 로그가 파이프라인을 멈추면 안 된다. */
async function record(
  supabase: SupabaseClient,
  input: {
    date: string;
    step: string;
    status: StepStatus;
    detail: Record<string, unknown> | null;
    startedAt: Date;
  },
): Promise<void> {
  try {
    await supabase.from("cron_runs").insert({
      date: input.date,
      step: input.step,
      status: input.status,
      detail: input.detail,
      duration_ms: Date.now() - input.startedAt.getTime(),
      started_at: input.startedAt.toISOString(),
      finished_at: new Date().toISOString(),
    });
  } catch {
    // 무시.
  }
}

/**
 * 결과에서 볼 만한 숫자만 뽑는다.
 * 브리핑 본문이나 payload 전체를 넣으면 표가 못 쓰게 커진다.
 */
function summarize(result: unknown): Record<string, unknown> | null {
  if (!result || typeof result !== "object") return null;
  const value = result as Record<string, unknown>;
  const picked: Record<string, unknown> = {};

  for (const key of [
    "inserted",
    "candidates",
    "unhealthy",
    "date",
    "skipped",
    "terms",
    "droppedUrls",
  ]) {
    if (key in value) picked[key] = value[key];
  }

  // 매크로는 지표 개수만.
  if (Array.isArray(value.gauges)) picked.gauges = value.gauges.length;
  // 브리핑은 붙은 이슈 수만.
  if (value.threads && typeof value.threads === "object") {
    picked.threads = value.threads;
  }

  return Object.keys(picked).length > 0 ? picked : null;
}

/** 최근 N일 실행 기록. 화면 배너가 쓴다. */
export async function recentRuns(
  supabase: SupabaseClient,
  days = 3,
): Promise<RunRow[]> {
  const since = new Date(Date.now() - days * 86400000).toLocaleDateString(
    "en-CA",
    { timeZone: "Asia/Seoul" },
  );

  const { data } = await supabase
    .from("cron_runs")
    .select("date, step, status, detail, duration_ms, started_at")
    .gte("date", since)
    .order("started_at", { ascending: false })
    .limit(60);

  return (data ?? []) as RunRow[];
}
