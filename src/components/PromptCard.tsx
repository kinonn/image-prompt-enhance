"use client";

import * as React from "react";
import { Copy, Check, Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

interface PromptCardProps {
  prompt: string;
  isStreaming: boolean;
  onChangePrompt: (newPrompt: string) => void;
  version: number;
  totalVersions: number;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
}

export function PromptCard({
  prompt,
  isStreaming,
  onChangePrompt,
  version,
  totalVersions,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
}: PromptCardProps) {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(prompt);
    setCopied(true);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900">
            <Sparkles className="h-3.5 w-3.5" />
          </div>
          <CardTitle className="text-[13px] font-semibold tracking-widest uppercase text-zinc-500 dark:text-zinc-400">Generated Prompt</CardTitle>
          {isStreaming && <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-400" />}
          {!isStreaming && prompt && (
            <Badge variant="secondary" className="text-[11px] font-mono">
              v{version}/{totalVersions}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {canUndo && (
            <Button variant="ghost" size="sm" onClick={onUndo} className="h-8 px-2.5 text-xs">
              Undo
            </Button>
          )}
          {canRedo && (
            <Button variant="ghost" size="sm" onClick={onRedo} className="h-8 px-2.5 text-xs">
              Redo
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={handleCopy} disabled={!prompt || isStreaming} className="h-8">
            {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {isStreaming ? (
          <div className="rounded-xl bg-zinc-50 p-4 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-800">
            <p className="whitespace-pre-wrap font-mono text-[13px] leading-relaxed text-zinc-800 dark:text-zinc-100">
              {prompt}
              <span className="inline-block h-3 w-1.5 bg-zinc-900 dark:bg-zinc-100 ml-0.5 animate-pulse align-middle" />
            </p>
          </div>
        ) : (
          <Textarea
            value={prompt}
            onChange={(e) => onChangePrompt(e.target.value)}
            rows={6}
            className="min-h-[140px] resize-y font-mono text-sm leading-relaxed"
            placeholder="Type a prompt here — or upload an image and click Generate."
          />
        )}
        {prompt && (
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {prompt.split(/\s+/).filter(Boolean).length} words • {prompt.length} chars
          </p>
        )}
      </CardContent>
    </Card>
  );
}
