import type { Provider } from "@/lib/providers";

/**
 * Settings slice — persisted per user when logged in.
 * Mirrors what is otherwise kept in localStorage for anonymous users.
 */
export interface SettingsState {
  providers: Provider[];
  selectedProviderId: string;
  selectedModel: string;
  refineProviderId: string;
  refineModel: string;
  chatProviderId: string;
  chatModel: string;
  describePrompt: string;
}

/**
 * Image-to-Prompt slice — the durable parts of the image prompt state.
 * The image itself is persisted as base64 so it survives a refresh for
 * logged-in users (reconstructed into a File + preview on hydrate).
 */
export interface PersistedImageState {
  imageBase64: string | null;
  imageMime: string;
  promptText: string;
  refinedText: string;
  refineInstruction: string;
}

/** Chat slice — messages + draft input (transient flags are not persisted). */
export interface PersistedChatState {
  messages: { role: "user" | "assistant"; content: string; imagePreviewUrl?: string | null }[];
  input: string;
}

/** Full per-user state kept in the server-side in-memory store (slices optional — merged on PUT). */
export interface PersistedAppState {
  settings?: SettingsState;
  image?: PersistedImageState;
  chat?: PersistedChatState;
}

export const EMPTY_SETTINGS: SettingsState = {
  providers: [],
  selectedProviderId: "",
  selectedModel: "",
  refineProviderId: "",
  refineModel: "",
  chatProviderId: "",
  chatModel: "",
  describePrompt: "",
};

export const EMPTY_IMAGE_STATE: PersistedImageState = {
  imageBase64: null,
  imageMime: "image/jpeg",
  promptText: "",
  refinedText: "",
  refineInstruction: "",
};

export const EMPTY_CHAT_STATE: PersistedChatState = {
  messages: [],
  input: "",
};