function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/*
 * Repetition-loop guard.
 *
 * A model that degenerates ("the same sentence, over and over") never ends its
 * own turn: the stream stays open, each chunk lands, and the UI grows the same
 * paragraph indefinitely. Nothing upstream can be relied on to stop —
 * `num_predict` is generous, `max_tokens` is absent on most endpoints, and
 * repetition_penalty is not portable across providers. So the loop is cut here,
 * in the one place every LLM response passes through.
 *
 * Detection is a periodicity test on the tail of the accumulated text: a loop
 * makes the end of the output periodic. The period is unknown in advance (a
 * model looping on a 99-character clause has period 99), so every plausible
 * period is tried. Four consecutive copies are required, which is what keeps
 * ordinary prose safe — a description only repeats itself when it has gone wrong.
 *
 * This module imports nothing: `proxy-e2e.mjs` loads it directly under plain
 * Node ESM, which does not resolve extensionless specifiers.
 */

/** Shortest period considered — below this it is a stutter, not a loop. */
const MIN_PERIOD = 12;
/** Longest period considered — roughly a long clause, well past any real loop. */
const MAX_PERIOD = 400;
/** Copies of the period that must match before the tail counts as a loop. */
const MIN_REPEATS = 4;
/** Only re-examine the accumulated text every this many new characters. */
const RESCAN_INTERVAL = 200;
/** Cheap pre-filter: this many characters must align before the full test runs. */
const FILTER = 32;

/** True when the tail of `text` is periodic, i.e. the model is looping. */
export function hasRepeatedTail(text: string): boolean {
  const maxPeriod = Math.min(MAX_PERIOD, Math.floor(text.length / MIN_REPEATS));
  for (let period = MIN_PERIOD; period <= maxPeriod; period++) {
    // The last MIN_REPEATS copies, minus the final one: repeating this forward
    // by `period` characters must reproduce the last copy exactly.
    const window = text.slice(-(period * MIN_REPEATS), -period);
    const block = text.slice(-(period * (MIN_REPEATS - 1)));
    // The two slices must be compared over the same length: for a short period
    // the trailing copy is shorter than FILTER, and comparing a long prefix
    // against a short one would reject every short period outright.
    const probe = Math.min(FILTER, block.length - period);
    if (probe > 0 && window.slice(0, probe) !== block.slice(period, period + probe)) continue;
    if (window !== block) continue;
    // Whitespace and punctuation runs repeat in honest prose ("no text, no
    // watermark, no logo"); require letters so those never trip the guard.
    if (!/[a-z]{4}/i.test(block)) continue;
    return true;
  }
  return false;
}

/**
 * Stateful wrapper so the periodicity test runs on a stride instead of on every
 * chunk. Call `tripped(text)` with the full accumulated text after each chunk;
 * it reports true once, when the loop first becomes visible.
 */
function createLoopGuard(): (text: string) => boolean {
  let checkedUpTo = 0;
  let tripped = false;
  return (text: string) => {
    if (tripped) return false;
    if (text.length - checkedUpTo < RESCAN_INTERVAL) return false;
    checkedUpTo = text.length;
    if (!hasRepeatedTail(text)) return false;
    tripped = true;
    return true;
  };
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

/**
 * Reads a provider stream to completion, calling `onText` with each displayable
 * fragment.
 *
 * `onLoop` fires when the output turns into a repetition loop, at which point
 * the reader is cancelled and whatever arrived before the loop is returned: a
 * truncated prompt beats an infinitely growing one.
 */
export async function streamResponse(
  res: Response,
  onText: (t: string) => void,
  onLoop?: () => void
): Promise<string> {
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

  // Single choke point for every fragment: append, display, then test for a
  // repetition loop. Once tripped, nothing further is emitted.
  const tripped = createLoopGuard();
  let looping = false;
  const emit = (t: string) => {
    if (looping || !t) return;
    full += t;
    onText(t);
    if (tripped(full)) {
      looping = true;
      onLoop?.();
    }
  };
  const looped = async (): Promise<boolean> => {
    if (!looping) return false;
    // Stop pulling from the socket so the provider's turn is actually cut.
    await reader.cancel().catch(() => {});
    return true;
  };

  if (isNDJSON) {
    const emitLine = (line: string) => {
      if (!line.trim()) return;
      parseSSEChunk(line, emit);
    };
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        emitLine(line);
        if (await looped()) return full;
      }
    }
    buffer += decoder.decode();
    emitLine(buffer);
    return full;
  }

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    buffer += chunk;

    const hasData = buffer.includes("data:");
    if (!isSSE && !hasData) {
      emit(chunk);
      if (await looped()) return full;
      buffer = "";
      continue;
    }
    if (!hasData) continue;

    const parts = buffer.split("\n\n");
    buffer = parts.pop() || "";
    for (const part of parts) {
      parseSSEChunk(part, emit);
      if (await looped()) return full;
    }
  }
  if (buffer) {
    if (buffer.includes("data:")) {
      parseSSEChunk(buffer, emit);
    } else if (!isSSE && buffer.trim()) {
      emit(buffer);
    }
  }
  return full;
}
