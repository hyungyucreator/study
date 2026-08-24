/**
 * 클라이언트에 노출해도 되는 값은 이 두 개뿐이다.
 * service_role 키·KIS 앱키·Anthropic 키 등은 절대 NEXT_PUBLIC_ 접두사를 붙이지 않는다 (CLAUDE.md §2-5).
 */
export function getSupabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY 가 없다. .env.example을 참고해 .env.local을 채울 것.",
    );
  }

  return { url, anonKey };
}
