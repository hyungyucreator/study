import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "단어장 · 투자 데스크" };

type Saved = {
  saved_at: string;
  concept_cards: {
    term: string;
    summary: string | null;
    body_md: string;
  } | null;
};

/**
 * 단어장.
 * 브리핑에서 저장한 용어가 쌓인다. RLS가 내 행만 돌려준다.
 */
export default async function GlossaryPage() {
  const supabase = await createClient();

  const { data } = await supabase
    .from("user_cards")
    .select("saved_at, concept_cards(term, summary, body_md)")
    .order("saved_at", { ascending: false });

  const cards = ((data ?? []) as unknown as Saved[]).filter(
    (row) => row.concept_cards !== null,
  );

  return (
    <main className="mx-auto w-full max-w-prose px-5 pt-12 pb-24 sm:px-8">
      <header className="border-b-2 border-ink pb-6">
        <p className="label">모아둔 말</p>
        <h1 className="font-serif text-display mt-2">단어장</h1>
      </header>

      {cards.length === 0 ? (
        <p className="mt-8 text-small text-muted">
          아직 담은 용어가 없다. 브리핑에서 점선 밑줄이 그어진 말을 눌러 담을 것.
        </p>
      ) : (
        <ul className="mt-8">
          {cards.map((row) => (
            <li
              key={row.concept_cards!.term}
              className="border-b border-line py-7 first:pt-0"
            >
              <div className="flex items-baseline justify-between gap-4">
                <h2 className="font-serif text-heading text-ink">
                  {row.concept_cards!.term}
                </h2>
                <span className="tabular label shrink-0">
                  {row.saved_at.slice(0, 10)}
                </span>
              </div>
              {row.concept_cards!.summary ? (
                <p className="text-body mt-3">{row.concept_cards!.summary}</p>
              ) : null}
              <p className="text-small mt-3 text-muted">
                {row.concept_cards!.body_md}
              </p>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

export const dynamic = "force-dynamic";
