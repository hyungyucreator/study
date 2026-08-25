"use client";

import { useActionState } from "react";

import { ASSET_CLASSES, type Holding } from "@/lib/assets";

import { updateClassification, type FormState } from "./actions";

/** KIS 동기화 항목용. 덮어써지지 않는 값(분류)만 노출한다. */
export function ClassifyForm({ holding }: { holding: Holding }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    updateClassification,
    {},
  );

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="id" value={holding.id} />

      <label className="block">
        <span className="label">자산군</span>
        <select
          name="asset_class"
          defaultValue={holding.asset_class}
          className="text-subhead mt-1.5 w-full rounded-xs border border-line px-3 py-2.5 font-normal focus:border-fg focus:outline-none"
        >
          {ASSET_CLASSES.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </label>

      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          name="is_etf"
          defaultChecked={holding.is_etf}
          className="size-4 accent-[var(--color-fg)]"
        />
        <span className="text-small text-muted">
          ETF (자산군은 실질 노출 기준으로 고른다. 예: 미국채 ETF는 채권)
        </span>
      </label>

      <div className="flex items-center gap-4 pt-1">
        <button
          type="submit"
          disabled={pending}
          className="text-subhead rounded-xs border border-fg bg-fg px-5 py-2.5 text-bg disabled:opacity-50"
        >
          {pending ? "저장 중" : "저장"}
        </button>
        {state.error ? <p className="text-small">{state.error}</p> : null}
      </div>
    </form>
  );
}
