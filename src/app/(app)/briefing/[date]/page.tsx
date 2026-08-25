import { notFound } from "next/navigation";

import { listBriefingDates, loadBriefing } from "@/lib/briefing/read";
import { loadPortfolio } from "@/lib/portfolio";
import { createClient } from "@/lib/supabase/server";

import { BriefingBody } from "../briefing-view";

export const metadata = { title: "브리핑 · 투자 데스크" };

export default async function ArchivedBriefingPage({
  params,
}: PageProps<"/briefing/[date]">) {
  const { date } = await params;
  const supabase = await createClient();

  const [view, archive, portfolio] = await Promise.all([
    loadBriefing(supabase, date),
    listBriefingDates(supabase),
    loadPortfolio(supabase),
  ]);

  const myWeights = Object.fromEntries(
    portfolio.byClass.map((slice) => [slice.value, slice.weight]),
  );

  if (!view) notFound();

  return <BriefingBody view={view} archive={archive} myWeights={myWeights} />;
}

export const dynamic = "force-dynamic";
