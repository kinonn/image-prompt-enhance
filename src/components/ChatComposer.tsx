"use client";

import * as React from "react";
import { Send, Loader2, Paperclip, X, ChevronDown, Settings, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { Provider, Model } from "@/lib/providers";
import { validateFile } from "@/lib/image";

interface ChatComposerProps {
  value: string;
  onChange: (v: string) => void;
  onSend: (text: string, image?: { base64: string; mime: string; previewUrl: string } | null) => void;
  disabled?: boolean;
  isStreaming?: boolean;
  providers: Provider[];
  modelsCache: Record<string, Model[]>;
  chatProviderId: string;
  chatModel: string;
  onSelectChatProvider: (id: string) => void;
  onSelectChatModel: (id: string) => void;
  loadingModelsFor?: string | null;
  onOpenSettings?: () => void;
}

export function ChatComposer({
  value,
  onChange,
  onSend,
  disabled,
  isStreaming,
  providers,
  modelsCache,
  chatProviderId,
  chatModel,
  onSelectChatProvider,
  onSelectChatModel,
  loadingModelsFor,
  onOpenSettings,
}: ChatComposerProps) {
  const [pendingImage, setPendingImage] = React.useState<{ file: File; previewUrl: string } | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const provider = providers.find((p) => p.id === chatProviderId);
  const models = modelsCache[chatProviderId] || [];
  const isLoadingModels = loadingModelsFor === chatProviderId;

  const handleFile = React.useCallback((file: File) => {
    const err = validateFile(file);
    if (err) return;
    if (pendingImage?.previewUrl) URL.revokeObjectURL(pendingImage.previewUrl);
    setPendingImage({ file, previewUrl: URL.createObjectURL(file) });
  }, [pendingImage]);

  const clearPending = () => {
    if (pendingImage?.previewUrl) URL.revokeObjectURL(pendingImage.previewUrl);
    setPendingImage(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const text = value.trim();
    if (!text && !pendingImage) return;
    if (isStreaming || disabled) return;
    if (pendingImage) {
      // convert to base64 just-in-time via FileReader in parent, but pass file here and let parent handle resize? simpler: read as data URL here
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        const base64 = dataUrl.split(",")[1] || "";
        const mime = pendingImage.file.type || "image/jpeg";
        onSend(text, { base64, mime, previewUrl: pendingImage.previewUrl });
        onChange("");
        // keep preview until sent; parent clears or we clear after send
        clearPending();
      };
      reader.readAsDataURL(pendingImage.file);
    } else {
      onSend(text, null);
      onChange("");
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSubmit();
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      // Enter to send (Shift+Enter for newline) — common chat pattern
      e.preventDefault();
      handleSubmit();
    }
  };

  const onPaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) {
          e.preventDefault();
          handleFile(file);
          break;
        }
      }
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      {pendingImage && (
        <div className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 p-2 dark:border-zinc-800 dark:bg-zinc-900">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={pendingImage.previewUrl} alt="Pending" className="h-12 w-12 rounded-lg object-cover" />
          <span className="truncate text-xs text-zinc-600 dark:text-zinc-400 flex-1">{pendingImage.file.name}</span>
          <Button type="button" variant="ghost" size="sm" onClick={clearPending} className="h-7 w-7 p-0">
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}
      <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white focus-within:border-zinc-300 focus-within:ring-1 focus-within:ring-zinc-900/10 dark:border-zinc-800 dark:bg-zinc-950 dark:focus-within:border-zinc-700">
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          placeholder={pendingImage ? "Add a caption (optional) — Enter to send, Shift+Enter for newline" : "Message — Enter to send, Shift+Enter for newline, paste an image"}
          rows={3}
          disabled={isStreaming || disabled}
          className="min-h-[72px] resize-none rounded-none border-0 bg-transparent shadow-none focus-visible:ring-0"
        />
        <div className="flex items-center gap-1.5 border-t border-zinc-100 bg-zinc-50/70 px-2 py-1.5 dark:border-zinc-800 dark:bg-zinc-900/50">
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            <div className="relative shrink-0">
              <select
                aria-label="Chat provider"
                value={chatProviderId}
                onChange={(e) => onSelectChatProvider(e.target.value)}
                disabled={!!isStreaming || !!disabled}
                className="h-7 appearance-none rounded-full border border-zinc-200 bg-white pl-2.5 pr-6 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
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
            <div className="relative min-w-0 max-w-[170px] flex-1 sm:max-w-[200px]">
              <select
                aria-label="Chat model"
                value={chatModel}
                onChange={(e) => onSelectChatModel(e.target.value)}
                disabled={!provider || !!isStreaming || !!disabled || (models.length === 0 && !isLoadingModels)}
                title={chatModel || undefined}
                className="h-7 w-full appearance-none truncate rounded-full border border-zinc-200 bg-white pl-2.5 pr-6 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
              >
                {isLoadingModels && <option value={chatModel}>{chatModel ? `${chatModel.split("/").pop()} — loading…` : "Loading…"}</option>}
                {!isLoadingModels && models.length === 0 && (
                  <option value="">{provider ? "No models — open settings" : "Select provider"}</option>
                )}
                {!isLoadingModels &&
                  models.map((m) => (
                    <option key={m.id} value={m.id} title={m.id}>
                      {m.name || m.id}
                    </option>
                  ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 text-zinc-500" />
            </div>
            {isLoadingModels && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-zinc-400" />}
            <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/jpg" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }} />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={!!isStreaming || !!disabled}
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
              title="Attach image"
              aria-label="Attach image"
            >
              <Paperclip className="h-3.5 w-3.5" />
            </button>
            {onOpenSettings && (
              <button
                type="button"
                onClick={onOpenSettings}
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800"
                title="Manage providers"
                aria-label="Manage providers"
              >
                <Settings className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <Button type="submit" size="sm" disabled={(!value.trim() && !pendingImage) || !!isStreaming} className="h-7 shrink-0 rounded-full px-3.5 text-xs">
            {isStreaming ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            {isStreaming ? "Sending…" : "Send"}
          </Button>
        </div>
      </div>
      <p className="text-[11px] text-zinc-400 dark:text-zinc-500 flex items-center gap-1">
        <ImageIcon className="h-3 w-3" /> Paste or attach an image to send with your message
      </p>
    </form>
  );
}
