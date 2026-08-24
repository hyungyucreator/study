import Link from "next/link";
import { notFound } from "next/navigation";

import { type Holding } from "@/lib/assets";
import { createClient } from "@/lib/supabase/server";

import { deleteHolding, updateHolding } from "../actions";
import { HoldingForm } from "../holding-form";

export const metadata = { title: "자산 수정 — 투자 데스크" };

export default async function EditHoldingPage({
  params,
}: PageProps<"/holdings/[id]">) {
  const { id } = await params;
  const supabase = await createClient();

  const { data } = await supabase
    .from("holdings")
    .select(
      "id, source, symbol, name, asset_class, is_etf, qty, avg_price, currency, updated_at",
    )
    .eq("id", id)
    .maybeSingle();

  if (!data) notFound();
  const holding = data as Holding;

  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-6 py-12">
      <header className="flex items-baseline justify-between border-b border-line pb-6">
        <h1 className="text-2xl font-semibold tracking-tight">자산 수정</h1>
        <Link
          href="/holdings"
          className="text-sm text-muted underline underline-offset-4 hover:text-fg"
        >
          목록
        </Link>
      </header>

      {holding.source === "kis" ? (
        <p className="mt-6 text-[15px] text-muted">
          KIS에서 동기화된 항목이다. 수정해도 다음 동기화 때 덮어써진다.
        </p>
      ) : null}

      <div className="mt-8">
        <HoldingForm
          action={updateHolding}
          holding={holding}
          submitLabel="저장"
        />
      </div>

      <div className="mt-12 border-t border-line pt-6">
        <form action={deleteHolding}>
          <input type="hidden" name="id" value={holding.id} />
          <button
            type="submit"
            className="text-sm text-muted underline underline-offset-4 hover:text-fg"
          >
            이 자산 삭제
          </button>
        </form>
      </div>
    </main>
  );
}
