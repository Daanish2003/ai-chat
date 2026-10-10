import type { AnyServerTool, ToolExecutionContext } from "@tanstack/ai";

import type { createPartsBuilder } from "../../shared/chat/parts";

/**
 * The Host's own tools (`createChat({ tools })`), written with TanStack AI's
 * `toolDefinition(...).server(fn)`. `fn` gets the user's and the Conversation's ids as the
 * context: `.server<HostToolContext>(...)`, then `context.context.userId`.
 */
export type HostToolContext = { userId: string; conversationId: string };

/** A Host tool, as `createChat({ tools })` takes it. */
export type HostTool = AnyServerTool;

/** Tool calls one reply may make across the Host's tools (and, later, MCP tools). */
export const maxToolCallsPerReply = 10;

export const toolCallLimitError = "tool call limit reached";

/**
 * The Host's tools for one reply. Each call is recorded in the reply's `parts` as a `host`
 * `tool_call`, and calls `onChange` when they change. A tool that throws fails only its own call:
 * the error becomes its result and the reply continues. Past `maxToolCallsPerReply` calls, a call
 * gets `toolCallLimitError` and runs nothing. A call cut off by the run ending (its signal aborts)
 * stays running, and the run closes it as cancelled.
 */
export function createHostTools(
  tools: HostTool[],
  {
    parts,
    onChange,
  }: {
    parts: ReturnType<typeof createPartsBuilder>;
    onChange: () => void;
  },
): AnyServerTool[] {
  let calls = 0;
  return tools.map((tool) => {
    const run = tool.execute;
    return {
      ...tool,
      execute: async (args: unknown, context?: ToolExecutionContext<HostToolContext>) => {
        // TanStack AI passes the call's id to every server tool; the stored part is keyed by it.
        const toolCallId = context?.toolCallId;
        if (!toolCallId) throw new Error(`${tool.name} was called without a tool call id`);
        parts.startToolCall({ toolCallId, name: tool.name, source: "host", args });
        onChange();
        try {
          if (calls >= maxToolCallsPerReply) {
            const error = { error: toolCallLimitError };
            parts.finishToolCall(toolCallId, { state: "error", result: error });
            return error;
          }
          calls++;
          const result = await run?.(args, context);
          parts.finishToolCall(toolCallId, { state: "done", result });
          return result;
        } catch (caught) {
          if (context?.abortSignal?.aborted) throw caught;
          const error = { error: caught instanceof Error ? caught.message : String(caught) };
          parts.finishToolCall(toolCallId, { state: "error", result: error });
          return error;
        } finally {
          onChange();
        }
      },
    };
  });
}
