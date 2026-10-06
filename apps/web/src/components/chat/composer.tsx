import { Button } from "@ai-chat/ui/components/button";
import {
  PromptInput,
  PromptInputActions,
  PromptInputTextarea,
} from "@ai-chat/ui/components/prompt-kit/prompt-input";
import { ArrowUpIcon } from "lucide-react";
import { type ReactNode, useState } from "react";

/** The docked composer: Enter sends, Shift+Enter starts a new line. */
export function Composer({
  onSend,
  disabled = false,
  children,
}: {
  onSend: (text: string) => void;
  /** While a reply streams, or when sending isn't possible. */
  disabled?: boolean;
  /** Extra controls on the left of the actions row. */
  children?: ReactNode;
}) {
  const [value, setValue] = useState("");
  const canSend = !disabled && value.trim().length > 0;

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
      isLoading={disabled}
      className="rounded-none bg-card"
    >
      <PromptInputTextarea
        placeholder="Message (Enter to send, Shift+Enter for a new line)"
        className="text-sm text-foreground"
        aria-label="Message"
      />
      <PromptInputActions className="justify-between px-1 pt-1">
        <div className="flex items-center gap-1">{children}</div>
        <Button
          size="icon"
          className="rounded-full"
          disabled={!canSend}
          onClick={submit}
          aria-label="Send"
        >
          <ArrowUpIcon />
        </Button>
      </PromptInputActions>
    </PromptInput>
  );
}
