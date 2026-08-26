import { listBriefingDates, loadBriefing } from "@/lib/briefing/read";
import { pipelineHealth } from "@/lib/ops/health";
import { createClient } from "@/lib/supabase/server";

import { BriefingBody } from "./briefing-view";

export const metadata = { title: "브리핑 · 투자 데스크" };

export default async function BriefingPage() {
  const supabase = await createClient();
  const [view, archive, health] = await Promise.all([
    loadBriefing(supabase),
    listBriefingDates(supabase),
    pipelineHealth(supabase),
  ]);

  if (!view) {
    return (
      <main className="mx-auto w-full max-w-page px-5 pt-12 pb-24 sm:px-8">
        <header className="border-b-2 border-ink pb-6">
          <p className="label">데일리 브리핑</p>
          <h1 className="font-serif text-display mt-2">브리핑</h1>
        </header>
        <p className="mt-8 label">발행된 브리핑 없음</p>
      </main>
    );
  }

  return <BriefingBody view={view} archive={archive} health={health} />;
}

export const dynamic = "force-dynamic";
