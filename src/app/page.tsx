"use client";

import * as React from "react";
import { Settings, Sparkles, Image as ImageIcon, Moon, Sun, Loader2, Trash2 } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { DropZone } from "@/components/DropZone";
import { PromptCard } from "@/components/PromptCard";
import { RefineBar } from "@/components/RefineBar";
import { SettingsDrawer } from "@/components/SettingsDrawer";
import { resizeImage } from "@/lib/image";
import { loadProviders, saveProviders, getSelectedProviderId, setSelectedProviderId, getSelectedModelId, setSelectedModelId, getProviderById } from "@/lib/providers";
import type { Provider, Model } from "@/lib/providers";
import { toast } from "sonner";

interface HistoryEntry {
  prompt: string;
  instruction: string;
  timestamp: number;
}

function parseSSEChunk(chunk: string, onText: (t: string) => void) {
  const lines = chunk.split("\n");
  for (const line of lines) {
    const t = line.trim();
    if (!t.startsWith("data:")) continue;
    const data = t.slice(5).trim();
    if (!data || data === "[DONE]" || data === "[done]") continue;
    try {
      const json = JSON.parse(data);

      // Skip thinking/reasoning — only final prompt text
      if (json.delta?.type === "thinking_delta" || json.delta?.thinking !== undefined || json.delta?.reasoning !== undefined) continue;
      if (json.delta?.type === "reasoning_delta") continue;
      if (json.type === "content_block_delta" && json.delta?.type === "thinking_delta") continue;

      const choiceDelta =
        json.choices?.[0]?.delta?.content ??
        json.choices?.[0]?.message?.content ??
        json.choices?.[0]?.text ??
        (typeof json.content === "string" ? json.content : "") ??
        "";
      if (typeof choiceDelta === "string" && choiceDelta) onText(choiceDelta);
      if (json.choices?.[0]?.delta?.text) onText(json.choices[0].delta.text);
      if (json.content && typeof json.content === "string" && !json.choices) onText(json.content);
      if (json.text && typeof json.text === "string" && !json.choices) onText(json.text);
      if (json.delta?.type === "text_delta" && typeof json.delta.text === "string") onText(json.delta.text);
      else if (json.delta?.text && typeof json.delta.text === "string" && json.delta?.type !== "thinking_delta") {
        if (json.delta.thinking === undefined && json.delta.reasoning === undefined) onText(json.delta.text);
      }
      if (json.delta?.delta?.text) onText(json.delta.delta.text);
      if (json.type?.includes("output_text") && typeof json.delta === "string") onText(json.delta);
      if (json.output_text && typeof json.output_text === "string") onText(json.output_text);
    } catch {
      // ignore keepalive
    }
  }
}

async function streamResponse(res: Response, onText: (t: string) => void): Promise<string> {
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const data = await res.json().catch(() => null);
    const msg = data?.error || `Request failed (${res.status})`;
    throw new Error(msg);
  }

  if (!res.body) {
    // fallback non-stream JSON
    if (contentType.includes("application/json")) {
      const j = await res.json();
      const text =
        j.choices?.[0]?.message?.content ||
        j.choices?.[0]?.text ||
        (Array.isArray(j.content)
          ? j.content
              .filter((c: { type?: string }) => c.type === "text" || c.type === undefined)
              .map((c: { text?: string }) => c.text || "")
              .join("")
          : j.content) ||
        j.output_text ||
        j.text ||
        "";
      onText(text);
      return text;
    }
    const text = await res.text();
    onText(text);
    return text;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let full = "";
  let buffer = "";
  const isSSE = contentType.includes("text/event-stream");

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    buffer += chunk;

    const hasData = buffer.includes("data:");
    // Plain text fallback only for non-SSE responses
    if (!isSSE && !hasData) {
      onText(chunk);
      full += chunk;
      buffer = "";
      continue;
    }
    // SSE mode but no complete data: frame yet — keep buffering
    if (!hasData) continue;

    // SSE: process lines ending with \n\n
    const parts = buffer.split("\n\n");
    // keep last incomplete part in buffer
    buffer = parts.pop() || "";
    for (const part of parts) {
      parseSSEChunk(part, (t) => {
        full += t;
        onText(t);
      });
    }
  }
  // flush remaining
  if (buffer) {
    if (buffer.includes("data:")) {
      parseSSEChunk(buffer, (t) => {
        full += t;
        onText(t);
      });
    } else if (!isSSE && buffer.trim()) {
      onText(buffer);
      full += buffer;
    }
  }
  return full;
}

