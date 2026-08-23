"use client";

import * as React from "react";
import { Sparkles, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropZone } from "@/components/DropZone";
import { PromptCard } from "@/components/PromptCard";
import { RefineBar } from "@/components/RefineBar";
import { resizeImage } from "@/lib/image";
import { loadDescribePrompt } from "@/lib/prompts";
import { streamResponse } from "@/lib/stream";
import { toast } from "sonner";
import { useProviders } from "@/components/providers-context";
import { useSettingsOpen } from "@/components/AppShell";
import { useRetainedImage } from "@/components/retained-state";

export default function Home() {
  const {
    providers,
    selectedProviderId,
    selectedModel,
    refineProviderId,
    refineModel,
    modelsCache,
    loadingModelsFor,
    selectedProvider,
    refineProvider,
    onSelectProvider,
    onSelectModel,
    onSelectRefineProvider,
    onSelectRefineModel,
  } = useProviders();
  const { setOpen: setSettingsOpen } = useSettingsOpen();
  const { state: retained, setState: setRetained, clear: clearRetained } = useRetainedImage();
  const file = retained.file;
  const previewUrl = retained.previewUrl;
  const imageBase64 = retained.imageBase64;
  const imageMime = retained.imageMime;
  const promptText = retained.promptText;
  const refinedText = retained.refinedText;
  const streamingText = retained.streamingText;
  const isDescribing = retained.isDescribing;
  const isRefining = retained.isRefining;
  const setPromptText = (v: string | ((prev: string) => string)) =>
    setRetained((s) => ({ ...s, promptText: typeof v === "function" ? (v as (p: string) => string)(s.promptText) : v }));
  const setRefinedText = (v: string | ((prev: string) => string)) =>
    setRetained((s) => ({ ...s, refinedText: typeof v === "function" ? (v as (p: string) => string)(s.refinedText) : v }));
  const setStreamingText = (v: string | ((prev: string) => string)) =>
    setRetained((s) => ({ ...s, streamingText: typeof v === "function" ? (v as (p: string) => string)(s.streamingText) : v }));
  const setIsDescribing = (v: boolean | ((prev: boolean) => boolean)) =>
    setRetained((s) => ({ ...s, isDescribing: typeof v === "function" ? (v as (p: boolean) => boolean)(s.isDescribing) : v }));
  const setIsRefining = (v: boolean | ((prev: boolean) => boolean)) =>
    setRetained((s) => ({ ...s, isRefining: typeof v === "function" ? (v as (p: boolean) => boolean)(s.isRefining) : v }));
  const refineInstruction = retained.refineInstruction;
  const setRefineInstruction = (v: string) => setRetained((s) => ({ ...s, refineInstruction: v }));
  const [mounted, setMounted] = React.useState(false);
  const displayPrompt = isDescribing ? streamingText : promptText;
  React.useEffect(() => setMounted(true), []);

  // File handling — persisted in retained state so switching routes does not clear it
  const handleFileSelect = async (f: File) => {
    const url = URL.createObjectURL(f);
    // Revoke previous preview if any before replacing
    if (retained.previewUrl) URL.revokeObjectURL(retained.previewUrl);
    setRetained((s) => ({ ...s, file: f, previewUrl: url, streamingText: "", promptText: "", refinedText: "" }));
    try {
      const { base64, mime } = await resizeImage(f, 1024, 0.8);
      setRetained((s) => ({ ...s, imageBase64: base64, imageMime: mime }));
    } catch (e) {
      toast.error("Failed to process image");
      console.error(e);
    }
  };

  const handleClear = () => {
    clearRetained();
  };

  // Remove only the uploaded image — the generated and refined prompts are left untouched
  const handleRemoveImage = () => {
    if (retained.previewUrl) URL.revokeObjectURL(retained.previewUrl);
    setRetained((s) => ({ ...s, file: null, previewUrl: null, imageBase64: null }));
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
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 shrink-0">
          <Sparkles className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h1 className="text-[15px] font-semibold tracking-tight leading-none">Image to Prompt</h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Turn any image into a recreate-ready prompt</p>
        </div>
      </div>

      <div className="space-y-6">
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
            instruction={refineInstruction}
            onInstructionChange={setRefineInstruction}
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
      </div>

      <footer className="border-t border-zinc-200 mt-8 py-6 text-center text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
        <p>Ephemeral by design — images are resized in-browser and never stored. Providers via server proxy.</p>
      </footer>
    </div>
  );
}
