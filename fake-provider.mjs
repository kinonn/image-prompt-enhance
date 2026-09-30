// Fake LLM provider used to exercise the real Next.js route handlers over HTTP.
// Records every request body it receives to $RECORD_DIR so the test can assert
// on what was actually sent upstream (e.g. max_tokens on /messages).
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const PORT = Number(process.env.FAKE_PORT || 9099);
const RECORD_DIR = process.env.RECORD_DIR || `${process.cwd()}/.proxy-e2e-records`;
let seq = 0;

fs.mkdirSync(RECORD_DIR, { recursive: true });

const sse = (res, events) => {
  res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" });
  for (const e of events) res.write(`data: ${JSON.stringify(e)}\n\n`);
  res.write("data: [DONE]\n\n");
  res.end();
};

const server = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    if (RECORD_DIR) {
      seq += 1;
      fs.writeFileSync(
        path.join(RECORD_DIR, `${String(seq).padStart(3, "0")}-${req.method}-${req.url.replace(/[/?]/g, "_")}.json`),
        JSON.stringify({ url: req.url, headers: req.headers, body }, null, 2),
      );
    }

    // Only serve the canonical /v1 base; anything else is a 404 like a real
    // provider hitting an unknown path.
    if (!req.url.startsWith("/v1/")) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: `no route for ${req.url}` }));
      return;
    }

    if (req.url.endsWith("/models")) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ data: [{ id: "fake-model" }] }));
      return;
    }

    if (req.url.endsWith("/chat/completions")) {
      sse(res, [
        { choices: [{ delta: { reasoning_content: "thinking..." } }] },
        { choices: [{ delta: { content: "hello " } }] },
        { choices: [{ delta: { content: "world" } }] },
      ]);
      return;
    }

    if (req.url.endsWith("/messages")) {
      sse(res, [
        { type: "content_block_delta", delta: { type: "thinking_delta", thinking: "pondering" } },
        { type: "content_block_delta", delta: { type: "text_delta", text: "refined output" } },
      ]);
      return;
    }

    if (req.url.endsWith("/responses")) {
      // Non-streaming provider: ignores stream:true and returns a single JSON body.
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ choices: [{ message: { content: "non-streaming reply" } }] }));
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: `no route for ${req.url}` }));
  });
});

server.listen(PORT, "127.0.0.1", () => console.log(`fake provider on http://127.0.0.1:${PORT}/v1`));