export default function Home() {
  const { theme, setTheme } = useTheme();
  const [providers, setProviders] = React.useState<Provider[]>([]);
  const [selectedProviderId, setSelectedProviderIdState] = React.useState<string>("");
  const [selectedModel, setSelectedModel] = React.useState<string>("");
  const [modelsCache, setModelsCache] = React.useState<Record<string, Model[]>>({});
  const [loadingModelsFor, setLoadingModelsFor] = React.useState<string | null>(null);

  const [file, setFile] = React.useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  const [imageBase64, setImageBase64] = React.useState<string | null>(null);
  const [imageMime, setImageMime] = React.useState<string>("image/jpeg");

  const [history, setHistory] = React.useState<HistoryEntry[]>([]);
  const [currentIdx, setCurrentIdx] = React.useState(-1);
  const [isDescribing, setIsDescribing] = React.useState(false);
  const [isRefining, setIsRefining] = React.useState(false);
  const [streamingText, setStreamingText] = React.useState("");

  // Single source of truth for the Generated Prompt box. It starts empty and is
  // directly editable (typing works without uploading an image). Generation and
  // refinement commit their results into it; history keeps snapshots for undo/redo.
  const [promptText, setPromptText] = React.useState("");

  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);

  const displayPrompt = isDescribing || isRefining ? streamingText : promptText;

  // init
  React.useEffect(() => {
    setMounted(true);
    const p = loadProviders();
    setProviders(p);
    const selP = getSelectedProviderId() || p[0]?.id || "";
    setSelectedProviderIdState(selP);
    const selM = getSelectedModelId() || "";
    setSelectedModel(selM);
  }, []);

  // Persist providers
  const handleSaveProviders = (next: Provider[]) => {
    setProviders(next);
    saveProviders(next);
    // if selected provider removed, fallback
    if (!next.find((p) => p.id === selectedProviderId)) {
      const fallback = next[0]?.id || "";
      setSelectedProviderIdState(fallback);
      setSelectedProviderId(fallback);
      setSelectedModel("");
      setSelectedModelId("");
    }
  };

  const selectedProvider = getProviderById(providers, selectedProviderId);

  // Fetch models when provider changes
  const fetchModels = React.useCallback(async (provider: Provider) => {
    setLoadingModelsFor(provider.id);
    try {
      const res = await fetch("/api/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseUrl: provider.baseUrl, apiKey: provider.apiKey }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to fetch models");
      const models: Model[] = data.models || [];
      setModelsCache((prev) => ({ ...prev, [provider.id]: models }));
      // auto-select first model if none selected or selected not in list
      if (models.length > 0) {
        const current = getSelectedModelId();
        const exists = current && models.find((m) => m.id === current);
        if (!current || !exists) {
          const pick = models.find((m) => /vision|gpt-4o|claude|gemini|vision/i.test(m.id))?.id || models[0].id;
          // only auto-set if we're on this provider and no manual selection yet
          if (provider.id === (getSelectedProviderId() || providers[0]?.id)) {
            // don't override if user already has something? check current state
            // Use callback to avoid stale
            setSelectedModel((prev) => (prev && models.find((m) => m.id === prev) ? prev : pick));
            setSelectedModelId(pick);
          }
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(`Failed to fetch models: ${msg}`);
    } finally {
      setLoadingModelsFor(null);
    }
  }, [providers]);

  React.useEffect(() => {
    if (selectedProvider) {
      // auto fetch if not cached
      if (!modelsCache[selectedProvider.id]) {
        fetchModels(selectedProvider);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProviderId]);

  // Keep localStorage synced on selection changes
  const onSelectProvider = (id: string) => {
    setSelectedProviderIdState(id);
    setSelectedProviderId(id);
    const cached = modelsCache[id];
    if (cached?.length) {
      const found = cached.find((m) => m.id === selectedModel);
      if (!found) {
        const pick = cached[0].id;
        setSelectedModel(pick);
        setSelectedModelId(pick);
      }
    } else {
      // will fetch, keep old or clear?
      setSelectedModel("");
    }
  };

  const onSelectModel = (id: string) => {
    setSelectedModel(id);
    setSelectedModelId(id);
  };

  // File handling
  const handleFileSelect = async (f: File) => {
    setFile(f);
    const url = URL.createObjectURL(f);
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return url;
    });
    // resize for LLM
    try {
      const { base64, mime } = await resizeImage(f, 1024, 0.8);
      setImageBase64(base64);
      setImageMime(mime);
    } catch (e) {
      toast.error("Failed to process image");
      console.error(e);
    }
    // reset history
    setHistory([]);
    setCurrentIdx(-1);
    setStreamingText("");
    setPromptText("");
  };

  const handleClear = () => {
    setFile(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setImageBase64(null);
    setHistory([]);
    setCurrentIdx(-1);
    setStreamingText("");
    setPromptText("");
  };

  const handleGenerate = async () => {
    if (!file || !imageBase64 || !selectedProvider || !selectedModel) {
      toast.error("Upload an image and select provider/model first");
      return;
    }
    if (!selectedProvider.apiKey && !selectedProvider.baseUrl.includes("localhost") && !selectedProvider.baseUrl.includes("127.0.0.1")) {
      // warn but allow (maybe provider doesn't need key)
    }

    setIsDescribing(true);
    setStreamingText("");
    setHistory([]);
    setCurrentIdx(-1);

    try {
      const res = await fetch("/api/describe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64,
          mime: imageMime,
          provider: { baseUrl: selectedProvider.baseUrl, apiKey: selectedProvider.apiKey },
          model: selectedModel,
        }),
      });

      if (!res.ok) {
        const ct = res.headers.get("content-type") || "";
        let msg = `Provider error ${res.status}`;
        if (ct.includes("json")) {
          const j = await res.json().catch(() => null);
          msg = j?.error || msg;
        } else {
          msg = (await res.text()).slice(0, 600) || msg;
        }
        throw new Error(msg);
      }

      let full = "";
      await streamResponse(res, (chunk) => {
        full += chunk;
        setStreamingText(full);
      });

      if (!full.trim()) throw new Error("Empty response from model");

      const entry: HistoryEntry = { prompt: full.trim(), instruction: "Initial generation", timestamp: Date.now() };
      setHistory([entry]);
      setCurrentIdx(0);
      setPromptText(full.trim());
      toast.success("Prompt generated");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(msg);
      console.error(e);
    } finally {
      setIsDescribing(false);
      setStreamingText((prev) => prev || "");
      // keep streamingText briefly then clear? We'll clear after setting history so display switches
      setTimeout(() => setStreamingText(""), 100);
    }
  };

  const handleRefine = async (instruction: string) => {
    // Refine operates only on the current prompt text — the image is never
    // resent (the /api/refine route takes prompt + instruction only).
    const basePrompt = promptText.trim();
    if (!basePrompt) {
      toast.error("Nothing to refine yet — type a prompt above or generate one from an image.");
      return;
    }
    if (!selectedProvider || !selectedModel) {
      toast.error("Select provider/model");
      return;
    }
    setIsRefining(true);
    setStreamingText("");

    try {
      const res = await fetch("/api/refine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: basePrompt,
          instruction,
          provider: { baseUrl: selectedProvider.baseUrl, apiKey: selectedProvider.apiKey },
          model: selectedModel,
        }),
      });

      if (!res.ok) {
        const ct = res.headers.get("content-type") || "";
        let msg = `Provider error ${res.status}`;
        if (ct.includes("json")) {
          const j = await res.json().catch(() => null);
          msg = j?.error || msg;
        } else {
          msg = (await res.text()).slice(0, 600) || msg;
        }
        throw new Error(msg);
      }

      let full = "";
      await streamResponse(res, (chunk) => {
        full += chunk;
        setStreamingText(full);
      });

      if (!full.trim()) throw new Error("Empty refinement");

      const entry: HistoryEntry = { prompt: full.trim(), instruction, timestamp: Date.now() };
      // If we're not at latest, truncate forward history (like undo redo)
      setHistory((prev) => {
        const sliced = prev.slice(0, currentIdx + 1);
        return [...sliced, entry];
      });
      setCurrentIdx((prev) => prev + 1);
      setPromptText(full.trim());
      toast.success("Prompt refined");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(msg);
    } finally {
      setIsRefining(false);
      setTimeout(() => setStreamingText(""), 100);
    }
  };

  const handleSelectHistory = (idx: number) => {
    setCurrentIdx(idx);
    setPromptText(history[idx]?.prompt ?? "");
    setStreamingText("");
  };

  const handleUndo = () => {
    if (currentIdx <= 0) return;
    const ni = currentIdx - 1;
    setCurrentIdx(ni);
    setPromptText(history[ni]?.prompt ?? "");
  };
  const handleRedo = () => {
    if (currentIdx >= history.length - 1) return;
    const ni = currentIdx + 1;
    setCurrentIdx(ni);
    setPromptText(history[ni]?.prompt ?? "");
  };

  if (!mounted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
      </div>
    );
  }

  const canGenerate = !!file && !!imageBase64 && !!selectedProvider && !!selectedModel && !isDescribing && !isRefining;

  return (
    <div className="flex min-h-screen flex-col">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-zinc-200 bg-white/80 backdrop-blur supports-[backdrop-filter]:bg-white/60 dark:border-zinc-800 dark:bg-zinc-950/80">
        <div className="mx-auto flex h-[64px] max-w-5xl items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 shrink-0">
              <Sparkles className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h1 className="text-[15px] font-semibold tracking-tight leading-none">Image Prompt</h1>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 hidden sm:block">Turn any image into a recreate-ready prompt</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} className="h-9 w-9">
              <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
              <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
              <span className="sr-only">Toggle theme</span>
            </Button>
            <Button variant="outline" size="sm" onClick={() => setSettingsOpen(true)} className="h-9">
              <Settings className="h-4 w-4" />
              <span className="hidden sm:inline">Providers</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
        <div className="space-y-6">
          {/* Drop zone */}
          <DropZone
            onFileSelect={handleFileSelect}
            previewUrl={previewUrl}
            onClear={handleClear}
            fileName={file?.name}
            disabled={isDescribing || isRefining}
          />

          {/* Generate button */}
          {file && (
            <div className="flex gap-2">
              <Button onClick={handleGenerate} disabled={!canGenerate} className="flex-1 h-11 text-[15px] font-medium" title={history.length > 0 ? "Re-run the image description; this overwrites the current prompt. Use Refine instead to edit it." : undefined}>
                {isDescribing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {isDescribing ? "Generating prompt..." : history.length === 0 ? "Generate prompt" : "Re-describe from image"}
              </Button>
              {history.length > 0 && (
                <Button
                  variant="outline"
                  onClick={handleClear}
                  disabled={isDescribing || isRefining}
                  className="h-11 px-4"
                  title="Clear image and prompt"
                >
                  <Trash2 className="h-4 w-4" />
                  Clear
                </Button>
              )}
            </div>
          )}

          {/* Prompt card */}
          <PromptCard
            prompt={displayPrompt}
            isStreaming={isDescribing || isRefining}
            onChangePrompt={setPromptText}
            version={currentIdx + 1}
            totalVersions={history.length}
            onUndo={handleUndo}
            onRedo={handleRedo}
            canUndo={currentIdx > 0}
            canRedo={currentIdx < history.length - 1}
          />

          {/* Refine */}
          <RefineBar
            hasPrompt={!!promptText}
            isRefining={isRefining}
            onRefine={handleRefine}
            history={history}
            onSelectHistory={handleSelectHistory}
            currentIndex={currentIdx}
            disabled={isDescribing}
            result={promptText}
          />

          {/* Footer hints */}
          <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-lg bg-zinc-100 dark:bg-zinc-800">
                <ImageIcon className="h-4 w-4 text-zinc-600 dark:text-zinc-400" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium">How it works</p>
                <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                  1. Default is <strong>OpenCode Go</strong> (<code className="rounded bg-zinc-100 px-1 py-0.5 font-mono text-xs dark:bg-zinc-800">https://opencode.ai/zen/go/v1</code> — coding models like <code>glm-5.3</code>, <code>kimi-k3</code>). For image describe you need a vision model — add <strong>OpenCode Zen</strong> (<code>https://opencode.ai/zen/v1</code>) via gear → Providers and pick e.g. <code className="rounded bg-zinc-100 px-1 py-0.5 font-mono text-xs dark:bg-zinc-800">gpt-4o</code> / <code className="rounded bg-zinc-100 px-1 py-0.5 font-mono text-xs dark:bg-zinc-800">claude-sonnet-4-5</code>).<br />
                  2. Upload → Generate builds a single-paragraph prompt.<br />
                  3. Refine iteratively: “make it watercolor”, “add fog”, etc. Edit inline anytime. Copy when ready.
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>

      <footer className="border-t border-zinc-200 py-6 text-center text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
        <div className="mx-auto max-w-3xl px-4">
          <p>
            Ephemeral by design — images are resized in-browser and never stored. Providers via server proxy.
          </p>
        </div>
      </footer>

      <SettingsDrawer
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        providers={providers}
        onSaveProviders={handleSaveProviders}
        modelsCache={modelsCache}
        onRefreshModels={fetchModels}
        loadingModelsFor={loadingModelsFor}
        selectedProviderId={selectedProviderId}
        onSelectProvider={onSelectProvider}
        selectedModel={selectedModel}
        onSelectModel={onSelectModel}
      />
    </div>
  );
}
