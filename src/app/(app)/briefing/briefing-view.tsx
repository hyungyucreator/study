import Link from "next/link";

import {
  assetLabel,
  directionClass,
  directionLabel,
  sortOutlook,
} from "@/lib/briefing/asset-classes";
import type { BriefingItem, BriefingView } from "@/lib/briefing/read";
import { sectionLabel } from "@/lib/briefing/schema";
import type { Health } from "@/lib/ops/health";

import { WithTerms } from "./term";

/**
 * 브리핑 화면.
 *
 * 축이 둘이다. 국내와 국제, 경제와 정치·사회.
 * **넓은 화면에서는 국내를 왼쪽, 국제를 오른쪽에 세운다.**
 *
 * 위계는 세 단이다. **오늘의 톱 1건 → 각 부의 리드 → 단신.**
 * 20건이 전부 같은 무게면 편집이 없는 것이다. 무엇이 중요한지는
 * 색이나 배지가 아니라 크기와 밀도가 말한다.
 *
 * 색은 방향에만 쓴다. 적이 상방, 청이 하방이다 (DESIGN.md §2).
 */

/** 톱 숫자의 방향색. 보합·수준 자체가 뉴스면 무채색. */
function statClass(direction: "up" | "down" | "flat") {
  if (direction === "up") return "text-gain";
  if (direction === "down") return "text-loss";
  return "text-ink";
}

