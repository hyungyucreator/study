import "server-only";

/**
 * Anthropic Messages API 호출.
 *
 * SDK 대신 fetch를 쓴다. 이 프로젝트의 다른 외부 호출과 방식을 맞추고
 * 의존성을 늘리지 않기 위함이다.
 */

const API_URL = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2023-06-01";

/** 해석 품질이 중요한 작업은 Sonnet (ARCHITECTURE.md §4-1). */
export const BRIEFING_MODEL = "claude-sonnet-5";

export type Usage = {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
};

export type ToolCallResult<T> = {
  data: T;
  usage: Usage;
  model: string;
};

type Tool = {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
};

type ApiResponse = {
  content?: { type: string; name?: string; input?: unknown }[];
  usage?: Usage;
  model?: string;
  stop_reason?: string;
  error?: { type?: string; message?: string };
};

function getKey() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY가 없다.");
  return key;
}

/**
 * 도구 호출을 강제해 구조화된 결과만 받는다.
 *
 * system은 배열로 보내고 cache_control을 붙인다. 매일 동일한 접두사라
 * 캐시가 히트하면 입력 단가가 크게 내려간다 (ARCHITECTURE §4-2).
 */
export async function callWithTool<T>(options: {
  system: string;
  userMessage: string;
  tool: Tool;
  maxTokens?: number;
}): Promise<ToolCallResult<T>> {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": getKey(),
      "anthropic-version": API_VERSION,
    },
    body: JSON.stringify({
      model: BRIEFING_MODEL,
      max_tokens: options.maxTokens ?? 6000,
      system: [
        {
          type: "text",
          text: options.system,
          cache_control: { type: "ephemeral" },
        },
      ],
      tools: [options.tool],
      tool_choice: { type: "tool", name: options.tool.name },
      messages: [{ role: "user", content: options.userMessage }],
    }),
    cache: "no-store",
  });

  const body = (await response.json()) as ApiResponse;

  if (!response.ok) {
    throw new Error(
      `Anthropic 호출 실패 (${response.status} ${body.error?.type ?? ""}): ${
        body.error?.message ?? "알 수 없는 오류"
      }`,
    );
  }

  const toolUse = body.content?.find(
    (block) => block.type === "tool_use" && block.name === options.tool.name,
  );

  if (!toolUse?.input) {
    // max_tokens에 걸리면 도구 입력이 잘려서 온다. 조용히 넘기면 안 된다.
    throw new Error(
      `모델이 도구를 호출하지 않았다 (stop_reason: ${body.stop_reason ?? "?"}).`,
    );
  }

  return {
    data: toolUse.input as T,
    usage: body.usage ?? { input_tokens: 0, output_tokens: 0 },
    model: body.model ?? BRIEFING_MODEL,
  };
}
