import { NextRequest } from "next/server";
import { DESCRIBE_SYSTEM_PROMPT } from "@/lib/prompts";
import { getEndpointUrl, getEndpointKind, buildChatPayload, buildAnthropicPayload, buildResponsesPayload } from "@/lib/llm";
import { extractResponseText } from "@/lib/extract";
import { assertSafeProviderUrl } from "@/lib/ssrf";

export async function POST(req: NextRequest) {
  try {
    const { imageBase64, mime, provider, model } = await req.json();

    if (!imageBase64 || !provider?.baseUrl || !model) {
      return new Response(JSON.stringify({ error: "Missing image, provider, or model" }), {
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

    let payload: unknown;
    if (kind === "chat") {
      payload = buildChatPayload(model, DESCRIBE_SYSTEM_PROMPT, [
        { type: "text", text: "Describe this image as a detailed prompt to recreate it:" },
        {
          type: "image_url",
          image_url: { url: `data:${mime || "image/jpeg"};base64,${imageBase64}` },
        },
      ]);
    } else if (kind === "messages") {
      payload = buildAnthropicPayload(model, DESCRIBE_SYSTEM_PROMPT, {
        text: "Describe this image as a detailed prompt to recreate it:",
        imageBase64,
        mime,
      });
    } else {
      payload = buildResponsesPayload(model, DESCRIBE_SYSTEM_PROMPT, {
        text: "Describe this image as a detailed prompt to recreate it:",
        imageBase64,
        mime,
      });
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

    // Streaming providers forward as SSE; the client parses the events.
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