/** "시장 예상치 확인 불가"는 정보가 아니다. 저장은 하되 싣지 않는다. */
function informativeSurprise(surprise: string | null): string | null {
  if (!surprise || surprise.includes("확인 불가")) return null;
  return surprise;
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

/** 이슈와 출처를 한 줄로. 항목마다 라벨 행을 반복하면 표처럼 굳는다. */
function Meta({ item }: { item: BriefingItem }) {
  return (
    <p className="label mt-4 flex flex-wrap items-baseline gap-x-2 gap-y-1">
      {item.thread ? (
        <>
          <Link
            href={`/thread/${item.thread.id}`}
            className="underline decoration-line-strong underline-offset-4 hover:text-ink hover:decoration-ink"
          >
            {item.thread.title}
          </Link>
          {item.thread.entries > 1 ? (
            <span className="tabular">{item.thread.entries}번째 전개</span>
          ) : null}
          <span aria-hidden className="text-faint select-none">
            ·
          </span>
        </>
      ) : null}
      <a
        href={item.sourceUrl}
        target="_blank"
        rel="noreferrer"
        className="underline decoration-line-strong underline-offset-4 hover:text-ink hover:decoration-ink"
      >
        {item.sourceName ?? "원문"}
      </a>
    </p>
  );
}

/**
 * 오늘의 톱. 하루 한 건, 두 열 위에 전면으로 세운다.
 * 초점이 하나 생겨야 나머지의 단조로움이 리듬이 된다.
 * 숫자는 이 화면에서 색을 쓸 수 있는 유일한 자리다. 크게 쓴다.
 */
function TopStory({ item }: { item: BriefingItem }) {
  const stat = item.stat;
  const surprise = informativeSurprise(item.surprise);

  return (
    <section className="border-b-2 border-ink py-9 lg:py-11">
      <div className="lg:flex lg:items-start lg:justify-between lg:gap-16">
        <div className="min-w-0 max-w-prose">
          <p className="label">오늘의 톱 · {sectionLabel(item.section)}</p>
          <h2 className="font-serif text-title lg:text-display mt-3 leading-[1.25] break-keep text-ink">
            {item.headline ?? item.points[0]}
          </h2>

          <Points points={item.points} cards={item.cards} />

          <div className="mt-4">
            {surprise ? (
              <Row label="예상 대비">
                <WithTerms text={surprise} cards={item.cards} />
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
          </div>

          <Meta item={item} />
        </div>

        {stat ? (
          <div className="mt-8 shrink-0 border-t border-line pt-5 lg:mt-1.5 lg:w-56 lg:border-t-0 lg:border-l lg:border-line lg:pt-1 lg:pl-10">
            <p className="label">{stat.label}</p>
            <p
              className={`tabular text-display mt-1.5 ${statClass(stat.direction)}`}
            >
              {stat.value}
            </p>
          </div>
        ) : null}
      </div>
    </section>
  );
}

/**
 * 기사 하나. 리드는 전체를, 단신은 헤드라인과 불렛만 싣는다.
 * 맥락·지켜볼 것은 리드에만 준다. 모든 항목이 모든 필드를 가지면
 * 화면이 표가 되고, 표는 훑을 수는 있어도 읽히지는 않는다.
 */
function Article({ item, lead }: { item: BriefingItem; lead: boolean }) {
  const surprise = informativeSurprise(item.surprise);

  if (!lead) {
    return (
      <article className="border-b border-line py-5 last:border-b-0">
        <h4 className="font-serif text-body font-semibold break-keep text-ink">
          {item.headline ?? item.points[0]}
        </h4>
        <Points points={item.points} cards={item.cards} />
        {surprise ? (
          <p className="mt-3 text-small text-muted">
            <span className="label mr-2">예상 대비</span>
            <WithTerms text={surprise} cards={item.cards} />
          </p>
        ) : null}
        <Meta item={item} />
      </article>
    );
  }

  return (
    <article className="border-b border-line py-7 first:pt-5 last:border-b-0">
      <h4 className="font-serif text-lead break-keep text-ink">
        {item.headline ?? item.points[0]}
      </h4>

      <Points points={item.points} cards={item.cards} />

      <div className="mt-4">
        {surprise ? (
          <Row label="예상 대비">
            <WithTerms text={surprise} cards={item.cards} />
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
        {item.investmentNote ? (
          <Row label="투자 함의">
            <WithTerms text={item.investmentNote} cards={item.cards} />
          </Row>
        ) : null}
      </div>

      <Meta item={item} />
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

/**
 * 파이프라인이 거른 날을 알린다.
 *
 * 자동화의 실패는 조용하다. 브리핑이 하루 비어도 사용자는 "오늘은 뉴스가 없었나"로
 * 읽는다. 놓친 날은 복구되지 않으므로 화면이 먼저 말해야 한다.
 * 색을 쓰지 않는다. 적/청은 방향이지 경고가 아니다 (DESIGN §2).
 */
function PipelineNotice({ problems }: { problems: Health["problems"] }) {
  if (problems.length === 0) return null;

  return (
    <section className="mt-8 border border-line-strong bg-surface px-5 py-4">
      <h2 className="label">파이프라인</h2>
      <ul className="mt-2 space-y-1">
        {problems.map((problem) => (
          <li key={problem.date} className="tabular text-small">
            {problem.date} · {problem.note}
          </li>
        ))}
      </ul>
      <p className="label mt-2">그날 기사는 다시 받아올 수 없다</p>
    </section>
  );
}

export function BriefingBody({
  view,
  archive,
  health,
}: {
  view: BriefingView;
  archive: string[];
  health?: Health;
}) {
  const past = archive.filter((date) => date !== view.date);
  const [year, month, day] = view.date.split("-");

  // 톱은 전면에 세우고 원래 섹션에서는 뺀다. 같은 기사가 두 번 나오면 안 된다.
  const strip = (items: BriefingItem[]) =>
    items.filter((item) => item !== view.top);

  const find = (key: string) =>
    strip(view.sections.find((section) => section.key === key)?.items ?? []);

  // 자산군 근거를 그 기사의 헤드라인으로 되돌린다. url만 보여주면 알 수 없다.
  const headlines = new Map(
    view.sections
      .flatMap((section) => section.items)
      .map((item) => [item.sourceUrl, item.headline ?? item.points[0]]),
  );
  const evidenceOf = (url: string) => headlines.get(url) ?? null;

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

      <PipelineNotice problems={health?.problems ?? []} />

      {view.top ? <TopStory item={view.top} /> : null}

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

      {view.outlook.length > 0 ? (
        <section className="mt-20 border-t-2 border-ink pt-6">
          <h2 className="font-serif text-title">오늘의 자산군</h2>
          <p className="label mt-2">
            브리핑 전체를 놓고 본 방향. 오늘 뉴스로 말할 수 있는 것만 싣는다
          </p>

          <div className="mt-6 grid gap-x-16 gap-y-7 lg:grid-cols-2">
            {sortOutlook(view.outlook).map((item) => (
              <div
                key={item.asset_class}
                className="border-l-2 border-line-strong pl-4"
              >
                <div className="flex items-baseline gap-2.5">
                  <span className="text-heading font-serif text-ink">
                    {assetLabel(item.asset_class)}
                  </span>
                  <span
                    className={`text-subhead ${directionClass(item.direction)}`}
                  >
                    {directionLabel(item.asset_class, item.direction)}
                  </span>
                </div>
                <p className="text-body mt-1.5 leading-[1.6]">{item.note}</p>
                {item.evidence.length > 0 ? (
                  <ul className="mt-2.5 space-y-1">
                    {item.evidence.map((url) => {
                      const source = evidenceOf(url);
                      if (!source) return null;
                      return (
                        <li key={url} className="label">
                          {source}
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

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
