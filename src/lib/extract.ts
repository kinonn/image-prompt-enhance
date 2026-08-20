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

  const choices = Array.isArray(json.choices) ? json.choices : [];
  const first = choices[0];
  if (isObj(first)) {
    const msgText = isObj(first.message) ? str(first.message.content) : "";
    if (msgText) return msgText;
    const firstText = str(first.text);
    if (firstText) return firstText;
    const deltaText = isObj(first.delta) ? str(first.delta.content) : "";
    if (deltaText) return deltaText;
  }

  if (Array.isArray(json.content)) {
    const joined = json.content
      .filter((c): c is Obj => isObj(c) && (c.type === "text" || c.type === undefined))
      .map((c) => str(c.text))
      .join("");
    if (joined) return joined;
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
              isObj(c) && (c.type === "text" || c.type === "output_text" || c.type === "input_text")
          )
          .map((c) => str(c.text))
          .join("");
      })
      .join("");
    if (joined) return joined;
  }

  return str(json.text);
}
