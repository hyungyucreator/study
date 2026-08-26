"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  assetLabel,
  directionClass,
  directionLabel,
  sortOutlook,
  type AssetOutlook,
} from "@/lib/briefing/asset-classes";
import type { BriefingItem, BriefingView } from "@/lib/briefing/read";
import { sectionLabel, SECTIONS } from "@/lib/briefing/schema";
import type { Health } from "@/lib/ops/health";

import { WithTerms } from "./term";

/**
 * 브리핑 화면. 1면과 리더의 이원 체제다.
 *
 * **1면은 훑는 화면이다.** 상세를 싣지 않는 대신 모든 헤드라인이 한 화면에 들어온다.
 * 오늘의 톱만 예외로 전문을 싣는다. 중요한 것은 클릭 없이 읽혀야 한다.
 * 섹션은 2×2 그리드다. 왼쪽 열이 국내, 오른쪽 열이 국제, 윗줄이 경제,
 * 아랫줄이 정치·사회. **두 축이 말 그대로 화면 기하가 된다.**
 *
 * **리더는 정독하는 화면이다.** 불렛·맥락·용어는 전부 여기서만 나온다.
 * 한 장에 한 건, 옆으로 넘긴다. 넘김이 곧 읽음이다.
 *
 * affordance는 하나다. **헤드라인은 어디서든 누르면 그 항목의 카드가 열린다.**
 * 1면 목록, 톱, 자산군 근거까지 전부 같은 동작이다. 죽은 클릭이 없어야 한다.
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

type ReadControl = {
  isRead: (url: string) => boolean;
  toggleRead: (url: string) => void;
};

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
      className={`mt-1.5 h-3.5 w-3.5 shrink-0 rounded-full border transition-colors ${
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

/**
 * 출처 한 줄. 대표 매체와 같은 사건을 보도한 다른 매체, 속한 이슈까지 전부 여기.
 * 항목마다 라벨 행을 반복하면 표처럼 굳는다.
 */
function Meta({ item }: { item: BriefingItem }) {
  return (
    <p className="label mt-5 flex flex-wrap items-baseline gap-x-2 gap-y-1">
      <span className="text-faint">출처</span>
      <a
        href={item.sourceUrl}
        target="_blank"
        rel="noreferrer"
        className="underline decoration-line-strong underline-offset-4 hover:text-ink hover:decoration-ink"
      >
        {item.sourceName ?? "원문"}
      </a>
      {item.related.map((entry) => (
        <a
          key={entry.url}
          href={entry.url}
          target="_blank"
          rel="noreferrer"
          title={entry.title}
          className="underline decoration-line-strong underline-offset-4 hover:text-ink hover:decoration-ink"
        >
          {entry.source}
        </a>
      ))}
      {item.thread ? (
        <>
          <span aria-hidden className="text-faint select-none">
            ·
          </span>
          <span className="text-faint">이슈</span>
          <Link
            href={`/thread/${item.thread.id}`}
            className="underline decoration-line-strong underline-offset-4 hover:text-ink hover:decoration-ink"
          >
            {item.thread.title}
          </Link>
          {item.thread.entries > 1 ? (
            <span className="tabular">{item.thread.entries}번째 전개</span>
          ) : null}
        </>
      ) : null}
    </p>
  );
}

/**
 * 항목의 몸통. 내용(문장체 문단) → 인사이트(개조식 불렛) 순서다.
 * 모든 항목이 같은 골격이라 화면도 같아진다.
 * 옛 브리핑(body 없음)은 불렛 + 라벨 행으로 폴백한다.
 */
function ItemContent({
  item,
  markFirstInsight = false,
}: {
  item: BriefingItem;
  /** 첫 인사이트에 형광펜. 오늘의 톱에서만. 화면에 형광펜은 한 곳뿐이다. */
  markFirstInsight?: boolean;
}) {
  const surprise = informativeSurprise(item.surprise);

  if (item.body.length > 0) {
    return (
      <>
        <div className="mt-4 space-y-3.5">
          {item.body.map((paragraph) => (
            <p key={paragraph} className="text-body leading-[1.7]">
              <WithTerms text={paragraph} cards={item.cards} />
            </p>
          ))}
        </div>
        {item.points.length > 0 ? (
          <div className="mt-6">
            <p className="label">인사이트</p>
            <Points
              points={item.points}
              cards={item.cards}
              markFirst={markFirstInsight}
            />
          </div>
        ) : null}
      </>
    );
  }

  return (
    <>
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
    </>
  );
}

