import { message } from "@ai-chat/db/schema/chat";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { insertConversation, insertMessage } from "../testing/conversations";
import { createTestDeps } from "../testing/deps";
import { insertUser } from "../testing/router-client";
import { sweepInterruptedRuns } from "./run";

async function rowOf(id: string) {
  const [row] = await createTestDeps().db.select().from(message).where(eq(message.id, id));
  return row!;
}

describe("sweepInterruptedRuns", () => {
  it("ends every streaming Message as error, interrupted, keeping its text", async () => {
    const user = await insertUser();
    const first = await insertConversation(user);
    const second = await insertConversation(await insertUser());
    const half = await insertMessage({
      conversationId: first.id,
      role: "assistant",
      text: "Half",
      status: "streaming",
    });
    const empty = await insertMessage({
      conversationId: second.id,
      role: "assistant",
      text: "",
      status: "streaming",
    });

    await sweepInterruptedRuns(createTestDeps());

    expect(await rowOf(half.id)).toMatchObject({
      status: "error",
      error: "interrupted",
      errorReason: null,
      parts: { parts: [{ type: "text", text: "Half" }] },
    });
    expect(await rowOf(empty.id)).toMatchObject({ status: "error", error: "interrupted" });
  });

  it("leaves Messages that ended, and runs still going in this process, alone", async () => {
    const user = await insertUser();
    const conv = await insertConversation(user);
    const done = await insertMessage({ conversationId: conv.id, role: "assistant", text: "Done" });
    const stopped = await insertMessage({
      conversationId: conv.id,
      role: "assistant",
      text: "Sto",
      status: "stopped",
    });
    const live = await insertMessage({
      conversationId: conv.id,
      role: "assistant",
      text: "Li",
      status: "streaming",
    });
    const deps = createTestDeps();
    deps.runs.set(live.id, new AbortController());

    await sweepInterruptedRuns(deps);

    expect(await rowOf(done.id)).toMatchObject({ status: "complete", error: null });
    expect(await rowOf(stopped.id)).toMatchObject({ status: "stopped", error: null });
    expect(await rowOf(live.id)).toMatchObject({ status: "streaming" });
  });
});
