import Link from "next/link";

import {
  listThreads,
  statusNote,
  STATUS_LABEL,
  type ThreadListItem,
  type ThreadTier,
} from "@/lib/briefing/thread-list";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "이슈 · 투자 데스크" };

function Group({
  status,
  items,
  note,
}: {
  status: ThreadTier;
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

      {/* 폭이 남으면 열을 늘려 쓴다 (DESIGN §4). 한 열 42rem 목록은 여백이 절반을 넘겼다. */}
      <ul className="lg:grid lg:grid-cols-2 lg:gap-x-16">
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

  const empty =
    grouped.active.length +
      grouped.fresh.length +
      grouped.watching.length +
      grouped.closed.length ===
    0;

  return (
    <main className="mx-auto w-full max-w-page px-5 pt-12 pb-24 sm:px-8">
      <header className="border-b-2 border-ink pb-6">
        <p className="label">이어지는 흐름</p>
        <h1 className="font-serif text-display mt-2">이슈</h1>
      </header>

      {empty ? (
        <p className="mt-8 label">쌓인 이슈 없음</p>
      ) : (
        <>
          <Group status="active" items={grouped.active} />
          <Group status="fresh" items={grouped.fresh} note="전개 1회" />
          <Group status="watching" items={grouped.watching} />
          <Group status="closed" items={grouped.closed} />
        </>
      )}
    </main>
  );
}

export const dynamic = "force-dynamic";
