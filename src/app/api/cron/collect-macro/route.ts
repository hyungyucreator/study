import { NextResponse, type NextRequest } from "next/server";

import { collectMacro } from "@/lib/macro";

/** 매크로 수집 → raw_market. 인증은 collect-news와 동일하게 CRON_SECRET. */
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
    return NextResponse.json(await collectMacro());
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "수집 실패" },
      { status: 500 },
    );
  }
}
