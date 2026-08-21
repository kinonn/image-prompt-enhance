import { NextRequest } from "next/server";
import { REFINE_SYSTEM_PROMPT } from "@/lib/prompts";
import { getEndpointUrl, getEndpointKind, buildChatPayload, buildAnthropicPayload, buildResponsesPayload } from "@/lib/llm";
import { extractResponseText } from "@/lib/extract";
import { assertSafeProviderUrl } from "@/lib/ssrf";

export async function POST(req: NextRequest) {
  try {
    const { prompt, instruction, provider, model } = await req.json();

    if (!prompt || !instruction || !provider?.baseUrl || !model) {
      return new Response(JSON.stringify({ error: "Missing prompt, instruction, provider, or model" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    await assertSafeProviderUrl(provider.baseUrl);

    const baseUrl = provider.baseUrl.replace(/\/$/, "");
    const url = getEndpointUrl(baseUrl, model);
    const kind = getEndpointKind(baseUrl, model);

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (provider.apiKey) {
      headers["Authorization"] = `Bearer ${provider.apiKey}`;
      headers["x-api-key"] = provider.apiKey;
    }

    const userText = `ORIGINAL PROMPT:\n${prompt}\n\nINSTRUCTION:\n${instruction}\n\nReturn only the refined prompt:`;
    let payload: unknown;
    if (kind === "chat") {
      payload = buildChatPayload(model, REFINE_SYSTEM_PROMPT, userText);
    } else if (kind === "messages") {
      payload = buildAnthropicPayload(model, REFINE_SYSTEM_PROMPT, userText);
    } else {
      payload = buildResponsesPayload(model, REFINE_SYSTEM_PROMPT, userText);
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

    // Non-streaming fallback: some providers ignore `stream: true` and return a
    // single JSON body. Extract the text here and hand the client plain text so
    // it renders instead of being silently dropped by the SSE parser.
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
