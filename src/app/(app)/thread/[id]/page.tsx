import Link from "next/link";
import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "이슈 · 투자 데스크" };

type Entry = {
  date: string;
  headline: string | null;
  points: string[] | null;
  source_url: string;
};

type Related = {
  published_at: string;
  raw_news: { title: string; source: string; url: string } | null;
};

/**
 * 이슈 타임라인.
 *
 * 브리핑에 실린 날은 그날의 불렛을 그대로 보여준다.
 * 실리지 않은 날의 관련 기사는 아래에 따로 둔다. 제목 유사도로 붙인 것이라
 * 브리핑이 실제로 다룬 것과 섞으면 안 된다.
 */
export default async function ThreadPage({
  params,
}: PageProps<"/thread/[id]">) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: thread } = await supabase
    .from("threads")
    .select("id, title, summary, started_on, last_seen_on, entries")
    .eq("id", id)
    .maybeSingle();

  if (!thread) notFound();

  const [{ data: entries }, { data: related }] = await Promise.all([
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
  ]);

  const timeline = ((entries ?? []) as unknown as (Entry & {
    briefings: { date: string } | null;
  })[])
    .map((entry) => ({ ...entry, date: entry.briefings?.date ?? "" }))
    .filter((entry) => entry.date)
    .sort((a, b) => b.date.localeCompare(a.date));

  const carried = (related ?? []) as unknown as Related[];

  return (
    <main className="mx-auto w-full max-w-prose px-5 pt-12 pb-24 sm:px-8">
      <header className="border-b-2 border-ink pb-6">
        <Link
          href="/briefing"
          className="label underline decoration-line-strong underline-offset-4 hover:text-ink"
        >
          브리핑으로
        </Link>
        <h1 className="font-serif text-display mt-3">{thread.title}</h1>
        <p className="tabular label mt-3">
          {thread.started_on} 시작 · 전개 {thread.entries}회
        </p>
      </header>

      {timeline.length > 0 ? (
        <section className="mt-10">
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
                    className="text-body flex gap-2.5 leading-[1.55]"
                  >
                    <span aria-hidden className="text-faint shrink-0">
                      ·
                    </span>
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </section>
      ) : null}

      {carried.length > 0 ? (
        <section className="mt-14">
          <h2 className="label border-b border-line-strong pb-2">
            관련 기사
          </h2>
          <p className="label mt-2">
            제목이 비슷해 함께 묶은 기사다. 브리핑이 다룬 것은 아니다.
          </p>
          <ul className="mt-3">
            {carried.map((item) => (
              <li
                key={item.raw_news?.url ?? item.published_at}
                className="border-b border-line py-3.5"
              >
                <a
                  href={item.raw_news?.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-small hover:text-ink"
                >
                  {item.raw_news?.title}
                </a>
                <p className="tabular label mt-1">
                  {item.published_at.slice(0, 10)} · {item.raw_news?.source}
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
