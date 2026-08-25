import { NextResponse, type NextRequest } from "next/server";

import { collectNews } from "@/lib/news/collect";

/**
 * RSS 수집 → raw_news 저장.
 *
 * 인증은 CRON_SECRET 하나로 한다. Vercel Cron은 쿠키 없이
 * `Authorization: Bearer $CRON_SECRET`을 붙여 호출한다.
 * 시크릿이 비어 있으면 아무도 못 부른다 — 열어두는 쪽으로 실패하지 않는다.
 */
function authorize(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!authorize(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const result = await collectNews();
    // 소스가 하나라도 죽으면 본문에 남긴다. 알림 연결은 파이프라인 완성 후.
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "수집 실패" },
      { status: 500 },
    );
  }
}
