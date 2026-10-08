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
    // Before boot by the host's clock; the database's default `createdAt` can run ahead of it.
    const createdAt = new Date(Date.now() - 60_000);
    const half = await insertMessage({
      conversationId: first.id,
      role: "assistant",
      text: "Half",
      status: "streaming",
      createdAt,
    });
    const empty = await insertMessage({
      conversationId: second.id,
      role: "assistant",
      text: "",
      status: "streaming",
      createdAt,
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

  it("leaves Messages that ended, and Messages from after boot, alone", async () => {
    const user = await insertUser();
    const conv = await insertConversation(user);
    const done = await insertMessage({ conversationId: conv.id, role: "assistant", text: "Done" });
    const stopped = await insertMessage({
      conversationId: conv.id,
      role: "assistant",
      text: "Sto",
      status: "stopped",
    });
    const bootedAt = new Date();
    const live = await insertMessage({
      conversationId: conv.id,
      role: "assistant",
      text: "Li",
      status: "streaming",
      createdAt: new Date(bootedAt.getTime() + 1),
    });

    await sweepInterruptedRuns(createTestDeps(), bootedAt);

    expect(await rowOf(done.id)).toMatchObject({ status: "complete", error: null });
    expect(await rowOf(stopped.id)).toMatchObject({ status: "stopped", error: null });
    expect(await rowOf(live.id)).toMatchObject({ status: "streaming" });
  });
});
