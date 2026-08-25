import Link from "next/link";

import { assetClassLabel } from "@/lib/assets";
import type { BriefingItem, BriefingView } from "@/lib/briefing/read";
import type { Implication } from "@/lib/briefing/schema";

/**
 * 브리핑 화면.
 *
 * 이 화면은 계기판이 아니라 출판물이다. 제목은 명조, 본문은 고딕으로 나눈다.
 * 각 부의 첫 기사를 크게 두어 편집의 흔적을 남긴다. 다 똑같은 크기로 늘어놓으면
 * 무엇이 중요한지 화면이 말해주지 않는다.
 *
 * 색은 방향에만 쓴다. 적이 상방, 청이 하방이다 (DESIGN.md §2).
 */

const DIRECTION: Record<Implication["direction"], string> = {
  up: "상방",
  down: "하방",
  unclear: "불확실",
};

function directionClass(direction: Implication["direction"]) {
  if (direction === "up") return "text-gain";
  if (direction === "down") return "text-loss";
  return "";
}

/** 내가 가진 자산군의 비중. 브리핑을 내 것으로 만드는 연결고리다. */
export type MyWeights = Record<string, number>;

function Gauges({ view }: { view: BriefingView }) {
  if (view.gauges.length === 0) {
    return <p className="text-small text-muted">지표를 수집하지 못했다.</p>;
  }

  return (
    <div className="border border-line bg-surface">
      <h2 className="label border-b border-line px-4 py-2.5">시장 상황</h2>

      {/*
        선 색을 반드시 함께 쓴다. Tailwind v4의 기본 border 색은 currentColor라
        border-line을 빼면 본문색으로 그려진다.
      */}
      <dl className="grid grid-cols-2 lg:grid-cols-1">
        {view.gauges.map((gauge, index) => (
          <div
            key={gauge.key}
            className={[
              "border-line px-4 py-3.5",
              index % 2 === 0 ? "border-r lg:border-r-0" : "",
              index > 1 ? "border-t" : "",
              "lg:border-t lg:first:border-t-0",
            ].join(" ")}
          >
            <dt className="label">{gauge.label}</dt>
            <dd className="tabular mt-1 flex items-baseline gap-2">
              <span className="text-heading text-ink">{gauge.display}</span>
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
              <dd className="label mt-1.5 normal-case">{gauge.note}</dd>
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

/** 라벨은 위에, 내용은 아래. 좁은 화면에서 좌측 라벨 열은 폭만 잡아먹는다. */
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
      <p className="mt-1.5 text-small text-muted">{children}</p>
    </div>
  );
}

function Implications({
  items,
  myWeights,
}: {
  items: Implication[];
  myWeights: MyWeights;
}) {
  if (items.length === 0) return null;

  return (
    <div className="mt-6">
      <h5 className="label">자산군 함의</h5>
      <ul className="mt-2.5 space-y-3.5">
        {items.map((implication) => {
          const weight = myWeights[implication.asset_class];
          return (
            <li
              key={implication.asset_class}
              className="border-l-2 border-line-strong pl-3.5"
            >
              <div className="flex flex-wrap items-baseline gap-x-2.5">
                <span className="text-subhead text-ink">
                  {assetClassLabel(implication.asset_class)}
                </span>
                <span
                  className={`text-subhead ${directionClass(implication.direction)}`}
                >
                  {DIRECTION[implication.direction]}
                </span>
                {/* 내가 가진 자산군이면 비중을 붙인다. 남 얘기와 내 얘기를 가른다. */}
                {weight !== undefined ? (
                  <span className="tabular label border border-line px-1.5 py-0.5">
                    내 비중 {(weight * 100).toFixed(1)}%
                  </span>
                ) : null}
              </div>
              <p className="mt-1 text-small text-muted">{implication.note}</p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Article({
  item,
  index,
  lead,
  myWeights,
}: {
  item: BriefingItem;
  index: number;
  lead: boolean;
  myWeights: MyWeights;
}) {
  return (
    <article
      className={
        lead
          ? "border-b border-line-strong pt-6 pb-10"
          : "border-b border-line py-8 last:border-b-0"
      }
    >
      <h4
        className={`font-serif text-ink ${lead ? "text-lead" : "text-heading"}`}
      >
        {!lead ? (
          <span className="tabular font-sans text-faint mr-2.5 text-small">
            {index}
          </span>
        ) : null}
        {item.headline ?? item.fact.slice(0, 30)}
      </h4>

      <p className={`text-body mt-3.5 ${lead ? "text-ink" : ""}`}>
        {item.fact}
      </p>

      {/* 톱기사는 라벨을 걷어낸다. 신문은 문단에 이름표를 붙이지 않는다. */}
      {lead ? (
        <>
          {item.surprise ? (
            <p className="mt-4 text-small text-muted">{item.surprise}</p>
          ) : null}
          {item.context ? (
            <p className="mt-3 text-small text-muted">{item.context}</p>
          ) : null}
          {item.outlook ? (
            <Block label="지켜볼 것">{item.outlook}</Block>
          ) : null}
        </>
      ) : (
        <>
          {item.surprise ? (
            <Block label="서프라이즈">{item.surprise}</Block>
          ) : null}
          {item.context ? <Block label="맥락">{item.context}</Block> : null}
          {item.outlook ? <Block label="지켜볼 것">{item.outlook}</Block> : null}
        </>
      )}

      <Implications items={item.implications} myWeights={myWeights} />

      {item.investmentNote ? (
        <Block label="투자 함의">{item.investmentNote}</Block>
      ) : null}

      <a
        href={item.sourceUrl}
        target="_blank"
        rel="noreferrer"
        className="label mt-6 inline-block underline decoration-line-strong underline-offset-4 hover:text-ink hover:decoration-ink"
      >
        {item.sourceName ?? "원문"}
      </a>
    </article>
  );
}

type Group = {
  key: string;
  label: string;
  items: BriefingItem[];
  offset: number;
};

function groupsOf(items: BriefingItem[], globalLabel: string): Group[] {
  const kr = items.filter((item) => item.region === "kr");
  const global = items.filter((item) => item.region === "global");
  return [
    { key: "kr", label: "국내", items: kr, offset: 1 },
    { key: "global", label: globalLabel, items: global, offset: kr.length + 1 },
  ].filter((group) => group.items.length > 0);
}

function Part({
  id,
  title,
  items,
  globalLabel,
  myWeights,
}: {
  id: string;
  title: string;
  items: BriefingItem[];
  globalLabel: string;
  myWeights: MyWeights;
}) {
  if (items.length === 0) return null;

  const groups = groupsOf(items, globalLabel);

  return (
    <section id={id} className="mt-20 scroll-mt-20 first:mt-0">
      <h2 className="font-serif text-title border-b-2 border-ink pb-3">
        {title}
      </h2>

      {groups.map((group) => (
        <div key={group.key} className="mt-9">
          <h3 className="label border-b border-line pb-2">{group.label}</h3>
          {group.items.map((item, index) => (
            <Article
              key={item.sourceUrl}
              item={item}
              index={group.offset + index}
              // 각 부의 맨 첫 기사만 톱기사로 크게 다룬다.
              lead={group.offset === 1 && index === 0}
              myWeights={myWeights}
            />
          ))}
        </div>
      ))}
    </section>
  );
}

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
          <li key={part.id} className="mt-3.5 first:mt-0">
            <a
              href={`#${part.id}`}
              className="text-subhead text-ink hover:text-muted"
            >
              {part.title}
            </a>
            <div className="tabular label mt-1">
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
  myWeights = {},
}: {
  view: BriefingView;
  archive: string[];
  myWeights?: MyWeights;
}) {
  const past = archive.filter((date) => date !== view.date);
  const [year, month, day] = view.date.split("-");
  const total = view.part1.length + view.part2.length;
  // 기사당 1분 안팎. 고정값 "10분"을 박아두면 기사 수와 무관해져 거짓말이 된다.
  const minutes = Math.max(3, Math.round(total * 1.1));

  return (
    <main className="mx-auto w-full max-w-page px-5 pt-12 pb-24 sm:px-8">
      <header className="border-b-2 border-ink pb-6">
        <p className="label">데일리 브리핑</p>
        <h1 className="font-serif text-display mt-2.5">
          {year}년 {Number(month)}월 {Number(day)}일
        </h1>
        <p className="label mt-3">
          기사 {total}건 · 읽는 시간 약 {minutes}분
        </p>
      </header>

      <div className="mt-10 lg:flex lg:items-start lg:gap-14">
        <aside className="space-y-6 lg:sticky lg:top-20 lg:order-2 lg:w-[17rem] lg:shrink-0">
          <Gauges view={view} />
          <Contents view={view} />
        </aside>

        <div className="mt-12 min-w-0 lg:order-1 lg:mt-0 lg:max-w-prose lg:flex-1">
          <Part
            id="part1"
            title="1부. 시장과 경제"
            items={view.part1}
            globalLabel="해외"
            myWeights={myWeights}
          />
          <Part
            id="part2"
            title="2부. 오늘의 세계"
            items={view.part2}
            globalLabel="국제"
            myWeights={myWeights}
          />

          {past.length > 0 ? (
            <section className="mt-24 border-t border-line-strong pt-6">
              <h2 className="label">지난 브리핑</h2>
              <ul className="mt-2">
                {past.map((date) => (
                  <li key={date} className="border-b border-line">
                    <Link
                      href={`/briefing/${date}`}
                      className="tabular block py-3.5 text-small hover:text-ink"
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
