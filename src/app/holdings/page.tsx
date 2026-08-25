import Link from "next/link";

import {
  ASSET_CLASSES,
  formatAsOf,
  formatMoney,
  formatPercent,
  formatQty,
  formatSignedMoney,
  marketValue,
  pnlClass,
  profit,
  returnRate,
} from "@/lib/assets";
import { loadPortfolio } from "@/lib/portfolio";
import { createClient } from "@/lib/supabase/server";

import { createHolding } from "./actions";
import { HoldingForm } from "./holding-form";
import { KisSyncButton } from "./kis-sync-button";

export const metadata = { title: "보유자산 — 투자 데스크" };

export default async function HoldingsPage() {
  const supabase = await createClient();

  // 집계는 홈 대시보드와 같은 계산을 쓴다 (src/lib/portfolio.ts).
  const {
    holdings,
    quotes,
    usdKrw,
    totalKrw,
    profitKrw,
    rate,
    excluded,
    missing,
    asOf,
  } = await loadPortfolio(supabase);

  const grouped = ASSET_CLASSES.map((assetClass) => ({
    ...assetClass,
    items: holdings.filter((item) => item.asset_class === assetClass.value),
  })).filter((group) => group.items.length > 0);

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-12">
      <header className="flex items-baseline justify-between border-b border-line pb-6">
        <h1 className="text-2xl font-semibold tracking-tight">보유자산</h1>
        <Link
          href="/"
          className="text-sm text-muted underline underline-offset-4 hover:text-fg"
        >
          홈
        </Link>
      </header>

      <section className="mt-8">
        {holdings.length === 0 ? (
          <p className="text-[15px] text-muted">등록된 자산이 없다.</p>
        ) : (
          <>
            <div className="text-sm text-muted">총자산 (원화 환산)</div>
            <div className="tabular mt-1 text-3xl font-semibold">
              {formatMoney(totalKrw, "KRW")}
            </div>
            <div className={`tabular mt-2 text-[15px] ${pnlClass(profitKrw)}`}>
              {formatSignedMoney(profitKrw, "KRW")}
              {rate !== null ? ` (${formatPercent(rate)})` : null}
            </div>

            <p className="mt-3 text-sm text-muted">
              {asOf ? `${formatAsOf(asOf)} 기준` : "시세 없음"}
              {usdKrw !== null
                ? ` · 원달러 ${usdKrw.toLocaleString("ko-KR", {
                    maximumFractionDigits: 2,
                  })}`
                : null}
              {excluded > 0 ? ` · ${excluded}건 시세 미반영` : null}
            </p>
            {missing.length > 0 ? (
              <p className="mt-1 text-sm text-muted">
                시세를 못 받은 종목: {missing.join(", ")}
              </p>
            ) : null}
          </>
        )}

        <div className="mt-6">
          <KisSyncButton />
        </div>
      </section>

      {grouped.map((group) => (
        <section key={group.value} className="mt-10">
          <h2 className="text-lg font-semibold">{group.label}</h2>
          <div className="overflow-x-auto">
            <table className="mt-3 w-full min-w-[640px] border-t border-line text-[15px]">
              <thead>
                <tr className="text-sm text-muted">
                  <th className="py-2 text-left font-normal">종목</th>
                  <th className="py-2 text-right font-normal">수량</th>
                  <th className="py-2 text-right font-normal">평단</th>
                  <th className="py-2 text-right font-normal">현재가</th>
                  <th className="py-2 text-right font-normal">평가금액</th>
                  <th className="py-2 text-right font-normal">손익</th>
                  <th className="py-2 text-right font-normal" />
                </tr>
              </thead>
              <tbody>
                {group.items.map((holding) => {
                  const price = quotes.get(holding.symbol)?.price ?? null;
                  const pnl = price === null ? null : profit(holding, price);
                  const rate = price === null ? null : returnRate(holding, price);

                  return (
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
                      <td className="tabular py-3 text-right">
                        {formatQty(holding.qty)}
                      </td>
                      <td className="tabular py-3 text-right">
                        {holding.avg_price > 0
                          ? formatMoney(holding.avg_price, holding.currency)
                          : "—"}
                      </td>
                      <td className="tabular py-3 text-right">
                        {price === null
                          ? "—"
                          : formatMoney(price, holding.currency)}
                      </td>
                      <td className="tabular py-3 text-right">
                        {price === null
                          ? "—"
                          : formatMoney(
                              marketValue(holding, price),
                              holding.currency,
                            )}
                      </td>
                      <td
                        className={`tabular py-3 text-right ${
                          pnl === null ? "" : pnlClass(pnl)
                        }`}
                      >
                        {pnl === null || rate === null ? (
                          "—"
                        ) : (
                          <>
                            {formatSignedMoney(pnl, holding.currency)}
                            <span className="ml-2 text-sm">
                              {formatPercent(rate)}
                            </span>
                          </>
                        )}
                      </td>
                      <td className="py-3 text-right">
                        <Link
                          href={`/holdings/${holding.id}`}
                          className="text-sm text-muted underline underline-offset-4 hover:text-fg"
                        >
                          {holding.source === "kis" ? "분류" : "수정"}
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
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
