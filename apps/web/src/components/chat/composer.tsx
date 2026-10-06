import { Button } from "@ai-chat/ui/components/button";
import {
  PromptInput,
  PromptInputActions,
  PromptInputTextarea,
} from "@ai-chat/ui/components/prompt-kit/prompt-input";
import { ArrowUpIcon, SquareIcon } from "lucide-react";
import { type ReactNode, useState } from "react";

/**
 * The docked composer: Enter sends, Shift+Enter starts a new line. While a reply streams, sending
 * is disabled and Send becomes Stop.
 */
export function Composer({
  onSend,
  onStop,
  streaming = false,
  disabled = false,
  children,
}: {
  onSend: (text: string) => void;
  onStop?: () => void;
  /** A reply is streaming in this Conversation. */
  streaming?: boolean;
  /** When sending isn't possible. */
  disabled?: boolean;
  /** Extra controls on the left of the actions row. */
  children?: ReactNode;
}) {
  const [value, setValue] = useState("");
  const canSend = !disabled && !streaming && value.trim().length > 0;

  const submit = () => {
    if (!canSend) return;
    onSend(value.trim());
    setValue("");
  };

  return (
    <PromptInput
      value={value}
      onValueChange={setValue}
      onSubmit={submit}
      isLoading={disabled || streaming}
      className="rounded-none bg-card"
    >
      <PromptInputTextarea
        placeholder="Message (Enter to send, Shift+Enter for a new line)"
        className="text-sm text-foreground"
        aria-label="Message"
      />
      <PromptInputActions className="justify-between px-1 pt-1">
        <div className="flex items-center gap-1">{children}</div>
        {streaming ? (
          <Button
            size="icon"
            className="rounded-full"
            disabled={!onStop}
            onClick={onStop}
            aria-label="Stop"
          >
            <SquareIcon className="fill-current" />
          </Button>
        ) : (
          <Button
            size="icon"
            className="rounded-full"
            disabled={!canSend}
            onClick={submit}
            aria-label="Send"
          >
            <ArrowUpIcon />
          </Button>
        )}
      </PromptInputActions>
    </PromptInput>
  );
}
