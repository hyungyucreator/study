import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export type ThreadBriefJson = {
  what?: string[];
  so_far?: string[];
  next?: string[];
};

/**
 * 이슈의 단.
 *
 * **진행 중은 자격이다. 전개가 2회 이상 이어져야 흐름이다.**
 * 한 번 다뤄진 것은 하루짜리 뉴스일 수 있다. "새로 등장"에 두고,
 * 두 번째 전개가 붙으면 올라오고 안 붙으면 조용히 잠든다.
 * 이래야 목록이 누적을 스스로 보여준다. 전부 진행 중이면 아무것도 진행 중이 아니다.
 */
export type ThreadTier = "active" | "fresh" | "watching" | "closed";

export type ThreadRow = {
  id: string;
  title: string;
  summary: string | null;
  started_on: string;
  last_seen_on: string;
  entries: number;
  closed_on: string | null;
  brief_json: ThreadBriefJson | null;
};

export type ThreadListItem = ThreadRow & {
  status: ThreadTier;
  /** 추적 시작일로부터 며칠째. */
  days: number;
};

/**
 * 종결은 모델이 판단해 closed_on을 찍은 것, 또는 30일 넘게 전개가 없는 것.
 * 안 닫으면 목록이 무한히 자란다.
 */
const WATCHING_AFTER = 7;
const CLOSED_AFTER = 30;
const ACTIVE_NEEDS_ENTRIES = 2;

function daysBetween(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00Z`).getTime();
  const b = new Date(`${to}T00:00:00Z`).getTime();
  return Math.max(0, Math.round((b - a) / 86400000));
}

export function tierOf(thread: ThreadRow, today: string): ThreadTier {
  if (thread.closed_on) return "closed";
  const idle = daysBetween(thread.last_seen_on, today);
  if (idle >= CLOSED_AFTER) return "closed";
  if (idle >= WATCHING_AFTER) return "watching";
  return thread.entries >= ACTIVE_NEEDS_ENTRIES ? "active" : "fresh";
}

export const STATUS_LABEL: Record<ThreadTier, string> = {
  active: "진행 중",
  fresh: "새로 등장",
  watching: "주시 중",
  closed: "종결",
};

export function statusNote(item: ThreadListItem): string {
  if (item.status === "closed") {
    return item.closed_on
      ? `${item.closed_on} 마무리`
      : `${item.last_seen_on} 이후 전개 없음`;
  }
  if (item.status === "watching") return `마지막 ${item.last_seen_on}`;
  if (item.status === "fresh") return `${item.started_on} 첫 등장`;
  return `${item.days + 1}일째 · 전개 ${item.entries}회`;
}

/** 이슈 전체를 단별로 나눠 돌려준다. */
export async function listThreads(
  supabase: SupabaseClient,
  today: string,
): Promise<Record<ThreadTier, ThreadListItem[]>> {
  const { data } = await supabase
    .from("threads")
    .select(
      "id, title, summary, started_on, last_seen_on, entries, closed_on, brief_json",
    )
    .order("last_seen_on", { ascending: false })
    .limit(300);

  const rows = (data ?? []) as ThreadRow[];
  const grouped: Record<ThreadTier, ThreadListItem[]> = {
    active: [],
    fresh: [],
    watching: [],
    closed: [],
  };

  for (const row of rows) {
    const status = tierOf(row, today);
    grouped[status].push({
      ...row,
      status,
      days: daysBetween(row.started_on, today),
    });
  }

  // 진행 중은 많이 움직인 순, 나머지는 최근 순.
  grouped.active.sort(
    (a, b) => b.entries - a.entries || b.last_seen_on.localeCompare(a.last_seen_on),
  );

  return grouped;
}
