import "server-only";

/**
 * 기사 본문 일시 수집 (CLAUDE.md §2-3 개정, 2026-08-26 사용자 승인).
 *
 * 하루 선별된 기사(~18건)에 한해 본문을 가져와 **브리핑 생성 재료로만** 쓴다.
 * DB·화면·로그 어디에도 본문을 남기지 않는다. 저작권이 보호하는 것은 표현이고,
 * 우리가 내보내는 것은 사실을 우리 문체로 다시 쓴 불렛뿐이다.
 *
 * 실패는 조용히 null이다. 리드문 폴백이 있으므로 브리핑이 죽는 일은 없다.
 */

const TIMEOUT_MS = 8000;
const MAX_CHARS = 2500;

/** 캡션·저작권 고지·구독 유도처럼 본문이 아닌 문단. */
const JUNK =
  /무단\s*전재|재배포\s*금지|저작권자|ⓒ|©|Copyright|기사제보|구독하기|카카오톡\s*채널|네이버에서\s*구독|관련\s*기사|사진\s*=|영상\s*=|프리미엄콘텐츠|본\s*기사는|앱\s*다운로드/;

const ENTITIES: Record<string, string> = {
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&nbsp;": " ",
  "&middot;": "·",
  "&hellip;": "…",
};

function stripTags(html: string): string {
  let text = html.replace(/<[^>]+>/g, " ");
  for (const [entity, char] of Object.entries(ENTITIES)) {
    text = text.split(entity).join(char);
  }
  return text.replace(/\s+/g, " ").trim();
}

/**
 * HTML에서 본문 문단을 뽑는다.
 * <article>이 있으면 그 안에서, 없으면 문서 전체에서 <p>를 모은다.
 * 짧은 문단(버튼·캡션)과 상용구를 거른다. 대상 매체가 12곳뿐이라
 * 범용 추출기 의존성 없이 이 휴리스틱으로 충분한지 실측으로 확인했다.
 */
export function extractArticleText(html: string): string | null {
  const articleMatch = html.match(/<article[\s\S]*?<\/article>/i);
  const scope = articleMatch ? articleMatch[0] : html;

  const cleaned = scope
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");

  const paragraphs = [...cleaned.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)].map(
    (match) => stripTags(match[1]),
  );

  // 본문 문단은 문장부호를 가진다. 메뉴·워치리스트 나열은 못 가진다.
  const isBody = (text: string) =>
    text.length >= 40 && /[.!?…]/.test(text) && !JUNK.test(text);

  // 본문은 연속된 덩어리고, 랭킹 목록·내비는 조각조각 흩어져 있다.
  // 연속 구간 중 가장 큰 것을 본문으로 본다 (매경·CNBC의 목록 잡음 대응, 실측).
  const groups: string[][] = [];
  let current: string[] = [];
  for (const text of paragraphs) {
    if (isBody(text)) {
      current.push(text);
    } else if (current.length > 0) {
      groups.push(current);
      current = [];
    }
  }
  if (current.length > 0) groups.push(current);
  if (groups.length === 0) return null;

  const best = groups.reduce((a, b) =>
    a.join("").length >= b.join("").length ? a : b,
  );

  const text = best.join("\n");
  if (text.length < 120) return null;

  // 품질 게이트. 본문은 마침표가 촘촘하고 내비·랭킹 덩어리는 그렇지 않다.
  // 오염된 재료를 모델에 넣느니 리드문 폴백이 낫다 (매경 실측으로 잡은 기준).
  const periods = (text.match(/\./g) ?? []).length;
  if (periods < text.length / 400) return null;

  if (text.length <= MAX_CHARS) return text;
  return `${text.slice(0, MAX_CHARS).trimEnd()}…`;
}

/** 기사 한 건의 본문. 실패하면 null (리드문 폴백). */
export async function fetchArticleText(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
        "Accept-Language": "ko,en;q=0.8",
      },
    });
    if (!response.ok) return null;
    return extractArticleText(await response.text());
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 선별된 기사들의 본문을 모아 온다. 동시 4건, 전체는 폴백이 있으므로
 * 실패한 것은 그냥 빠진다.
 */
export async function fetchArticleTexts(
  urls: string[],
): Promise<Map<string, string>> {
  const bodies = new Map<string, string>();
  const CONCURRENCY = 4;

  for (let i = 0; i < urls.length; i += CONCURRENCY) {
    const batch = urls.slice(i, i + CONCURRENCY);
    const texts = await Promise.all(batch.map((url) => fetchArticleText(url)));
    batch.forEach((url, index) => {
      const text = texts[index];
      if (text) bodies.set(url, text);
    });
  }

  return bodies;
}
