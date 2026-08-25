import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  buildWeights,
  fingerprint,
  weightedJaccard,
  type Candidate,
} from "@/lib/news/select";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * 이슈 스레드.
 *
 * 브리핑에 기억을 붙이는 장치다. 오늘 "협상단 철수"를 읽을 때
 * 이게 2주째 이어지는 "미국 통상 압박"의 5번째 전개라는 걸 알려준다.
 *
 * 판정은 코드와 모델을 섞는다. 코드만으로는 안 된다.
 * "캐나다산 철강 관세 25%"와 "협상단 철수"는 같은 이슈지만
 * 공유 토큰이 "캐나다" 하나뿐이라 제목 유사도로는 안 묶인다.
 * 스토리 전개를 잇는 데는 의미 이해가 필요하다.
 *
 * 그래서 코드는 진행 중인 스레드 목록을 프롬프트에 넣어주고,
 * 모델이 각 항목을 배정한다. 코드는 그 뒤에 파편화만 막는다.
 */

export type Thread = {
  id: string;
  title: string;
  summary: string | null;
  started_on: string;
  last_seen_on: string;
  entries: number;
};

/** 모델이 돌려주는 배정. 기존이면 id, 새 이슈면 new_title. */
export type ThreadAssignment = {
  id?: string | null;
  new_title?: string | null;
};

/** 프롬프트에 넣을 스레드 수 상한. 넘으면 모델이 고르기 어려워진다. */
const MAX_ACTIVE = 25;
const ACTIVE_DAYS = 21;
const RECENT_DAYS = 7;

/**
 * 새 스레드 제목이 기존과 이만큼 겹치면 같은 이슈로 본다.
 * 0.28에서는 "미 장기금리 상승과 재정건전성"과
 * "미 재정건전성과 디베이스먼트 트레이드"가 따로 만들어졌다.
 */
const SAME_THREAD = 0.22;

function daysAgo(days: number): string {
  return new Date(Date.now() - days * 86400000)
    .toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
}

/**
 * 진행 중인 이슈.
 * 최근 21일 안에 언급됐고, 전개가 2회 이상이거나 최근 7일 안에 등장한 것.
 * 오래 잠든 이슈까지 넣으면 목록이 길어져 모델이 엉뚱한 데 붙인다.
 */
export async function activeThreads(
  supabase: SupabaseClient,
): Promise<Thread[]> {
  const { data } = await supabase
    .from("threads")
    .select("id, title, summary, started_on, last_seen_on, entries")
    .gte("last_seen_on", daysAgo(ACTIVE_DAYS))
    .order("last_seen_on", { ascending: false })
    .limit(80);

  const threads = (data ?? []) as Thread[];
  const recent = daysAgo(RECENT_DAYS);

  return threads
    .filter(
      (thread) => thread.entries >= 2 || thread.last_seen_on >= recent,
    )
    .slice(0, MAX_ACTIVE);
}

/** 프롬프트용 한 줄 표기. */
export function formatThreads(threads: Thread[]): string {
  if (threads.length === 0) return "(진행 중인 이슈 없음. 전부 새 이슈로 만든다)";
  return threads
    .map(
      (thread) =>
        `- id: ${thread.id}\n  제목: ${thread.title}\n  ${thread.started_on} 시작 · 전개 ${thread.entries}회${
          thread.summary ? `\n  최근: ${thread.summary}` : ""
        }`,
    )
    .join("\n");
}

/**
 * 새 제목이 기존 스레드와 같은 이슈인지 본다.
 * 모델이 같은 이슈를 못 알아보고 새로 만들면 스레드가 파편화된다.
 */
function matchExisting(title: string, threads: Thread[]): Thread | null {
  const print = fingerprint(title);
  if (!print) return null;

  const prints = threads
    .map((thread) => ({ thread, print: fingerprint(thread.title) }))
    .filter((item): item is { thread: Thread; print: NonNullable<ReturnType<typeof fingerprint>> } =>
      item.print !== null,
    );

  const weights = buildWeights([print, ...prints.map((item) => item.print)]);

  let best: { thread: Thread; score: number } | null = null;
  for (const item of prints) {
    if (item.print.lang !== print.lang) continue;
    const score = weightedJaccard(print.set, item.print.set, weights);
    if (score >= SAME_THREAD && (!best || score > best.score)) {
      best = { thread: item.thread, score };
    }
  }

  return best?.thread ?? null;
}

export type ResolvedThread = { id: string; title: string; entries: number };

/**
 * 배정을 실제 스레드 id로 바꾼다. 없으면 만든다.
 * 같은 실행 안에서 여러 항목이 같은 새 이슈를 가리킬 수 있으므로
 * 방금 만든 것도 캐시에 넣어 중복 생성을 막는다.
 */
