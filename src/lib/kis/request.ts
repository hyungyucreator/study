import "server-only";

import { getKisEnv } from "./env";
import { getAccessToken } from "./token";

/**
 * KIS GET 요청 공통부. 잔고조회와 현재가조회가 같이 쓴다.
 * 주문 관련 TR은 이 파일을 포함해 어디에도 두지 않는다 (CLAUDE.md §2-1).
 */

export type KisResponse = {
  rt_cd?: string;
  msg1?: string;
  msg_cd?: string;
  output?: Record<string, string>;
  output1?: Record<string, string>[];
  output2?: Record<string, string>[] | Record<string, string>;
};

export function toNumber(value: string | undefined) {
  const parsed = Number(value ?? "");
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function kisGet(
  path: string,
  trId: string,
  params: Record<string, string>,
  trCont = "",
): Promise<{ body: KisResponse; nextTrCont: string }> {
  const { appKey, appSecret, baseUrl } = getKisEnv();
  const token = await getAccessToken();

  const response = await fetch(
    `${baseUrl}${path}?${new URLSearchParams(params)}`,
    {
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
        appkey: appKey,
        appsecret: appSecret,
        tr_id: trId,
        tr_cont: trCont,
        custtype: "P",
      },
      cache: "no-store",
    },
  );

  const body = (await response.json()) as KisResponse;

  if (!response.ok || (body.rt_cd && body.rt_cd !== "0")) {
    throw new Error(
      `KIS 조회 실패 (${response.status} ${body.msg_cd ?? ""}): ${
        body.msg1?.trim() ?? "알 수 없는 오류"
      }`,
    );
  }

  // F/M = 다음 페이지 있음.
  const header = response.headers.get("tr_cont") ?? "";
  return { body, nextTrCont: header === "F" || header === "M" ? "N" : "" };
}
