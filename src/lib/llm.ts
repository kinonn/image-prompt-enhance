import type { EffortSelection, ThinkingEffort } from "./effort";

export interface ChatMessageContent {
  type: "text" | "image_url";
  text?: string;
  image_url?: { url: string };
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string | ChatMessageContent[];
}

export interface ChatPayload {
  model: string;
  messages: ChatMessage[];
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
  reasoning_effort?: string;
}

export type EndpointKind = "chat" | "responses" | "messages" | "ollama";

/**
 * Ollama's default context window (`num_ctx`) is 4096, which is smaller than
 * the refine system prompt (~3.7k tokens) on its own — the model gets a prompt
 * to satisfy and essentially no room to answer, and returns an empty completion
 * with `finish_reason: length`. Its OpenAI-compat endpoint (`/v1`) silently
 * ignores `options`, so the window cannot be raised there. The native endpoint
 * (`/api/chat`) does honour `options.num_ctx` / `options.num_predict`, which is
 * why Ollama is routed there instead of through `getEndpointUrl`.
 */
export const OLLAMA_NUM_CTX = 16384;
export const OLLAMA_NUM_PREDICT = 2048;

/** Ollama's default port, plus the hostnames people commonly point at it. */
export function isOllamaBaseUrl(baseUrl: string): boolean {
  return /:11434(\/|$)/.test(baseUrl) || /^https?:\/\/(ollama|host\.docker\.internal)(:|\/)/.test(baseUrl);
}

export function getEndpointKind(baseUrl: string, model: string): EndpointKind {
  const m = model.toLowerCase();
  const isGo = baseUrl.includes("/zen/go/");

  // Ollama is a distinct kind: native /api/chat, NDJSON stream, and a payload
  // whose content/image fields differ from the OpenAI shape.
  if (isOllamaBaseUrl(baseUrl)) return "ollama";

  // Responses: Grok, GPT, Muse Spark (per Go/Zen docs)
  if (/^(grok|gpt-|muse-spark)/.test(m)) return "responses";
  // Messages: Claude, Gemini, Qwen, and for Go also MiniMax
  if (/^(claude|gemini|qwen)/.test(m)) return "messages";
  if (/^minimax/.test(m)) {
    // Go uses /messages for MiniMax, Zen uses /chat/completions
    if (isGo) return "messages";
    return "chat";
  }
  // Default chat for GLM, Kimi, DeepSeek, MiMo, Hy3, Big Pickle, etc.
  return "chat";
}

export function getEndpointUrl(baseUrl: string, model: string): string {
  const base = baseUrl.replace(/\/$/, "");
  // Ollama keeps its own native surface: the compat endpoint ignores `options`,
  // so `num_ctx` — the fix for the 4096 default — can only be set on /api/chat.
  if (getEndpointKind(baseUrl, model) === "ollama") {
    return `${base.replace(/\/v1$/, "")}/api/chat`;
  }
  const kind = getEndpointKind(baseUrl, model);
  if (kind === "responses") return `${base}/responses`;
  if (kind === "messages") return `${base}/messages`;
  return `${base}/chat/completions`;
}

export interface OllamaMessage {
  role: string;
  content: string;
  thinking?: string;
  /** Base64 (no data: prefix) — Ollama's native image field. */
  images?: string[];
}

/** Strip a `data:<mime>;base64,` prefix down to the raw base64 Ollama expects. */
function toBareBase64(urlOrBase64: string): string {
  const comma = urlOrBase64.indexOf(",");
  return urlOrBase64.startsWith("data:") && comma !== -1 ? urlOrBase64.slice(comma + 1) : urlOrBase64;
}

/**
 * Ollama's native payload. Two shapes differ from OpenAI's and both are
 * required, not cosmetic:
 *  - `messages[].content` must be a plain string; the content-part array is
 *    rejected outright ("cannot unmarshal array into Go struct field").
 *  - images are a sibling `images: [base64]` array, not an inline part.
 * Thinking effort is not a concept Ollama exposes, so no effort param is sent.
 */
