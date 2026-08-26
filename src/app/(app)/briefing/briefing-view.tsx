"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

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
 * 톱과 리드는 펼쳐진 채 둔다. 중요한 것은 클릭 없이 읽혀야 한다.
 * **단신은 헤드라인 한 줄로 접는다.** 접힌 헤드라인이 곧 목차라서
 * 브리핑 전체가 두 화면 안에 들어오고, 훑고 → 고르고 → 확인하는 흐름이 된다.
 *
 * 읽음 체크는 localStorage다 (날짜가 바뀌면 리셋). 하루짜리 상태라
 * 기기 간 동기화가 필요 없고, 필요해지면 그때 DB로 올린다.
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

/** 읽음 상태 저장. 실패해도 조용히 넘어간다. 편의 기능이 화면을 깨면 안 된다. */
const READ_KEY = "briefing-read";

function loadRead(date: string): Set<string> {
  try {
    const raw = localStorage.getItem(READ_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as { date?: string; urls?: string[] };
    if (parsed.date !== date || !Array.isArray(parsed.urls)) return new Set();
    return new Set(parsed.urls);
  } catch {
    return new Set();
  }
}

function persistRead(date: string, urls: Set<string>) {
  try {
    localStorage.setItem(READ_KEY, JSON.stringify({ date, urls: [...urls] }));
  } catch {
    // 무시.
  }
}

/** 읽음 체크 원. 채워지면 읽은 것이다. */
function ReadDot({
  read,
  onToggle,
}: {
  read: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={read ? "읽음 해제" : "읽음으로 표시"}
      aria-pressed={read}
      onClick={onToggle}
      className={`mt-1 h-3.5 w-3.5 shrink-0 rounded-full border transition-colors ${
        read
          ? "border-ink bg-ink"
          : "border-line-strong bg-transparent hover:border-ink"
      }`}
    />
  );
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
  markFirst = false,
}: {
  points: string[];
  cards: { term: string; summary: string | null }[];
  /** 첫 불렛에 형광펜. 오늘의 톱에서만 쓴다. 화면에 형광펜은 한 곳뿐이다. */
  markFirst?: boolean;
}) {
  return (
    <ul className="mt-3.5 space-y-2">
      {points.map((point, index) => (
        <li key={point} className="text-body flex gap-2.5 leading-[1.55]">
          <span aria-hidden className="text-faint shrink-0 select-none">
            ·
          </span>
          <span
            className={
              markFirst && index === 0
                ? "bg-mark box-decoration-clone px-1"
                : undefined
            }
          >
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

type ReadControl = {
  isRead: (url: string) => boolean;
  toggleRead: (url: string) => void;
};

/**
 * 오늘의 톱. 하루 한 건, 두 열 위에 전면으로 세운다.
 * 초점이 하나 생겨야 나머지의 단조로움이 리듬이 된다.
 * 숫자는 이 화면에서 색을 쓸 수 있는 유일한 자리다. 크게 쓴다.
 */
function TopStory({ item, control }: { item: BriefingItem; control: ReadControl }) {
  const stat = item.stat;
  const surprise = informativeSurprise(item.surprise);

  return (
    <section className="border-b-2 border-ink py-9 lg:py-11">
      <div className="lg:flex lg:items-start lg:justify-between lg:gap-16">
        <div className="min-w-0 max-w-prose">
          <p className="label">오늘의 톱 · {sectionLabel(item.section)}</p>
          <div className="mt-3 flex items-start gap-4">
            <h2 className="font-serif text-title lg:text-display min-w-0 leading-[1.25] break-keep text-ink">
              {item.headline ?? item.points[0]}
            </h2>
            <span className="pt-2 lg:pt-4">
              <ReadDot
                read={control.isRead(item.sourceUrl)}
                onToggle={() => control.toggleRead(item.sourceUrl)}
              />
            </span>
          </div>

          <Points points={item.points} cards={item.cards} markFirst />

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
 * 각 부의 리드. 항상 펼쳐져 있고 전체 필드를 싣는다.
 * 읽으면 헤드라인이 가라앉는다. 지운 것이 아니라 지나온 것이다.
 */
function LeadArticle({
  item,
  control,
}: {
  item: BriefingItem;
  control: ReadControl;
}) {
  const surprise = informativeSurprise(item.surprise);
  const read = control.isRead(item.sourceUrl);

  return (
    <article className="border-b border-line py-7 first:pt-5">
      <div className="flex items-start gap-3">
        <h4
          className={`font-serif text-lead min-w-0 flex-1 break-keep ${
            read ? "text-muted" : "text-ink"
          }`}
        >
          {item.headline ?? item.points[0]}
        </h4>
        <ReadDot
          read={read}
          onToggle={() => control.toggleRead(item.sourceUrl)}
        />
      </div>

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

/**
 * 단신. 접혀 있으면 헤드라인이 곧 목차다.
 * 펼치는 행위가 곧 읽음이다. 따로 체크할 필요가 없다.
 */
function BriefArticle({
  item,
  open,
  onToggleOpen,
  control,
}: {
  item: BriefingItem;
  open: boolean;
  onToggleOpen: () => void;
  control: ReadControl;
}) {
  const surprise = informativeSurprise(item.surprise);
  const read = control.isRead(item.sourceUrl);

  return (
    <article className="border-b border-line last:border-b-0">
      <div className="flex items-start gap-3 py-3.5">
        <button
          type="button"
          aria-expanded={open}
          onClick={onToggleOpen}
          className="min-w-0 flex-1 text-left"
        >
          <span
            className={`font-serif text-body font-semibold break-keep ${
              read ? "text-muted" : "text-ink"
            }`}
          >
            {item.headline ?? item.points[0]}
          </span>
        </button>
        <ReadDot
          read={read}
          onToggle={() => control.toggleRead(item.sourceUrl)}
        />
      </div>

      {open ? (
        <div className="pb-5">
          <Points points={item.points} cards={item.cards} />
          {surprise ? (
            <p className="mt-3 text-small text-muted">
              <span className="label mr-2">예상 대비</span>
              <WithTerms text={surprise} cards={item.cards} />
            </p>
          ) : null}
          <Meta item={item} />
        </div>
      ) : null}
    </article>
  );
}

function Section({
  label,
  items,
  openSet,
  onToggleOpen,
  control,
}: {
  label: string;
  items: BriefingItem[];
  openSet: Set<string>;
  onToggleOpen: (url: string) => void;
  control: ReadControl;
}) {
  if (items.length === 0) return null;
  const readCount = items.filter((item) =>
    control.isRead(item.sourceUrl),
  ).length;

  return (
    <section className="mt-12 first:mt-0">
      {/* 2차 축. 1차 축(국내/국제)보다는 작되 라벨보다는 존재감이 있어야 한다. */}
      <div className="flex items-baseline justify-between border-b border-line-strong pb-2">
        <h3 className="text-subhead text-muted">{label}</h3>
        <span className="tabular label">
          {readCount}/{items.length}
        </span>
      </div>
      {items.map((item, index) =>
        index === 0 ? (
          <LeadArticle key={item.sourceUrl} item={item} control={control} />
        ) : (
          <BriefArticle
            key={item.sourceUrl}
            item={item}
            open={openSet.has(item.sourceUrl)}
            onToggleOpen={() => onToggleOpen(item.sourceUrl)}
            control={control}
          />
        ),
      )}
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

  // 읽음 상태. 서버 렌더와 첫 클라이언트 렌더가 같아야 하므로(hydration)
  // localStorage 복원은 마운트 후 한 번만 한다. 이 경우의 setState는 의도된 것이다.
  const [read, setRead] = useState<Set<string>>(new Set());
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRead(loadRead(view.date));
  }, [view.date]);

  const [openSet, setOpenSet] = useState<Set<string>>(new Set());

  const markRead = (url: string, value?: boolean) => {
    setRead((prev) => {
      const next = new Set(prev);
      const on = value ?? !next.has(url);
      if (on) next.add(url);
      else next.delete(url);
      persistRead(view.date, next);
      return next;
    });
  };

  const toggleOpen = (url: string) => {
    const opening = !openSet.has(url);
    setOpenSet((prev) => {
      const next = new Set(prev);
      if (opening) next.add(url);
      else next.delete(url);
      return next;
    });
    // 펼쳐 봤으면 읽은 것이다.
    if (opening) markRead(url, true);
  };

  const control: ReadControl = {
    isRead: (url) => read.has(url),
    toggleRead: (url) => markRead(url),
  };

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

  // 진행 표시와 모두 펼치기의 대상 목록.
  const { allUrls, briefUrls } = useMemo(() => {
    const all: string[] = [];
    const briefs: string[] = [];
    if (view.top) all.push(view.top.sourceUrl);
    for (const column of columns) {
      for (const group of column.groups) {
        group.items.forEach((item, index) => {
          all.push(item.sourceUrl);
          if (index > 0) briefs.push(item.sourceUrl);
        });
      }
    }
    return { allUrls: all, briefUrls: briefs };
    // columns는 view에서 파생된다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  const readCount = allUrls.filter((url) => read.has(url)).length;
  const anyOpen = openSet.size > 0;

  return (
    <main className="mx-auto w-full max-w-page px-5 pt-12 pb-24 sm:px-8">
      <header className="border-b-2 border-ink pb-6">
        <p className="label">데일리 브리핑</p>
        <h1 className="font-serif text-display mt-2">
          {year}년 {Number(month)}월 {Number(day)}일
        </h1>
      </header>

      <PipelineNotice problems={health?.problems ?? []} />

      {view.top ? <TopStory item={view.top} control={control} /> : null}

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

      <div className="mt-10 flex items-baseline justify-between">
        <p className="tabular label">
          읽음 {readCount}/{allUrls.length}
        </p>
        <button
          type="button"
          onClick={() =>
            setOpenSet(anyOpen ? new Set() : new Set(briefUrls))
          }
          className="label underline decoration-line-strong underline-offset-4 hover:text-ink hover:decoration-ink"
        >
          {anyOpen ? "단신 모두 접기" : "단신 모두 펼치기"}
        </button>
      </div>

      {/* 두 열이 곧 축이다. 좁은 화면에서는 국내 다음 국제로 이어진다. */}
      <div className="mt-4 grid gap-x-16 gap-y-16 lg:grid-cols-2">
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
                  openSet={openSet}
                  onToggleOpen={toggleOpen}
                  control={control}
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
