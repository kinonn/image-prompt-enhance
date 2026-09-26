/**
 * Shared thinking-effort types and options.
 *
 * Pure module — safe to import from both client components and server routes.
 * `EffortSelection` uses "" to mean "Default" (the provider decides; no effort
 * parameter is sent upstream).
 */

export type ThinkingEffort = "low" | "medium" | "high";

export type EffortSelection = ThinkingEffort | "";

export interface EffortOption {
  value: EffortSelection;
  label: string;
}

export const THINKING_EFFORT_OPTIONS: EffortOption[] = [
  { value: "", label: "Default" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

export function isEffortSelection(value: unknown): value is EffortSelection {
  return value === "" || value === "low" || value === "medium" || value === "high";
}
