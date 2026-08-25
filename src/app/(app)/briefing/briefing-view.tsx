import Link from "next/link";

import { assetClassLabel } from "@/lib/assets";
import type { BriefingItem, BriefingView } from "@/lib/briefing/read";
import type { Implication } from "@/lib/briefing/schema";

import { WithTerms } from "./term";

/**
 * 브리핑 화면.
 *
 * 축이 둘이다. 국내와 국제, 경제와 정치·사회.
 * **넓은 화면에서는 국내를 왼쪽, 국제를 오른쪽에 세운다.**
 * 4분면으로 나눠놓고 세로로 일렬로 늘어놓으면 축이 보이지 않는다.
 * 나란히 놓아야 "내 주변"과 "바깥 세상"을 한눈에 비교할 수 있다.
 *
 * 본문은 개조식 불렛이다. 읽는 사람은 훑어본다.
 * 그래서 불렛이 화면에서 가장 큰 본문 크기를 가진다.
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

/** 라벨 + 내용 한 줄. 내용이 한 줄 명사구라 좌측 라벨이 스캔에 유리하다. */
function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-3 flex gap-4">
      <div className="label w-[4.5rem] shrink-0 pt-0.5">{label}</div>
      <div className="min-w-0 flex-1 text-small">{children}</div>
    </div>
  );
}

function Points({
  points,
  cards,
}: {
  points: string[];
  cards: { term: string; summary: string | null }[];
}) {
  return (
    <ul className="mt-3.5 space-y-2">
      {points.map((point) => (
        <li key={point} className="text-body flex gap-2.5 leading-[1.55]">
          <span aria-hidden className="text-faint shrink-0 select-none">
            ·
          </span>
          <span>
            <WithTerms text={point} cards={cards} />
          </span>
        </li>
      ))}
    </ul>
  );
}

function Implications({
  items,
  cards,
}: {
  items: Implication[];
  cards: { term: string; summary: string | null }[];
}) {
  if (items.length === 0) return null;

  return (
    <Row label="자산군">
      <ul className="space-y-2">
        {items.map((implication) => (
          <li key={implication.asset_class}>
            <span className="text-subhead text-ink">
              {assetClassLabel(implication.asset_class)}
            </span>{" "}
            <span
              className={`text-subhead ${directionClass(implication.direction)}`}
            >
              {DIRECTION[implication.direction]}
            </span>
            <p className="text-small text-muted">
              <WithTerms text={implication.note} cards={cards} />
            </p>
          </li>
        ))}
      </ul>
    </Row>
  );
}

function Article({ item, lead }: { item: BriefingItem; lead: boolean }) {
  return (
    <article className="border-b border-line py-7 first:pt-5 last:border-b-0">
      <h4
        className={`font-serif text-ink ${lead ? "text-lead" : "text-heading"}`}
      >
        {item.headline ?? item.points[0]}
      </h4>

      <Points points={item.points} cards={item.cards} />

      <div className="mt-4">
        {item.surprise ? (
          <Row label="예상 대비">
            <WithTerms text={item.surprise} cards={item.cards} />
          </Row>
        ) : null}
        {item.context ? (
          <Row label="맥락">
            <WithTerms text={item.context} cards={item.cards} />
          </Row>
        ) : null}
        {item.outlook ? (
          <Row label="지켜볼 것">
            <WithTerms text={item.outlook} cards={item.cards} />
          </Row>
        ) : null}

        <Implications items={item.implications} cards={item.cards} />

        {item.investmentNote ? (
          <Row label="투자 함의">
            <WithTerms text={item.investmentNote} cards={item.cards} />
          </Row>
        ) : null}

        {item.thread ? (
          <Row label="이슈">
            <Link
              href={`/thread/${item.thread.id}`}
              className="text-small underline decoration-line-strong underline-offset-4 hover:text-ink hover:decoration-ink"
            >
              {item.thread.title}
            </Link>
            {item.thread.entries > 1 ? (
              <span className="tabular label ml-2">
                {item.thread.entries}번째 전개
              </span>
            ) : null}
          </Row>
        ) : null}

        <Row label="출처">
          <a
            href={item.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="text-small text-muted underline decoration-line-strong underline-offset-4 hover:text-ink hover:decoration-ink"
          >
            {item.sourceName ?? "원문"}
          </a>
        </Row>
      </div>
    </article>
  );
}

function Section({
  label,
  items,
}: {
  label: string;
  items: BriefingItem[];
}) {
  if (items.length === 0) return null;

  return (
    <section className="mt-12 first:mt-0">
      {/* 2차 축. 1차 축(국내/국제)보다는 작되 라벨보다는 존재감이 있어야 한다. */}
      <h3 className="text-subhead border-b border-line-strong pb-2 text-muted">
        {label}
      </h3>
      {items.map((item, index) => (
        <Article key={item.sourceUrl} item={item} lead={index === 0} />
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
  const [year, month, day] = view.date.split("-");

  const find = (key: string) =>
    view.sections.find((section) => section.key === key)?.items ?? [];

  const columns = [
    {
      key: "kr",
      label: "국내",
      groups: [
        { label: "경제", items: find("kr_economy") },
        { label: "정치·사회", items: find("kr_politics") },
      ],
    },
    {
      key: "global",
      label: "국제",
      groups: [
        { label: "경제", items: find("global_economy") },
        { label: "정치·사회", items: find("global_politics") },
      ],
    },
  ].filter((column) => column.groups.some((group) => group.items.length > 0));

  return (
    <main className="mx-auto w-full max-w-page px-5 pt-12 pb-24 sm:px-8">
      <header className="border-b-2 border-ink pb-6">
        <p className="label">데일리 브리핑</p>
        <h1 className="font-serif text-display mt-2">
          {year}년 {Number(month)}월 {Number(day)}일
        </h1>
      </header>

      {view.threads.length > 0 ? (
        <section className="mt-8 border-b border-line pb-6">
          <h2 className="label">오늘 이어진 이슈</h2>
          <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
            {view.threads.slice(0, 6).map((thread) => (
              <li key={thread.id}>
                <Link
                  href={`/thread/${thread.id}`}
                  className="text-subhead text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink"
                >
                  {thread.title}
                </Link>
                <span className="tabular label ml-1.5">{thread.entries}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* 두 열이 곧 축이다. 좁은 화면에서는 국내 다음 국제로 이어진다. */}
      <div className="mt-10 grid gap-x-16 gap-y-16 lg:grid-cols-2">
        {columns.map((column) => (
          <div
            key={column.key}
            className="min-w-0 lg:last:border-l lg:last:border-line lg:last:pl-16"
          >
            <h2 className="font-serif text-title border-b-2 border-ink pb-2.5">
              {column.label}
            </h2>
            <div className="mt-6">
              {column.groups.map((group) => (
                <Section
                  key={group.label}
                  label={group.label}
                  items={group.items}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {past.length > 0 ? (
        <section className="mt-24 border-t border-line-strong pt-6">
          <h2 className="label">지난 브리핑</h2>
          <ul className="mt-2 lg:columns-2 lg:gap-x-16">
            {past.map((date) => (
              <li key={date} className="border-b border-line">
                <Link
                  href={`/briefing/${date}`}
                  className="tabular block py-3 text-small hover:text-ink"
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
