import { redirect } from "next/navigation";

import { getUser } from "@/lib/supabase/server";

import { GoogleSignInButton } from "./google-sign-in-button";

const ERROR_MESSAGES: Record<string, string> = {
  access_denied:
    "이 계정은 아직 허용되지 않았다. Google Cloud 인증 플랫폼의 테스트 사용자에 등록된 계정으로 로그인할 것.",
  server_error: "구글 인증 서버가 요청을 거절했다. 잠시 후 다시 시도할 것.",
  missing_code: "인증 코드가 없다. 다시 로그인할 것.",
  exchange_failed: "세션 교환에 실패했다. 다시 로그인할 것.",
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const user = await getUser();
  if (user) {
    redirect("/");
  }

  const params = await searchParams;
  const error = first(params.error);
  const detail = first(params.detail);
  const message = error
    ? (ERROR_MESSAGES[error] ?? `로그인에 실패했다. (${error})`)
    : undefined;

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">투자 데스크</h1>
      <p className="mt-2 text-[15px] text-muted">
        매일 10분 브리핑과 자산배분 관리.
      </p>

      <div className="mt-10">
        <GoogleSignInButton />
      </div>

      {message ? (
        <div className="mt-6 border-t border-line pt-4">
          <p className="text-sm">{message}</p>
          {detail ? <p className="mt-1 text-sm text-muted">{detail}</p> : null}
        </div>
      ) : null}
    </main>
  );
}
