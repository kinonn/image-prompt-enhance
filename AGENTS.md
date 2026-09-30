<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Project: Image Prompt

Next.js 16 (App Router, TypeScript) app that turns an uploaded image into a detailed, paste-ready prompt (SD/Midjourney/DALL·E) with iterative natural-language refinement, plus a general-purpose chat with vision support. See `README.md` for setup, provider URLs, and Docker.

## Commands

- `npm run dev` — dev server
- `npm run build` / `npm run start` — production build / serve
- `npm run lint` — ESLint (next/core-web-vitals + typescript)
- `npm run test:proxy` — end-to-end check of the LLM routes against a fake provider (start the app on port 3100 first: `npm start -- -p 3100`). `next start` prints `"next start" does not work with "output: standalone"` — that warning is expected and harmless here; the server does serve routes and static assets correctly. Safe to run repeatedly.

## Architecture rules

- **All LLM calls go through server-side proxy routes** in `src/app/api/{models,describe,refine,chat}/route.ts`. Never call a provider directly from the client.
- **Every LLM generation route (`describe`, `refine`, `chat`) goes through `proxyLLMRequest`** (`src/lib/proxy.ts`), which owns the SSRF check, endpoint dispatch, upstream fetch, SSE passthrough, and the non-streaming fallback. A route validates its inputs, then only builds a payload — don't re-add `fetch`, header building, or response unwrapping to a route. `api/models` is the deliberate exception: it's a GET model-listing with no request body, payload builder, endpoint dispatch, or streaming, so it calls `assertSafeProviderUrl` and `fetch` itself. Don't "fix" it by routing it through `proxyLLMRequest`.
- **Every provider URL must be validated** with `assertSafeProviderUrl` (`src/lib/ssrf.ts`) before fetching. Private/local hosts are allowed; cloud metadata, loopback, multicast, reserved, and unspecified addresses are blocked.
- **Endpoint dispatch is centralized** in `src/lib/llm.ts` (`getEndpointKind` / `getEndpointUrl`): `/chat/completions` (OpenAI-style), `/responses` (Grok, GPT, Muse Spark), `/messages` (Claude, Gemini, Qwen, MiniMax on Go), and `/api/chat` (Ollama). Add new model families there, not in route handlers.
- **Ollama is a distinct endpoint kind** (`"ollama"`), not an OpenAI-compatible one. Its default `num_ctx` is 4096 — smaller than `REFINE_SYSTEM_PROMPT` — so requests carry `options.num_ctx`/`num_predict` via `buildOllamaPayload`, `content` is a plain string with images in a sibling `images[]` array, and the stream is NDJSON, not SSE. Two constraints are load-bearing: the compat `/v1` endpoint **silently ignores** `options`, and `/api/chat` **rejects** OpenAI content-part arrays outright.
- **Streaming**: use `streamResponse` / `parseSSEChunk` (`src/lib/stream.ts`). Providers that ignore `stream: true` are unwrapped server-side via `extractResponseText` (`src/lib/extract.ts`) — don't drop the non-streaming fallback.
- **Provider keys live in `localStorage`** (`image-prompt-providers`), never committed. Per-task provider/model selection is persisted under separate keys (generate / refine / chat).
- **State across routes** is kept in memory via `RetainedStateProvider` (`src/components/retained-state.tsx`) — cleared on refresh, not persisted.
- **Images are ephemeral**: resized in-browser (Canvas → JPEG 1024px q0.8), base64 in memory only, never stored server-side.
- **Optional Google OAuth** (`src/auth.ts`, NextAuth v5): when signed in, settings + app state are preserved in a server-side in-memory store (`src/lib/server-store.ts`, keyed by user id, exposed via `GET/PUT /api/state`) — survives refresh, lost on restart, single-instance only. Server is source of truth while logged in; localStorage is the anonymous fallback. Auth is optional — the login UI is hidden unless `AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET` are set.

## Conventions

- Path alias `@/*` → `src/*`.
- `react-hooks/set-state-in-effect` is intentionally disabled in `eslint.config.mjs` — don't re-enable it.
- Every `/messages` payload must use `ANTHROPIC_MAX_TOKENS` (`src/lib/llm.ts`), never a literal. It must exceed the largest thinking budget (`high` = 16384) because Anthropic rejects the request when `budget_tokens` is not strictly less than `max_tokens`. A lower cap reproduces the bug where reasoning models exhaust the cap and stream no answer.
- System prompts live in `src/lib/prompts.ts` (`DESCRIBE_SYSTEM_PROMPT`, `REFINE_SYSTEM_PROMPT`, `CHAT_SYSTEM_PROMPT`). The describe prompt is user-editable and persisted in `localStorage:image-prompt-describe-prompt`.
- Keep the `nextjs-agent-rules` block above intact — `next dev` re-adds it; add content outside the markers.
