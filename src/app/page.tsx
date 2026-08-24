import Link from "next/link";

import { getUser } from "@/lib/supabase/server";

export default async function Home() {
  const user = await getUser();

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
      <header className="flex items-baseline justify-between border-b border-line pb-6">
        <h1 className="text-2xl font-semibold tracking-tight">투자 데스크</h1>
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            className="text-sm text-muted underline underline-offset-4 hover:text-fg"
          >
            로그아웃
          </button>
        </form>
      </header>

      <p className="mt-6 text-[15px] text-muted">{user?.email}</p>

      <nav className="mt-10 border-t border-line">
        <Link
          href="/holdings"
          className="flex items-baseline justify-between border-b border-line py-4 hover:bg-line/30"
        >
          <span className="text-[17px]">보유자산</span>
          <span className="text-sm text-muted">수동 입력 · 자산군별 정리</span>
        </Link>
      </nav>

      <p className="mt-10 text-sm text-muted">
        ROADMAP 2단계 진행 중 — 시세 갱신과 대시보드는 아직 없다.
      </p>
    </main>
  );
}
