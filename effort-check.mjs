import { applyThinkingEffort } from "./src/lib/llm.ts";

console.log(
  JSON.stringify({
    chat: applyThinkingEffort("chat", "high"),
    messages: applyThinkingEffort("messages", "low"),
    responses: applyThinkingEffort("responses", "medium"),
    default: applyThinkingEffort("chat", ""),
  })
);
