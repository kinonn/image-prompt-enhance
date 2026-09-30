// End-to-end check of the refactored proxy routes against the fake provider.
// Exercises the real Next.js server and the real client SSE parser:
// endpoint dispatch per model family, SSE passthrough, non-streaming
// unwrapping, effort translation, and the /messages max_tokens cap.
import fs from "node:fs";
import { spawn } from "node:child_process";
import { parseSSEChunk } from "./src/lib/stream.ts";

const BASE = process.env.APP_URL || "http://127.0.0.1:3100";
const PROVIDER = { baseUrl: `${process.env.FAKE_URL || "http://127.0.0.1:9099"}/v1`, apiKey: "sk-test" };
const DIR = process.env.RECORD_DIR || `${process.cwd()}/.proxy-e2e-records`;
const IMG = "aGVsbG8=";

let failures = 0;
const check = (name, cond, detail = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${cond ? "" : ` — ${detail}`}`);
  if (!cond) failures += 1;
};

/** Replay an SSE body through the app's own parser and return the text a user would see. */
const render = (sseText) => {
  let out = "";
  for (const part of sseText.split("\n\n")) {
    if (part.includes("data:")) parseSSEChunk(part, (t) => (out += t));
  }
  return out;
};

const post = async (path, body) => {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { res, text: await res.text() };
};

const bodies = () =>
  fs
    .readdirSync(DIR)
    .map((f) => JSON.parse(fs.readFileSync(`${DIR}/${f}`, "utf8")))
    .filter((r) => r.body) // skip bodyless requests (e.g. health checks)
    .map((r) => ({ url: r.url, headers: r.headers, body: JSON.parse(r.body) }));

const run = async () => {
  // Start from a clean slate: earlier runs would pollute the upstream assertions.
  fs.mkdirSync(DIR, { recursive: true });
  for (const f of fs.readdirSync(DIR)) {
    // Only ever delete our own recordings (NNN-METHOD-_v1_path.json).
    if (!/^\d{3}-[A-Z]+-_v1_/.test(f)) continue;
    fs.rmSync(`${DIR}/${f}`);
  }

  // --- 1. describe + refine + chat across all three endpoint families
  for (const [model, expect, streamed] of [
    ["glm-5.3", "thinking...hello world", true],
    ["claude-sonnet-4-5", "ponderingrefined output", true],
    ["gpt-4o", "non-streaming reply", false],
  ]) {
    const common = { provider: PROVIDER, model, effort: "medium" };
    let r = await post("/api/refine", { prompt: "a cat", instruction: "more cinematic", ...common });
    check(`refine/${model} content-type`, streamed
      ? r.res.headers.get("content-type")?.includes("text/event-stream")
      : r.res.headers.get("content-type")?.includes("text/plain"), r.res.headers.get("content-type") || "none");
    check(`refine/${model} -> "${expect}"`, (streamed ? render(r.text) : r.text) === expect, JSON.stringify(streamed ? render(r.text) : r.text));

    r = await post("/api/describe", { imageBase64: IMG, mime: "image/jpeg", describePrompt: "custom describe prompt", ...common });
    check(`describe/${model} -> "${expect}"`, (streamed ? render(r.text) : r.text) === expect, JSON.stringify(streamed ? render(r.text) : r.text));

    r = await post("/api/chat", {
      messages: [
        { role: "user", content: "what is this?" },
        { role: "assistant", content: "a cat" },
        { role: "user", content: "and now?" },
      ],
      imageBase64: IMG, mime: "image/jpeg", ...common,
    });
    check(`chat/${model} -> "${expect}"`, (streamed ? render(r.text) : r.text) === expect, JSON.stringify(streamed ? render(r.text) : r.text));
  }

  // Snapshot the 3x3 matrix before the failure-path tests add their own calls.
  const matrix = bodies();

  // --- 2. 400s keep each route's own message, as JSON
  for (const [path, body, want] of [
    ["/api/refine", { prompt: "", instruction: "x", provider: PROVIDER, model: "glm-5.3" }, "Missing prompt"],
    ["/api/chat", { messages: [], provider: PROVIDER, model: "glm-5.3" }, "Missing messages"],
    ["/api/describe", { imageBase64: IMG, provider: { baseUrl: "" }, model: "glm-5.3" }, "Missing image"],
  ]) {
    const r = await post(path, body);
    check(`${path} 400 status`, r.res.status === 400, String(r.res.status));
    check(`${path} 400 message`, JSON.parse(r.text).error?.includes(want), r.text.slice(0, 160));
  }

  // --- 3. upstream failure propagates status + body
  let r = await post("/api/refine", {
    prompt: "a", instruction: "b",
    provider: { baseUrl: PROVIDER.baseUrl.replace(/\/v1$/, "/nowhere/v1"), apiKey: "k" },
    model: "glm-5.3",
  });
  check("upstream 404 propagated", r.res.status === 404, `${r.res.status} ${r.text.slice(0, 120)}`);
  check("upstream body surfaced", JSON.parse(r.text).error?.includes("Provider error 404"), r.text.slice(0, 200));

  // --- 4. SSRF guard still enforced through the shared proxy
  r = await post("/api/refine", { prompt: "a", instruction: "b", provider: { baseUrl: "http://169.254.169.254/v1" }, model: "glm-5.3" });
  check("metadata IP blocked", r.res.status === 500 && JSON.parse(r.text).error?.includes("blocked address"), `${r.res.status} ${r.text.slice(0, 160)}`);
  r = await post("/api/chat", { messages: [{ role: "user", content: "x" }], provider: { baseUrl: "file:///etc/passwd" }, model: "glm-5.3" });
  check("non-http scheme blocked", r.res.status === 500 && JSON.parse(r.text).error?.includes("http or https"), `${r.res.status} ${r.text.slice(0, 160)}`);

  // --- 5. what actually went upstream (3x3 matrix only; failure paths are excluded)
  const sent = matrix;
  const llm = sent.filter((b) => b.body.model);
  check("all 9 LLM calls recorded", llm.length === 9, `got ${llm.length}`);
  check("api key sent as Bearer + x-api-key",
    llm.every((b) => b.headers.authorization === "Bearer sk-test" && b.headers["x-api-key"] === "sk-test"),
    JSON.stringify(llm[0]?.headers));

  const dispatches = { "chat/completions": 0, messages: 0, responses: 0 };
  for (const b of llm) {
    if (b.url.endsWith("/chat/completions")) dispatches["chat/completions"] += 1;
    else if (b.url.endsWith("/messages")) dispatches.messages += 1;
    else if (b.url.endsWith("/responses")) dispatches.responses += 1;
  }
  check("endpoint dispatch 3/3/3", dispatches["chat/completions"] === 3 && dispatches.messages === 3 && dispatches.responses === 3, JSON.stringify(dispatches));

  const msgs = llm.filter((b) => b.url.endsWith("/messages"));
  check("every /messages call uses max_tokens=32768", msgs.every((b) => b.body.max_tokens === 32768),
    JSON.stringify(msgs.map((b) => `${b.body.model}=${b.body.max_tokens}`)));

  check("effort -> reasoning_effort on chat/completions", llm.filter((b) => b.url.endsWith("/chat/completions")).every((b) => b.body.reasoning_effort === "medium"), "mismatch");
  check("effort -> thinking.budget_tokens on /messages", msgs.every((b) => b.body.thinking?.budget_tokens === 4096),
    JSON.stringify(msgs.map((b) => b.body.thinking)));
  check("effort -> reasoning.effort on /responses", llm.filter((b) => b.url.endsWith("/responses")).every((b) => b.body.reasoning?.effort === "medium"), "mismatch");

  // Effort "Default" must send no effort parameter at all.
  r = await post("/api/refine", { prompt: "a cat", instruction: "brighter", provider: PROVIDER, model: "glm-5.3", effort: "" });
  const last = bodies().at(-1).body;
  check("empty effort sends no effort param", !("reasoning_effort" in last) && !("reasoning" in last) && !("thinking" in last), JSON.stringify(last));

  // Junk effort from a hand-rolled request must be dropped, not forwarded.
  r = await post("/api/refine", { prompt: "a cat", instruction: "brighter", provider: PROVIDER, model: "claude-sonnet-4-5", effort: "ultra-max" });
  const junk = bodies().at(-1).body;
  check("invalid effort rejected -> Default", !("thinking" in junk), JSON.stringify(junk));

  // Image must reach the provider on every kind.
  const withImage = {
    "chat/completions": llm.find((b) => b.url.endsWith("/chat/completions") && b.body.messages?.[2]?.content?.[1])?.body,
    messages: llm.find((b) => b.url.endsWith("/messages") && b.body.messages?.at(-1)?.content?.[1])?.body,
    responses: llm.find((b) => b.url.endsWith("/responses") && b.body.input?.at(-1)?.content?.[1])?.body,
  };
  check("image attached on all three kinds", Object.values(withImage).every(Boolean), JSON.stringify(Object.keys(withImage)));

  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
  // Return the code rather than calling process.exit here, so the caller can
  // tear down the fake provider before the process ends.
  return failures === 0 ? 0 : 1;
};

/** Start the fake provider unless one is already listening (A/B runs reuse it). */
const startFakeProvider = async () => {
  const port = PROVIDER.baseUrl.match(/:(\d+)\//)?.[1] || "9099";
  try {
    const probe = await fetch(`http://127.0.0.1:${port}/v1/models`, { signal: AbortSignal.timeout(1000) });
    if (probe.ok) return null;
  } catch { /* not running — fall through and spawn it */ }

  const child = spawn(process.execPath, ["fake-provider.mjs"], {
    stdio: "ignore",
    env: { ...process.env, RECORD_DIR: DIR },
  });
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 250));
    try {
      const probe = await fetch(`http://127.0.0.1:${port}/v1/models`, { signal: AbortSignal.timeout(1000) });
      if (probe.ok) return child;
    } catch { /* keep waiting */ }
  }
  child.kill();
  throw new Error(`fake provider did not come up on port ${port}`);
};

let fake = null;
let code = 2;
startFakeProvider()
  .then((child) => { fake = child; return run(); })
  .then((c) => { code = c; })
  .catch((e) => { console.error("harness error:", e); code = 2; })
  .finally(() => { if (fake) fake.kill(); })
  .then(() => process.exit(code));
