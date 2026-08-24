import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";

function loginUrl(origin: string, reason: string, detail?: string | null) {
  const url = new URL("/login", origin);
  url.searchParams.set("error", reason);
  // 원인 파악용. 구글/Supabase가 준 설명을 그대로 넘긴다.
  if (detail) {
    url.searchParams.set("detail", detail.slice(0, 300));
  }
  return url.toString();
}

/** Google OAuth 리디렉션을 받아 세션으로 교환한다. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  // OAuth 실패 시 code 대신 error가 온다. 이유를 삼키지 않고 그대로 전달한다.
  const providerError = searchParams.get("error");
  if (providerError) {
    return NextResponse.redirect(
      loginUrl(
        origin,
        providerError,
        searchParams.get("error_description") ?? searchParams.get("error_code"),
      ),
    );
  }

  if (!code) {
    return NextResponse.redirect(loginUrl(origin, "missing_code"));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(
      loginUrl(origin, "exchange_failed", error.message),
    );
  }

  // 오픈 리디렉션 방지: 같은 출처의 경로만 허용한다.
  const target = next.startsWith("/") && !next.startsWith("//") ? next : "/";
  return NextResponse.redirect(`${origin}${target}`);
}
