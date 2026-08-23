"use client";

import * as React from "react";
import { Upload, Image as ImageIcon, ClipboardPaste, X, ChevronDown, Settings, Loader2, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { validateFile } from "@/lib/image";
import { DEFAULT_DESCRIBE_SYSTEM_PROMPT, loadDescribePrompt, saveDescribePrompt } from "@/lib/prompts";
import type { Provider, Model } from "@/lib/providers";
import { toast } from "sonner";

interface DropZoneProps {
  onFileSelect: (file: File) => void;
  previewUrl: string | null;
  onClear: () => void;
  fileName?: string;
  disabled?: boolean;
  providers: Provider[];
  modelsCache: Record<string, Model[]>;
  selectedProviderId: string;
  selectedModel: string;
  onSelectProvider: (id: string) => void;
  onSelectModel: (id: string) => void;
  loadingModelsFor?: string | null;
  onOpenSettings?: () => void;
}

export function DropZone({
  onFileSelect,
  previewUrl,
  onClear,
  fileName,
  disabled,
  providers,
  modelsCache,
  selectedProviderId,
  selectedModel,
  onSelectProvider,
  onSelectModel,
  loadingModelsFor,
  onOpenSettings,
}: DropZoneProps) {
  const selectedProvider = providers.find((p) => p.id === selectedProviderId);
  const models = modelsCache[selectedProviderId] || [];
  const isLoadingModels = loadingModelsFor === selectedProviderId;
  const [isDragOver, setIsDragOver] = React.useState(false);
  const [describeOpen, setDescribeOpen] = React.useState(false);
  const [describePrompt, setDescribePrompt] = React.useState(DEFAULT_DESCRIBE_SYSTEM_PROMPT);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => setDescribePrompt(loadDescribePrompt()), []);

  const handleFile = (file: File) => {
    const err = validateFile(file);
    if (err) {
      toast.error(err);
      return;
    }
    onFileSelect(file);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (disabled) return;
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const onPaste = React.useCallback(
    (e: ClipboardEvent) => {
      if (disabled) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) {
            handleFile(file);
            toast.success("Image pasted");
          }
          break;
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handleFile is stable per render, onFileSelect is prop
    [disabled]
  );

  React.useEffect(() => {
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [onPaste]);

  // Subtle pill toolbar — same unobtrusive style as RefineBar / Gemini / ChatGPT
  const ControlsBar = (
    <div
      className="flex items-center gap-1.5 border-t border-zinc-100 bg-zinc-50/70 px-2 py-1.5 dark:border-zinc-800 dark:bg-zinc-900/50"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="relative shrink-0">
        <select
          aria-label="Image to prompt provider"
          value={selectedProviderId}
          onChange={(e) => onSelectProvider(e.target.value)}
          disabled={disabled}
          className="h-7 appearance-none rounded-full border border-zinc-200 bg-white pl-2.5 pr-6 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          {providers.length === 0 && <option value="">No providers</option>}
          {providers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 text-zinc-500" />
      </div>
      <div className="relative min-w-0 max-w-[180px] flex-1 sm:max-w-[220px]">
        <select
          aria-label="Image to prompt model"
          value={selectedModel}
          onChange={(e) => onSelectModel(e.target.value)}
          disabled={!selectedProvider || disabled || (models.length === 0 && !isLoadingModels)}
          title={selectedModel || undefined}
          className="h-7 w-full appearance-none truncate rounded-full border border-zinc-200 bg-white pl-2.5 pr-6 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          {isLoadingModels && <option value={selectedModel}>{selectedModel ? `${selectedModel.split("/").pop()} — loading…` : "Loading…"}</option>}
          {!isLoadingModels && models.length === 0 && (
            <option value="">{selectedProvider ? "No models — open settings" : "Select provider"}</option>
          )}
          {!isLoadingModels &&
            models.map((m) => (
              <option key={m.id} value={m.id} title={m.id}>
                {m.name || m.id}
              </option>
            ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 h-3 w-3 shrink-0 -translate-y-1/2 text-zinc-500" />
      </div>
      {isLoadingModels && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-zinc-400" />}
      <button
        type="button"
        onClick={() => setDescribeOpen((v) => !v)}
        disabled={disabled}
        aria-expanded={describeOpen}
        aria-controls="describe-prompt-panel"
        className={cn(
          "ml-auto inline-flex h-7 shrink-0 items-center gap-1 rounded-full border border-zinc-200 bg-white pl-2 pr-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800",
          describeOpen && "border-zinc-300 bg-zinc-100 text-zinc-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
        )}
        title="Edit the system prompt used when generating from an image"
      >
        <SlidersHorizontal className="h-3.5 w-3.5" />
        Prompt settings
        <ChevronDown className={cn("h-3 w-3 transition-transform", describeOpen && "rotate-180")} />
      </button>
      {onOpenSettings && (
        <button
          type="button"
          onClick={onOpenSettings}
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
          title="Manage providers & models"
          aria-label="Manage providers"
        >
          <Settings className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );

  // Accordion panel — the "Image to Description Prompt" system prompt editor,
  // toggled by the "Prompt settings" button in the ControlsBar above.
  const DescribePromptPanel = (
    <div
      id="describe-prompt-panel"
      className="space-y-3 border-t border-zinc-100 bg-zinc-50/70 px-3 py-3 dark:border-zinc-800 dark:bg-zinc-900/50"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">Image to Description Prompt</p>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs"
          onClick={() => {
            setDescribePrompt(DEFAULT_DESCRIBE_SYSTEM_PROMPT);
            saveDescribePrompt(DEFAULT_DESCRIBE_SYSTEM_PROMPT);
            toast.success("Reset to default");
          }}
        >
          Reset
        </Button>
      </div>
      <p className="text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
        System prompt sent when generating from an image. Edit and save; empty resets to default on next generate.
      </p>
      <Textarea
        value={describePrompt}
        onChange={(e) => setDescribePrompt(e.target.value)}
        rows={6}
        className="min-h-[120px] font-mono text-xs leading-relaxed"
        placeholder={DEFAULT_DESCRIBE_SYSTEM_PROMPT}
      />
      <div className="flex gap-2">
        <Button
          size="sm"
          onClick={() => {
            const v = describePrompt.trim() || DEFAULT_DESCRIBE_SYSTEM_PROMPT;
            if (!describePrompt.trim()) setDescribePrompt(v);
            saveDescribePrompt(v);
            toast.success("Describe prompt saved");
          }}
        >
          Save prompt
        </Button>
        <span className="text-xs leading-8 text-zinc-500">{describePrompt.length} chars</span>
      </div>
    </div>
  );

  if (previewUrl) {
    return (
      <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        {/* eslint-disable-next-line @next/next/no-img-element -- object URL preview, not optimizable */}
        <img src={previewUrl} alt="Preview" className="max-h-[420px] w-full object-contain bg-zinc-100 dark:bg-zinc-900" />
        <div className="flex items-center justify-between gap-3 border-t border-zinc-200 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900">
          <span className="truncate text-sm text-zinc-600 dark:text-zinc-400 flex-1">{fileName}</span>
          <Button variant="outline" size="sm" onClick={onClear} disabled={disabled}>
            <X className="h-4 w-4" />
            Remove
          </Button>
        </div>
        {ControlsBar}
        {describeOpen && DescribePromptPanel}
      </div>
    );
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={onDrop}
      onClick={() => !disabled && inputRef.current?.click()}
      className={cn(
        "group relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed bg-white p-8 text-center transition-all cursor-pointer dark:bg-zinc-900",
        isDragOver ? "border-zinc-900 bg-zinc-50 dark:border-zinc-50 dark:bg-zinc-800" : "border-zinc-200 dark:border-zinc-800",
        disabled && "opacity-60 cursor-not-allowed",
        "hover:border-zinc-300 dark:hover:border-zinc-700"
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/jpg"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = "";
        }}
      />
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 group-hover:scale-105 transition-transform">
        <Upload className="h-6 w-6" />
      </div>
      <p className="text-base font-semibold text-zinc-900 dark:text-zinc-50">Drop image here or click to upload</p>
      <p className="mt-1.5 text-sm text-zinc-500 dark:text-zinc-400">PNG, JPEG, WebP • up to 10MB • Paste with Ctrl+V</p>
      <div className="mt-4 flex items-center gap-2 text-xs text-zinc-400 dark:text-zinc-500">
        <span className="flex items-center gap-1.5">
          <ImageIcon className="h-3.5 w-3.5" /> Auto-resized to 1024px
        </span>
        <span>•</span>
        <span className="flex items-center gap-1.5">
          <ClipboardPaste className="h-3.5 w-3.5" /> Clipboard supported
        </span>
      </div>
      <div className="mt-6 w-full pt-4 border-t border-zinc-100 dark:border-zinc-800 text-left" onClick={(e) => e.stopPropagation()}>
        {ControlsBar}
        {describeOpen && DescribePromptPanel}
      </div>
    </div>
  );
}