export function buildOllamaPayload(
  model: string,
  system: string,
  messages: { role: string; content: string | ChatMessageContent[]; images?: string[] }[],
  imageBase64?: string
) {
  const native: OllamaMessage[] = [{ role: "system", content: system }];
  for (const m of messages) {
    if (typeof m.content === "string") {
      native.push({ role: m.role, content: m.content, ...(m.images ? { images: m.images } : {}) });
      continue;
    }
    let text = "";
    const images: string[] = [];
    for (const part of m.content) {
      if (part.type === "text") text += part.text ?? "";
      else if (part.type === "image_url" && part.image_url?.url) images.push(toBareBase64(part.image_url.url));
    }
    native.push({ role: m.role, content: text, ...(images.length ? { images } : {}) });
  }
  if (imageBase64) {
    // The image rides on the last user turn, matching the other providers.
    const last = native[native.length - 1];
    if (last && last.role === "user") {
      last.images = [...(last.images ?? []), toBareBase64(imageBase64)];
    }
  }
  return {
    model,
    messages: native,
    stream: true,
    options: { num_ctx: OLLAMA_NUM_CTX, num_predict: OLLAMA_NUM_PREDICT },
  };
}

// Extended-thinking token budget per effort level for Anthropic-style /messages providers.
const EFFORT_BUDGET_TOKENS: Record<ThinkingEffort, number> = {
  low: 1024,
  medium: 4096,
  high: 16384,
};

/**
 * Output cap for Anthropic-style /messages requests, which always require
 * `max_tokens`. It must exceed the largest thinking budget (16384) and still
 * leave room for the final answer: reasoning models otherwise burn the whole
 * cap on thinking and stream no text at all, which surfaces as an empty
 * refinement. Every /messages payload must use this value — a lower cap
 * reintroduces the truncation bug.
 */
export const ANTHROPIC_MAX_TOKENS = 32768;

/**
 * Translate a thinking-effort selection into provider-specific request params.
 * "Default" (empty) returns nothing so no effort parameter is sent upstream.
 */
export function applyThinkingEffort(kind: EndpointKind, effort: EffortSelection): Record<string, unknown> {
  if (!effort) return {};
  if (kind === "ollama") return {}; // Ollama exposes no effort knob; depth is num_ctx/num_predict.
  if (kind === "chat") return { reasoning_effort: effort };
  if (kind === "responses") return { reasoning: { effort } };
  // Anthropic-style /messages: extended thinking with a token budget
  return { thinking: { type: "enabled", budget_tokens: EFFORT_BUDGET_TOKENS[effort] } };
}

export function buildChatPayload(model: string, system: string, userContent: ChatMessageContent[] | string, effort: EffortSelection = ""): ChatPayload {
  const messages: ChatMessage[] =
    typeof userContent === "string"
      ? [
          { role: "system", content: system },
          { role: "user", content: userContent },
        ]
      : [
          { role: "system", content: system },
          { role: "user", content: userContent },
        ];
  return { model, stream: true, temperature: 0.7, messages, ...applyThinkingEffort("chat", effort) };
}

export function buildAnthropicPayload(model: string, system: string, userContent: string | { text: string; imageBase64?: string; mime?: string }, effort: EffortSelection = "") {
  // Anthropic messages format
  let content: unknown;
  if (typeof userContent === "string") {
    content = [{ type: "text", text: userContent }];
  } else if (userContent.imageBase64) {
    content = [
      { type: "text", text: userContent.text },
      {
        type: "image",
        source: {
          type: "base64",
          media_type: userContent.mime || "image/jpeg",
          data: userContent.imageBase64,
        },
      },
    ];
  } else {
    content = [{ type: "text", text: userContent.text }];
  }
  return {
    model,
    stream: true,
    max_tokens: ANTHROPIC_MAX_TOKENS,
    system,
    messages: [{ role: "user", content }],
    ...applyThinkingEffort("messages", effort),
  };
}

export function buildResponsesPayload(model: string, system: string, userContent: string | { text: string; imageBase64?: string; mime?: string }, effort: EffortSelection = "") {
  const inputContent: unknown[] = [];
  if (typeof userContent === "string") {
    inputContent.push({ type: "input_text", text: `${system}\n\n${userContent}` });
  } else if (userContent.imageBase64) {
    inputContent.push({ type: "input_text", text: `${system}\n\n${userContent.text}` });
    inputContent.push({ type: "input_image", image_url: `data:${userContent.mime || "image/jpeg"};base64,${userContent.imageBase64}` });
  } else {
    inputContent.push({ type: "input_text", text: `${system}\n\n${userContent.text}` });
  }
  return {
    model,
    stream: true,
    ...applyThinkingEffort("responses", effort),
    input: [{ role: "user", content: inputContent }],
  };
}

