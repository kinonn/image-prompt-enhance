import { NextRequest } from "next/server";
import { CHAT_SYSTEM_PROMPT } from "@/lib/prompts";
import { ANTHROPIC_MAX_TOKENS, applyThinkingEffort } from "@/lib/llm";
import { jsonError, proxyLLMRequest, toErrorResponse } from "@/lib/proxy";
import type { EffortSelection } from "@/lib/effort";

interface ClientMessage {
  role: string;
  content: string;
}

export async function POST(req: NextRequest) {
  try {
    const { messages, provider, model, systemPrompt, imageBase64, mime, effort } = (await req.json()) as {
      messages?: ClientMessage[];
      provider?: { baseUrl?: string; apiKey?: string };
      model?: string;
      systemPrompt?: string;
      imageBase64?: string;
      mime?: string;
      effort?: unknown;
    };

    if (!Array.isArray(messages) || messages.length === 0 || !provider?.baseUrl || !model) {
      return jsonError("Missing messages, provider, or model", 400);
    }

    const system = typeof systemPrompt === "string" && systemPrompt.trim() ? systemPrompt.trim() : CHAT_SYSTEM_PROMPT;
    const imagePart = imageBase64 ? { base64: imageBase64, mime: mime || "image/jpeg" } : null;

    return await proxyLLMRequest(
      { baseUrl: provider.baseUrl, apiKey: provider.apiKey, model, effort },
      (kind, effort: EffortSelection) => {
        const thinkingParams = applyThinkingEffort(kind, effort);

        if (kind === "chat") {
          // OpenAI-style: system + history; the last user message may carry an image.
          if (imagePart) {
            const history = messages.slice(0, -1);
            const lastContent = [
              { type: "text" as const, text: messages[messages.length - 1]?.content || "" },
              { type: "image_url" as const, image_url: { url: `data:${imagePart.mime};base64,${imagePart.base64}` } },
            ];
            return {
              model,
              stream: true,
              temperature: 0.7,
              ...thinkingParams,
              messages: [
                { role: "system", content: system },
                ...history,
                { role: "user", content: lastContent },
              ],
            };
          }
          return {
            model,
            stream: true,
            temperature: 0.7,
            ...thinkingParams,
            messages: [
              { role: "system", content: system },
              ...messages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
            ],
          };
        }

        if (kind === "messages") {
          // Anthropic: system is a top-level field; the image rides on the last user turn.
          const anthropicMessages = messages.map((m, i) => {
            const isLast = i === messages.length - 1 && imagePart && m.role === "user";
            if (isLast) {
              return {
                role: "user",
                content: [
                  { type: "text", text: m.content },
                  { type: "image", source: { type: "base64", media_type: imagePart.mime, data: imagePart.base64 } },
                ],
              };
            }
            return { role: m.role, content: [{ type: "text", text: m.content }] };
          });
          return {
            model,
            stream: true,
            max_tokens: ANTHROPIC_MAX_TOKENS,
            system,
            ...thinkingParams,
            messages: anthropicMessages,
          };
        }

        // Responses API: flatten history into input, with the system prompt first.
        const input = messages.map((m) => ({
          role: m.role,
          content: [{ type: "input_text", text: m.content }],
        }));
        const last = input[input.length - 1] as { role: string; content: unknown[] } | undefined;
        if (imagePart && last && last.role === "user") {
          last.content.push({ type: "input_image", image_url: `data:${imagePart.mime};base64,${imagePart.base64}` });
        }
        return {
          model,
          stream: true,
          ...thinkingParams,
          input: [{ role: "user", content: [{ type: "input_text", text: system }] }, ...input],
        };
      },
    );
  } catch (e) {
    return toErrorResponse(e);
  }
}
