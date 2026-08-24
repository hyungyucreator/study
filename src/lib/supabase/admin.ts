import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * RLS를 우회하는 관리자 클라이언트. 서버에서만 쓴다.
 * "server-only" import가 클라이언트 번들에 섞이는 순간 빌드를 실패시킨다.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY가 없다. Supabase > Project Settings > API에서 복사해 .env.local에 넣을 것.",
    );
  }

  return createSupabaseClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
