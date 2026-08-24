import { redirect } from "next/navigation";

import { getUser } from "@/lib/supabase/server";

import { GoogleSignInButton } from "./google-sign-in-button";

const ERROR_MESSAGES: Record<string, string> = {
  missing_code: "인증 코드가 없다. 다시 로그인할 것.",
  exchange_failed: "세션 교환에 실패했다. 다시 로그인할 것.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const user = await getUser();
  if (user) {
    redirect("/");
  }

  const { error } = await searchParams;
  const message = typeof error === "string" ? ERROR_MESSAGES[error] : undefined;

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">투자 데스크</h1>
      <p className="mt-2 text-[15px] text-muted">
        매일 10분 브리핑과 자산배분 관리.
      </p>

      <div className="mt-10">
        <GoogleSignInButton />
      </div>

      {message ? <p className="mt-4 text-sm text-muted">{message}</p> : null}
    </main>
  );
}
