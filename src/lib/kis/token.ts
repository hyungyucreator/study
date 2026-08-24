import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

import { getKisEnv } from "./env";

// 만료 직전 토큰으로 요청하다 실패하는 것을 막는 여유분.
const EXPIRY_MARGIN_MS = 10 * 60 * 1000;

type TokenResponse = {
  access_token?: string;
  expires_in?: number;
  access_token_token_expired?: string;
  error_description?: string;
  error_code?: string;
};

/**
 * 캐시된 접근토큰을 돌려주고, 없거나 만료가 임박했으면 새로 발급한다.
 * KIS는 토큰 재발급을 1분 1회로 제한하므로 절대 매 요청마다 발급하지 않는다.
 */
export async function getAccessToken(): Promise<string> {
  const supabase = createAdminClient();

  const { data: cached } = await supabase
    .from("kis_token")
    .select("access_token, expires_at")
    .eq("id", "default")
    .maybeSingle();

  if (cached) {
    const expiresAt = new Date(cached.expires_at).getTime();
    if (expiresAt - EXPIRY_MARGIN_MS > Date.now()) {
      return cached.access_token;
    }
  }

  const { appKey, appSecret, baseUrl } = getKisEnv();

  const response = await fetch(`${baseUrl}/oauth2/tokenP`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      appkey: appKey,
      appsecret: appSecret,
    }),
    cache: "no-store",
  });

  const body = (await response.json()) as TokenResponse;

  if (!response.ok || !body.access_token) {
    // 1분 1회 제한(EGW00133)에 걸렸는데 캐시가 남아 있으면 그걸로 버틴다.
    if (cached) return cached.access_token;
    throw new Error(
      `KIS 토큰 발급 실패 (${response.status}): ${
        body.error_description ?? body.error_code ?? "알 수 없는 오류"
      }`,
    );
  }

  const expiresAt = new Date(
    Date.now() + (body.expires_in ?? 86400) * 1000,
  ).toISOString();

  await supabase
    .from("kis_token")
    .upsert({
      id: "default",
      access_token: body.access_token,
      expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    });

  return body.access_token;
}
