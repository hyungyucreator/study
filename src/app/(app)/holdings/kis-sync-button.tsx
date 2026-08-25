"use client";

import { useActionState } from "react";

import { syncFromKis, type SyncState } from "./actions";

export function KisSyncButton() {
  const [state, formAction, pending] = useActionState<SyncState, FormData>(
    syncFromKis,
    {},
  );

  return (
    <form action={formAction} className="flex items-baseline gap-3">
      <button
        type="submit"
        disabled={pending}
        className="label rounded-xs border border-line px-3.5 py-2 hover:bg-fg hover:text-bg disabled:opacity-50"
      >
        {pending ? "동기화 중" : "KIS 동기화"}
      </button>
      {state.message ? (
        <span className="label">{state.message}</span>
      ) : null}
      {state.error ? <span className="text-small">{state.error}</span> : null}
    </form>
  );
}
