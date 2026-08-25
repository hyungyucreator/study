import Link from "next/link";

import { listBriefingDates, loadBriefing } from "@/lib/briefing/read";
import { createClient } from "@/lib/supabase/server";

import { BriefingBody } from "./briefing-view";

export const metadata = { title: "브리핑 — 투자 데스크" };

export default async function BriefingPage() {
  const supabase = await createClient();
  const [view, archive] = await Promise.all([
    loadBriefing(supabase),
    listBriefingDates(supabase),
  ]);

  if (!view) {
    return (
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
        <header className="flex items-baseline justify-between border-b border-line pb-6">
          <h1 className="text-2xl font-semibold tracking-tight">브리핑</h1>
          <Link
            href="/"
            className="text-sm text-muted underline underline-offset-4 hover:text-fg"
          >
            홈
          </Link>
        </header>
        <p className="mt-8 text-[15px] text-muted">
          아직 발행된 브리핑이 없다.
        </p>
      </main>
    );
  }

  return <BriefingBody view={view} archive={archive} />;
}

export const dynamic = "force-dynamic";
