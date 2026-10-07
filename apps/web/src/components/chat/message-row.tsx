import { findModel } from "@ai-chat/api/chat/models";
import { webSearchOf } from "@ai-chat/api/chat/web-search";
import { Loader } from "@ai-chat/ui/components/prompt-kit/loader";
import { Markdown } from "@ai-chat/ui/components/prompt-kit/markdown";
import { SystemMessage } from "@ai-chat/ui/components/prompt-kit/system-message";
import { cn } from "@ai-chat/ui/lib/utils";
import type { UIMessage } from "@tanstack/ai-react";
import { Link } from "@tanstack/react-router";
import { BotIcon, UserIcon } from "lucide-react";

import { describeError, messageInfo, type MessageInfo } from "@/lib/chat";

import { SearchRow } from "./search-row";

function plainText(message: UIMessage) {
  return message.parts.map((part) => (part.type === "text" ? part.content : "")).join("");
}

/** One full-width Message row: avatar, header, then the text (Markdown for the assistant). */
export function MessageRow({ message }: { message: UIMessage }) {
  const info = messageInfo(message);
  const text = plainText(message);
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
            <AssistantParts parts={message.parts} />
            {info.status === "streaming" && waitingForText(message.parts) && (
              <Loader variant="typing" size="sm" />
            )}
            {info.status === "stopped" && (
              <span className="text-xs text-muted-foreground italic">Stopped</span>
            )}
            {info.status === "error" && <ErrorMessage info={info} />}
          </>
        )}
      </div>
    </div>
  );
}

/** A reply's text and web searches, in stream order. */
function AssistantParts({ parts }: { parts: UIMessage["parts"] }) {
  return parts.map((part, index) => {
    if (part.type === "text") {
      return part.content ? (
        <Markdown key={index} className="prose prose-sm max-w-[80ch] dark:prose-invert">
          {part.content}
        </Markdown>
      ) : null;
    }
    const search = webSearchOf(part);
    return search ? <SearchRow key={search.toolCallId} search={search} /> : null;
  });
}

/**
 * A streaming reply shows the typing loader until text arrives: before its first token, and
 * after a finished search. A running search shows its own spinner instead.
 */
function waitingForText(parts: UIMessage["parts"]) {
  const shown = parts.filter((part) =>
    part.type === "text" ? part.content !== "" : webSearchOf(part) !== null,
  );
  const last = shown.at(-1);
  if (!last) return true;
  if (last.type === "text") return false;
  return webSearchOf(last)?.state !== "running";
}

/** Why the reply ended in `error`, with a way to fix a rejected key. */
function ErrorMessage({ info }: { info: MessageInfo }) {
  const { text, keySettings } = describeError(info);
  return (
    <SystemMessage variant="error" fill role="alert" className="max-w-[80ch] rounded-none">
      {text}
      {keySettings && (
        <>
          {" "}
          <Link to="/settings/keys" className="font-medium underline underline-offset-2">
            Key settings
          </Link>
        </>
      )}
    </SystemMessage>
  );
}
