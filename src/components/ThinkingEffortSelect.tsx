"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { THINKING_EFFORT_OPTIONS } from "@/lib/effort";
import type { EffortSelection } from "@/lib/effort";

interface ThinkingEffortSelectProps {
  value: EffortSelection;
  onChange: (value: EffortSelection) => void;
  disabled?: boolean;
  title?: string;
}

/**
 * Compact "Thinking effort" pill — mirrors the provider/model pill style used
 * across the composer toolbars (VS Code-like effort picker).
 */
export function ThinkingEffortSelect({ value, onChange, disabled, title }: ThinkingEffortSelectProps) {
  const label = THINKING_EFFORT_OPTIONS.find((o) => o.value === value)?.label ?? "Default";
  return (
    <div className="relative shrink-0">
      <select
        aria-label="Thinking effort"
        title={title || `Thinking effort: ${label}`}
        value={value}
        onChange={(e) => onChange(e.target.value as EffortSelection)}
        disabled={disabled}
        className="h-7 appearance-none rounded-full border border-zinc-200 bg-white pl-2.5 pr-6 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
      >
        {THINKING_EFFORT_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 text-zinc-500" />
    </div>
  );
}
