"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { isAssetClass, isCurrency } from "@/lib/assets";
import { rememberClassification } from "@/lib/kis/classify";
import { canSyncKis } from "@/lib/kis/env";
import { syncKisHoldings } from "@/lib/kis/sync";
import { createClient } from "@/lib/supabase/server";

export type FormState = { error?: string };

type ParsedHolding = {
  symbol: string;
  name: string;
  asset_class: string;
  is_etf: boolean;
  qty: number;
  avg_price: number;
  currency: string;
};

function parseNumber(raw: FormDataEntryValue | null) {
  if (raw === null) return Number.NaN;
  // 사용자가 1,000 처럼 입력해도 받는다.
  const cleaned = String(raw).replace(/,/g, "").trim();
  if (cleaned === "") return Number.NaN;
  return Number(cleaned);
}

function parse(formData: FormData): ParsedHolding | string {
  const symbol = String(formData.get("symbol") ?? "")
    .trim()
    .toUpperCase();
  const name = String(formData.get("name") ?? "").trim();
  const assetClass = String(formData.get("asset_class") ?? "");
  const currency = String(formData.get("currency") ?? "");
  const qty = parseNumber(formData.get("qty"));
  const isCash = assetClass === "cash";
  // 현금은 평단 개념이 없다. 비워두면 1로 저장해 금액 = 수량이 되게 한다.
  const rawAvgPrice = formData.get("avg_price");
  const avgPrice =
    isCash && String(rawAvgPrice ?? "").trim() === ""
      ? 1
      : parseNumber(rawAvgPrice);

  if (!symbol) return "종목코드를 입력할 것.";
  if (!name) return "종목명을 입력할 것.";
  if (!isAssetClass(assetClass)) return "자산군을 선택할 것.";
  if (!isCurrency(currency)) return "통화를 선택할 것.";
  if (!Number.isFinite(qty) || qty <= 0) return "수량은 0보다 커야 한다.";
  if (!Number.isFinite(avgPrice) || avgPrice < 0)
    return "평단은 0 이상이어야 한다.";

  return {
    symbol,
    name,
    asset_class: assetClass,
    is_etf: formData.get("is_etf") === "on",
    qty,
    avg_price: avgPrice,
    currency,
  };
}

export async function createHolding(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요하다." };

  const parsed = parse(formData);
  if (typeof parsed === "string") return { error: parsed };

  // RLS가 있어도 user_id는 서버에서 채운다. 클라이언트 입력을 신뢰하지 않는다.
  const { error } = await supabase
    .from("holdings")
    .insert({ ...parsed, user_id: user.id, source: "manual" });

  if (error) {
    if (error.code === "23505") {
      return { error: "이미 등록된 종목코드다. 기존 항목을 수정할 것." };
    }
    return { error: `저장 실패: ${error.message}` };
  }

  await rememberClassification({
    symbol: parsed.symbol,
    name: parsed.name,
    assetClass: parsed.asset_class as never,
    isEtf: parsed.is_etf,
  });

  revalidatePath("/holdings");
  return {};
}

export async function updateHolding(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "대상을 찾을 수 없다." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요하다." };

  const parsed = parse(formData);
  if (typeof parsed === "string") return { error: parsed };

  const { error } = await supabase
    .from("holdings")
    .update({ ...parsed, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    if (error.code === "23505") {
      return { error: "이미 등록된 종목코드다." };
    }
    return { error: `저장 실패: ${error.message}` };
  }

  // 사용자가 고친 분류를 사실 테이블에 남긴다. 다음 동기화부터 이 값이 쓰인다.
  await rememberClassification({
    symbol: parsed.symbol,
    name: parsed.name,
    assetClass: parsed.asset_class as never,
    isEtf: parsed.is_etf,
  });

  revalidatePath("/holdings");
  redirect("/holdings");
}

export async function deleteHolding(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.from("holdings").delete().eq("id", id).eq("user_id", user.id);

  revalidatePath("/holdings");
  redirect("/holdings");
}

export type SyncState = { message?: string; error?: string };

/** KIS 잔고조회로 holdings를 동기화한다. 읽기 전용 API만 호출한다. */
export async function syncFromKis(
  _prev: SyncState,
  _formData: FormData,
): Promise<SyncState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요하다." };

  if (!canSyncKis(user.email)) {
    return { error: "이 계정에는 연결된 KIS 계좌가 없다." };
  }

  try {
    const { synced, removed } = await syncKisHoldings(supabase, user.id);
    revalidatePath("/holdings");
    return {
      message:
        removed > 0
          ? `${synced}건 반영, ${removed}건 정리.`
          : `${synced}건 반영.`,
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "동기화에 실패했다.",
    };
  }
}
