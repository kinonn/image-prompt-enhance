"use client";

import * as React from "react";
import { useAuth } from "@/components/auth-context";
import type { PersistedAppState } from "@/lib/state-types";

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
  const { user, status } = useAuth();
  const loggedIn = status === "authenticated" && !!user?.id;
  const [hydrated, setHydrated] = React.useState(false);
  const [image, setImage] = React.useState<ImagePromptState>(defaultImageState);
  const [chat, setChat] = React.useState<ChatRetainedState>(defaultChatState);

  // Reconstruct the image (File + preview) from persisted base64.
  const applyPersisted = React.useCallback(async (data: PersistedAppState | null) => {
    if (data?.image) {
      const p = data.image;
      let file: File | null = null;
      let previewUrl: string | null = null;
      if (p.imageBase64) {
        try {
          const res = await fetch(`data:${p.imageMime || "image/jpeg"};base64,${p.imageBase64}`);
          const blob = await res.blob();
          file = new File([blob], "image.jpg", { type: p.imageMime || "image/jpeg" });
          previewUrl = URL.createObjectURL(blob);
        } catch {
          // Image can't be restored — keep prompts only.
        }
      }
      setImage({
        file,
        previewUrl,
        imageBase64: p.imageBase64,
        imageMime: p.imageMime || "image/jpeg",
        promptText: p.promptText || "",
        refinedText: p.refinedText || "",
        refineInstruction: p.refineInstruction || "",
        streamingText: "",
        isDescribing: false,
        isRefining: false,
      });
    }
    if (data?.chat) {
      // Object URLs in imagePreviewUrl are invalid after a refresh — strip them.
      setChat({
        messages: (data.chat.messages || []).map((m) => ({ ...m, imagePreviewUrl: null })),
        input: data.chat.input || "",
        isStreaming: false,
        streamingText: "",
      });
    }
  }, []);

  // Hydrate from the server store once auth status is known (logged-in only).
  React.useEffect(() => {
    if (status === "loading") return;
    let cancelled = false;
    if (loggedIn) {
      fetch("/api/state")
        .then((res) => (res.ok ? res.json() : null))
        .then(async (data) => {
          if (cancelled) return;
          await applyPersisted(data);
          if (!cancelled) setHydrated(true);
        })
        .catch(() => setHydrated(true));
    } else {
      setHydrated(true);
    }
    return () => {
      cancelled = true;
    };
  }, [status, loggedIn, applyPersisted]);

  // Debounced sync to the server store while logged in.
  const syncTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(() => {
    if (!loggedIn || !hydrated) return;
    if (syncTimer.current) clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(() => {
      fetch("/api/state", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image: {
            imageBase64: image.imageBase64,
            imageMime: image.imageMime,
            promptText: image.promptText,
            refinedText: image.refinedText,
            refineInstruction: image.refineInstruction,
          },
          chat: {
            messages: chat.messages,
            input: chat.input,
          },
        }),
      }).catch(() => {});
    }, 500);
    return () => {
      if (syncTimer.current) clearTimeout(syncTimer.current);
    };
  }, [loggedIn, hydrated, image, chat]);

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
