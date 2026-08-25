import { listBriefingDates, loadBriefing } from "@/lib/briefing/read";
import { loadPortfolio } from "@/lib/portfolio";
import { createClient } from "@/lib/supabase/server";

import { BriefingBody } from "./briefing-view";

export const metadata = { title: "브리핑 · 투자 데스크" };

export default async function BriefingPage() {
  const supabase = await createClient();
  const [view, archive, portfolio] = await Promise.all([
    loadBriefing(supabase),
    listBriefingDates(supabase),
    loadPortfolio(supabase),
  ]);

  // 자산군별 내 비중. 브리핑의 함의가 내 얘기인지 남 얘기인지 가른다.
  const myWeights = Object.fromEntries(
    portfolio.byClass.map((slice) => [slice.value, slice.weight]),
  );

  if (!view) {
    return (
      <main className="mx-auto w-full max-w-prose px-5 pt-10 pb-24 sm:px-8">
        <h1 className="text-title">브리핑</h1>
        <p className="mt-4 text-small text-muted">아직 발행된 브리핑이 없다.</p>
      </main>
    );
  }

  return <BriefingBody view={view} archive={archive} myWeights={myWeights} />;
}

export const dynamic = "force-dynamic";
