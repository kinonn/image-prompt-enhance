function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Emit the displayable text from one streamed event. `chunk` may be a raw SSE
 * `data:` payload or a bare JSON line — Ollama's native /api/chat streams
 * NDJSON, which has no `data:` prefix but otherwise carries the same
 * `message.content` / `message.thinking` fields handled here.
 */
export function parseSSEChunk(chunk: string, onText: (t: string) => void) {
  const lines = chunk.split("\n");
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    const data = t.startsWith("data:") ? t.slice(5).trim() : t;
    if (!data || data === "[DONE]" || data === "[done]") continue;
    try {
      const json = JSON.parse(data);

      // Thinking/reasoning traces are displayed, not suppressed — emit them
      // in arrival order (they stream before the final answer).
      const thinking =
        json.choices?.[0]?.delta?.reasoning ??
        json.choices?.[0]?.delta?.reasoning_content ??
        json.choices?.[0]?.message?.reasoning_content ??
        json.choices?.[0]?.message?.reasoning ??
        json.delta?.thinking ??
        json.delta?.reasoning ??
        json.delta?.reasoning_content ??
        "";
      if (typeof thinking === "string" && thinking) onText(thinking);
      // Responses-style reasoning events carry the text in a bare string delta.
      if (typeof json.delta === "string" && typeof json.type === "string" && /reasoning|thinking/.test(json.type)) {
        onText(json.delta);
      }

      const choiceDelta =
        json.choices?.[0]?.delta?.content ??
        json.choices?.[0]?.message?.content ??
        json.choices?.[0]?.text ??
        (typeof json.content === "string" ? json.content : "") ??
        "";
      if (typeof choiceDelta === "string" && choiceDelta) onText(choiceDelta);
      // Ollama native /api/chat: text and thinking sit on `message`, and the
      // stream is NDJSON rather than SSE — this shape is reused for both.
      if (isObj(json.message)) {
        const msgThinking = typeof json.message.thinking === "string" ? json.message.thinking : "";
        const msgContent = typeof json.message.content === "string" ? json.message.content : "";
        if (msgThinking) onText(msgThinking);
        if (msgContent) onText(msgContent);
      }
      // Top-level `delta.content` — proxies that omit the choices envelope.
      if (
        !json.choices &&
        typeof json.delta === "object" &&
        json.delta !== null &&
        typeof json.delta.content === "string" &&
        json.delta.content
      ) {
        onText(json.delta.content);
      }
      if (json.choices?.[0]?.delta?.text) onText(json.choices[0].delta.text);
      if (json.content && typeof json.content === "string" && !json.choices) onText(json.content);
      if (json.text && typeof json.text === "string" && !json.choices) onText(json.text);
      if (json.delta?.type === "text_delta" && typeof json.delta.text === "string") onText(json.delta.text);
      else if (json.delta?.text && typeof json.delta.text === "string") {
        // An explicit `text` field is displayable text; thinking deltas carry
        // their own `thinking` field, which is emitted above.
        onText(json.delta.text);
      }
      if (json.delta?.delta?.text) onText(json.delta.delta.text);
      if (json.type?.includes("output_text") && typeof json.delta === "string") onText(json.delta);
      if (json.output_text && typeof json.output_text === "string") onText(json.output_text);
    } catch {
      // ignore keepalive
    }
  }
}

export async function streamResponse(res: Response, onText: (t: string) => void): Promise<string> {
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const data = await res.json().catch(() => null);
    const msg = data?.error || `Request failed (${res.status})`;
    throw new Error(msg);
  }

  if (!res.body) {
    if (contentType.includes("application/json")) {
      const j = await res.json();
      const text =
        j.choices?.[0]?.message?.content ||
        j.choices?.[0]?.text ||
        (Array.isArray(j.content)
          ? j.content
              .filter((c: { type?: string }) => c.type === "text" || c.type === undefined)
              .map((c: { text?: string }) => c.text || "")
              .join("")
          : j.content) ||
        j.output_text ||
        j.text ||
        "";
      onText(text);
      return text;
    }
    const text = await res.text();
    onText(text);
    return text;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let full = "";
  let buffer = "";
  const isSSE = contentType.includes("text/event-stream");
  // Ollama's native /api/chat streams newline-delimited JSON, not SSE: there is
  // no `data:` prefix to key off, so it needs its own line-based path.
  const isNDJSON = contentType.includes("application/x-ndjson");

  if (isNDJSON) {
    const emit = (line: string) => {
      if (!line.trim()) return;
      parseSSEChunk(line, (t) => {
        full += t;
        onText(t);
      });
    };
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) emit(line);
    }
    buffer += decoder.decode();
    emit(buffer);
    return full;
  }

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    buffer += chunk;

    const hasData = buffer.includes("data:");
    if (!isSSE && !hasData) {
      onText(chunk);
      full += chunk;
      buffer = "";
      continue;
    }
    if (!hasData) continue;

    const parts = buffer.split("\n\n");
    buffer = parts.pop() || "";
    for (const part of parts) {
      parseSSEChunk(part, (t) => {
        full += t;
        onText(t);
      });
    }
  }
  if (buffer) {
    if (buffer.includes("data:")) {
      parseSSEChunk(buffer, (t) => {
        full += t;
        onText(t);
      });
    } else if (!isSSE && buffer.trim()) {
      onText(buffer);
      full += buffer;
    }
  }
  return full;
}
