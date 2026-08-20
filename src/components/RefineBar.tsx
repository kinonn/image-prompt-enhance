"use client";

import * as React from "react";
import { Wand2, Loader2, Send, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface HistoryEntry {
  prompt: string;
  instruction: string;
  timestamp: number;
}

interface RefineBarProps {
  hasPrompt: boolean;
  isRefining: boolean;
  onRefine: (instruction: string) => void;
  history: HistoryEntry[];
  onSelectHistory: (index: number) => void;
  currentIndex: number;
  disabled?: boolean;
}

export function RefineBar({ hasPrompt, isRefining, onRefine, history, onSelectHistory, currentIndex, disabled }: RefineBarProps) {
  const [instruction, setInstruction] = React.useState("");

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const trimmed = instruction.trim();
    if (!trimmed || !hasPrompt || isRefining || disabled) return;
    onRefine(trimmed);
    setInstruction("");
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
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
            <Wand2 className="h-3.5 w-3.5" />
          </div>
          <CardTitle className="text-[13px] font-semibold tracking-widest uppercase text-zinc-500 dark:text-zinc-400">Refine Prompt</CardTitle>
          {history.length > 0 && (
            <Badge variant="outline" className="ml-auto text-xs font-mono">
              <History className="h-3 w-3 mr-1" />
              {history.length} edits
            </Badge>
          )}
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
            disabled={!hasPrompt || isRefining || disabled}
            className="resize-none"
          />
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-zinc-500 dark:text-zinc-400 hidden sm:block">Cmd+Enter to send • Be specific for best results</p>
            <Button type="submit" disabled={!instruction.trim() || !hasPrompt || isRefining || disabled} className="ml-auto">
              {isRefining ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {isRefining ? "Refining..." : "Refine"}
            </Button>
          </div>
        </form>

        {history.length > 0 && (
          <div className="space-y-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
            <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">History</p>
            <div className="flex gap-1.5 overflow-x-auto pb-2 scrollbar-thin">
              {history.map((h, idx) => (
                <button
                  key={idx}
                  onClick={() => onSelectHistory(idx)}
                  className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                    idx === currentIndex
                      ? "bg-zinc-900 text-white border-zinc-900 dark:bg-zinc-50 dark:text-zinc-900 dark:border-zinc-50"
                      : "bg-white hover:bg-zinc-50 border-zinc-200 dark:bg-zinc-900 dark:hover:bg-zinc-800 dark:border-zinc-800"
                  }`}
                  title={h.instruction}
                >
                  {idx === 0 ? "Original" : `Edit ${idx}`}
                  <span className="ml-1.5 opacity-60 truncate max-w-[120px] inline-block align-bottom">{h.instruction.slice(0, 28)}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
