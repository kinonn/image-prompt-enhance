import { NextRequest } from "next/server";
import { DESCRIBE_SYSTEM_PROMPT } from "@/lib/prompts";

export async function POST(req: NextRequest) {
  try {
    const { imageBase64, mime, provider, model } = await req.json();

    if (!imageBase64 || !provider?.baseUrl || !model) {
      return new Response(JSON.stringify({ error: "Missing image, provider, or model" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const baseUrl = provider.baseUrl.replace(/\/$/, "");
    const url = `${baseUrl}/chat/completions`;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (provider.apiKey) {
      headers["Authorization"] = `Bearer ${provider.apiKey}`;
      headers["x-api-key"] = provider.apiKey;
    }

    const payload = {
      model,
      stream: true,
      temperature: 0.7,
      messages: [
        { role: "system", content: DESCRIBE_SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: "Describe this image as a detailed prompt to recreate it:" },
            {
              type: "image_url",
              image_url: { url: `data:${mime || "image/jpeg"};base64,${imageBase64}` },
            },
          ],
        },
      ],
    };

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

    // If upstream is not streaming (some providers), handle non-stream fallback
    const contentType = upstream.headers.get("content-type") || "";
    if (!upstream.body) {
      const json = await upstream.json();
      const content = json.choices?.[0]?.message?.content || json.content || JSON.stringify(json);
      return new Response(content, {
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    // Stream through SSE passthrough, converting to plain text chunks
    // We'll forward SSE as text/plain chunks for client to parse
    // Keep SSE format for client parser to work uniformly
    return new Response(upstream.body, {
      headers: {
        "Content-Type": contentType.includes("text/event-stream") ? "text/event-stream" : "text/event-stream",
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
