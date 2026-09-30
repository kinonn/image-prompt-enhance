import { NextRequest } from "next/server";
import { DESCRIBE_SYSTEM_PROMPT } from "@/lib/prompts";
import { buildChatPayload, buildAnthropicPayload, buildResponsesPayload } from "@/lib/llm";
import { jsonError, proxyLLMRequest, toErrorResponse } from "@/lib/proxy";
import type { EffortSelection } from "@/lib/effort";

const USER_TEXT = "Describe this image as a detailed prompt to recreate it:";

export async function POST(req: NextRequest) {
  try {
    const { imageBase64, mime, provider, model, describePrompt, effort } = await req.json();

    if (!imageBase64 || !provider?.baseUrl || !model) {
      return jsonError("Missing image, provider, or model", 400);
    }

    const systemPrompt = typeof describePrompt === "string" && describePrompt.trim()
      ? describePrompt.trim()
      : DESCRIBE_SYSTEM_PROMPT;

    return await proxyLLMRequest(
      { baseUrl: provider.baseUrl, apiKey: provider.apiKey, model, effort },
      (kind, effort: EffortSelection) => {
        if (kind === "chat") {
          return buildChatPayload(model, systemPrompt, [
            { type: "text", text: USER_TEXT },
            { type: "image_url", image_url: { url: `data:${mime || "image/jpeg"};base64,${imageBase64}` } },
          ], effort);
        }
        const user = { text: USER_TEXT, imageBase64, mime };
        if (kind === "messages") return buildAnthropicPayload(model, systemPrompt, user, effort);
        return buildResponsesPayload(model, systemPrompt, user, effort);
      },
    );
  } catch (e) {
    return toErrorResponse(e);
  }
}
