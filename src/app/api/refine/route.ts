import { NextRequest } from "next/server";
import { REFINE_SYSTEM_PROMPT } from "@/lib/prompts";
import { buildChatPayload, buildAnthropicPayload, buildResponsesPayload } from "@/lib/llm";
import { jsonError, proxyLLMRequest, toErrorResponse } from "@/lib/proxy";
import type { EffortSelection } from "@/lib/effort";

export async function POST(req: NextRequest) {
  try {
    const { prompt, instruction, provider, model, effort } = await req.json();

    if (!prompt || !instruction || !provider?.baseUrl || !model) {
      return jsonError("Missing prompt, instruction, provider, or model", 400);
    }

    const userText = `ORIGINAL PROMPT:\n${prompt}\n\nINSTRUCTION:\n${instruction}\n\nReturn only the refined prompt:`;

    return await proxyLLMRequest(
      { baseUrl: provider.baseUrl, apiKey: provider.apiKey, model, effort },
      (kind, effort: EffortSelection) => {
        if (kind === "chat") return buildChatPayload(model, REFINE_SYSTEM_PROMPT, userText, effort);
        if (kind === "messages") return buildAnthropicPayload(model, REFINE_SYSTEM_PROMPT, userText, effort);
        return buildResponsesPayload(model, REFINE_SYSTEM_PROMPT, userText, effort);
      },
    );
  } catch (e) {
    return toErrorResponse(e);
  }
}
