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
  type Holding,
} from "@/lib/assets";
import { loadPortfolio } from "@/lib/portfolio";
import type { Quote } from "@/lib/quotes";
import { createClient } from "@/lib/supabase/server";

import { createHolding } from "./actions";
import { HoldingForm } from "./holding-form";
import { KisSyncButton } from "./kis-sync-button";

export const metadata = { title: "보유자산 · 투자 데스크" };

/** 값을 못 구한 칸. 대시 대신 가운뎃점 하나만 둔다. */
const EMPTY = "·";

function Pnl({
  holding,
  price,
}: {
  holding: Holding;
  price: number | null;
}) {
  if (price === null) return <span className="text-muted">{EMPTY}</span>;

  const pnl = profit(holding, price);
  const rate = returnRate(holding, price);
  if (rate === null) return <span className="text-muted">{EMPTY}</span>;

  return (
    <span className={pnlClass(pnl)}>
      {formatSignedMoney(pnl, holding.currency)}
      <span className="ml-2 text-label whitespace-nowrap">
        {formatPercent(rate)}
      </span>
    </span>
  );
}

function Name({ holding }: { holding: Holding }) {
  return (
    <>
      <span className="text-subhead text-ink">{holding.name}</span>
      <span className="tabular ml-2 text-label text-muted">
        {holding.symbol}
      </span>
      {holding.is_etf ? <span className="label ml-2">ETF</span> : null}
      {holding.source === "kis" ? <span className="label ml-2">KIS</span> : null}
    </>
  );
}

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

  const priceOf = (holding: Holding) =>
    (quotes as Map<string, Quote>).get(holding.symbol)?.price ?? null;

  const grouped = ASSET_CLASSES.map((assetClass) => ({
    ...assetClass,
    items: holdings.filter((item) => item.asset_class === assetClass.value),
  })).filter((group) => group.items.length > 0);

  return (
    <main className="mx-auto w-full max-w-page px-5 pt-10 pb-24 sm:px-8">
      <section>
        <h1 className="label">보유자산 평가액</h1>
        {holdings.length === 0 ? (
          <p className="mt-3 text-small text-muted">등록된 자산이 없다.</p>
        ) : (
          <>
            <p className="text-display tabular text-ink mt-2">
              {formatMoney(totalKrw, "KRW")}
            </p>
            <p className={`tabular text-subhead mt-2 ${pnlClass(profitKrw)}`}>
              {formatSignedMoney(profitKrw, "KRW")}
              {rate !== null ? ` (${formatPercent(rate)})` : null}
            </p>
            <p className="label mt-3">
              {asOf ? `${formatAsOf(asOf)} 기준` : "시세 없음"}
              {usdKrw !== null
                ? ` · 원달러 ${usdKrw.toLocaleString("ko-KR", {
                    maximumFractionDigits: 2,
                  })}`
                : null}
              {excluded > 0 ? ` · ${excluded}건 시세 미반영` : null}
            </p>
            {missing.length > 0 ? (
              <p className="label mt-1">
                시세 미확보: {missing.join(", ")}
              </p>
            ) : null}
          </>
        )}
        <div className="mt-6">
          <KisSyncButton />
        </div>
      </section>

      {grouped.map((group) => (
        <section key={group.value} className="mt-14">
          <h2 className="label border-b border-line-strong pb-2">{group.label}</h2>

          {/* 모바일: 행 단위 스택. 표를 가로로 스크롤하게 두지 않는다. */}
          <ul className="md:hidden">
            {group.items.map((holding) => {
              const price = priceOf(holding);
              return (
                <li
                  key={holding.id}
                  className="border-b border-line py-4"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <div className="min-w-0">
                      <Name holding={holding} />
                    </div>
                    <Link
                      href={`/holdings/${holding.id}`}
                      className="label shrink-0 underline decoration-line-strong underline-offset-4 hover:text-ink"
                    >
                      {holding.source === "kis" ? "분류" : "수정"}
                    </Link>
                  </div>

                  <p className="tabular mt-1.5 text-label text-muted">
                    {formatQty(holding.qty)}
                    {holding.avg_price > 0
                      ? ` · 평단 ${formatMoney(holding.avg_price, holding.currency)}`
                      : ""}
                    {price !== null
                      ? ` · 현재 ${formatMoney(price, holding.currency)}`
                      : ""}
                  </p>

                  <div className="tabular mt-2 flex items-baseline justify-between gap-3 text-small">
                    <span>
                      {price === null
                        ? EMPTY
                        : formatMoney(
                            marketValue(holding, price),
                            holding.currency,
                          )}
                    </span>
                    <Pnl holding={holding} price={price} />
                  </div>
                </li>
              );
            })}
          </ul>

          {/* 데스크탑: 표. 자릿수 비교가 쉬워진다. */}
          {/*
            table-fixed로 열 폭을 고정한다. 자산군마다 표가 따로라
            auto 레이아웃으로 두면 표마다 열 위치가 어긋나 자릿수 비교가 안 된다.
          */}
          <table className="hidden w-full table-fixed md:table">
            <thead>
              <tr className="label border-b border-line">
                <th className="w-[32%] py-2.5 text-left font-medium">종목</th>
                <th className="w-[9%] py-2.5 text-right font-medium">수량</th>
                <th className="w-[13%] py-2.5 text-right font-medium">평단</th>
                <th className="w-[13%] py-2.5 text-right font-medium">현재가</th>
                <th className="w-[15%] py-2.5 text-right font-medium">
                  평가금액
                </th>
                <th className="w-[14%] py-2.5 text-right font-medium">손익</th>
                <th className="w-[4%]" />
              </tr>
            </thead>
            <tbody>
              {group.items.map((holding) => {
                const price = priceOf(holding);
                return (
                  <tr key={holding.id} className="border-b border-line">
                    <td className="py-3.5 pr-4">
                      <Name holding={holding} />
                    </td>
                    <td className="tabular py-3.5 text-right text-small">
                      {formatQty(holding.qty)}
                    </td>
                    <td className="tabular py-3.5 text-right text-small">
                      {holding.avg_price > 0
                        ? formatMoney(holding.avg_price, holding.currency)
                        : EMPTY}
                    </td>
                    <td className="tabular py-3.5 text-right text-small">
                      {price === null
                        ? EMPTY
                        : formatMoney(price, holding.currency)}
                    </td>
                    <td className="tabular py-3.5 text-right text-small">
                      {price === null
                        ? EMPTY
                        : formatMoney(
                            marketValue(holding, price),
                            holding.currency,
                          )}
                    </td>
                    <td className="tabular py-3.5 text-right text-small">
                      <Pnl holding={holding} price={price} />
                    </td>
                    <td className="py-3.5 pl-4 text-right">
                      <Link
                        href={`/holdings/${holding.id}`}
                        className="label underline decoration-line-strong underline-offset-4 hover:text-ink"
                      >
                        {holding.source === "kis" ? "분류" : "수정"}
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      ))}

      <section className="mt-24 max-w-form border-t border-line-strong pt-8">
        <h2 className="font-serif text-title text-ink">자산 추가</h2>
        <p className="mt-2 mb-7 text-small text-muted">
          한국투자증권 계좌는 KIS 동기화로 자동 반영된다. 여기에는 타
          증권사와 연금계좌를 직접 입력한다.
        </p>
        <HoldingForm action={createHolding} submitLabel="추가" />
      </section>
    </main>
  );
}

export const dynamic = "force-dynamic";
