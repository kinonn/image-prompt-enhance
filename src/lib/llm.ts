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

export type EndpointKind = "chat" | "responses" | "messages";

export function getEndpointKind(baseUrl: string, model: string): EndpointKind {
  const m = model.toLowerCase();
  const isGo = baseUrl.includes("/zen/go/");

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
  const kind = getEndpointKind(baseUrl, model);
  const base = baseUrl.replace(/\/$/, "");
  if (kind === "responses") return `${base}/responses`;
  if (kind === "messages") return `${base}/messages`;
  return `${base}/chat/completions`;
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

