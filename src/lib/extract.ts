type Obj = Record<string, unknown>;

function isObj(v: unknown): v is Obj {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/** Pulls the assistant text out of a non-streaming LLM response, across the
 *  OpenAI chat, Anthropic messages, and OpenAI responses shapes. */
export function extractResponseText(json: unknown): string {
  if (!isObj(json)) return "";

  // Ollama native /api/chat: text lives on `message`, with thinking alongside.
  if (isObj(json.message)) {
    const thinking = str(json.message.thinking);
    const text = str(json.message.content);
    return thinking + text;
  }

  const choices = Array.isArray(json.choices) ? json.choices : [];
  const first = choices[0];
  if (isObj(first)) {
    // Thinking/reasoning traces are displayed alongside the final text.
    const msg = isObj(first.message) ? first.message : undefined;
    const thinking = msg
      ? str(msg.reasoning_content) || str(msg.reasoning) || str(msg.thinking)
      : "";
    const msgText = msg ? str(msg.content) : "";
    if (msgText) return thinking + msgText;
    const firstText = str(first.text);
    if (firstText) return thinking + firstText;
    const deltaText = isObj(first.delta) ? str(first.delta.content) : "";
    if (deltaText) return thinking + deltaText;
    if (thinking) return thinking;
  }

  if (Array.isArray(json.content)) {
    // Anthropic-style thinking blocks ride alongside the text blocks.
    const thinking = json.content
      .filter((c): c is Obj => isObj(c) && c.type === "thinking")
      .map((c) => str(c.thinking))
      .join("");
    const joined = json.content
      .filter((c): c is Obj => isObj(c) && (c.type === "text" || c.type === undefined))
      .map((c) => str(c.text))
      .join("");
    if (joined) return thinking + joined;
    if (thinking) return thinking;
  } else {
    const s = str(json.content);
    if (s) return s;
  }

  const outText = str(json.output_text);
  if (outText) return outText;

  if (Array.isArray(json.output)) {
    const joined = json.output
      .filter(isObj)
      .map((o) => {
        if (!Array.isArray(o.content)) return "";
        return o.content
          .filter(
            (c): c is Obj =>
              isObj(c) &&
              (c.type === "text" ||
                c.type === "output_text" ||
                c.type === "input_text" ||
                c.type === "summary_text")
          )
          .map((c) => str(c.text))
          .join("");
      })
      .join("");
    if (joined) return joined;
  }

  return str(json.text);
}
