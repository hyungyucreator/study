import Link from "next/link";

import {
  formatAsOf,
  formatMoney,
  formatPercent,
  formatSignedMoney,
  pnlClass,
} from "@/lib/assets";
import { loadBriefing } from "@/lib/briefing/read";
import { loadPortfolio, recordSnapshot } from "@/lib/portfolio";
import { createClient, getUser } from "@/lib/supabase/server";

export const metadata = { title: "투자 데스크" };

export default async function Home() {
  const user = await getUser();
  const supabase = await createClient();

  const [portfolio, briefing] = await Promise.all([
    loadPortfolio(supabase),
    loadBriefing(supabase),
  ]);

  const previous = user
    ? await recordSnapshot(supabase, user.id, portfolio)
    : null;

  // 직전 기록 대비 변화. 매입원가가 함께 뛰었다면 신규 납입이 섞인 것이다.
  const change = previous ? portfolio.totalKrw - previous.total_krw : null;
  const deposited = previous ? portfolio.bookKrw - previous.book_krw : null;

  const headlines = briefing
    ? [...briefing.part1, ...briefing.part2].slice(0, 4)
    : [];

  return (
    <main className="mx-auto w-full max-w-page px-5 pt-10 pb-24 sm:px-8">
      {portfolio.holdings.length === 0 ? (
        <p className="text-small text-muted">
          등록된 자산이 없다. 보유자산에서 KIS 동기화를 하거나 직접 입력할 것.
        </p>
      ) : (
        <section>
          <h1 className="label">총자산</h1>
          <p className="text-display tabular mt-2">
            {formatMoney(portfolio.totalKrw, "KRW")}
          </p>
          <p
            className={`tabular text-subhead mt-2 ${pnlClass(portfolio.profitKrw)}`}
          >
            {formatSignedMoney(portfolio.profitKrw, "KRW")}
            {portfolio.rate !== null
              ? ` (${formatPercent(portfolio.rate)})`
              : null}
          </p>

          {change !== null && previous ? (
            <p className="tabular mt-1 text-small text-muted">
              {previous.date} 대비 {formatSignedMoney(change, "KRW")}
              {deposited !== null && Math.abs(deposited) >= 1000
                ? ` · 납입 ${formatSignedMoney(deposited, "KRW")}`
                : null}
            </p>
          ) : null}

          <p className="label mt-3">
            {portfolio.asOf ? `${formatAsOf(portfolio.asOf)} 기준` : "시세 없음"}
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
      )}

      <div className="mt-14 gap-12 lg:flex lg:items-start">
        {portfolio.byClass.length > 0 ? (
          <section className="lg:w-[22rem] lg:shrink-0">
            <h2 className="label">자산군 비중</h2>
            <ul className="mt-3 border border-line bg-surface">
              {portfolio.byClass.map((slice) => (
                <li
                  key={slice.value}
                  className="border-t border-line px-4 py-3.5 first:border-t-0"
                >
                  <div className="flex items-baseline justify-between gap-4">
                    <span className="text-subhead">{slice.label}</span>
                    <span className="tabular text-small">
                      {(slice.weight * 100).toFixed(1)}%
                      <span className="ml-2.5 text-label text-muted">
                        {formatMoney(slice.krw, "KRW")}
                      </span>
                    </span>
                  </div>
                  {/* 비중은 길이로만 나타낸다. 자산군에 색을 주지 않는다. */}
                  <div className="mt-2.5 h-0.5 w-full bg-line">
                    <div
                      className="h-0.5 bg-fg"
                      style={{ width: `${(slice.weight * 100).toFixed(1)}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
            <Link
              href="/holdings"
              className="label mt-3 inline-block underline decoration-line underline-offset-4 hover:text-fg hover:decoration-fg"
            >
              종목별 보기
            </Link>
          </section>
        ) : null}

        <section className="mt-14 min-w-0 lg:mt-0 lg:flex-1">
          <h2 className="label">
            {briefing ? `${briefing.date} 브리핑` : "브리핑"}
          </h2>

          {headlines.length === 0 ? (
            <p className="mt-3 text-small text-muted">
              아직 발행된 브리핑이 없다.
            </p>
          ) : (
            <>
              <ul className="mt-3 border-t border-line">
                {headlines.map((item) => (
                  <li key={item.sourceUrl} className="border-b border-line">
                    <Link
                      href="/briefing"
                      className="flex items-baseline gap-3 py-3.5 hover:text-muted"
                    >
                      <span className="label shrink-0">
                        {item.region === "kr" ? "국내" : "해외"}
                      </span>
                      <span className="text-subhead">
                        {item.headline ?? item.fact.slice(0, 30)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              <Link
                href="/briefing"
                className="label mt-3 inline-block underline decoration-line underline-offset-4 hover:text-fg hover:decoration-fg"
              >
                브리핑 전체 읽기
              </Link>
            </>
          )}
        </section>
      </div>
    </main>
  );
}

export const dynamic = "force-dynamic";
