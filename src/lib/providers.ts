export type ProviderType = "openai-compatible";

export interface Provider {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  type: ProviderType;
}

export interface Model {
  id: string;
  name?: string;
}

export const DEFAULT_PROVIDERS: Provider[] = [
  {
    id: "zen",
    name: "OpenCode Zen",
    baseUrl: "https://api.opencode.ai/v1",
    apiKey: "",
    type: "openai-compatible",
  },
];

const STORAGE_KEY = "image-prompt-providers";
const SELECTED_PROVIDER_KEY = "image-prompt-selected-provider";
const SELECTED_MODEL_KEY = "image-prompt-selected-model";

export function loadProviders(): Provider[] {
  if (typeof window === "undefined") return DEFAULT_PROVIDERS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PROVIDERS;
    const parsed = JSON.parse(raw) as Provider[];
    // Ensure at least zen exists; migrate old storage
    if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_PROVIDERS;
    return parsed.map((p) => ({
      ...p,
      type: p.type || "openai-compatible",
    }));
  } catch {
    return DEFAULT_PROVIDERS;
  }
}

export function saveProviders(providers: Provider[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(providers));
}

export function getSelectedProviderId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(SELECTED_PROVIDER_KEY);
}

export function setSelectedProviderId(id: string) {
  localStorage.setItem(SELECTED_PROVIDER_KEY, id);
}

export function getSelectedModelId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(SELECTED_MODEL_KEY);
}

export function setSelectedModelId(id: string) {
  localStorage.setItem(SELECTED_MODEL_KEY, id);
}

export function getProviderById(providers: Provider[], id: string): Provider | undefined {
  return providers.find((p) => p.id === id);
}
