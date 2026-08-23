"use client";

import * as React from "react";

export interface RetainedImageState {
  file: File | null;
  previewUrl: string | null;
  imageBase64: string | null;
  imageMime: string;
}

export interface ImagePromptState extends RetainedImageState {
  promptText: string;
  refinedText: string;
  refineInstruction: string;
  streamingText: string;
  isDescribing: boolean;
  isRefining: boolean;
}

export interface ChatRetainedState {
  messages: { role: "user" | "assistant"; content: string; imagePreviewUrl?: string | null }[];
  input: string;
  isStreaming: boolean;
  streamingText: string;
}

const defaultImageState: ImagePromptState = {
  file: null,
  previewUrl: null,
  imageBase64: null,
  imageMime: "image/jpeg",
  promptText: "",
  refinedText: "",
  refineInstruction: "",
  streamingText: "",
  isDescribing: false,
  isRefining: false,
};

const defaultChatState: ChatRetainedState = {
  messages: [],
  input: "",
  isStreaming: false,
  streamingText: "",
};

interface RetainedStateValue {
  image: ImagePromptState;
  setImage: React.Dispatch<React.SetStateAction<ImagePromptState>>;
  chat: ChatRetainedState;
  setChat: React.Dispatch<React.SetStateAction<ChatRetainedState>>;
  clearImage: () => void;
  clearChat: () => void;
}

const Ctx = React.createContext<RetainedStateValue | null>(null);

export function RetainedStateProvider({ children }: { children: React.ReactNode }) {
  const [image, setImage] = React.useState<ImagePromptState>(defaultImageState);
  const [chat, setChat] = React.useState<ChatRetainedState>(defaultChatState);

  const clearImage = React.useCallback(() => {
    setImage((prev) => {
      if (prev.previewUrl) URL.revokeObjectURL(prev.previewUrl);
      return { ...defaultImageState };
    });
  }, []);

  const clearChat = React.useCallback(() => {
    setChat({ ...defaultChatState });
  }, []);

  const value: RetainedStateValue = React.useMemo(
    () => ({ image, setImage, chat, setChat, clearImage, clearChat }),
    [image, chat, clearImage, clearChat]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useRetainedImage() {
  const v = React.useContext(Ctx);
  if (!v) throw new Error("useRetainedImage must be used within RetainedStateProvider");
  return { state: v.image, setState: v.setImage, clear: v.clearImage };
}

export function useRetainedChat() {
  const v = React.useContext(Ctx);
  if (!v) throw new Error("useRetainedChat must be used within RetainedStateProvider");
  return { state: v.chat, setState: v.setChat, clear: v.clearChat };
}
