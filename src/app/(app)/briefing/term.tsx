"use client";

import { useState, useTransition } from "react";

import { saveTerm } from "./actions";

/**
 * 본문 속 용어.
 *
 * 점선 밑줄만 그어두고 hover나 탭에서 설명을 연다.
 * 색을 쓰지 않는다. 이 제품에서 색은 방향을 뜻한다 (DESIGN.md §2).
 */
export function Term({
  term,
  summary,
}: {
  term: string;
  summary: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  if (!summary) return <>{term}</>;

  const save = () => {
    startTransition(async () => {
      const ok = await saveTerm(term);
      if (ok) setSaved(true);
    });
  };

  return (
    <span
      className="relative inline-block"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="underline decoration-dotted decoration-from-font underline-offset-4 hover:decoration-solid"
      >
        {term}
      </button>

      {open ? (
        <span
          role="tooltip"
          // 오른쪽 끝 단어에서 화면 밖으로 나가지 않게 뷰포트 폭으로 잘라둔다.
          className="absolute top-full left-0 z-20 mt-2 block w-[min(20rem,calc(100vw-3rem))] border border-ink bg-bg p-4"
        >
          <span className="text-subhead text-ink block">{term}</span>
          <span className="text-small mt-1.5 block text-muted">{summary}</span>
          <button
            type="button"
            onClick={save}
            disabled={pending || saved}
            className="label mt-3 block underline decoration-line-strong underline-offset-4 hover:text-ink hover:decoration-ink disabled:no-underline"
          >
            {saved ? "단어장에 저장됨" : pending ? "저장 중" : "단어장에 저장"}
          </button>
        </span>
      ) : null}
    </span>
  );
}

export type Piece = string | { term: string; summary: string | null };

/**
 * 문장에서 용어를 찾아 조각낸다.
 * 긴 용어를 먼저 찾아야 "국채 바이백"이 "국채"로 잘리지 않는다.
 */
export function splitByTerms(
  text: string,
  cards: { term: string; summary: string | null }[],
): Piece[] {
  if (cards.length === 0) return [text];

  const sorted = [...cards].sort((a, b) => b.term.length - a.term.length);
  let pieces: Piece[] = [text];

  for (const card of sorted) {
    const next: Piece[] = [];
    for (const piece of pieces) {
      if (typeof piece !== "string") {
        next.push(piece);
        continue;
      }
      // 한 문장에 같은 용어가 여러 번 나와도 첫 번째만 표시한다.
      const at = piece.indexOf(card.term);
      if (at === -1) {
        next.push(piece);
        continue;
      }
      if (at > 0) next.push(piece.slice(0, at));
      next.push({ term: card.term, summary: card.summary });
      const rest = piece.slice(at + card.term.length);
      if (rest) next.push(rest);
    }
    pieces = next;
  }

  return pieces;
}

/** 조각을 렌더한다. 용어만 Term으로 감싼다. */
export function WithTerms({
  text,
  cards,
}: {
  text: string;
  cards: { term: string; summary: string | null }[];
}) {
  const pieces = splitByTerms(text, cards);
  if (pieces.length === 1 && typeof pieces[0] === "string") return <>{text}</>;

  return (
    <>
      {pieces.map((piece, index) =>
        typeof piece === "string" ? (
          <span key={index}>{piece}</span>
        ) : (
          <Term key={index} term={piece.term} summary={piece.summary} />
        ),
      )}
    </>
  );
}
