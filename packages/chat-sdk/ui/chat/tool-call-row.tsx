import type { ToolCallStatus, ToolCallView } from "../../core/shared/chat/tool-call";
import { cn } from "@/lib/utils";
import { BanIcon, CheckIcon, ChevronRightIcon, LoaderIcon, WrenchIcon, XIcon } from "lucide-react";
import { useId, useState } from "react";

const statusLabels: Record<ToolCallStatus, string> = {
  running: "Running",
  done: "Done",
  error: "Failed",
  cancelled: "Cancelled",
};

/**
 * One tool call of a reply other than a search (a Host tool, later an MCP tool): a slim line with
 * its name and state, which expands to the arguments and result. A call redacted for a Shared link
 * shows only that it was used. To give one tool its own look, edit this file in the Host's `ui/`;
 * the SDK copy never overwrites it.
 */
export function ToolCallRow({ call }: { call: ToolCallView }) {
  const [open, setOpen] = useState(false);
  const detailsId = useId();

  if (call.redacted) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <WrenchIcon className="size-3.5 shrink-0" aria-hidden />
        <span>{`Used ${call.name}`}</span>
      </div>
    );
  }

  return (
    <div className="flex max-w-[80ch] flex-col gap-2 text-xs text-muted-foreground">
      <div className="flex items-center gap-1.5">
        <StatusIcon status={call.status} />
        <button
          type="button"
          className="truncate hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          aria-expanded={open}
          aria-controls={detailsId}
          onClick={() => setOpen((value) => !value)}
        >
          <span className="font-medium">{call.name}</span>
          <span role="status" className="ml-1.5 italic">
            {statusLabels[call.status]}
          </span>
          <ChevronRightIcon
            className={cn("ml-1 inline size-3.5 transition-transform", open && "rotate-90")}
            aria-hidden
          />
        </button>
      </div>
      {open && (
        <div id={detailsId} className="border-l pl-3">
          <ToolCallDetails call={call} />
        </div>
      )}
    </div>
  );
}

/** A tool call's arguments and, once it has one, its result. */
export function ToolCallDetails({ call }: { call: ToolCallView }) {
  return (
    <div className="space-y-2">
      <JsonBlock title="Arguments" value={call.args} />
      {call.result !== undefined && <JsonBlock title="Result" value={call.result} />}
    </div>
  );
}

function JsonBlock({ title, value }: { title: string; value: unknown }) {
  return (
    <div className="space-y-1">
      <p className="font-medium text-foreground">{title}</p>
      <pre className="overflow-x-auto rounded-md bg-muted p-2 break-all whitespace-pre-wrap">
        {JSON.stringify(value)}
      </pre>
    </div>
  );
}

function StatusIcon({ status }: { status: ToolCallStatus }) {
  const className = "size-3.5 shrink-0";
  switch (status) {
    case "running":
      return <LoaderIcon className={cn(className, "animate-spin")} aria-hidden />;
    case "done":
      return <CheckIcon className={className} aria-hidden />;
    case "error":
      return <XIcon className={className} aria-hidden />;
    case "cancelled":
      return <BanIcon className={className} aria-hidden />;
  }
}
