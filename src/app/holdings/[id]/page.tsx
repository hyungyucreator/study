import Link from "next/link";
import { notFound } from "next/navigation";

import { type Holding } from "@/lib/assets";
import { createClient } from "@/lib/supabase/server";

import { deleteHolding, updateHolding } from "../actions";
import { ClassifyForm } from "../classify-form";
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

  // KIS 항목은 수량·평단이 동기화로 덮어써진다. 고칠 수 있는 것은 분류뿐이다.
  const isKis = holding.source === "kis";

  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-6 py-12">
      <header className="flex items-baseline justify-between border-b border-line pb-6">
        <h1 className="text-2xl font-semibold tracking-tight">
          {isKis ? "분류 수정" : "자산 수정"}
        </h1>
        <Link
          href="/holdings"
          className="text-sm text-muted underline underline-offset-4 hover:text-fg"
        >
          목록
        </Link>
      </header>

      <p className="mt-6 text-[15px]">
        {holding.name}
        <span className="tabular ml-2 text-sm text-muted">
          {holding.symbol}
        </span>
      </p>

      {isKis ? (
        <p className="mt-1 text-sm text-muted">
          수량과 평단은 KIS 동기화로 관리된다. 여기서 바꾼 분류는 다음
          동기화에도 유지된다.
        </p>
      ) : null}

      <div className="mt-8">
        {isKis ? (
          <ClassifyForm holding={holding} />
        ) : (
          <HoldingForm
            action={updateHolding}
            holding={holding}
            submitLabel="저장"
          />
        )}
      </div>

      {isKis ? null : (
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
      )}
    </main>
  );
}
