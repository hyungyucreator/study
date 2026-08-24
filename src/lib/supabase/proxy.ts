import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

import { getSupabaseEnv } from "./env";

/** 인증 없이 접근 가능한 경로. */
const PUBLIC_PATHS = ["/login", "/auth"];

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}

/**
 * 매 요청마다 세션을 갱신하고, 미인증 접근을 /login으로 돌린다.
 * Next.js 16부터 미들웨어의 이름이 proxy로 바뀌었다.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const { url, anonKey } = getSupabaseEnv();

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
        // 인증 쿠키가 실린 응답은 캐시되면 안 된다.
        for (const [key, headerValue] of Object.entries(headers)) {
          response.headers.set(key, headerValue);
        }
      },
    },
  });

  // getUser()를 호출해야 만료된 토큰이 갱신된다. 이 줄을 지우면 세션이 임의로 끊긴다.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && !isPublicPath(request.nextUrl.pathname)) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    return NextResponse.redirect(loginUrl);
  }

  return response;
}
