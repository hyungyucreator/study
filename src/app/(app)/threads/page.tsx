import Link from "next/link";

import {
  listThreads,
  movedWithin,
  statusNote,
  STATUS_LABEL,
  type ThreadListItem,
  type ThreadStatus,
} from "@/lib/briefing/thread-list";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "이슈 · 투자 데스크" };

function Group({
  status,
  items,
  note,
}: {
  status: ThreadStatus;
  items: ThreadListItem[];
  note?: string;
}) {
  if (items.length === 0) return null;

  return (
    <section className="mt-12">
      <div className="flex items-baseline gap-3 border-b border-line-strong pb-2">
        <h2 className="text-subhead text-ink">{STATUS_LABEL[status]}</h2>
        <span className="tabular label">{items.length}</span>
        {note ? <span className="label">{note}</span> : null}
      </div>

      <ul>
        {items.map((item) => (
          <li key={item.id} className="border-b border-line">
            <Link
              href={`/thread/${item.id}`}
              className="block py-4 hover:opacity-70"
            >
              <div className="flex items-baseline justify-between gap-4">
                <span className="font-serif text-heading text-ink">
                  {item.title}
                </span>
                <span className="tabular label shrink-0">
                  {statusNote(item)}
                </span>
              </div>
              {item.brief_json?.what?.[0] ? (
                <p className="text-small mt-1 text-muted">
                  {item.brief_json.what[0]}
                </p>
              ) : item.summary ? (
                <p className="text-small mt-1 text-muted">{item.summary}</p>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * 이슈 목록.
 * 상태는 기간 필터가 아니라 활동량으로 정한다 (thread-list.ts).
 */
export default async function ThreadsPage() {
  const supabase = await createClient();
  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: "Asia/Seoul",
  });

  const grouped = await listThreads(supabase, today);
  const thisWeek = movedWithin(grouped.active, today, 7);
  const thisMonth = movedWithin(
    [...grouped.active, ...grouped.watching],
    today,
    30,
  );

  const empty =
    grouped.active.length + grouped.watching.length + grouped.closed.length ===
    0;

  return (
    <main className="mx-auto w-full max-w-prose px-5 pt-12 pb-24 sm:px-8">
      <header className="border-b-2 border-ink pb-6">
        <p className="label">이어지는 흐름</p>
        <h1 className="font-serif text-display mt-2">이슈</h1>
      </header>

      {empty ? (
        <p className="mt-8 text-small text-muted">
          아직 쌓인 이슈가 없다. 브리핑이 발행되면 흐름이 만들어진다.
        </p>
      ) : (
        <>
          <dl className="mt-8 grid grid-cols-3 gap-4 border-b border-line pb-6">
            <div>
              <dt className="label">이번 주 움직임</dt>
              <dd className="tabular text-title text-ink mt-1">
                {thisWeek.length}
              </dd>
            </div>
            <div>
              <dt className="label">이번 달 움직임</dt>
              <dd className="tabular text-title text-ink mt-1">
                {thisMonth.length}
              </dd>
            </div>
            <div>
              <dt className="label">종결</dt>
              <dd className="tabular text-title text-ink mt-1">
                {grouped.closed.length}
              </dd>
            </div>
          </dl>

          <Group status="active" items={grouped.active} />
          <Group
            status="watching"
            items={grouped.watching}
            note="7일 넘게 전개 없음"
          />
          <Group status="closed" items={grouped.closed} />
        </>
      )}
    </main>
  );
}

export const dynamic = "force-dynamic";
