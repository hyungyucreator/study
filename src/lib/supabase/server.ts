import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

import { getSupabaseEnv } from "./env";

/**
 * 서버 컴포넌트 / 라우트 핸들러용 Supabase 클라이언트.
 * 세션 쿠키를 읽고 쓴다.
 */
export async function createClient() {
  // cookies()를 먼저 await 해야 이 경로가 동적 렌더링으로 확정된다 (프리렌더 방지).
  const cookieStore = await cookies();
  const { url, anonKey } = getSupabaseEnv();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // 서버 컴포넌트에서는 쿠키를 쓸 수 없다.
          // 세션 갱신은 proxy.ts가 담당하므로 여기서는 무시해도 된다.
        }
      },
    },
  });
}

/** 로그인한 유저를 반환한다. 없으면 null. */
export async function getUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}
