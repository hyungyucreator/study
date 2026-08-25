import Link from "next/link";

import { assetClassLabel } from "@/lib/assets";
import type { BriefingItem, BriefingView } from "@/lib/briefing/read";
import type { Implication } from "@/lib/briefing/schema";

/**
 * 브리핑 화면.
 *
 * 매일 읽을 화면이라 읽기 경험이 전부다. 신문을 참고했다.
 * 마스트헤드로 시작을 알리고, 본문은 한 컬럼으로 좁게 유지하고,
 * 지표와 목차는 넓은 화면에서만 옆으로 뺀다 (DESIGN.md §4).
 *
 * 위계는 크기와 굵기로만 만든다. 구분은 여백과 1px 선으로 한다.
 * 카드, 그림자, 유채색을 쓰지 않는다.
 */

const DIRECTION: Record<Implication["direction"], string> = {
  up: "상방",
  down: "하방",
  unclear: "불확실",
};

function Gauges({ view }: { view: BriefingView }) {
  if (view.gauges.length === 0) {
    return <p className="text-small text-muted">지표를 수집하지 못했다.</p>;
  }

  return (
    <div className="border border-line bg-surface">
      <h2 className="label border-b border-line px-4 py-2.5">시장 상황</h2>

      {/*
        선 색을 반드시 함께 쓴다. Tailwind v4의 기본 border 색은 currentColor라
        border-line을 빼면 본문색(검정)으로 그려진다.
      */}
      <dl className="grid grid-cols-2 lg:grid-cols-1">
        {view.gauges.map((gauge, index) => (
          <div
            key={gauge.key}
            className={[
              "border-line px-4 py-3.5",
              // 2열일 때는 격자, 1열일 때는 가로선만. 선이 겹치지 않게 잘라 쓴다.
              index % 2 === 0 ? "border-r lg:border-r-0" : "",
              index > 1 ? "border-t" : "",
              "lg:border-t lg:first:border-t-0",
            ].join(" ")}
          >
            <dt className="label">{gauge.label}</dt>
            <dd className="tabular mt-1 flex items-baseline gap-1.5">
              <span className="text-heading">{gauge.display}</span>
              {gauge.change !== null ? (
                <span className="text-label text-muted">
                  {gauge.change > 0 ? "+" : ""}
                  {gauge.change}
                </span>
              ) : null}
            </dd>
            {gauge.note ? (
              <dd className="mt-1.5 text-label leading-[1.55] text-muted">
                {gauge.note}
              </dd>
            ) : null}
          </div>
        ))}
      </dl>

      {view.failedGauges.length > 0 ? (
        <p className="label border-t border-line px-4 py-2.5">
          {view.failedGauges.join(", ")} 수집 실패
        </p>
      ) : null}
    </div>
  );
}

/** 라벨은 위에, 내용은 아래. 모바일에서 좌측 라벨 열은 폭만 잡아먹는다. */
function Block({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-5">
      <h5 className="label">{label}</h5>
      <div className="mt-1.5 text-small">{children}</div>
    </div>
  );
}

