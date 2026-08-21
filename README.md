# Image Prompt — Recreate any image

Simple, elegant Next.js app that turns an uploaded image into a detailed prompt to recreate it, with iterative natural-language refinement.

- **Upload image** → drag-drop / click / paste (PNG/JPEG/WebP, 10MB max, auto-resized to 1024px in-browser, never stored)
- **Generate prompt** → single-paragraph, paste-ready for SD/Midjourney/DALL·E via vision-capable LLM
- **Refine** → chat-like iterative edits (“more cinematic, add fog…”); the result streams into a dedicated **Refined Prompt** box while the Generated Prompt stays untouched, with copy + inline edit
- **Providers** → OpenCode Go (`https://opencode.ai/zen/go/v1`, see https://opencode.ai/docs/go) and Ollama (`http://localhost:11434/v1`) presets by default; add any OpenAI-compatible provider (OpenCode Zen `https://opencode.ai/zen/v1`, OpenRouter `https://openrouter.ai/api/v1`, LM Studio…) via gear → Providers. Keys in `localStorage`, proxied through Next.js API routes (no CORS, no exposure to git)
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

1. Click gear → **Providers** → set API key for OpenCode Go (subscribe at https://opencode.ai/auth, `/connect` → Go; or add custom provider → Test → Save). Go models: https://opencode.ai/zen/go/v1/models (e.g. `glm-5.3`, `kimi-k3`, `mimo-v2.5`)
2. In the config bar, pick Provider + Model (Refresh fetches `{baseUrl}/models`; for vision pick a vision-capable model — Go is coding-focused, so for image describe you may need Zen/OpenAI vision model e.g. `gpt-4o`, `claude-sonnet-4-5` via separate Zen provider)
3. Drop image → **Generate prompt** → copy / edit / **Refine** iteratively

## Configuration

- **Providers** stored in `localStorage:image-prompt-providers`. Defaults: `OpenCode Go` (`https://opencode.ai/zen/go/v1`, docs https://opencode.ai/docs/go, models `https://opencode.ai/zen/go/v1/models`) and `Ollama` (`http://localhost:11434/v1`, no key needed). Zen alternative: `https://opencode.ai/zen/v1`.
- **Add generic provider**: Name, Base URL (must be OpenAI-compatible `/v1`), API Key. `Test` pings `POST /api/models`. Supports OpenRouter (`https://openrouter.ai/api/v1`), Ollama local, etc.
- **Models**: fetched via `POST /api/models {baseUrl, apiKey}` proxy → `{models:[{id,name}]}`. Selection persisted in `localStorage`.
- **Ephemeral images**: resized via Canvas to JPEG 1024px q0.8, base64 in memory only, discarded on clear/reload. No server storage.

## API routes (proxied)

- `POST /api/models` → proxies `GET {baseUrl}/models`
- `POST /api/describe` → forwards vision request (`system: DESCRIBE_SYSTEM_PROMPT`, `user: [{text},{image_url}]`) streaming SSE
- `POST /api/refine` → forwards `REFINE_SYSTEM_PROMPT + original + instruction` streaming SSE

All LLM calls go through server to avoid CORS and keep keys off the client network tab (still in localStorage, never committed).

## Security / SSRF

The server-side proxy validates every provider `baseUrl` before fetching it (`src/lib/ssrf.ts`). Private/local network addresses (RFC1918, CGNAT, link-local, ULA) and `.local` (mDNS/Bonjour) hostnames are allowed so local LLM providers (Ollama, LM Studio, LAN devices like `mac-mini.local` or `192.168.1.50`) work. Only the cloud metadata endpoint (`169.254.169.254`), loopback, multicast, reserved, and unspecified addresses are refused. To permit additional hosts, set the comma-separated `ALLOWED_PROVIDER_HOSTS` env var.

Non-streaming providers that ignore `stream: true` are handled server-side: the single JSON response is unwrapped to plain text (`src/lib/extract.ts`) instead of being dropped by the SSE parser.

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
src/lib/{providers, prompts, image, llm, extract, ssrf, utils}.ts
src/components/{DropZone, PromptCard, RefineBar, SettingsDrawer, ui/*, theme-provider}
```

## Prompt engineering

- `DESCRIBE_SYSTEM_PROMPT` (lib/prompts.ts:1) — instructs single-paragraph, 80–180 words, subject/lighting/palette/composition/mood/background
- `REFINE_SYSTEM_PROMPT` (lib/prompts.ts:12) — applies instruction, preserves core scene unless told otherwise, returns only paragraph

## Notes

- Choose vision-capable models; non-vision models will error (shown in toast)
- Paste images with Ctrl+V anywhere after focusing page
- The **Remove** button under the image only removes the image — generated and refined prompts are kept
- Refine applies to the text in the Generated Prompt box; the result appears in the Refined Prompt box (copy it into the Generated Prompt box to chain further edits)

## License

MIT
