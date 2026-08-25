import { NextResponse, type NextRequest } from "next/server";

import { generateBriefing } from "@/lib/briefing/generate";

/**
 * 데일리 브리핑 생성.
 * `?dry=1` 이면 모델만 부르고 저장하지 않는다 (프롬프트 튜닝용).
 * `?force=1` 이면 오늘 브리핑이 있어도 다시 만든다.
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

  const params = request.nextUrl.searchParams;

  try {
    const result = await generateBriefing({
      dryRun: params.get("dry") === "1",
      force: params.get("force") === "1",
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "생성 실패" },
      { status: 500 },
    );
  }
}
