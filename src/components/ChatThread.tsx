"use client";

import * as React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export interface ChatMsg {
  role: "user" | "assistant";
  content: string;
  imagePreviewUrl?: string | null;
}

interface ChatThreadProps {
  messages: ChatMsg[];
  streamingText?: string;
  isStreaming?: boolean;
}

export function ChatThread({ messages, streamingText, isStreaming }: ChatThreadProps) {
  const bottomRef = React.useRef<HTMLDivElement>(null);
  const [copiedIdx, setCopiedIdx] = React.useState<number | null>(null);

  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, streamingText]);

  const handleCopy = async (text: string, idx: number) => {
    await navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    toast.success("Copied");
    setTimeout(() => setCopiedIdx(null), 1200);
  };

  const all = isStreaming && streamingText !== undefined
    ? [...messages, { role: "assistant" as const, content: streamingText, imagePreviewUrl: null }]
    : messages;

  if (all.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-zinc-200 bg-white p-10 text-center dark:border-zinc-800 dark:bg-zinc-900">
        <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Start a conversation</p>
        <p className="mt-1 text-sm text-zinc-500">Ask anything — attach or paste an image for vision models.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {all.map((m, i) => {
        const isUser = m.role === "user";
        const isStreamingBubble = isStreaming && i === all.length - 1 && m.role === "assistant";
        return (
          <div key={i} className={isUser ? "flex justify-end" : "flex justify-start"}>
            <div
              className={
                isUser
                  ? "max-w-[85%] rounded-2xl bg-zinc-900 px-3.5 py-2.5 text-sm text-white dark:bg-white dark:text-zinc-900"
                  : "max-w-[85%] rounded-2xl border border-zinc-200 bg-white px-3.5 py-2.5 text-sm dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
              }
            >
              {m.imagePreviewUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={m.imagePreviewUrl} alt="attachment" className="mb-2 max-h-48 rounded-xl border border-zinc-200 object-contain dark:border-zinc-800" />
              )}
              {isUser ? (
                <div className="whitespace-pre-wrap break-words leading-relaxed">
                  {m.content}
                </div>
              ) : (
                <div className="prose prose-sm max-w-none break-words dark:prose-invert prose-p:my-2 prose-headings:font-semibold prose-headings:tracking-tight prose-pre:my-2 prose-pre:overflow-auto prose-code:text-[13px] prose-code:font-mono prose-table:text-sm prose-a:underline prose-a:underline-offset-4">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      a: (props) => <a {...props} target="_blank" rel="noopener noreferrer" />,
                      code: ({ children, ...props }) => {
                        const isBlock = String(children).includes("\n");
                        return isBlock ? (
                          <code {...props} className="block overflow-auto rounded-lg bg-zinc-100 px-3 py-2 dark:bg-zinc-800">
                            {children}
                          </code>
                        ) : (
                          <code {...props} className="rounded bg-zinc-100 px-1 py-0.5 dark:bg-zinc-800">
                            {children}
                          </code>
                        );
                      },
                      pre: (props) => <pre {...props} className="overflow-auto" />,
                    }}
                  >
                    {m.content}
                  </ReactMarkdown>
                  {isStreamingBubble && <span className="ml-1 inline-block h-3 w-1 animate-pulse bg-zinc-400 align-middle" />}
                </div>
              )}
              {!isUser && m.content && (
                <div className="mt-2 flex justify-end">
                  <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => handleCopy(m.content, i)}>
                    {copiedIdx === i ? <Check className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3" />}
                    {copiedIdx === i ? "Copied" : "Copy"}
                  </Button>
                </div>
              )}
            </div>
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
