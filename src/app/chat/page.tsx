"use client";

import * as React from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChatThread, type ChatMsg } from "@/components/ChatThread";
import { ChatComposer } from "@/components/ChatComposer";
import { useProviders } from "@/components/providers-context";
import { useSettingsOpen } from "@/components/AppShell";
import { streamResponse } from "@/lib/stream";
import { toast } from "sonner";

export default function ChatPage() {
  const { providers, modelsCache, chatProviderId, chatModel, onSelectChatProvider, onSelectChatModel, loadingModelsFor, chatProvider } = useProviders();
  const { setOpen } = useSettingsOpen();
  const [messages, setMessages] = React.useState<ChatMsg[]>([]);
  const [input, setInput] = React.useState("");
  const [isStreaming, setIsStreaming] = React.useState(false);
  const [streamingText, setStreamingText] = React.useState("");

  const handleSend = async (text: string, image?: { base64: string; mime: string; previewUrl: string } | null) => {
    if (!text && !image) return;
    if (!chatProvider || !chatModel) {
      toast.error("Select a chat provider/model first (use the pills below the input or open Settings)");
      return;
    }

    const userMsg: ChatMsg = {
      role: "user",
      content: text || "(image)",
      imagePreviewUrl: image?.previewUrl || null,
    };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setIsStreaming(true);
    setStreamingText("");

    // Build history for API: map to {role, content}
    const apiMessages = nextMessages.map((m) => ({ role: m.role, content: m.content }));

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: apiMessages,
          provider: { baseUrl: chatProvider.baseUrl, apiKey: chatProvider.apiKey },
          model: chatModel,
          imageBase64: image?.base64,
          mime: image?.mime,
        }),
      });

      if (!res.ok) {
        const ct = res.headers.get("content-type") || "";
        let msg = `Provider error ${res.status}`;
        if (ct.includes("json")) {
          const j = await res.json().catch(() => null);
          msg = j?.error || msg;
        } else {
          msg = (await res.text()).slice(0, 600) || msg;
        }
        throw new Error(msg);
      }

      let full = "";
      await streamResponse(res, (chunk) => {
        full += chunk;
        setStreamingText(full);
      });

      if (!full.trim() && !isStreaming) throw new Error("Empty response");

      setMessages((prev) => [...prev, { role: "assistant", content: full.trim(), imagePreviewUrl: null }]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(msg);
    } finally {
      setIsStreaming(false);
      setStreamingText("");
    }
  };

  const handleClear = () => {
    setMessages([]);
    setInput("");
    setStreamingText("");
    toast.success("Conversation cleared");
  };

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-base font-semibold">Chat</h1>
          <p className="text-xs text-zinc-500">Ephemeral — cleared on refresh. Attach or paste images for vision models.</p>
        </div>
        {messages.length > 0 && (
          <Button variant="outline" size="sm" onClick={handleClear} disabled={isStreaming} className="shrink-0">
            <Trash2 className="h-4 w-4" /> Clear
          </Button>
        )}
      </div>

      <ChatThread messages={messages} streamingText={streamingText} isStreaming={isStreaming} />

      <div className="sticky bottom-0 -mx-4 bg-zinc-50 px-4 py-3 dark:bg-zinc-950 sm:-mx-6 sm:px-6">
        <ChatComposer
          value={input}
          onChange={setInput}
          onSend={handleSend}
          disabled={false}
          isStreaming={isStreaming}
          providers={providers}
          modelsCache={modelsCache}
          chatProviderId={chatProviderId}
          chatModel={chatModel}
          onSelectChatProvider={onSelectChatProvider}
          onSelectChatModel={onSelectChatModel}
          loadingModelsFor={loadingModelsFor}
          onOpenSettings={() => setOpen(true)}
        />
      </div>
    </div>
  );
}
