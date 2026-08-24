import "server-only";

/** KIS 자격증명. 전부 서버 전용이며 NEXT_PUBLIC_ 접두사를 쓰지 않는다 (CLAUDE.md §2-5). */
export function getKisEnv() {
  const appKey = process.env.KIS_APP_KEY;
  const appSecret = process.env.KIS_APP_SECRET;
  const cano = process.env.KIS_CANO;
  const acntPrdtCd = process.env.KIS_ACNT_PRDT_CD;
  const baseUrl =
    process.env.KIS_BASE_URL ?? "https://openapi.koreainvestment.com:9443";

  if (!appKey || !appSecret || !cano || !acntPrdtCd) {
    throw new Error(
      "KIS 환경변수가 없다. .env.example의 KIS_ 항목을 .env.local에 채울 것.",
    );
  }

  return { appKey, appSecret, cano, acntPrdtCd, baseUrl };
}

/**
 * KIS 계좌는 이 앱의 소유자 한 명의 것이다.
 * 지인이 로그인해도 소유자 잔고가 그 사람 포트폴리오로 들어가면 안 되므로,
 * KIS_OWNER_EMAIL이 설정돼 있으면 그 계정만 동기화를 허용한다.
 */
export function canSyncKis(email: string | undefined) {
  const owner = process.env.KIS_OWNER_EMAIL?.trim().toLowerCase();
  if (!owner) return true;
  return email?.trim().toLowerCase() === owner;
}
