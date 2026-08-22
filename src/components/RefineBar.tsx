"use client";

import * as React from "react";
import { Wand2, Loader2, Send, Copy, Check, ChevronDown, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Provider, Model } from "@/lib/providers";
import { toast } from "sonner";

interface RefineBarProps {
  hasPrompt: boolean;
  isRefining: boolean;
  onRefine: (instruction: string) => void;
  disabled?: boolean;
  result: string;
  providers: Provider[];
  modelsCache: Record<string, Model[]>;
  refineProviderId: string;
  refineModel: string;
  onSelectRefineProvider: (id: string) => void;
  onSelectRefineModel: (id: string) => void;
  onOpenSettings?: () => void;
  loadingModelsFor?: string | null;
}

export function RefineBar({
  hasPrompt,
  isRefining,
  onRefine,
  disabled,
  result,
  providers,
  modelsCache,
  refineProviderId,
  refineModel,
  onSelectRefineProvider,
  onSelectRefineModel,
  onOpenSettings,
  loadingModelsFor,
}: RefineBarProps) {
  const [instruction, setInstruction] = React.useState("");
  const [copied, setCopied] = React.useState(false);

  const refineProvider = providers.find((p) => p.id === refineProviderId);
  const refineModels = modelsCache[refineProviderId] || [];
  const modelLabel =
    refineProvider && refineModel
      ? (refineModels.find((m) => m.id === refineModel)?.name || refineModel.split("/").pop() || refineModel)
      : refineModel || (refineProvider ? "Select model" : "Select provider");
  const isLoadingRefineModels = loadingModelsFor === refineProviderId;

  const handleCopyResult = async () => {
    if (!result) return;
    await navigator.clipboard.writeText(result);
    setCopied(true);
    toast.success("Refined prompt copied");
    setTimeout(() => setCopied(false), 1500);
  };

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const trimmed = instruction.trim();
    // Let the parent decide: it refines only on real prompt content and
    // shows a clear message when there is nothing to refine yet.
    // Keep the instruction text so the user can tweak and re-run it.
    if (!trimmed || isRefining || disabled) return;
    onRefine(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      handleSubmit();
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900">
            <Wand2 className="h-3.5 w-3.5" />
          </div>
          <CardTitle className="text-[13px] font-semibold tracking-widest uppercase text-zinc-500 dark:text-zinc-400">Refine Prompt</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white focus-within:border-zinc-300 focus-within:ring-1 focus-within:ring-zinc-900/10 dark:border-zinc-800 dark:bg-zinc-950 dark:focus-within:border-zinc-700">
            <Textarea
              placeholder={
                hasPrompt
                  ? "e.g., Make it more cinematic, add volumetric lighting, change to anime style, make background a cyberpunk city..."
                  : "Upload an image and generate a prompt first"
              }
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={3}
              disabled={isRefining || disabled}
              className="min-h-[72px] resize-none rounded-none border-0 bg-transparent shadow-none focus-visible:ring-0"
            />
            {/* Composer toolbar — VS Code / Gemini / ChatGPT style: model pill + settings + send */}
            <div className="flex items-center gap-1.5 border-t border-zinc-100 bg-zinc-50/70 px-2 py-1.5 dark:border-zinc-800 dark:bg-zinc-900/50">
              <div className="flex min-w-0 flex-1 items-center gap-1.5">
                {/* Provider pill */}
                <div className="relative shrink-0">
                  <select
                    aria-label="Refine provider"
                    value={refineProviderId}
                    onChange={(e) => onSelectRefineProvider(e.target.value)}
                    disabled={isRefining || disabled}
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

                {/* Model pill */}
                <div className="relative min-w-0 max-w-[180px] flex-1 sm:max-w-[220px]">
                  <select
                    aria-label="Refine model"
                    value={refineModel}
                    onChange={(e) => onSelectRefineModel(e.target.value)}
                    disabled={!refineProvider || isRefining || disabled || (refineModels.length === 0 && !isLoadingRefineModels)}
                    title={refineModel || undefined}
                    className="h-7 w-full appearance-none truncate rounded-full border border-zinc-200 bg-white pl-2.5 pr-6 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  >
                    {isLoadingRefineModels && <option value={refineModel}>{refineModel ? `${modelLabel} — loading…` : "Loading…"}</option>}
                    {!isLoadingRefineModels && refineModels.length === 0 && (
                      <option value="">{refineProvider ? "No models — open settings" : "Select provider"}</option>
                    )}
                    {!isLoadingRefineModels &&
                      refineModels.map((m) => (
                        <option key={m.id} value={m.id} title={m.id}>
                          {m.name || m.id}
                        </option>
                      ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 h-3 w-3 shrink-0 -translate-y-1/2 text-zinc-500" />
                </div>

                {isLoadingRefineModels && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-zinc-400" />}

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

              <Button type="submit" size="sm" disabled={!instruction.trim()} className="h-7 shrink-0 rounded-full px-3.5 text-xs">
                {isRefining ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                {isRefining ? "Refining…" : "Refine"}
              </Button>
            </div>
          </div>
        </form>

        {/* Dedicated box for the resulting refined prompt */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Refined Prompt</p>
            {result && (
              <Button variant="ghost" size="sm" onClick={handleCopyResult} className="h-7 px-2 text-xs">
                {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? "Copied" : "Copy"}
              </Button>
            )}
          </div>
          {result ? (
            <div className="rounded-xl bg-zinc-50 border border-zinc-200 p-3 text-sm font-mono whitespace-pre-wrap leading-relaxed text-zinc-800 dark:bg-zinc-800/50 dark:border-zinc-800 dark:text-zinc-100">
              {result}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-400 dark:border-zinc-800 dark:bg-zinc-900/50">
              The refined prompt will appear here after you refine.
            </div>
          )}
          {result && (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {result.split(/\s+/).filter(Boolean).length} words • {result.length} chars
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
