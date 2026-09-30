import { getEndpointKind, getEndpointUrl, type EndpointKind } from "./llm";
import { extractResponseText } from "./extract";
import { assertSafeProviderUrl } from "./ssrf";
import { isEffortSelection, type EffortSelection } from "./effort";

/** Provider coordinates as sent by the client. */
export interface ProxyTarget {
  baseUrl: string;
  apiKey?: string;
  model: string;
  /** Unvalidated client value; sanitized here so no route can skip the check. */
  effort?: unknown;
}

/**
 * Builds the upstream request body for the endpoint kind chosen for the model.
 * Payload shape stays with the route; transport stays in this module.
 */
export type PayloadBuilder = (kind: EndpointKind, effort: EffortSelection) => unknown;

export function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function toErrorResponse(e: unknown): Response {
  return jsonError(e instanceof Error ? e.message : String(e), 500);
}

/** OpenAI-style `Authorization` plus the `x-api-key` some providers expect. */
export function providerAuthHeaders(apiKey?: string): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
    headers["x-api-key"] = apiKey;
  }
  return headers;
}

/**
 * Single path for every LLM call: SSRF validation, endpoint dispatch, upstream
 * fetch, and response unwrapping. Streaming providers forward as SSE; providers
 * that ignore `stream: true` are unwrapped to plain text so the client still
 * renders something. Never call a provider from a route handler directly.
 */
export async function proxyLLMRequest(target: ProxyTarget, buildPayload: PayloadBuilder): Promise<Response> {
  const { baseUrl: rawBaseUrl, apiKey, model, effort } = target;

  await assertSafeProviderUrl(rawBaseUrl);

  const baseUrl = rawBaseUrl.replace(/\/$/, "");
  const kind = getEndpointKind(baseUrl, model);
  const url = getEndpointUrl(baseUrl, model);
  const thinkingEffort: EffortSelection = isEffortSelection(effort) ? effort : "";

  const upstream = await fetch(url, {
    method: "POST",
    headers: providerAuthHeaders(apiKey),
    body: JSON.stringify(buildPayload(kind, thinkingEffort)),
  });

  if (!upstream.ok) {
    const text = await upstream.text();
    return jsonError(`Provider error ${upstream.status}: ${text.slice(0, 800)}`, upstream.status);
  }

  const contentType = upstream.headers.get("content-type") || "";
  if (contentType.includes("text/event-stream")) {
    // Forwarded verbatim so streamed thinking/reasoning deltas reach the client.
    return new Response(upstream.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  }

  const json = await upstream.json();
  return new Response(extractResponseText(json), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
