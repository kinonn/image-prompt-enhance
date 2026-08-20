# Image Prompt — Recreate any image

Simple, elegant Next.js app that turns an uploaded image into a detailed prompt to recreate it, with iterative natural-language refinement.

- **Upload image** → drag-drop / click / paste (PNG/JPEG/WebP, 10MB max, auto-resized to 1024px in-browser, never stored)
- **Generate prompt** → single-paragraph, paste-ready for SD/Midjourney/DALL·E via vision-capable LLM
- **Refine** → chat-like iterative edits (“more cinematic, add fog…”) with history + undo/redo + inline edit + copy
- **Providers** → OpenCode Zen preset (`https://api.opencode.ai/v1`) by default; add any OpenAI-compatible provider (OpenRouter, Ollama `http://localhost:11434/v1`, LM Studio…) via gear → Providers. Keys in `localStorage`, proxied through Next.js API routes (no CORS, no exposure to git)
- **Streaming** → token-by-token
- **Theme** → minimal light/dark, responsive, Tailwind + shadcn/ui

## Stack

Next.js 16 (App Router, TS) • Tailwind v4 • shadcn/ui • next-themes • sonner • Edge-ready Node runtime • Docker (standalone output)

## Quick start (local)

```bash
npm install
npm run dev
# open http://localhost:3000
```

1. Click gear → **Providers** → set API key for OpenCode Zen (or add custom provider → Test → Save)
2. In the config bar, pick Provider + Model (Refresh fetches `/v1/models`; pick a vision model e.g. `gpt-4o`, `claude-3.5-sonnet`, `gemini-1.5-pro`)
3. Drop image → **Generate prompt** → copy / edit / **Refine** iteratively

## Configuration

- **Providers** stored in `localStorage:image-prompt-providers`. Default: `OpenCode Zen` (`https://api.opencode.ai/v1`).
- **Add generic provider**: Name, Base URL (must be OpenAI-compatible `/v1`), API Key. `Test` pings `POST /api/models`. Supports OpenRouter (`https://openrouter.ai/api/v1`), Ollama local, etc.
- **Models**: fetched via `POST /api/models {baseUrl, apiKey}` proxy → `{models:[{id,name}]}`. Selection persisted in `localStorage`.
- **Ephemeral images**: resized via Canvas to JPEG 1024px q0.8, base64 in memory only, discarded on clear/reload. No server storage.

## API routes (proxied)

- `POST /api/models` → proxies `GET {baseUrl}/models`
- `POST /api/describe` → forwards vision request (`system: DESCRIBE_SYSTEM_PROMPT`, `user: [{text},{image_url}]`) streaming SSE
- `POST /api/refine` → forwards `REFINE_SYSTEM_PROMPT + original + instruction` streaming SSE

All LLM calls go through server to avoid CORS and keep keys off the client network tab (still in localStorage, never committed).

## Docker (production)

```bash
docker build -t image-prompt-enhance .
docker run -p 3000:3000 image-prompt-enhance
# or
docker compose up --build
# open http://localhost:3000
```

Standalone output (`next.config.ts: output:"standalone"`). No env vars required.

## Project layout

```
src/app/page.tsx        # orchestration (upload → generate → refine + provider/model selectors)
src/app/api/{models,describe,refine}/route.ts
src/lib/{providers, prompts, image, utils}.ts
src/components/{DropZone, PromptCard, RefineBar, SettingsDrawer, ui/*, theme-provider}
```

## Prompt engineering

- `DESCRIBE_SYSTEM_PROMPT` (lib/prompts.ts:1) — instructs single-paragraph, 80–180 words, subject/lighting/palette/composition/mood/background
- `REFINE_SYSTEM_PROMPT` (lib/prompts.ts:12) — applies instruction, preserves core scene unless told otherwise, returns only paragraph

## Notes

- Choose vision-capable models; non-vision models will error (shown in toast)
- Paste images with Ctrl+V anywhere after focusing page
- Copy + inline edit + history navigation (pill timeline + undo/redo)

## License

MIT