/**
 * 오늘의 톱. 하루 한 건, 1면에서 유일하게 전문이 실린다.
 * 초점이 하나 생겨야 나머지의 단조로움이 리듬이 된다.
 * 숫자는 이 화면에서 색을 쓸 수 있는 유일한 자리다. 크게 쓴다.
 */
function TopStory({
  item,
  control,
  onOpen,
}: {
  item: BriefingItem;
  control: ReadControl;
  onOpen: () => void;
}) {
  const stat = item.stat;

  return (
    <section className="border-b-2 border-ink py-9 lg:py-11">
      <div className="lg:flex lg:items-start lg:justify-between lg:gap-16">
        <div className="min-w-0 max-w-prose">
          <div className="flex items-center gap-3">
            <p className="label">오늘의 톱 · {sectionLabel(item.section)}</p>
            <ReadDot
              read={control.isRead(item.sourceUrl)}
              onToggle={() => control.toggleRead(item.sourceUrl)}
            />
          </div>
          <h2 className="mt-3">
            <button
              type="button"
              onClick={onOpen}
              className="font-serif text-title lg:text-display text-left leading-[1.25] break-keep text-ink decoration-line-strong underline-offset-8 hover:underline"
            >
              {item.headline ?? item.points[0]}
            </button>
          </h2>

          <ItemContent item={item} markFirstInsight />

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
 * 1면의 분면 하나. 헤드라인 목록만 싣는다. 상세는 리더의 일이다.
 * 첫 기사만 크게 둔다. 편집이란 무엇을 크게 둘지 정하는 일이다.
 */
function SectionPanel({
  label,
  items,
  control,
  onOpen,
}: {
  label: string;
  items: BriefingItem[];
  control: ReadControl;
  onOpen: (url: string) => void;
}) {
  if (items.length === 0) return null;
  const readCount = items.filter((item) =>
    control.isRead(item.sourceUrl),
  ).length;

  return (
    <section className="bg-surface border border-line px-6 py-5 sm:px-7">
      <div className="flex items-baseline justify-between border-b border-line-strong pb-3">
        <h3 className="font-serif text-heading text-ink">{label}</h3>
        <span className="tabular label">
          {readCount}/{items.length}
        </span>
      </div>
      <ul>
        {items.map((item, index) => {
          const read = control.isRead(item.sourceUrl);
          return (
            <li
              key={item.sourceUrl}
              className="flex items-start gap-3 border-b border-line last:border-b-0"
            >
              <button
                type="button"
                onClick={() => onOpen(item.sourceUrl)}
                className="min-w-0 flex-1 py-3.5 text-left"
              >
                <span
                  className={`font-serif break-keep decoration-line-strong underline-offset-4 hover:underline ${
                    index === 0 ? "text-body font-semibold" : "text-small"
                  } ${read ? "text-muted" : "text-ink"}`}
                >
                  {item.headline ?? item.points[0]}
                </span>
              </button>
              <span className="py-2.5">
                <ReadDot
                  read={read}
                  onToggle={() => control.toggleRead(item.sourceUrl)}
                />
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * 차례로 읽기. 한 장에 한 건, 옆으로 넘긴다.
 *
 * 1면은 훑는 화면이고 이것이 정독하는 화면이다. 순서대로 착착 넘기는 쪽이
 * 스크롤보다 빠르고, 넘김이 곧 읽음이라 진행이 저절로 쌓인다.
 * 스와이프(터치), 방향키, 버튼 전부 받는다.
 * index가 items.length면 완료 카드다. 의식에는 마침표가 있어야 한다.
 */
function Reader({
  items,
  index,
  outlook,
  onPrev,
  onNext,
  onClose,
}: {
  items: BriefingItem[];
  index: number;
  outlook: AssetOutlook[];
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
}) {
  const done = index >= items.length;
  const item = done ? null : items[index];
  const touchX = useRef<number | null>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") onNext();
      else if (event.key === "ArrowLeft") onPrev();
      else if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onNext, onPrev, onClose]);

  // 카드 모드가 열려 있는 동안 뒤 1면이 스크롤되면 안 된다.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="차례로 읽기"
      className="fixed inset-0 z-50 flex flex-col bg-bg"
      onTouchStart={(event) => {
        touchX.current = event.touches[0].clientX;
      }}
      onTouchEnd={(event) => {
        if (touchX.current === null) return;
        const dx = event.changedTouches[0].clientX - touchX.current;
        touchX.current = null;
        if (Math.abs(dx) < 48) return;
        if (dx < 0) onNext();
        else onPrev();
      }}
    >
      <header className="border-b border-line">
        <div className="mx-auto flex w-full max-w-prose items-baseline justify-between gap-4 px-5 py-4 sm:px-8">
          <p className="tabular label">
            {done ? "끝" : `${index + 1} / ${items.length}`}
          </p>
          <p className="label">
            {item ? sectionLabel(item.section) : "오늘의 자산군"}
          </p>
          <button
            type="button"
            onClick={onClose}
            className="label underline decoration-line-strong underline-offset-4 hover:text-ink hover:decoration-ink"
          >
            닫기
          </button>
        </div>
        <div className="h-0.5 w-full bg-line">
          <div
            className="h-full bg-ink transition-all duration-200"
            style={{
              width: `${(Math.min(index + 1, items.length) / items.length) * 100}%`,
            }}
          />
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {item ? (
          <div className="mx-auto w-full max-w-prose px-5 py-10 sm:px-8">
            {item.top ? <p className="label">오늘의 톱</p> : null}
            <h2 className="font-serif text-title lg:text-display mt-2 leading-[1.25] break-keep text-ink">
              {item.headline ?? item.points[0]}
            </h2>

            {item.stat ? (
              <p className="mt-5 flex items-baseline gap-3">
                <span
                  className={`tabular text-display ${statClass(item.stat.direction)}`}
                >
                  {item.stat.value}
                </span>
                <span className="label">{item.stat.label}</span>
              </p>
            ) : null}

            <ItemContent item={item} markFirstInsight={item.top} />

            <Meta item={item} />
          </div>
        ) : (
          <div className="mx-auto w-full max-w-prose px-5 py-10 sm:px-8">
            <p className="label">오늘 브리핑 끝</p>
            <h2 className="font-serif text-title lg:text-display mt-2 break-keep text-ink">
              {items.length}건 다 읽었다
            </h2>

            {outlook.length > 0 ? (
              <div className="mt-8 border-t border-line-strong pt-6">
                <h3 className="label">오늘의 자산군</h3>
                <ul className="mt-4 space-y-4">
                  {sortOutlook(outlook).map((entry) => (
                    <li key={entry.asset_class}>
                      <div className="flex items-baseline gap-2.5">
                        <span className="font-serif text-heading text-ink">
                          {assetLabel(entry.asset_class)}
                        </span>
                        <span
                          className={`text-subhead ${directionClass(entry.direction)}`}
                        >
                          {directionLabel(entry.asset_class, entry.direction)}
                        </span>
                      </div>
                      <p className="text-small mt-1 text-muted">{entry.note}</p>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        )}
      </div>

      <footer className="border-t border-line">
        <div className="mx-auto flex w-full max-w-prose items-baseline justify-between px-5 py-4 sm:px-8">
          <button
            type="button"
            onClick={onPrev}
            disabled={index === 0}
            className="label underline decoration-line-strong underline-offset-4 hover:text-ink hover:decoration-ink disabled:no-underline disabled:opacity-40"
          >
            이전
          </button>
          <button
            type="button"
            onClick={onNext}
            className="text-subhead text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink"
          >
            {done ? "닫기" : index === items.length - 1 ? "마무리" : "다음"}
          </button>
        </div>
      </footer>
    </div>
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

  const control: ReadControl = {
    isRead: (url) => read.has(url),
    toggleRead: (url) => markRead(url),
  };

  // 톱은 전면에 세우고 분면 목록에서는 뺀다. 같은 기사가 두 번 나오면 안 된다.
  const strip = (items: BriefingItem[]) =>
    items.filter((item) => item !== view.top);

  const find = (key: string) =>
    strip(view.sections.find((section) => section.key === key)?.items ?? []);

  // 2×2 분면. SECTIONS 순서(국내경제·국제경제·국내정치·국제정치)가
  // 그리드에서 정확히 왼쪽 열 국내, 오른쪽 열 국제, 윗줄 경제, 아랫줄 정치가 된다.
  const panels = SECTIONS.map((section) => ({
    key: section.key,
    label: section.label,
    items: find(section.key),
  })).filter((panel) => panel.items.length > 0);

  // 읽기 순서 = 1면 순서. 톱 → 국내 경제 → 국제 경제 → 국내 정치 → 국제 정치.
  const readerItems = useMemo(() => {
    const list: BriefingItem[] = view.top ? [view.top] : [];
    for (const panel of panels) list.push(...panel.items);
    return list;
    // panels는 view에서 파생된다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  const [readerIndex, setReaderIndex] = useState<number | null>(null);

  // 카드를 보이는 것이 곧 읽는 것이다. 이동 이벤트에서 함께 처리한다.
  const readerGo = (index: number) => {
    setReaderIndex(index);
    if (index < readerItems.length)
      markRead(readerItems[index].sourceUrl, true);
  };
  const openReader = () => {
    const firstUnread = readerItems.findIndex(
      (item) => !read.has(item.sourceUrl),
    );
    readerGo(firstUnread === -1 ? 0 : firstUnread);
  };
  /** 어느 헤드라인이든 누르면 그 항목의 카드가 열린다. */
  const openAt = (url: string) => {
    const index = readerItems.findIndex((item) => item.sourceUrl === url);
    if (index >= 0) readerGo(index);
  };
  const readerPrev = () => {
    if (readerIndex !== null && readerIndex > 0) readerGo(readerIndex - 1);
  };
  const readerNext = () => {
    if (readerIndex === null) return;
    // 마지막 항목 다음은 완료 카드, 완료 카드 다음은 닫기.
    if (readerIndex >= readerItems.length) setReaderIndex(null);
    else if (readerIndex === readerItems.length - 1)
      setReaderIndex(readerItems.length);
    else readerGo(readerIndex + 1);
  };

  const readCount = readerItems.filter((item) =>
    read.has(item.sourceUrl),
  ).length;
  const total = readerItems.length;

  // 자산군 근거를 그 기사의 헤드라인으로 되돌린다. url만 보여주면 알 수 없다.
  const headlines = new Map(
    view.sections
      .flatMap((section) => section.items)
      .map((item) => [item.sourceUrl, item.headline ?? item.points[0]]),
  );
  const evidenceOf = (url: string) => headlines.get(url) ?? null;

  return (
    <main className="mx-auto w-full max-w-page px-5 pt-12 pb-24 sm:px-8">
      <header className="border-b-2 border-ink pb-6">
        <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-5">
          <div>
            <p className="label">데일리 브리핑</p>
            <h1 className="font-serif text-display mt-2">
              {year}년 {Number(month)}월 {Number(day)}일
            </h1>
          </div>
          <div className="flex items-baseline gap-5 pb-1">
            <p className="tabular label">
              읽음 {readCount}/{total}
            </p>
            <button
              type="button"
              onClick={openReader}
              className="bg-ink text-bg text-subhead px-5 py-2.5 hover:opacity-85"
            >
              {readCount === 0
                ? "오늘 브리핑 읽기"
                : readCount < total
                  ? "이어서 읽기"
                  : "다시 읽기"}
            </button>
          </div>
        </div>
      </header>

      <PipelineNotice problems={health?.problems ?? []} />

      {view.top ? (
        <TopStory
          item={view.top}
          control={control}
          onOpen={() => openAt(view.top!.sourceUrl)}
        />
      ) : null}

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

      {/* 2×2 분면. 두 축(국내|국제, 경제|정치·사회)이 화면 기하다. */}
      <div className="mt-10 grid gap-5 lg:grid-cols-2 lg:gap-6">
        {panels.map((panel) => (
          <SectionPanel
            key={panel.key}
            label={panel.label}
            items={panel.items}
            control={control}
            onOpen={openAt}
          />
        ))}
      </div>

      {view.outlook.length > 0 ? (
        <section className="mt-16 border-t-2 border-ink pt-6">
          <h2 className="font-serif text-title">오늘의 자산군</h2>

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
                        <li key={url}>
                          <button
                            type="button"
                            onClick={() => openAt(url)}
                            className="label text-left underline decoration-line-strong underline-offset-4 hover:text-ink hover:decoration-ink"
                          >
                            {source}
                          </button>
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

      {readerIndex !== null ? (
        <Reader
          items={readerItems}
          index={readerIndex}
          outlook={view.outlook}
          onPrev={readerPrev}
          onNext={readerNext}
          onClose={() => setReaderIndex(null)}
        />
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
