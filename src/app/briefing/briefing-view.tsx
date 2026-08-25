import Link from "next/link";

import { assetClassLabel } from "@/lib/assets";
import type { BriefingItem, BriefingView } from "@/lib/briefing/read";
import type { Implication } from "@/lib/briefing/schema";

/**
 * 브리핑 화면.
 *
 * 매일 읽을 화면이라 읽기 경험이 전부다.
 * 위계는 크기·굵기로만 만들고, 구분은 여백과 1px 선으로 한다.
 * 카드·그림자·유채색을 쓰지 않는다 (DESIGN.md).
 */

const DIRECTION: Record<Implication["direction"], string> = {
  up: "상방",
  down: "하방",
  unclear: "불확실",
};

function Gauges({ view }: { view: BriefingView }) {
  if (view.gauges.length === 0) {
    return <p className="text-[15px] text-muted">지표를 수집하지 못했다.</p>;
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-x-6 gap-y-6 sm:grid-cols-4">
        {view.gauges.map((gauge) => (
          <div key={gauge.key}>
            <div className="text-[13px] text-muted">{gauge.label}</div>
            <div className="tabular mt-1.5 flex items-baseline gap-1.5">
              <span className="text-[22px] leading-none font-semibold">
                {gauge.display}
              </span>
              {gauge.change !== null ? (
                <span className="text-[13px] text-muted">
                  {gauge.change > 0 ? "+" : ""}
                  {gauge.change}
                </span>
              ) : null}
            </div>
            {gauge.note ? (
              <div className="mt-2 text-[13px] leading-[1.5] text-muted">
                {gauge.note}
              </div>
            ) : null}
          </div>
        ))}
      </div>
      {view.failedGauges.length > 0 ? (
        <p className="mt-5 text-[13px] text-muted">
          {view.failedGauges.join(", ")}: 오늘 데이터 수집 실패
        </p>
      ) : null}
    </>
  );
}

/** 라벨 + 내용 한 줄. 라벨은 작게 눕히고 내용이 읽기 흐름을 갖게 한다. */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-4 sm:flex sm:gap-5">
      <div className="w-[4.5rem] shrink-0 pt-0.5 text-[13px] text-muted">
        {label}
      </div>
      <div className="mt-1 text-[15px] leading-[1.7] sm:mt-0">{children}</div>
    </div>
  );
}

function Row({ item, index }: { item: BriefingItem; index: number }) {
  return (
    <article className="border-t border-line py-8 first:border-t-0 first:pt-5">
      <h4 className="flex gap-3 text-[17px] leading-[1.5] font-semibold">
        <span className="tabular shrink-0 text-muted">{index}</span>
        <span>{item.headline ?? item.fact.slice(0, 30)}</span>
      </h4>

      <p className="mt-3 pl-7 text-[16px] leading-[1.75]">{item.fact}</p>

      <div className="pl-7">
        {item.surprise ? (
          <Field label="서프라이즈">{item.surprise}</Field>
        ) : null}
        {item.context ? <Field label="맥락">{item.context}</Field> : null}
        {item.outlook ? <Field label="지켜볼 것">{item.outlook}</Field> : null}
        {item.investmentNote ? (
          <Field label="투자 함의">{item.investmentNote}</Field>
        ) : null}

        {/* 자산군 함의는 이 제품이 내놓는 핵심이다. 세로선으로 도드라지게 둔다. */}
        {item.implications.length > 0 ? (
          <div className="mt-5 space-y-2.5 border-l border-line pl-4">
            {item.implications.map((implication) => (
              <div
                key={implication.asset_class}
                className="text-[15px] leading-[1.7]"
              >
                <span className="font-semibold">
                  {assetClassLabel(implication.asset_class)}{" "}
                  {DIRECTION[implication.direction]}
                </span>
                <span className="text-muted"> — {implication.note}</span>
              </div>
            ))}
          </div>
        ) : null}

        <a
          href={item.sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-5 inline-block text-[13px] text-muted underline decoration-line underline-offset-4 hover:text-fg hover:decoration-fg"
        >
          {item.sourceName ?? "원문"} 원문 보기
        </a>
      </div>
    </article>
  );
}

/**
 * 한 부를 국내/해외로 나눠 그린다.
 * 번호는 부 전체에서 이어진다 — 그룹마다 1로 돌아가면 항목을 지칭할 수 없다.
 */
function Part({
  title,
  items,
  globalLabel,
}: {
  title: string;
  items: BriefingItem[];
  globalLabel: string;
}) {
  if (items.length === 0) return null;

  const kr = items.filter((item) => item.region === "kr");
  const global = items.filter((item) => item.region === "global");
  const groups = [
    { key: "kr", label: "국내", items: kr, offset: 1 },
    { key: "global", label: globalLabel, items: global, offset: kr.length + 1 },
  ].filter((group) => group.items.length > 0);

  return (
    <section className="mt-16">
      <h2 className="text-[19px] font-semibold tracking-tight">{title}</h2>
      {groups.map((group) => (
        <div key={group.key} className="mt-9">
          <h3 className="border-b border-fg pb-2 text-[13px] font-semibold tracking-[0.08em]">
            {group.label}
          </h3>
          {group.items.map((item, index) => (
            <Row
              key={item.sourceUrl}
              item={item}
              index={group.offset + index}
            />
          ))}
        </div>
      ))}
    </section>
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
    <main className="mx-auto w-full max-w-[46rem] flex-1 px-6 py-14 sm:px-8">
      <header className="flex items-baseline justify-between">
        <h1 className="tabular text-[26px] font-semibold tracking-tight">
          {view.date}
        </h1>
        <Link
          href="/"
          className="text-[13px] text-muted underline underline-offset-4 hover:text-fg"
        >
          홈
        </Link>
      </header>

      <section className="mt-8 border-t border-line pt-8">
        <Gauges view={view} />
      </section>

      <Part title="1부. 시장과 경제" items={view.part1} globalLabel="해외" />
      <Part title="2부. 오늘의 세계" items={view.part2} globalLabel="국제" />

      {past.length > 0 ? (
        <section className="mt-20 border-t border-line pt-8">
          <h2 className="text-[13px] font-semibold tracking-[0.08em] text-muted">
            지난 브리핑
          </h2>
          <ul className="mt-3">
            {past.map((date) => (
              <li key={date} className="border-b border-line">
                <Link
                  href={`/briefing/${date}`}
                  className="tabular block py-3.5 text-[15px] hover:text-muted"
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
