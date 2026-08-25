import { NextResponse, type NextRequest } from "next/server";

import { selectNews } from "@/lib/news/select";
import { briefingWindow, loadCandidates } from "@/lib/news/window";

/**
 * 사전 필터링 결과만 보여주는 튜닝용 라우트. 모델을 부르지 않는다.
 * ROADMAP 3단계는 "프롬프트 튜닝 반복"을 요구하는데,
 * 모델에 무엇이 들어가는지 눈으로 못 보면 튜닝을 할 수 없다.
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
    // 생성 라우트와 같은 구간을 봐야 미리보기가 의미가 있다.
    const today = new Date().toLocaleDateString("en-CA", {
      timeZone: "Asia/Seoul",
    });
    const window = await briefingWindow(today);
    const candidates = await loadCandidates(window);
    // 임계값을 흔들어보며 묶음 품질을 눈으로 확인하는 손잡이.
    const scale = Number(request.nextUrl.searchParams.get("scale") ?? "1");
    const selection = selectNews(candidates, {
      scale: Number.isFinite(scale) && scale > 0 ? scale : 1,
    });

    const shape = (cluster: (typeof selection.part1)[number]) => ({
      title: cluster.lead_item.title,
      source: cluster.lead_item.source,
      category: cluster.lead_item.category,
      region: cluster.region,
      sourceCount: cluster.sourceCount,
      score: Number(cluster.score.toFixed(1)),
      published_at: cluster.lead_item.published_at,
      others: cluster.others.map((item) => `${item.source}: ${item.title}`),
    });

    return NextResponse.json({
      window,
      scale,
      candidates: candidates.length,
      part1: selection.part1.map(shape),
      part2: selection.part2.map(shape),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "선별 실패" },
      { status: 500 },
    );
  }
}
