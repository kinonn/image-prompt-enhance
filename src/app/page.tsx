"use client";

import * as React from "react";
import { Settings, Sparkles, Moon, Sun, Loader2, Trash2 } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { DropZone } from "@/components/DropZone";
import { PromptCard } from "@/components/PromptCard";
import { RefineBar } from "@/components/RefineBar";
import { SettingsDrawer } from "@/components/SettingsDrawer";
import { resizeImage } from "@/lib/image";
import {
  loadProviders,
  saveProviders,
  getSelectedProviderId,
  setSelectedProviderId,
  getSelectedModelId,
  setSelectedModelId,
  getSelectedRefineProviderId,
  setSelectedRefineProviderId,
  getSelectedRefineModelId,
  setSelectedRefineModelId,
  getProviderById,
} from "@/lib/providers";
import type { Provider, Model } from "@/lib/providers";
import { loadDescribePrompt } from "@/lib/prompts";
import { toast } from "sonner";

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
  // Generated Prompt (describe) — its own provider/model
  const [selectedProviderId, setSelectedProviderIdState] = React.useState<string>("");
  const [selectedModel, setSelectedModel] = React.useState<string>("");
  // Refined Prompt — independent provider/model so users can mix models
  const [refineProviderId, setRefineProviderIdState] = React.useState<string>("");
  const [refineModel, setRefineModel] = React.useState<string>("");
  const [modelsCache, setModelsCache] = React.useState<Record<string, Model[]>>({});
  const [loadingModelsFor, setLoadingModelsFor] = React.useState<string | null>(null);

  const [file, setFile] = React.useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  const [imageBase64, setImageBase64] = React.useState<string | null>(null);
  const [imageMime, setImageMime] = React.useState<string>("image/jpeg");

  const [isDescribing, setIsDescribing] = React.useState(false);
  const [isRefining, setIsRefining] = React.useState(false);
  const [streamingText, setStreamingText] = React.useState("");

  // Single source of truth for the Generated Prompt box. It starts empty and is
  // directly editable (typing works without uploading an image). Generation
  // commits its result here; refinement leaves it untouched.
  const [promptText, setPromptText] = React.useState("");

  // Output of the latest refinement, shown in the "Refined Prompt" box inside
  // the RefineBar.
  const [refinedText, setRefinedText] = React.useState("");

  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);

  // Only image description streams into the Generated Prompt box; refinement
  // streams into the Refined Prompt box instead.
  const displayPrompt = isDescribing ? streamingText : promptText;

  // init
  React.useEffect(() => {
    setMounted(true);
    const p = loadProviders();
    setProviders(p);
    const selP = getSelectedProviderId() || p[0]?.id || "";
    setSelectedProviderIdState(selP);
    const selM = getSelectedModelId() || "";
    setSelectedModel(selM);
    // Refine defaults to the generate selection until the user picks its own
    const selRP = getSelectedRefineProviderId() || selP;
    setRefineProviderIdState(selRP);
    const selRM = getSelectedRefineModelId() || "";
    setRefineModel(selRM);
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
    // same for refine when its provider was removed
    if (!next.find((p) => p.id === refineProviderId)) {
      const fallback = next.find((p) => p.id === selectedProviderId)?.id || next[0]?.id || "";
      setRefineProviderIdState(fallback);
      setSelectedRefineProviderId(fallback);
      setRefineModel("");
      setSelectedRefineModelId("");
    }
  };

  const selectedProvider = getProviderById(providers, selectedProviderId);
  const refineProvider = getProviderById(providers, refineProviderId);

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
      // Selection fixup happens in the validation effect below so it works for
      // both the generate and refine selections.
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(`Failed to fetch models: ${msg}`);
    } finally {
      setLoadingModelsFor(null);
    }
  }, []);

  React.useEffect(() => {
    if (selectedProvider && !modelsCache[selectedProvider.id]) {
      fetchModels(selectedProvider);
    }
    if (refineProvider && !modelsCache[refineProvider.id]) {
      fetchModels(refineProvider);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProviderId, refineProviderId]);

  // Keep localStorage synced on selection changes
  const onSelectProvider = (id: string) => {
    setSelectedProviderIdState(id);
    setSelectedProviderId(id);
    if (!modelsCache[id]?.length) setSelectedModel("");
  };

  const onSelectModel = (id: string) => {
    setSelectedModel(id);
    setSelectedModelId(id);
  };

  const onSelectRefineProvider = (id: string) => {
    setRefineProviderIdState(id);
    setSelectedRefineProviderId(id);
    if (!modelsCache[id]?.length) setRefineModel("");
  };

  const onSelectRefineModel = (id: string) => {
    setRefineModel(id);
    setSelectedRefineModelId(id);
  };

  // Keep each selection valid for its provider's cached models; auto-pick a
  // default when empty or stale (vision-capable preferred for generate).
  React.useEffect(() => {
    const describeModels = modelsCache[selectedProviderId];
    if (describeModels?.length && !describeModels.some((m) => m.id === selectedModel)) {
      const pick = describeModels.find((m) => /vision|gpt-4o|claude|gemini/i.test(m.id))?.id || describeModels[0].id;
      setSelectedModel(pick);
      setSelectedModelId(pick);
    }
    const refineModels = modelsCache[refineProviderId];
    if (refineModels?.length && !refineModels.some((m) => m.id === refineModel)) {
      const pick = refineModels.find((m) => /claude|gpt-4|gemini|deepseek|qwen/i.test(m.id))?.id || refineModels[0].id;
      setRefineModel(pick);
      setSelectedRefineModelId(pick);
    }
  }, [modelsCache, selectedProviderId, selectedModel, refineProviderId, refineModel]);

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
    // reset prompts
    setStreamingText("");
    setPromptText("");
    setRefinedText("");
  };

  const handleClear = () => {
    setFile(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setImageBase64(null);
    setStreamingText("");
    setPromptText("");
    setRefinedText("");
  };

  // Remove only the uploaded image — the generated and refined prompts are
  // left untouched so the user can keep working with them.
  const handleRemoveImage = () => {
    setFile(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setImageBase64(null);
  };

  const handleGenerate = async () => {
    if (!file || !imageBase64 || !selectedProvider || !selectedModel) {
      toast.error("Upload an image and select a generate provider/model in Settings first");
      return;
    }
    if (!selectedProvider.apiKey && !selectedProvider.baseUrl.includes("localhost") && !selectedProvider.baseUrl.includes("127.0.0.1")) {
      // warn but allow (maybe provider doesn't need key)
    }

    setIsDescribing(true);
    setStreamingText("");
    setRefinedText("");

    try {
      const res = await fetch("/api/describe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64,
          mime: imageMime,
          provider: { baseUrl: selectedProvider.baseUrl, apiKey: selectedProvider.apiKey },
          model: selectedModel,
          describePrompt: loadDescribePrompt(),
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

      setPromptText(full.trim());
      toast.success("Prompt generated");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(msg);
      console.error(e);
    } finally {
      setIsDescribing(false);
      setStreamingText((prev) => prev || "");
      // keep streamingText briefly then clear so the display switches cleanly
      setTimeout(() => setStreamingText(""), 100);
    }
  };

  const handleRefine = async (instruction: string) => {
    // Refine operates only on the current Generated Prompt text — the image is
    // never resent (the /api/refine route takes prompt + instruction only).
    // The Generated Prompt box is left untouched; the result streams into the
    // dedicated "Refined Prompt" box in the RefineBar.
    const basePrompt = promptText.trim();
    if (!basePrompt) {
      toast.error("Nothing to refine yet — type a prompt above or generate one from an image.");
      return;
    }
    if (!refineProvider || !refineModel) {
      toast.error("Select a refine provider/model in Settings");
      return;
    }
    setIsRefining(true);
    setRefinedText("");

    try {
      const res = await fetch("/api/refine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: basePrompt,
          instruction,
          provider: { baseUrl: refineProvider.baseUrl, apiKey: refineProvider.apiKey },
          model: refineModel,
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
        setRefinedText(full);
      });

      if (!full.trim()) throw new Error("Empty refinement");

      setRefinedText(full.trim());
      toast.success("Prompt refined");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(msg);
    } finally {
      setIsRefining(false);
    }
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
          {/* Drop zone — Image to Prompt model picker lives inside it */}
          <DropZone
            onFileSelect={handleFileSelect}
            previewUrl={previewUrl}
            onClear={handleRemoveImage}
            fileName={file?.name}
            disabled={isDescribing || isRefining}
            providers={providers}
            modelsCache={modelsCache}
            selectedProviderId={selectedProviderId}
            selectedModel={selectedModel}
            onSelectProvider={onSelectProvider}
            onSelectModel={onSelectModel}
            loadingModelsFor={loadingModelsFor}
            onOpenSettings={() => setSettingsOpen(true)}
          />

          {/* Generate button */}
          {file && (
            <div className="flex gap-2">
              <Button onClick={handleGenerate} disabled={!canGenerate} className="flex-1 h-11 text-[15px] font-medium" title={promptText ? "Re-run the image description; this overwrites the current prompt. Use Refine instead to edit it." : undefined}>
                {isDescribing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {isDescribing ? "Generating prompt..." : !promptText ? "Generate prompt" : "Re-describe from image"}
              </Button>
              {promptText && (
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
            isStreaming={isDescribing}
            onChangePrompt={setPromptText}
          />

          {/* Refine */}
          <RefineBar
            hasPrompt={!!promptText}
            isRefining={isRefining}
            onRefine={handleRefine}
            disabled={isDescribing}
            result={refinedText}
            providers={providers}
            modelsCache={modelsCache}
            refineProviderId={refineProviderId}
            refineModel={refineModel}
            onSelectRefineProvider={onSelectRefineProvider}
            onSelectRefineModel={onSelectRefineModel}
            onOpenSettings={() => setSettingsOpen(true)}
            loadingModelsFor={loadingModelsFor}
          />
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
      />
    </div>
  );
}
