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

  // 섹션별로 앞의 두 건씩. 4섹션이면 최대 8건이 홈에 걸린다.
  const preview =
    briefing?.sections.map((section) => ({
      key: section.key,
      label: section.label,
      total: section.items.length,
      items: section.items.slice(0, 2),
    })) ?? [];

  return (
    <main className="mx-auto w-full max-w-page px-5 pt-10 pb-24 sm:px-8">
      {portfolio.holdings.length === 0 ? (
        <p className="label">등록된 자산 없음</p>
      ) : (
        <section>
          <h1 className="label">총자산</h1>
          <p className="text-display tabular text-ink mt-2">
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

          <p className="label mt-4">
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

      {briefing && briefing.gauges.length > 0 ? (
        <section className="mt-12 border-y border-line-strong">
          <h2 className="sr-only">시장 상황</h2>
          <dl className="grid grid-cols-2 md:grid-cols-4">
            {briefing.gauges.map((gauge, index) => (
              <div
                key={gauge.key}
                className={[
                  "border-line px-1 py-5",
                  index % 2 === 0 ? "border-r md:border-r" : "",
                  index === 3 ? "md:border-r-0" : "",
                  index > 1 ? "border-t md:border-t-0" : "",
                  index > 0 ? "md:pl-6" : "",
                ].join(" ")}
              >
                <dt className="label">{gauge.label}</dt>
                <dd className="tabular mt-1.5 flex items-baseline gap-2">
                  <span className="text-title text-ink">{gauge.display}</span>
                  {gauge.change !== null && gauge.change !== 0 ? (
                    <span
                      className={`text-small font-semibold ${
                        gauge.change > 0 ? "text-gain" : "text-loss"
                      }`}
                    >
                      {gauge.change > 0 ? "+" : ""}
                      {gauge.change}
                    </span>
                  ) : null}
                </dd>
                {gauge.note ? (
                  <dd className="label mt-1.5">{gauge.note}</dd>
                ) : null}
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      <div className="mt-14 gap-14 lg:flex lg:items-start">
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
                    <span className="text-subhead text-ink">{slice.label}</span>
                    <span className="tabular text-small">
                      {(slice.weight * 100).toFixed(1)}%
                      <span className="ml-2.5 text-label text-muted">
                        {formatMoney(slice.krw, "KRW")}
                      </span>
                    </span>
                  </div>
                  {/* 비중은 길이로만 나타낸다. 자산군에 색을 주지 않는다. */}
                  <div className="mt-2.5 h-0.5 w-full bg-line-strong">
                    <div
                      className="h-0.5 bg-ink"
                      style={{ width: `${(slice.weight * 100).toFixed(1)}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
            <Link
              href="/holdings"
              className="label mt-3 inline-block underline decoration-line-strong underline-offset-4 hover:text-ink hover:decoration-ink"
            >
              종목별 보기
            </Link>
          </section>
        ) : null}

        <section className="mt-14 min-w-0 lg:mt-0 lg:flex-1">
          <h2 className="label">
            {briefing ? `${briefing.date} 브리핑` : "브리핑"}
          </h2>

          {preview.length === 0 ? (
            <p className="mt-3 text-small text-muted">
              아직 발행된 브리핑이 없다.
            </p>
          ) : (
            <>
              <div className="mt-3 border-t border-line-strong">
                {preview.map((section) => (
                  <div key={section.key} className="border-b border-line py-4">
                    <div className="flex items-baseline gap-2">
                      <h3 className="label">{section.label}</h3>
                      <span className="tabular label">{section.total}건</span>
                    </div>
                    <ul className="mt-2 space-y-1.5">
                      {section.items.map((item) => (
                        <li key={item.sourceUrl}>
                          <Link
                            href="/briefing"
                            className="font-serif text-subhead text-ink hover:opacity-70"
                          >
                            {item.headline ?? item.points[0]}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
              <Link
                href="/briefing"
                className="label mt-3 inline-block underline decoration-line-strong underline-offset-4 hover:text-ink hover:decoration-ink"
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
