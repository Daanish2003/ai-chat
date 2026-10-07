import { findModel } from "@ai-chat/api/chat/models";
import { Button } from "@ai-chat/ui/components/button";
import { Loader } from "@ai-chat/ui/components/prompt-kit/loader";
import { Markdown } from "@ai-chat/ui/components/prompt-kit/markdown";
import { SystemMessage } from "@ai-chat/ui/components/prompt-kit/system-message";
import { Textarea } from "@ai-chat/ui/components/textarea";
import { cn } from "@ai-chat/ui/lib/utils";
import type { UIMessage } from "@tanstack/ai-react";
import { Link } from "@tanstack/react-router";
import {
  BotIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CopyIcon,
  PencilIcon,
  RefreshCwIcon,
  UserIcon,
} from "lucide-react";
import { useState } from "react";

import { describeError, messageSiblings, messageInfo, type MessageInfo } from "@/lib/chat";

function plainText(message: UIMessage) {
  return message.parts.map((part) => (part.type === "text" ? part.content : "")).join("");
}

/**
 * One full-width Message row: avatar, header with the ‹ n/m › Branch arrows, then the text
 * (Markdown for the assistant). Hovering shows Copy, and Edit (user) or Regenerate (assistant).
 * While a reply streams, those and the arrows are disabled.
 */
export function MessageRow({
  message,
  streaming,
  onEdit,
  onRegenerate,
  onSwitchBranch,
}: {
  message: UIMessage;
  /** A reply is streaming in this Conversation. */
  streaming: boolean;
  /** Sends the edited text as a new Branch beside this user Message. */
  onEdit: (text: string) => void;
  /** Asks for a new reply beside this assistant Message. */
  onRegenerate: () => void;
  /** Shows the Branch through this sibling. */
  onSwitchBranch: (messageId: string) => void;
}) {
  const info = messageInfo(message);
  const text = plainText(message);
  const isUser = message.role === "user";
  const model = info.model ? (findModel(info.model)?.label ?? info.model) : null;
  const [editing, setEditing] = useState(false);

  return (
    <div
      className={cn(
        "group relative flex gap-3 border-b border-border/50 px-6 py-4",
        isUser && "bg-muted/30",
      )}
    >
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
          <BranchArrows message={message} disabled={streaming} onSwitch={onSwitchBranch} />
        </div>
        {editing ? (
          <EditBox
            initial={text}
            onCancel={() => setEditing(false)}
            onSave={(edited) => {
              setEditing(false);
              onEdit(edited);
            }}
            saveDisabled={streaming}
          />
        ) : isUser ? (
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
            {info.status === "error" && <ErrorMessage info={info} />}
          </>
        )}
      </div>
      {!editing && (
        <div className="absolute top-3 right-4 flex border bg-background opacity-0 shadow-sm group-focus-within:opacity-100 group-hover:opacity-100">
          <CopyButton text={text} disabled={streaming} />
          {isUser ? (
            <Button
              variant="ghost"
              size="icon-xs"
              disabled={streaming}
              onClick={() => setEditing(true)}
              title="Edit (new Branch)"
              aria-label="Edit"
            >
              <PencilIcon />
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="icon-xs"
              disabled={streaming}
              onClick={onRegenerate}
              title="Regenerate (new Branch)"
              aria-label="Regenerate"
            >
              <RefreshCwIcon />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

/** ‹ n/m › between a Message's siblings; nothing when it has none. */
function BranchArrows({
  message,
  disabled,
  onSwitch,
}: {
  message: UIMessage;
  disabled: boolean;
  onSwitch: (messageId: string) => void;
}) {
  const { index, count, previousId, nextId } = messageSiblings(message);
  if (count < 2) return null;
  return (
    <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground tabular-nums">
      <Button
        variant="ghost"
        size="icon-xs"
        disabled={disabled || !previousId}
        onClick={() => previousId && onSwitch(previousId)}
        aria-label="Previous Branch"
      >
        <ChevronLeftIcon />
      </Button>
      {index + 1}/{count}
      <Button
        variant="ghost"
        size="icon-xs"
        disabled={disabled || !nextId}
        onClick={() => nextId && onSwitch(nextId)}
        aria-label="Next Branch"
      >
        <ChevronRightIcon />
      </Button>
    </span>
  );
}

function CopyButton({ text, disabled }: { text: string; disabled: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="ghost"
      size="icon-xs"
      disabled={disabled}
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        });
      }}
      title="Copy"
      aria-label="Copy"
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
    </Button>
  );
}

/** Inline edit of a user Message: Enter or Save & submit sends it, Escape cancels. */
function EditBox({
  initial,
  onSave,
  onCancel,
  saveDisabled,
}: {
  initial: string;
  onSave: (text: string) => void;
  onCancel: () => void;
  saveDisabled: boolean;
}) {
  const [value, setValue] = useState(initial);
  const canSave = !saveDisabled && value.trim().length > 0;
  const save = () => canSave && onSave(value.trim());
  return (
    <div className="flex max-w-[80ch] flex-col gap-2 border bg-card p-2">
      <Textarea
        autoFocus
        aria-label="Edit Message"
        className="min-h-12 border-none bg-transparent text-sm md:text-sm dark:bg-transparent"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            save();
          }
          if (event.key === "Escape") onCancel();
        }}
      />
      <div className="flex justify-end gap-1.5">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" disabled={!canSave} onClick={save}>
          Save & submit
        </Button>
      </div>
      <p className="text-[10px] text-muted-foreground">
        Saving creates a new Branch. The old one stays reachable with the arrows.
      </p>
    </div>
  );
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
