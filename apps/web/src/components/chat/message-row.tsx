import { findModel } from "@ai-chat/api/chat/models";
import { Loader } from "@ai-chat/ui/components/prompt-kit/loader";
import { Markdown } from "@ai-chat/ui/components/prompt-kit/markdown";
import { cn } from "@ai-chat/ui/lib/utils";
import type { UIMessage } from "@tanstack/ai-react";
import { BotIcon, UserIcon } from "lucide-react";

import { messageInfo } from "@/lib/chat";

function textOf(message: UIMessage) {
  return message.parts.map((part) => (part.type === "text" ? part.content : "")).join("");
}

/** One full-width Message row: avatar, header, then the text (Markdown for the assistant). */
export function MessageRow({ message }: { message: UIMessage }) {
  const info = messageInfo(message);
  const text = textOf(message);
  const isUser = message.role === "user";
  const model = info.model ? (findModel(info.model)?.label ?? info.model) : null;

  return (
    <div className={cn("flex gap-3 border-b border-border/50 px-6 py-4", isUser && "bg-muted/30")}>
      <div
        className={cn(
          "flex size-7 shrink-0 items-center justify-center",
          isUser ? "bg-secondary" : "bg-primary/15 text-primary",
        )}
      >
        {isUser ? <UserIcon className="size-3.5" /> : <BotIcon className="size-3.5" />}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex items-center gap-2 text-xs">
          <span className="font-medium">{isUser ? "You" : "Assistant"}</span>
          {!isUser && model && (
            <span className="border px-1.5 py-0.5 text-[10px] text-muted-foreground">{model}</span>
          )}
          {message.createdAt && (
            <time
              className="text-[10px] text-muted-foreground"
              dateTime={message.createdAt.toISOString()}
            >
              {message.createdAt.toLocaleTimeString(undefined, {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </time>
          )}
        </div>
        {isUser ? (
          <p className="max-w-[80ch] text-sm whitespace-pre-wrap">{text}</p>
        ) : (
          <>
            {text && (
              <Markdown className="prose prose-sm max-w-[80ch] dark:prose-invert">{text}</Markdown>
            )}
            {info.status === "streaming" && !text && <Loader variant="typing" size="sm" />}
            {info.status === "stopped" && (
              <span className="text-xs text-muted-foreground italic">Stopped</span>
            )}
            {info.status === "error" && (
              <p role="alert" className="text-xs text-destructive">
                {info.error ?? "The Provider returned an error."}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
