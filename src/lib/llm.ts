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

export function buildChatPayload(model: string, system: string, userContent: ChatMessageContent[] | string): ChatPayload {
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
  return { model, stream: true, temperature: 0.7, messages };
}

export function buildAnthropicPayload(model: string, system: string, userContent: string | { text: string; imageBase64?: string; mime?: string }) {
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
    max_tokens: 2048,
    system,
    messages: [{ role: "user", content }],
  };
}

export function buildResponsesPayload(model: string, system: string, userContent: string | { text: string; imageBase64?: string; mime?: string }) {
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
    input: [{ role: "user", content: inputContent }],
  };
}

export function parseSSEResponse(chunk: string): string {
  // chunk may contain multiple lines: data: {...}\n\n
  let text = "";
  const lines = chunk.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) continue;
    const data = trimmed.slice(5).trim();
    if (data === "[DONE]" || data === "[done]") continue;
    try {
      const json = JSON.parse(data);

      // OpenAI Chat Completions
      const choiceDelta =
        json.choices?.[0]?.delta?.content ?? json.choices?.[0]?.message?.content ?? json.choices?.[0]?.text ?? "";
      if (typeof choiceDelta === "string" && choiceDelta) text += choiceDelta;

      // Common fallback
      if (typeof json.content === "string" && json.content) text += json.content;
      if (typeof json.text === "string" && json.text && !json.choices) text += json.text;

      // Anthropic messages: {"type":"content_block_delta","delta":{"type":"text_delta","text":"..."}}
      if (json.delta?.text && typeof json.delta.text === "string") text += json.delta.text;
      if (json.delta?.delta?.text) text += json.delta.delta.text;
      // Anthropic via some proxies: {"delta":{"text":"..."}}
      // OpenAI Responses API: {"type":"response.output_text.delta","delta":"..."} or {"delta":"..."}
      if (json.type?.includes("output_text") && typeof json.delta === "string") text += json.delta;
      if (json.type?.includes("text_delta") && typeof json.delta?.text === "string") text += json.delta.text;
      if (json.output_text && typeof json.output_text === "string") text += json.output_text;

      // DeepSeek etc. alternative
      if (json.choices?.[0]?.delta?.text) text += json.choices[0].delta.text;
    } catch {
      // ignore parse errors for keep-alive pings
    }
  }
  return text;
}
