export function parseSSEChunk(chunk: string, onText: (t: string) => void) {
  const lines = chunk.split("\n");
  for (const line of lines) {
    const t = line.trim();
    if (!t.startsWith("data:")) continue;
    const data = t.slice(5).trim();
    if (!data || data === "[DONE]" || data === "[done]") continue;
    try {
      const json = JSON.parse(data);
      if (json.delta?.type === "thinking_delta" || json.delta?.thinking !== undefined || json.delta?.reasoning !== undefined) continue;
      if (json.delta?.type === "reasoning_delta") continue;
      if (json.type === "content_block_delta" && json.delta?.type === "thinking_delta") continue;

      const choiceDelta =
        json.choices?.[0]?.delta?.content ??
        json.choices?.[0]?.message?.content ??
        json.choices?.[0]?.text ??
        (typeof json.content === "string" ? json.content : "") ??
        "";
      if (typeof choiceDelta === "string" && choiceDelta) onText(choiceDelta);
      if (json.choices?.[0]?.delta?.text) onText(json.choices[0].delta.text);
      if (json.content && typeof json.content === "string" && !json.choices) onText(json.content);
      if (json.text && typeof json.text === "string" && !json.choices) onText(json.text);
      if (json.delta?.type === "text_delta" && typeof json.delta.text === "string") onText(json.delta.text);
      else if (json.delta?.text && typeof json.delta.text === "string" && json.delta?.type !== "thinking_delta") {
        if (json.delta.thinking === undefined && json.delta.reasoning === undefined) onText(json.delta.text);
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
