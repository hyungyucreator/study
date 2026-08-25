import Link from "next/link";

import { assetClassLabel } from "@/lib/assets";
import type { BriefingItem, BriefingView } from "@/lib/briefing/read";
import type { Implication } from "@/lib/briefing/schema";

/**
 * 브리핑 화면.
 * 위계는 크기·굵기로만 만든다. 카드를 쓰지 않고 여백과 1px 선으로 나눈다 (DESIGN.md).
 */

const DIRECTION: Record<Implication["direction"], string> = {
  up: "상방",
  down: "하방",
  unclear: "불확실",
};

function Gauges({ view }: { view: BriefingView }) {
  if (view.gauges.length === 0) {
    return <p className="mt-3 text-[15px] text-muted">지표를 수집하지 못했다.</p>;
  }

  return (
    <div className="mt-4 grid grid-cols-2 gap-x-8 gap-y-5 sm:grid-cols-4">
      {view.gauges.map((gauge) => (
        <div key={gauge.key}>
          <div className="text-sm text-muted">{gauge.label}</div>
          <div className="tabular mt-1 text-xl font-medium">
            {gauge.display}
            {gauge.change !== null ? (
              <span className="ml-2 text-sm font-normal text-muted">
                {gauge.change > 0 ? "+" : ""}
                {gauge.change}
              </span>
            ) : null}
          </div>
          {gauge.note ? (
            <div className="mt-1 text-sm text-muted">{gauge.note}</div>
          ) : null}
        </div>
      ))}
      {view.failedGauges.length > 0 ? (
        <div className="col-span-full text-sm text-muted">
          {view.failedGauges.join(", ")}: 오늘 데이터 수집 실패
        </div>
      ) : null}
    </div>
  );
}

function Row({ item, index }: { item: BriefingItem; index: number }) {
  return (
    <article className="border-t border-line py-7">
      <h3 className="text-[17px] font-semibold">
        <span className="tabular mr-2 text-muted">{index + 1}</span>
        {item.headline ?? item.fact.slice(0, 30)}
      </h3>

      <p className="mt-3 text-[16px] leading-[1.7]">{item.fact}</p>

      <dl className="mt-4 space-y-2 text-[15px]">
        {item.surprise ? (
          <div className="flex gap-3">
            <dt className="w-20 shrink-0 text-muted">서프라이즈</dt>
            <dd>{item.surprise}</dd>
          </div>
        ) : null}

        {item.context ? (
          <div className="flex gap-3">
            <dt className="w-20 shrink-0 text-muted">맥락</dt>
            <dd>{item.context}</dd>
          </div>
        ) : null}

        {item.outlook ? (
          <div className="flex gap-3">
            <dt className="w-20 shrink-0 text-muted">지켜볼 것</dt>
            <dd>{item.outlook}</dd>
          </div>
        ) : null}

        {item.implications.length > 0 ? (
          <div className="flex gap-3">
            <dt className="w-20 shrink-0 text-muted">자산군</dt>
            <dd className="space-y-1">
              {item.implications.map((implication) => (
                <div key={implication.asset_class}>
                  <span className="font-medium">
                    {assetClassLabel(implication.asset_class)}{" "}
                    {DIRECTION[implication.direction]}
                  </span>
                  <span className="text-muted"> — {implication.note}</span>
                </div>
              ))}
            </dd>
          </div>
        ) : null}

        {item.investmentNote ? (
          <div className="flex gap-3">
            <dt className="w-20 shrink-0 text-muted">투자 함의</dt>
            <dd>{item.investmentNote}</dd>
          </div>
        ) : null}
      </dl>

      <a
        href={item.sourceUrl}
        target="_blank"
        rel="noreferrer"
        className="mt-4 inline-block text-sm text-muted underline underline-offset-4 hover:text-fg"
      >
        원문 보기
      </a>
    </article>
  );
}

export function BriefingBody({
  view,
  archive,
}: {
  view: BriefingView;
  archive: string[];
}) {
  const past = archive.filter((date) => date !== view.date);

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
      <header className="flex items-baseline justify-between border-b border-line pb-6">
        <h1 className="tabular text-2xl font-semibold tracking-tight">
          {view.date} 브리핑
        </h1>
        <Link
          href="/"
          className="text-sm text-muted underline underline-offset-4 hover:text-fg"
        >
          홈
        </Link>
      </header>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">오늘의 온도</h2>
        <Gauges view={view} />
      </section>

      <section className="mt-14">
        <h2 className="text-lg font-semibold">1부. 시장과 경제</h2>
        <div className="mt-4">
          {view.part1.map((item, index) => (
            <Row key={item.sourceUrl} item={item} index={index} />
          ))}
        </div>
      </section>

      <section className="mt-14">
        <h2 className="text-lg font-semibold">2부. 오늘의 세계</h2>
        <div className="mt-4">
          {view.part2.map((item, index) => (
            <Row key={item.sourceUrl} item={item} index={index} />
          ))}
        </div>
      </section>

      {past.length > 0 ? (
        <section className="mt-14 border-t border-line pt-8">
          <h2 className="text-lg font-semibold">지난 브리핑</h2>
          <ul className="mt-3">
            {past.map((date) => (
              <li key={date} className="border-b border-line">
                <Link
                  href={`/briefing/${date}`}
                  className="tabular block py-3 text-[15px] hover:bg-line/30"
                >
                  {date}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
