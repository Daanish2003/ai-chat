import type { MessageUsage } from "../../core/shared/chat/message-record";
import { buttonVariants } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { InfoIcon } from "lucide-react";
import { Fragment } from "react";

/** An assistant Message's tokens behind an info control. Tokens only, never cost. */
export function UsageInfo({ usage }: { usage: MessageUsage }) {
  return (
    <Popover>
      <PopoverTrigger
        aria-label="Token usage"
        title="Token usage"
        className={cn(
          buttonVariants({ variant: "ghost", size: "icon-xs" }),
          "text-muted-foreground",
        )}
      >
        <InfoIcon />
      </PopoverTrigger>
      <PopoverContent className="w-52 p-3">
        <UsageBreakdown usage={usage} />
      </PopoverContent>
    </Popover>
  );
}

/** The tokens a reply's Run used, and a note when they are an estimate. */
export function UsageBreakdown({ usage }: { usage: MessageUsage }) {
  const rows = [
    ["Input", usage.input],
    ["Output", usage.output],
    ["Reasoning", usage.reasoning],
    ["Cached", usage.cached],
  ] as const;
  return (
    <div className="flex flex-col gap-2 text-xs">
      <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1">
        {rows.map(([label, tokens]) => (
          <Fragment key={label}>
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="text-right tabular-nums">{tokens.toLocaleString("en-US")}</dd>
          </Fragment>
        ))}
      </dl>
      {usage.estimated && (
        <p className="text-muted-foreground">
          Estimate: the Provider reported no usage for this reply.
        </p>
      )}
    </div>
  );
}
