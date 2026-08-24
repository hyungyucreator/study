import { getUser } from "@/lib/supabase/server";

// 1단계(뼈대) 확인용 화면. 2단계에서 포트폴리오 대시보드로 대체된다.
const TYPE_SAMPLE = [
  { label: "미 기준금리", value: "4.25", unit: "%", note: "동결" },
  { label: "원달러 환율", value: "1,382.50", unit: "원", note: "전일 대비 +0.3%" },
  { label: "VIX", value: "14.02", unit: "", note: "낮음, 시장 평온" },
  { label: "미 10년물", value: "4.187", unit: "%", note: "전일 대비 -2bp" },
];

export default async function Home() {
  const user = await getUser();

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-16">
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

      <p className="mt-6 text-[15px] text-muted">
        로그인 계정 {user?.email}
      </p>

      <section className="mt-12">
        <h2 className="text-lg font-semibold">숫자 정렬 확인</h2>
        <p className="mt-1 text-[15px] text-muted">
          tabular-nums 적용 상태. 소수점 자리가 세로로 맞아야 한다.
        </p>

        <dl className="mt-6 divide-y divide-line border-y border-line">
          {TYPE_SAMPLE.map((item) => (
            <div
              key={item.label}
              className="flex items-baseline justify-between gap-4 py-4"
            >
              <dt className="text-[15px]">{item.label}</dt>
              <dd className="text-right">
                <span className="tabular text-xl font-medium">
                  {item.value}
                </span>
                <span className="text-xl font-medium">{item.unit}</span>
                <span className="ml-2 text-sm text-muted">{item.note}</span>
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="mt-12">
        <h2 className="text-lg font-semibold">색 확인</h2>
        <p className="mt-1 text-[15px] text-muted">
          유채색은 수익(적)·손실(청) 두 개뿐이다.
        </p>
        <p className="mt-4 flex gap-6 text-xl font-medium">
          <span className="tabular text-gain">+12.40%</span>
          <span className="tabular text-loss">-3.15%</span>
        </p>
      </section>

      <section className="mt-12 border-t border-line pt-6">
        <h2 className="text-lg font-semibold">현재 진행 단계</h2>
        <p className="mt-1 text-[15px] text-muted">
          ROADMAP 1단계 — 뼈대. 포트폴리오·브리핑은 다음 단계에서 만든다.
        </p>
      </section>
    </main>
  );
}
