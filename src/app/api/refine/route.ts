import { NextRequest } from "next/server";
import { REFINE_SYSTEM_PROMPT } from "@/lib/prompts";
import { getEndpointUrl, getEndpointKind, buildChatPayload, buildAnthropicPayload, buildResponsesPayload } from "@/lib/llm";

export async function POST(req: NextRequest) {
  try {
    const { prompt, instruction, provider, model } = await req.json();

    if (!prompt || !instruction || !provider?.baseUrl || !model) {
      return new Response(JSON.stringify({ error: "Missing prompt, instruction, provider, or model" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

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

    if (!upstream.body) {
      const json = await upstream.json();
      const content =
        json.choices?.[0]?.message?.content ||
        json.choices?.[0]?.text ||
        (Array.isArray(json.content) ? json.content.map((c: { text?: string }) => c.text || "").join("") : json.content) ||
        json.output_text ||
        (Array.isArray(json.output) ? json.output.map((o: { content?: { text?: string }[] }) => o.content?.map((c) => c.text).join("") || "").join("") : "") ||
        json.text ||
        JSON.stringify(json);
      return new Response(content, {
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    return new Response(upstream.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
