import { NextRequest } from "next/server";
import { CHAT_SYSTEM_PROMPT } from "@/lib/prompts";
import { getEndpointUrl, getEndpointKind } from "@/lib/llm";
import { extractResponseText } from "@/lib/extract";
import { assertSafeProviderUrl } from "@/lib/ssrf";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { messages, provider, model, systemPrompt, imageBase64, mime } = body as {
      messages?: { role: string; content: string }[];
      provider?: { baseUrl?: string; apiKey?: string };
      model?: string;
      systemPrompt?: string;
      imageBase64?: string;
      mime?: string;
    };

    if (!Array.isArray(messages) || messages.length === 0 || !provider?.baseUrl || !model) {
      return new Response(JSON.stringify({ error: "Missing messages, provider, or model" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    await assertSafeProviderUrl(provider.baseUrl);

    const baseUrl = provider.baseUrl.replace(/\/$/, "");
    const url = getEndpointUrl(baseUrl, model);
    const kind = getEndpointKind(baseUrl, model);

    const system = typeof systemPrompt === "string" && systemPrompt.trim() ? systemPrompt.trim() : CHAT_SYSTEM_PROMPT;

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (provider.apiKey) {
      headers["Authorization"] = `Bearer ${provider.apiKey}`;
      headers["x-api-key"] = provider.apiKey;
    }

    // Build provider-specific payload. Chat is multi-turn with optional image on last user message.
    let payload: unknown;
    if (kind === "chat") {
      // OpenAI chat: system + history; last user may carry image_url
      const lastUserImage = imageBase64
        ? [{ type: "text" as const, text: messages[messages.length - 1]?.content || "" }, { type: "image_url" as const, image_url: { url: `data:${mime || "image/jpeg"};base64,${imageBase64}` } }]
        : undefined;

      if (lastUserImage) {
        // Replace last message content with multimodal
        const history = messages.slice(0, -1);
        payload = {
          model,
          stream: true,
          temperature: 0.7,
          messages: [{ role: "system", content: system }, ...history, { role: "user", content: lastUserImage }],
        };
      } else {
        // Use buildChatPayload pattern but with history
        const msgs = [{ role: "system", content: system } as const, ...messages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content }))];
        payload = { model, stream: true, temperature: 0.7, messages: msgs };
      }
    } else if (kind === "messages") {
      // Anthropic: system separate, messages array; image on last user
      const anthroMessages = messages.map((m, i) => {
        const isLast = i === messages.length - 1 && imageBase64 && m.role === "user";
        if (isLast) {
          return {
            role: "user",
            content: [
              { type: "text", text: m.content },
              { type: "image", source: { type: "base64", media_type: mime || "image/jpeg", data: imageBase64 } },
            ],
          };
        }
        return { role: m.role, content: [{ type: "text", text: m.content }] };
      });
      payload = { model, stream: true, max_tokens: 4096, system, messages: anthroMessages };
    } else {
      // Responses API: flatten history into input
      const input = messages.map((m) => ({
        role: m.role,
        content: [{ type: "input_text", text: m.content }],
      }));
      // Attach image to last user if present
      if (imageBase64 && input.length > 0) {
        const last = input[input.length - 1] as { role: string; content: unknown[] };
        if (last.role === "user") {
          (last.content as unknown[]).push({ type: "input_image", image_url: `data:${mime || "image/jpeg"};base64,${imageBase64}` });
        }
      }
      // Prepend system as first input_text
      payload = { model, stream: true, input: [{ role: "user", content: [{ type: "input_text", text: system }] }, ...input] };
    }

    const upstream = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    if (!upstream.ok) {
      const text = await upstream.text();
      return new Response(JSON.stringify({ error: `Provider error ${upstream.status}: ${text.slice(0, 800)}` }), {
        status: upstream.status,
        headers: { "Content-Type": "application/json" },
      });
    }

    const contentType = upstream.headers.get("content-type") || "";
    if (contentType.includes("text/event-stream")) {
      return new Response(upstream.body, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    const json = await upstream.json();
    const content = extractResponseText(json);
    return new Response(content, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