export async function resolveThreads(
  assignments: { key: string; assignment: ThreadAssignment; date: string }[],
): Promise<Map<string, ResolvedThread>> {
  const supabase = createAdminClient();
  const existing = await activeThreads(supabase);
  const byId = new Map(existing.map((thread) => [thread.id, thread]));
  const pool = [...existing];
  const resolved = new Map<string, ResolvedThread>();

  for (const { key, assignment, date } of assignments) {
    // 1) 모델이 기존 id를 지목했고 그 id가 실재하면 그대로 쓴다.
    const known = assignment.id ? byId.get(assignment.id) : undefined;
    if (known) {
      resolved.set(key, {
        id: known.id,
        title: known.title,
        entries: known.entries + 1,
      });
      continue;
    }

    const title = assignment.new_title?.trim();
    if (!title) continue;

    // 2) 새 제목이 기존 스레드와 겹치면 그쪽에 붙인다.
    const matched = matchExisting(title, pool);
    if (matched) {
      resolved.set(key, {
        id: matched.id,
        title: matched.title,
        entries: matched.entries + 1,
      });
      continue;
    }

    // 3) 정말 새 이슈다.
    const { data, error } = await supabase
      .from("threads")
      .insert({
        title,
        started_on: date,
        last_seen_on: date,
        entries: 0,
      })
      .select("id, title, summary, started_on, last_seen_on, entries")
      .single();

    if (error || !data) continue;

    const created = data as Thread;
    pool.push(created);
    byId.set(created.id, created);
    resolved.set(key, { id: created.id, title: created.title, entries: 1 });
  }

  return resolved;
}

/**
 * 전개 횟수와 최근 상태를 갱신한다.
 *
 * 횟수를 더하지 않고 **briefing_news에서 세어 다시 쓴다.**
 * 더하기로 하면 force로 재생성할 때마다 같은 날이 중복 계산돼
 * 하루 만에 "전개 5회"가 된다. 실제 기록이 정본이다.
 */
export async function touchThreads(
  entries: { id: string; date: string; summary: string }[],
): Promise<void> {
  const supabase = createAdminClient();

  const byThread = new Map<string, { date: string; summary: string }>();
  for (const entry of entries) {
    if (!byThread.has(entry.id)) byThread.set(entry.id, entry);
  }

  for (const [id, entry] of byThread) {
    const { data } = await supabase
      .from("briefing_news")
      .select("briefing_id")
      .eq("thread_id", id);

    const rows = (data ?? []) as { briefing_id: string }[];
    const count = new Set(rows.map((row) => row.briefing_id)).size;

    await supabase
      .from("threads")
      .update({
        entries: Math.max(count, 1),
        last_seen_on: entry.date,
        summary: entry.summary,
      })
      .eq("id", id);
  }
}

/** 타임라인 시작점을 과거에서 채울 때 훑을 기간. */
const BACKFILL_DAYS = 14;
const BACKFILL_MATCH = 0.24;

/**
 * 새로 만든 스레드에 과거 기사를 붙인다.
 *
 * 스레드를 오늘 처음 만들면 타임라인에 오늘 하나뿐이라 가치가 안 보인다.
 * raw_news를 거슬러 올라가 비슷한 기사를 찾아 붙여 첫날부터 여러 날짜가 찍히게 한다.
 * 제목 유사도라 완벽하지 않으므로 화면에서 브리핑 항목과 구분해 표시한다.
 */
export async function backfillTimeline(
  threadId: string,
  seedTitle: string,
): Promise<number> {
  const supabase = createAdminClient();
  const since = new Date(
    Date.now() - BACKFILL_DAYS * 86400000,
  ).toISOString();

  const { data } = await supabase
    .from("raw_news")
    .select("id, source, url, title, lead, published_at, category")
    .gte("published_at", since)
    .order("published_at", { ascending: false })
    .limit(1000);

  const candidates = (data ?? []) as Candidate[];
  const seed = fingerprint(seedTitle);
  if (!seed) return 0;

  const prints = candidates
    .map((item) => ({ item, print: fingerprint(item.title) }))
    .filter((entry): entry is { item: Candidate; print: NonNullable<ReturnType<typeof fingerprint>> } =>
      entry.print !== null,
    );

  const weights = buildWeights([seed, ...prints.map((entry) => entry.print)]);

  const rows = prints
    .filter((entry) => entry.print.lang === seed.lang)
    .filter(
      (entry) =>
        weightedJaccard(seed.set, entry.print.set, weights) >= BACKFILL_MATCH,
    )
    .slice(0, 30)
    .map((entry) => ({
      thread_id: threadId,
      raw_news_id: entry.item.id,
      published_at: entry.item.published_at,
    }));

  if (rows.length === 0) return 0;

  await supabase
    .from("thread_news")
    .upsert(rows, { onConflict: "thread_id,raw_news_id", ignoreDuplicates: true });

  return rows.length;
}
