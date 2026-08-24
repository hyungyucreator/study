import { createBrowserClient } from "@supabase/ssr";

import { getSupabaseEnv } from "./env";

/** 브라우저(클라이언트 컴포넌트)용 Supabase 클라이언트. */
export function createClient() {
  const { url, anonKey } = getSupabaseEnv();
  return createBrowserClient(url, anonKey);
}
