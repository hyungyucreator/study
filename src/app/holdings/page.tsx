import Link from "next/link";

import {
  ASSET_CLASSES,
  BUCKETS,
  bookValue,
  bucketLabel,
  countsTowardAllocation,
  formatMoney,
  formatQty,
  type Currency,
  type Holding,
} from "@/lib/assets";
import { createClient } from "@/lib/supabase/server";

import { createHolding, setBucket } from "./actions";
import { HoldingForm } from "./holding-form";
import { KisSyncButton } from "./kis-sync-button";

export const metadata = { title: "보유자산 — 투자 데스크" };

/** 실험 버킷이 이 비율을 넘으면 화면에 표시한다. 차단하지 않는다. */
const EXPERIMENT_LIMIT = 0.2;

export default async function HoldingsPage() {
  const supabase = await createClient();

  // RLS가 내 행만 돌려준다 (0001_init.sql: holdings_select_own).
  const { data, error } = await supabase
    .from("holdings")
    .select(
      "id, source, symbol, name, asset_class, is_etf, bucket, qty, avg_price, currency, updated_at",
    )
    .order("asset_class")
    .order("name");

  const holdings = (data ?? []) as Holding[];

  // 통화별 매입금액 합계. 원화 환산 총액은 시세·환율 연동 후에 붙인다.
  const totals = new Map<Currency, number>();
  for (const holding of holdings) {
    totals.set(
      holding.currency,
      (totals.get(holding.currency) ?? 0) + bookValue(holding),
    );
  }

  const unassigned = holdings.filter((holding) => holding.bucket === null);

  // 실험 비중은 매입금액 기준. 환율이 붙기 전이라 원화 자산만으로 계산한다.
  const krwHoldings = holdings.filter((holding) => holding.currency === "KRW");
  const krwTotal = krwHoldings.reduce((sum, item) => sum + bookValue(item), 0);
  const experimentTotal = krwHoldings
    .filter((holding) => holding.bucket === "experiment")
    .reduce((sum, item) => sum + bookValue(item), 0);
  const experimentRatio = krwTotal > 0 ? experimentTotal / krwTotal : 0;
  const hasForeign = holdings.some((holding) => holding.currency !== "KRW");

  const allocationTotal = krwHoldings
    .filter((holding) => countsTowardAllocation(holding.bucket))
    .reduce((sum, item) => sum + bookValue(item), 0);

  const grouped = ASSET_CLASSES.map((assetClass) => ({
    ...assetClass,
    items: holdings.filter((item) => item.asset_class === assetClass.value),
  })).filter((group) => group.items.length > 0);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
      <header className="flex items-baseline justify-between border-b border-line pb-6">
        <h1 className="text-2xl font-semibold tracking-tight">보유자산</h1>
        <Link
          href="/"
          className="text-sm text-muted underline underline-offset-4 hover:text-fg"
        >
          홈
        </Link>
      </header>

      {error ? (
        <p className="mt-6 text-[15px]">불러오지 못했다. {error.message}</p>
      ) : null}

      <section className="mt-8">
        <div className="flex flex-wrap items-baseline gap-x-8 gap-y-2">
          {totals.size === 0 ? (
            <p className="text-[15px] text-muted">등록된 자산이 없다.</p>
          ) : (
            [...totals].map(([currency, sum]) => (
              <div key={currency}>
                <span className="text-sm text-muted">{currency} 매입금액</span>
                <span className="tabular ml-3 text-xl font-medium">
                  {formatMoney(sum, currency)}
                </span>
              </div>
            ))
          )}
        </div>
        <p className="mt-2 text-sm text-muted">
          평가금액과 원화 환산 총액은 시세 연동 후 표시된다.
        </p>
        <div className="mt-6">
          <KisSyncButton />
        </div>
      </section>

      {experimentRatio > EXPERIMENT_LIMIT ? (
        <section className="mt-8 border-y border-line py-4">
          <p className="text-[15px]">
            실험 버킷이 전체의{" "}
            <span className="tabular font-medium">
              {(experimentRatio * 100).toFixed(1)}%
            </span>
            다. 기준선 {EXPERIMENT_LIMIT * 100}%를 넘었다.
          </p>
          <p className="mt-1 text-sm text-muted">
            실험분은 목표 비중과 리밸런싱 계산에서 빠진다. 배분 대상은{" "}
            <span className="tabular">
              {formatMoney(allocationTotal, "KRW")}
            </span>
            {hasForeign ? " (원화 자산 기준)" : ""}.
          </p>
        </section>
      ) : null}

      {unassigned.length > 0 ? (
        <section className="mt-10 border-t border-line pt-6">
          <h2 className="text-lg font-semibold">버킷 지정 필요</h2>
          <p className="mt-1 text-sm text-muted">
            새로 들어온 종목이다. 한 번만 정하면 다음 동기화부터 기억한다.
            코어·틸트만 목표 비중 계산에 들어간다.
          </p>
          <ul className="mt-4 divide-y divide-line border-y border-line">
            {unassigned.map((holding) => (
              <li
                key={holding.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <span className="text-[15px]">
                  {holding.name}
                  <span className="tabular ml-2 text-sm text-muted">
                    {holding.symbol}
                  </span>
                </span>
                <div className="flex gap-2">
                  {BUCKETS.map((item) => (
                    <form key={item.value} action={setBucket}>
                      <input type="hidden" name="id" value={holding.id} />
                      <input type="hidden" name="bucket" value={item.value} />
                      <button
                        type="submit"
                        className="rounded-xs border border-line px-3 py-1 text-sm hover:bg-fg hover:text-bg"
                      >
                        {item.label}
                      </button>
                    </form>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {grouped.map((group) => (
        <section key={group.value} className="mt-10">
          <h2 className="text-lg font-semibold">{group.label}</h2>
          <table className="mt-3 w-full border-t border-line text-[15px]">
            <thead>
              <tr className="text-sm text-muted">
                <th className="py-2 text-left font-normal">종목</th>
                <th className="py-2 text-left font-normal">버킷</th>
                <th className="py-2 text-right font-normal">수량</th>
                <th className="py-2 text-right font-normal">평단</th>
                <th className="py-2 text-right font-normal">매입금액</th>
                <th className="py-2 text-right font-normal" />
              </tr>
            </thead>
            <tbody>
              {group.items.map((holding) => (
                <tr key={holding.id} className="border-t border-line">
                  <td className="py-3">
                    <span>{holding.name}</span>
                    <span className="tabular ml-2 text-sm text-muted">
                      {holding.symbol}
                    </span>
                    {holding.is_etf ? (
                      <span className="ml-2 text-sm text-muted">ETF</span>
                    ) : null}
                    {holding.source === "kis" ? (
                      <span className="ml-2 text-sm text-muted">KIS</span>
                    ) : null}
                  </td>
                  <td className="py-3 text-sm text-muted">
                    {bucketLabel(holding.bucket)}
                  </td>
                  <td className="tabular py-3 text-right">
                    {formatQty(holding.qty)}
                  </td>
                  <td className="tabular py-3 text-right">
                    {formatMoney(holding.avg_price, holding.currency)}
                  </td>
                  <td className="tabular py-3 text-right">
                    {formatMoney(bookValue(holding), holding.currency)}
                  </td>
                  <td className="py-3 text-right">
                    <Link
                      href={`/holdings/${holding.id}`}
                      className="text-sm text-muted underline underline-offset-4 hover:text-fg"
                    >
                      수정
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}

      <section className="mt-14 border-t border-line pt-8">
        <h2 className="text-lg font-semibold">자산 추가</h2>
        <p className="mt-1 mb-6 text-sm text-muted">
          한국투자증권 계좌는 KIS 동기화로 자동 반영된다. 여기에는 타
          증권사·연금계좌를 직접 입력한다.
        </p>
        <HoldingForm action={createHolding} submitLabel="추가" />
      </section>
    </main>
  );
}

export const dynamic = "force-dynamic";
