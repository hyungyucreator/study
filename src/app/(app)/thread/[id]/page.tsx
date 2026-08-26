import Link from "next/link";
import { notFound } from "next/navigation";

import {
  statusNote,
  tierOf,
  STATUS_LABEL,
  type ThreadRow,
} from "@/lib/briefing/thread-list";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "이슈 · 투자 데스크" };

type Entry = {
  headline: string | null;
  points: string[] | null;
  source_url: string;
  briefings: { date: string } | null;
};

type Related = {
  published_at: string;
  raw_news: { title: string; source: string; url: string } | null;
};

/** 브리프 한 덩어리. 없으면 그리지 않는다. */
function BriefBlock({ label, items }: { label: string; items?: string[] }) {
  if (!items || items.length === 0) return null;

  return (
    <div className="mt-7 first:mt-0">
      <h3 className="label">{label}</h3>
      <ul className="mt-2 space-y-2">
        {items.map((line) => (
          <li key={line} className="text-body flex gap-2.5 ">
            <span aria-hidden className="text-faint shrink-0 select-none">
              ·
            </span>
            <span>{line}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * 이슈 화면.
 *
 * 위쪽은 서사(브리프), 아래쪽은 기록이다.
 * 브리프가 없으면 이 화면은 기사 목록일 뿐이다.
 */
export default async function ThreadPage({
  params,
}: PageProps<"/thread/[id]">) {
  const { id } = await params;
  const supabase = await createClient();

  const { data } = await supabase
    .from("threads")
    .select(
      "id, title, summary, started_on, last_seen_on, entries, closed_on, brief_json",
    )
    .eq("id", id)
    .maybeSingle();

  if (!data) notFound();
  const thread = data as ThreadRow;

  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: "Asia/Seoul",
  });
  const status = tierOf(thread, today);
  const days = Math.max(
    0,
    Math.round(
      (new Date(`${today}T00:00:00Z`).getTime() -
        new Date(`${thread.started_on}T00:00:00Z`).getTime()) /
        86400000,
    ),
  );

  const [{ data: entries }, { data: related }, { data: oldest }] =
    await Promise.all([
      supabase
        .from("briefing_news")
        .select("headline, points, source_url, briefings(date)")
        .eq("thread_id", id)
        .order("position"),
      supabase
        .from("thread_news")
        .select("published_at, raw_news(title, source, url)")
        .eq("thread_id", id)
        .order("published_at", { ascending: false })
        .limit(30),
      // 이슈의 실제 시작은 추적 시작보다 이르다. 데이터가 말할 수 있는
      // 가장 이른 지점(가장 오래된 관련 기사)까지만 말한다. 추정하지 않는다.
      supabase
        .from("thread_news")
        .select("published_at")
        .eq("thread_id", id)
        .order("published_at", { ascending: true })
        .limit(1)
        .maybeSingle(),
    ]);

  const timeline = ((entries ?? []) as unknown as Entry[])
    .map((entry) => ({ ...entry, date: entry.briefings?.date ?? "" }))
    .filter((entry) => entry.date)
    .sort((a, b) => b.date.localeCompare(a.date));

  const carried = ((related ?? []) as unknown as Related[]).filter(
    (item) => item.raw_news !== null,
  );

  const brief = thread.brief_json;

  return (
    <main className="mx-auto w-full max-w-prose px-5 pt-12 pb-24 sm:px-8">
      <header className="border-b-2 border-ink pb-6">
        <Link
          href="/threads"
          className="label underline decoration-line-strong underline-offset-4 hover:text-ink"
        >
          이슈 목록
        </Link>
        <h1 className="font-serif text-display mt-3">{thread.title}</h1>
        <div className="mt-3 space-y-1">
          <p className="tabular label flex flex-wrap gap-x-3">
            <span>{STATUS_LABEL[status]}</span>
            <span>{statusNote({ ...thread, status, days })}</span>
          </p>
          <p className="tabular label flex flex-wrap gap-x-3">
            <span>추적 시작 {thread.started_on}</span>
            {oldest && oldest.published_at.slice(0, 10) < thread.started_on ? (
              <span>관련 기사 {oldest.published_at.slice(0, 10)}부터</span>
            ) : null}
          </p>
        </div>
      </header>

      {brief ? (
        <section className="mt-10 border-b border-line-strong pb-8">
          <BriefBlock label="이 이슈는 무엇인가" items={brief.what} />
          <BriefBlock label="지금까지" items={brief.so_far} />
          <BriefBlock label="다음 분기점" items={brief.next} />
        </section>
      ) : (
        <p className="mt-8 label">아직 요약 없음</p>
      )}

      {timeline.length > 0 ? (
        <section className="mt-12">
          <h2 className="label border-b border-line-strong pb-2">브리핑 기록</h2>
          {timeline.map((entry) => (
            <article
              key={entry.source_url}
              className="border-b border-line py-6"
            >
              <p className="tabular label">{entry.date}</p>
              <h3 className="font-serif text-heading text-ink mt-1.5">
                {entry.headline}
              </h3>
              <ul className="mt-3 space-y-2">
                {(entry.points ?? []).map((point) => (
                  <li
                    key={point}
                    className="text-body flex gap-2.5 "
                  >
                    <span aria-hidden className="text-faint shrink-0">
                      ·
                    </span>
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
              <a
                href={entry.source_url}
                target="_blank"
                rel="noreferrer"
                className="label mt-3 inline-block underline decoration-line-strong underline-offset-4 hover:text-ink hover:decoration-ink"
              >
                원문
              </a>
            </article>
          ))}
        </section>
      ) : null}

      {carried.length > 0 ? (
        <section className="mt-14">
          <h2 className="label border-b border-line-strong pb-2">관련 기사</h2>
          <ul className="mt-3">
            {carried.map((item) => (
              <li key={item.raw_news!.url} className="border-b border-line py-3.5">
                <a
                  href={item.raw_news!.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-small hover:text-ink"
                >
                  {item.raw_news!.title}
                </a>
                <p className="tabular label mt-1 flex flex-wrap gap-x-3">
                  <span>{item.published_at.slice(0, 10)}</span>
                  <span>{item.raw_news!.source}</span>
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}

export const dynamic = "force-dynamic";
