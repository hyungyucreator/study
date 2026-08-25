"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

/**
 * 용어를 단어장에 담는다.
 *
 * RLS가 있어도 user_id는 서버에서 채운다. 서버 액션은 UI를 거치지 않고
 * 직접 호출될 수 있어 클라이언트 입력을 신뢰하지 않는다
 * (holdings/actions.ts와 같은 원칙).
 */
export async function saveTerm(term: string): Promise<boolean> {
  const clean = term.trim();
  if (!clean) return false;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { data: card } = await supabase
    .from("concept_cards")
    .select("id")
    .eq("term", clean)
    .maybeSingle();

  if (!card) return false;

  // 이미 담았으면 조용히 넘어간다. 두 번 눌러도 오류가 아니다.
  const { error } = await supabase
    .from("user_cards")
    .upsert(
      { user_id: user.id, concept_card_id: card.id },
      { onConflict: "user_id,concept_card_id", ignoreDuplicates: true },
    );

  if (error) return false;

  revalidatePath("/glossary");
  return true;
}
