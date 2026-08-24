"use client";

import { useActionState, useState } from "react";

import {
  ASSET_CLASSES,
  CURRENCIES,
  type AssetClass,
  type Holding,
} from "@/lib/assets";

import type { FormState } from "./actions";

type Props = {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  holding?: Holding;
  submitLabel: string;
};

const fieldClass =
  "mt-1 w-full border border-line px-3 py-2 text-[15px] rounded-xs focus:border-fg focus:outline-none";

export function HoldingForm({ action, holding, submitLabel }: Props) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    action,
    {},
  );
  const [assetClass, setAssetClass] = useState<AssetClass>(
    holding?.asset_class ?? "kr_equity",
  );
  const isCash = assetClass === "cash";

  return (
    <form action={formAction} className="space-y-5">
      {holding ? <input type="hidden" name="id" value={holding.id} /> : null}

      <div className="grid grid-cols-2 gap-4">
        <label className="block">
          <span className="text-sm text-muted">자산군</span>
          <select
            name="asset_class"
            value={assetClass}
            onChange={(event) =>
              setAssetClass(event.target.value as AssetClass)
            }
            className={fieldClass}
          >
            {ASSET_CLASSES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-sm text-muted">통화</span>
          <select
            name="currency"
            defaultValue={holding?.currency ?? "KRW"}
            className={fieldClass}
          >
            {CURRENCIES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <label className="block">
          <span className="text-sm text-muted">종목코드</span>
          <input
            name="symbol"
            defaultValue={holding?.symbol}
            placeholder={isCash ? "KRW" : "360750"}
            required
            className={`${fieldClass} tabular uppercase`}
          />
        </label>

        <label className="block">
          <span className="text-sm text-muted">종목명</span>
          <input
            name="name"
            defaultValue={holding?.name}
            placeholder={isCash ? "예수금" : "TIGER 미국S&P500"}
            required
            className={fieldClass}
          />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <label className="block">
          <span className="text-sm text-muted">{isCash ? "금액" : "수량"}</span>
          <input
            name="qty"
            inputMode="decimal"
            defaultValue={holding ? String(holding.qty) : ""}
            required
            className={`${fieldClass} tabular`}
          />
        </label>

        <label className="block">
          <span className="text-sm text-muted">
            평균단가{isCash ? " (현금은 비워둘 것)" : ""}
          </span>
          <input
            name="avg_price"
            inputMode="decimal"
            defaultValue={holding ? String(holding.avg_price) : ""}
            required={!isCash}
            disabled={isCash}
            className={`${fieldClass} tabular disabled:bg-line/40`}
          />
        </label>
      </div>

      <div className="flex items-center gap-4 pt-1">
        <button
          type="submit"
          disabled={pending}
          className="rounded-xs border border-fg bg-fg px-4 py-2 text-[15px] font-medium text-bg disabled:opacity-50"
        >
          {pending ? "저장 중" : submitLabel}
        </button>
        {/* 적색은 이 제품에서 '수익'을 뜻한다. 에러 표시에는 색을 쓰지 않는다. */}
        {state.error ? <p className="text-sm">{state.error}</p> : null}
      </div>
    </form>
  );
}
