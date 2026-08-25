import Link from "next/link";

import {
  formatAsOf,
  formatMoney,
  formatPercent,
  formatSignedMoney,
  pnlClass,
} from "@/lib/assets";
import { loadPortfolio, recordSnapshot } from "@/lib/portfolio";
import { createClient, getUser } from "@/lib/supabase/server";

export default async function Home() {
  const user = await getUser();
  const supabase = await createClient();

  const portfolio = await loadPortfolio(supabase);
  const previous = user
    ? await recordSnapshot(supabase, user.id, portfolio)
    : null;

  // 직전 기록 대비 변화. 매입원가가 함께 뛰었다면 신규 납입이 섞인 것이다.
  const change = previous ? portfolio.totalKrw - previous.total_krw : null;
  const deposited = previous ? portfolio.bookKrw - previous.book_krw : null;

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
      <header className="flex items-baseline justify-between border-b border-line pb-6">
        <h1 className="text-2xl font-semibold tracking-tight">투자 데스크</h1>
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            className="text-sm text-muted underline underline-offset-4 hover:text-fg"
          >
            로그아웃
          </button>
        </form>
      </header>

      {portfolio.holdings.length === 0 ? (
        <p className="mt-8 text-[15px] text-muted">
          등록된 자산이 없다. 보유자산에서 KIS 동기화를 하거나 직접 입력할 것.
        </p>
      ) : (
        <>
          <section className="mt-8">
            <div className="text-sm text-muted">총자산</div>
            <div className="tabular mt-1 text-4xl font-semibold">
              {formatMoney(portfolio.totalKrw, "KRW")}
            </div>
            <div
              className={`tabular mt-2 text-[15px] ${pnlClass(portfolio.profitKrw)}`}
            >
              {formatSignedMoney(portfolio.profitKrw, "KRW")}
              {portfolio.rate !== null
                ? ` (${formatPercent(portfolio.rate)})`
                : null}
            </div>

            {change !== null && previous ? (
              <div className="tabular mt-1 text-sm text-muted">
                {previous.date} 대비 {formatSignedMoney(change, "KRW")}
                {deposited !== null && Math.abs(deposited) >= 1000
                  ? ` · 납입 ${formatSignedMoney(deposited, "KRW")}`
                  : null}
              </div>
            ) : null}

            <p className="mt-3 text-sm text-muted">
              {portfolio.asOf
                ? `${formatAsOf(portfolio.asOf)} 기준`
                : "시세 없음"}
              {portfolio.usdKrw !== null
                ? ` · 원달러 ${portfolio.usdKrw.toLocaleString("ko-KR", {
                    maximumFractionDigits: 2,
                  })}`
                : null}
              {portfolio.excluded > 0
                ? ` · ${portfolio.excluded}건 시세 미반영`
                : null}
            </p>
          </section>

          <section className="mt-10">
            <h2 className="text-lg font-semibold">자산군 비중</h2>
            <ul className="mt-3 border-t border-line">
              {portfolio.byClass.map((slice) => (
                <li key={slice.value} className="border-b border-line py-3">
                  <div className="flex items-baseline justify-between">
                    <span className="text-[15px]">{slice.label}</span>
                    <span className="tabular text-[15px]">
                      {(slice.weight * 100).toFixed(1)}%
                      <span className="ml-3 text-sm text-muted">
                        {formatMoney(slice.krw, "KRW")}
                      </span>
                    </span>
                  </div>
                  {/* 비중은 길이로만 나타낸다. 자산군에 색을 주지 않는다 (DESIGN.md) */}
                  <div className="mt-2 h-1 w-full bg-line">
                    <div
                      className="h-1 bg-fg"
                      style={{ width: `${(slice.weight * 100).toFixed(1)}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}

      <nav className="mt-10 border-t border-line">
        <Link
          href="/briefing"
          className="flex items-baseline justify-between border-b border-line py-4 hover:bg-line/30"
        >
          <span className="text-[17px]">데일리 브리핑</span>
          <span className="text-sm text-muted">시장 상황 · 국내 · 해외</span>
        </Link>
        <Link
          href="/holdings"
          className="flex items-baseline justify-between border-b border-line py-4 hover:bg-line/30"
        >
          <span className="text-[17px]">보유자산</span>
          <span className="text-sm text-muted">종목별 수익률 · 동기화</span>
        </Link>
      </nav>

      <p className="mt-10 text-sm text-muted">{user?.email}</p>
    </main>
  );
}

export const dynamic = "force-dynamic";
