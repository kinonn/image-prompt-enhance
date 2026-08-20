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

export function parseSSEResponse(chunk: string): string {
  // chunk may contain multiple lines: data: {...}\n\n
  let text = "";
  const lines = chunk.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) continue;
    const data = trimmed.slice(5).trim();
    if (data === "[DONE]") continue;
    try {
      const json = JSON.parse(data);
      const delta = json.choices?.[0]?.delta?.content ?? json.choices?.[0]?.message?.content ?? json.content ?? "";
      if (typeof delta === "string") text += delta;
      // Some providers use "text" field
      if (json.choices?.[0]?.text) text += json.choices[0].text;
    } catch {
      // ignore parse errors for keep-alive pings
    }
  }
  return text;
}
