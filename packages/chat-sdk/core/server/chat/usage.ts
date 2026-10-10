import { fromSpecTokenUsage, type ModelMessage, type TokenUsage } from "@tanstack/ai";

import { usage } from "../db/schema/usage";
import type { AppDeps, HostModel } from "../deps";
import { uuidv7 } from "../lib/uuidv7";

/** A Host Model's price, per 1M tokens (ADR 0007). */
export type HostPrice = Pick<HostModel, "inputUsdPerMillion" | "outputUsdPerMillion">;

/** A Run on Host credentials: whose Quota it counts against, and what the Model costs. */
export type UsageMeter = { userId: string; model: string; price: HostPrice };

/** A Run's usage summed over its RUN_FINISHED chunks; `cost` only when a Provider reported one. */
export type RunTotals = { promptTokens: number; completionTokens: number; cost?: number };

/** Adds one RUN_FINISHED chunk's usage to a Run's running total. */
export function addRunUsage(
  total: RunTotals | undefined,
  chunkUsage: unknown,
): RunTotals | undefined {
  const next = Array.isArray(chunkUsage)
    ? fromSpecTokenUsage(chunkUsage)
    : (chunkUsage as TokenUsage | undefined);
  if (!next) return total;
  const cost =
    next.cost === undefined && total?.cost === undefined
      ? undefined
      : (total?.cost ?? 0) + (next.cost ?? 0);
  return {
    promptTokens: (total?.promptTokens ?? 0) + next.promptTokens,
    completionTokens: (total?.completionTokens ?? 0) + next.completionTokens,
    cost,
  };
}

/** A usage row's numbers, as the cost of a call on Host credentials (ADR 0007). */
export type RunCost = {
  inputTokens: number;
  outputTokens: number;
  costMicros: number;
  estimated: boolean;
};

/**
 * The cost of a Run on Host credentials. A Run that completed with usage costs what the Provider
 * reported, else its tokens times the Model's price. Anything else (a stopped or failed Run, or one
 * with no usage) is estimated from characters ÷ 4 and priced the same way.
 */
export function runCost({
  totals,
  completed,
  inputChars,
  outputChars,
  price,
}: {
  totals: RunTotals | undefined;
  completed: boolean;
  inputChars: number;
  outputChars: number;
  price: HostPrice;
}): RunCost {
  if (completed && totals) {
    const costMicros =
      totals.cost !== undefined
        ? Math.round(totals.cost * 1_000_000)
        : Math.round(
            totals.promptTokens * price.inputUsdPerMillion +
              totals.completionTokens * price.outputUsdPerMillion,
          );
    return {
      inputTokens: totals.promptTokens,
      outputTokens: totals.completionTokens,
      costMicros,
      estimated: false,
    };
  }
  const inputTokens = Math.ceil(inputChars / 4);
  const outputTokens = Math.ceil(outputChars / 4);
  return {
    inputTokens,
    outputTokens,
    costMicros: Math.round(
      inputTokens * price.inputUsdPerMillion + outputTokens * price.outputUsdPerMillion,
    ),
    estimated: true,
  };
}

/** The characters of the text the Model was sent: string contents and text parts. */
export function inputCharsOf(messages: ModelMessage[]): number {
  return messages.reduce((total, { content }) => {
    if (typeof content === "string") return total + content.length;
    if (!Array.isArray(content)) return total;
    return (
      total +
      content.reduce((sum, part) => sum + (part.type === "text" ? part.content.length : 0), 0)
    );
  }, 0);
}

/** Writes the usage row of a Run on Host credentials (ADR 0007). */
export async function recordRunUsage(
  deps: Pick<AppDeps, "db">,
  meter: UsageMeter,
  run: {
    totals: RunTotals | undefined;
    completed: boolean;
    messages: ModelMessage[];
    outputText: string;
  },
): Promise<void> {
  const cost = runCost({
    totals: run.totals,
    completed: run.completed,
    inputChars: inputCharsOf(run.messages),
    outputChars: run.outputText.length,
    price: meter.price,
  });
  await deps.db.insert(usage).values({
    id: uuidv7(),
    userId: meter.userId,
    kind: "run",
    model: meter.model,
    ...cost,
  });
}
