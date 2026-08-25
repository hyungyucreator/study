import Link from "next/link";

import { Nav } from "./nav";

/**
 * 로그인이 필요한 화면의 공통 셸.
 * 라우트 그룹이라 URL에는 (app)이 들어가지 않는다.
 *
 * 마스트헤드는 모든 화면에서 같은 자리에 같은 모양으로 있어야 한다.
 * 페이지마다 헤더를 따로 그리면 폭도 여백도 제각각이 된다.
 */
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <header className="sticky top-0 z-10 border-b border-line-strong bg-bg">
        <div className="mx-auto flex h-16 w-full max-w-page items-center justify-between gap-6 px-5 sm:px-8">
          <Link
            href="/"
            className="font-serif text-heading text-ink whitespace-nowrap"
          >
            투자 데스크
          </Link>

          <Nav />

          <form action="/auth/signout" method="post" className="ml-auto">
            <button
              type="submit"
              className="label whitespace-nowrap hover:text-ink"
            >
              로그아웃
            </button>
          </form>
        </div>
      </header>

      {children}
    </>
  );
}