function Article({ item, index }: { item: BriefingItem; index: number }) {
  return (
    <article className="border-t border-line py-8 first:border-t-0 first:pt-6">
      <h4 className="text-heading flex gap-3">
        <span className="tabular shrink-0 text-muted">{index}</span>
        <span>{item.headline ?? item.fact.slice(0, 30)}</span>
      </h4>

      <div className="sm:pl-[1.9rem]">
        <p className="text-body mt-3">{item.fact}</p>

        {item.surprise ? (
          <Block label="서프라이즈">{item.surprise}</Block>
        ) : null}
        {item.context ? <Block label="맥락">{item.context}</Block> : null}
        {item.outlook ? <Block label="지켜볼 것">{item.outlook}</Block> : null}

        {/* 자산군 함의는 이 제품이 내놓는 핵심이다. 불렛으로 끊어 눈에 걸리게 둔다. */}
        {item.implications.length > 0 ? (
          <div className="mt-5">
            <h5 className="label">자산군 함의</h5>
            <ul className="mt-2 space-y-3">
              {item.implications.map((implication) => (
                <li
                  key={implication.asset_class}
                  className="border-l-2 border-line pl-3.5"
                >
                  <div className="text-subhead">
                    {assetClassLabel(implication.asset_class)}{" "}
                    {DIRECTION[implication.direction]}
                  </div>
                  <div className="text-small text-muted">
                    {implication.note}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {item.investmentNote ? (
          <Block label="투자 함의">{item.investmentNote}</Block>
        ) : null}

        <a
          href={item.sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="label mt-6 inline-block underline decoration-line underline-offset-4 hover:text-fg hover:decoration-fg"
        >
          {item.sourceName ?? "원문"} 원문
        </a>
      </div>
    </article>
  );
}

type Group = { key: string; label: string; items: BriefingItem[]; offset: number };

function groupsOf(items: BriefingItem[], globalLabel: string): Group[] {
  const kr = items.filter((item) => item.region === "kr");
  const global = items.filter((item) => item.region === "global");
  return [
    { key: "kr", label: "국내", items: kr, offset: 1 },
    { key: "global", label: globalLabel, items: global, offset: kr.length + 1 },
  ].filter((group) => group.items.length > 0);
}

/** 번호는 부 전체에서 이어진다. 그룹마다 1로 돌아가면 항목을 지칭할 수 없다. */
function Part({
  id,
  title,
  items,
  globalLabel,
}: {
  id: string;
  title: string;
  items: BriefingItem[];
  globalLabel: string;
}) {
  if (items.length === 0) return null;

  return (
    <section id={id} className="mt-16 scroll-mt-20 first:mt-0">
      <h2 className="text-title border-b-2 border-fg pb-3">{title}</h2>

      {groupsOf(items, globalLabel).map((group) => (
        <div key={group.key} className="mt-10">
          <h3 className="label border-b border-line pb-2">{group.label}</h3>
          {group.items.map((item, index) => (
            <Article
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

/** 넓은 화면에서만 보이는 목차. 어떤 부에 무엇이 몇 건 있는지 한눈에 준다. */
function Contents({ view }: { view: BriefingView }) {
  const parts = [
    { id: "part1", title: "1부. 시장과 경제", items: view.part1, global: "해외" },
    { id: "part2", title: "2부. 오늘의 세계", items: view.part2, global: "국제" },
  ].filter((part) => part.items.length > 0);

  if (parts.length === 0) return null;

  return (
    <nav className="hidden border border-line lg:block">
      <h2 className="label border-b border-line px-4 py-2.5">목차</h2>
      <ul className="px-4 py-3.5">
        {parts.map((part) => (
          <li key={part.id} className="mt-3 first:mt-0">
            <a href={`#${part.id}`} className="text-subhead hover:text-muted">
              {part.title}
            </a>
            <div className="tabular mt-1 text-label text-muted">
              {groupsOf(part.items, part.global)
                .map((group) => `${group.label} ${group.items.length}`)
                .join(" · ")}
            </div>
          </li>
        ))}
      </ul>
    </nav>
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
    <main className="mx-auto w-full max-w-page px-5 pt-10 pb-24 sm:px-8">
      <header className="border-b-2 border-fg pb-5">
        <h1 className="text-display tabular">{view.date}</h1>
        <p className="label mt-2">데일리 브리핑</p>
      </header>

      <div className="mt-8 lg:flex lg:items-start lg:gap-12">
        <aside className="space-y-6 lg:sticky lg:top-20 lg:order-2 lg:w-[17rem] lg:shrink-0">
          <Gauges view={view} />
          <Contents view={view} />
        </aside>

        <div className="mt-10 min-w-0 lg:order-1 lg:mt-0 lg:max-w-prose lg:flex-1">
          <Part
            id="part1"
            title="1부. 시장과 경제"
            items={view.part1}
            globalLabel="해외"
          />
          <Part
            id="part2"
            title="2부. 오늘의 세계"
            items={view.part2}
            globalLabel="국제"
          />

          {past.length > 0 ? (
            <section className="mt-20 border-t border-line pt-6">
              <h2 className="label">지난 브리핑</h2>
              <ul className="mt-2">
                {past.map((date) => (
                  <li key={date} className="border-b border-line">
                    <Link
                      href={`/briefing/${date}`}
                      className="tabular block py-3.5 text-small hover:text-muted"
                    >
                      {date}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </div>
    </main>
  );
}
