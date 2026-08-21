"use client";

import * as React from "react";
import { Wand2, Loader2, Send, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

interface RefineBarProps {
  hasPrompt: boolean;
  isRefining: boolean;
  onRefine: (instruction: string) => void;
  disabled?: boolean;
  result: string;
}

export function RefineBar({ hasPrompt, isRefining, onRefine, disabled, result }: RefineBarProps) {
  const [instruction, setInstruction] = React.useState("");
  const [copied, setCopied] = React.useState(false);

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
            className="resize-none"
          />
          <div className="flex items-center justify-between gap-3">
            <Button type="submit" disabled={!instruction.trim()} className="ml-auto">
              {isRefining ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {isRefining ? "Refining..." : "Refine"}
            </Button>
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
