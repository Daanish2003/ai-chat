import { describe, expect, it } from "vitest";

import { insertConversation, insertMessage } from "../testing/conversations";
import { createTestClient, insertUser } from "../testing/router-client";

async function signedIn() {
  const user = await insertUser();
  return { user, client: createTestClient({ user }) };
}

/** A minute after a fixed start, so ordering doesn't depend on the database clock. */
function at(minute: number) {
  return new Date(Date.UTC(2026, 9, 1, 12, minute));
}

describe("search.query", () => {
  it("finds Messages on every Branch, newest first, one row per Message", async () => {
    const { user, client } = await signedIn();
    const conv = await insertConversation(user, { title: "Trip planning" });
    const question = await insertMessage({
      conversationId: conv.id,
      role: "user",
      text: "Where should I go in Lisbon?",
      createdAt: at(1),
    });
    const inactive = await insertMessage({
      conversationId: conv.id,
      parentId: question.id,
      role: "assistant",
      text: "Lisbon has Alfama and Belém.",
      createdAt: at(2),
    });
    const active = await insertMessage({
      conversationId: conv.id,
      parentId: question.id,
      role: "assistant",
      text: "Try LISBON's Bairro Alto.",
      createdAt: at(3),
      active: true,
    });
    await insertMessage({
      conversationId: conv.id,
      parentId: active.id,
      role: "user",
      text: "Thanks!",
      createdAt: at(4),
    });

    const result = await client.search.query({ q: "lisbon" });

    expect(result.hits.map((hit) => hit.messageId)).toEqual([active.id, inactive.id, question.id]);
    expect(result.hits[0]).toEqual({
      messageId: active.id,
      conversationId: conv.id,
      conversationTitle: "Trip planning",
      role: "assistant",
      createdAt: at(3),
      snippet: { text: "Try LISBON's Bairro Alto.", match: { start: 4, end: 10 } },
    });
    expect(result.nextCursor).toBeNull();
  });

  it("never returns another user's Messages", async () => {
    const { client } = await signedIn();
    const other = await insertUser();
    const theirs = await insertConversation(other);
    await insertMessage({ conversationId: theirs.id, role: "user", text: "secret plans" });

    await expect(client.search.query({ q: "secret" })).resolves.toEqual({
      hits: [],
      nextCursor: null,
    });
  });

  it("matches `%`, `_` and `\\` literally", async () => {
    const { user, client } = await signedIn();
    const conv = await insertConversation(user);
    const literal = await insertMessage({
      conversationId: conv.id,
      role: "user",
      text: String.raw`50% off_ C:\temp`,
    });
    await insertMessage({ conversationId: conv.id, role: "user", text: "500 offers" });
    await insertMessage({ conversationId: conv.id, role: "user", text: "offXline" });
    await insertMessage({ conversationId: conv.id, role: "user", text: "C:/temp" });

    for (const q of ["0%", "off_", String.raw`:\t`]) {
      const result = await client.search.query({ q });
      expect(
        result.hits.map((hit) => hit.messageId),
        q,
      ).toEqual([literal.id]);
    }
  });

  it("refuses queries shorter than 2 characters", async () => {
    const { client } = await signedIn();

    await expect(client.search.query({ q: " a " })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  it("pages through hits with a cursor", async () => {
    const { user, client } = await signedIn();
    const conv = await insertConversation(user);
    const ids: string[] = [];
    for (let minute = 0; minute < 55; minute++) {
      const row = await insertMessage({
        conversationId: conv.id,
        role: "user",
        text: `note ${minute}`,
        createdAt: at(minute),
      });
      ids.unshift(row.id);
    }

    const first = await client.search.query({ q: "note" });
    expect(first.hits.map((hit) => hit.messageId)).toEqual(ids.slice(0, 50));
    expect(first.nextCursor).not.toBeNull();

    const second = await client.search.query({ q: "note", cursor: first.nextCursor! });
    expect(second.hits.map((hit) => hit.messageId)).toEqual(ids.slice(50));
    expect(second.nextCursor).toBeNull();
  });

  it("refuses a cursor it didn't write", async () => {
    const { client } = await signedIn();

    await expect(client.search.query({ q: "note", cursor: "garbage" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  it("requires a signed-in user", async () => {
    await expect(createTestClient().search.query({ q: "anything" })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });
});
