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

## Architecture rules

- **All LLM calls go through server-side proxy routes** in `src/app/api/{models,describe,refine,chat}/route.ts`. Never call a provider directly from the client.
- **Every provider URL must be validated** with `assertSafeProviderUrl` (`src/lib/ssrf.ts`) before fetching. Private/local hosts are allowed; cloud metadata, loopback, multicast, reserved, and unspecified addresses are blocked.
- **Endpoint dispatch is centralized** in `src/lib/llm.ts` (`getEndpointKind` / `getEndpointUrl`): `/chat/completions` (OpenAI-style), `/responses` (Grok, GPT, Muse Spark), `/messages` (Claude, Gemini, Qwen, MiniMax on Go). Add new model families there, not in route handlers.
- **Streaming**: use `streamResponse` / `parseSSEChunk` (`src/lib/stream.ts`). Providers that ignore `stream: true` are unwrapped server-side via `extractResponseText` (`src/lib/extract.ts`) — don't drop the non-streaming fallback.
- **Provider keys live in `localStorage`** (`image-prompt-providers`), never committed. Per-task provider/model selection is persisted under separate keys (generate / refine / chat).
- **State across routes** is kept in memory via `RetainedStateProvider` (`src/components/retained-state.tsx`) — cleared on refresh, not persisted.
- **Images are ephemeral**: resized in-browser (Canvas → JPEG 1024px q0.8), base64 in memory only, never stored server-side.

## Conventions

- Path alias `@/*` → `src/*`.
- `react-hooks/set-state-in-effect` is intentionally disabled in `eslint.config.mjs` — don't re-enable it.
- System prompts live in `src/lib/prompts.ts` (`DESCRIBE_SYSTEM_PROMPT`, `REFINE_SYSTEM_PROMPT`, `CHAT_SYSTEM_PROMPT`). The describe prompt is user-editable and persisted in `localStorage:image-prompt-describe-prompt`.
- Keep the `nextjs-agent-rules` block above intact — `next dev` re-adds it; add content outside the markers.
