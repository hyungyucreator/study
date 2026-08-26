import { NextResponse, type NextRequest } from "next/server";

import { generateBriefing, type GenerateResult } from "@/lib/briefing/generate";
import { collectMacro } from "@/lib/macro";
import { collectNews } from "@/lib/news/collect";
import { kstToday, runStep, type StepStatus } from "@/lib/ops/run-log";

/**
 * 하루 한 번 도는 오케스트레이터.
 *
 * 수집 → 매크로 → 생성은 순서가 있는데 Vercel Cron은 체이닝을 못 한다.
 * 시각을 벌려 세 개를 거는 대신 라우트 하나가 순서대로 부른다.
 * 크론 슬롯을 하나만 쓰고, 앞 단계 실패를 뒤 단계가 알 수 있다.
 *
 * 매크로를 따로 부르는 이유: generateBriefing이 안에서 collectMacro를 부르지만
 * 이미 오늘 브리핑이 있으면 그 전에 빠져나간다. 함의 채점은 매일의 raw_market이
 * 빠짐없이 있어야 성립하므로 브리핑 성패와 무관하게 지표를 남긴다.
 */
function authorize(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  if (!authorize(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const date = kstToday();
  const force = request.nextUrl.searchParams.get("force") === "1";
  const startedAt = Date.now();

  const news = await runStep(date, "collect-news", collectNews);
  const macro = await runStep(date, "collect-macro", collectMacro);

  // 수집이 실패했으면 어제 기사로 오늘 브리핑을 쓰게 된다. 그건 만들지 않는다.
  // 다음 날 크론이 다시 돌고, 화면에는 실패가 남는다.
  const briefing: {
    status: StepStatus;
    result: GenerateResult | null;
    error: string | null;
  } =
    news.status === "ok"
      ? await runStep(
          date,
          "generate-briefing",
          () => generateBriefing({ force }),
          (result) => result.skipped,
        )
      : { status: "skipped", result: null, error: "수집 실패로 건너뜀" };

  const failed = [news, macro, briefing].filter(
    (step) => step.status === "failed",
  ).length;

  return NextResponse.json(
    {
      date,
      durationMs: Date.now() - startedAt,
      steps: {
        news: { status: news.status, error: news.error, result: news.result },
        macro: { status: macro.status, error: macro.error },
        briefing: {
          status: briefing.status,
          error: briefing.error,
          date: briefing.result?.date ?? null,
          skipped: briefing.result?.skipped ?? null,
          threads: briefing.result?.threads ?? null,
        },
      },
    },
    { status: failed > 0 ? 500 : 200 },
  );
}
