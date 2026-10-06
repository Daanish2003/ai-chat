import { message } from "@ai-chat/db/schema/chat";
import { getTestDb } from "@ai-chat/db/testing/test-database";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { insertConversation, insertMessage } from "../testing/conversations";
import { createTestClient, insertUser } from "../testing/router-client";

async function signedIn() {
  const user = await insertUser();
  return { user, client: createTestClient({ user }) };
}

describe("conversation.create", () => {
  it("creates an empty Conversation with the chosen Model", async () => {
    const { client } = await signedIn();

    const { id } = await client.conversation.create({ model: "openai:gpt-5.6" });

    await expect(client.conversation.get({ id })).resolves.toMatchObject({
      id,
      title: null,
      model: "openai:gpt-5.6",
      messages: [],
    });
  });

  it("refuses a Model that isn't available", async () => {
    const { client } = await signedIn();

    await expect(client.conversation.create({ model: "openai:gpt-2" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });
});

describe("conversation.get", () => {
  it("returns the Active Branch path, oldest first, leaving out other Branches", async () => {
    const { user, client } = await signedIn();
    const conv = await insertConversation(user);
    const question = await insertMessage({ conversationId: conv.id, role: "user", text: "Hi" });
    await insertMessage({
      conversationId: conv.id,
      parentId: question.id,
      role: "assistant",
      text: "An older reply",
    });
    const reply = await insertMessage({
      conversationId: conv.id,
      parentId: question.id,
      role: "assistant",
      text: "Hello!",
      active: true,
    });

    const result = await client.conversation.get({ id: conv.id });

    expect(result.messages).toEqual([
      {
        id: question.id,
        parentId: null,
        role: "user",
        parts: [{ type: "text", content: "Hi" }],
        model: null,
        status: "complete",
        error: null,
        errorReason: null,
        createdAt: question.createdAt,
      },
      {
        id: reply.id,
        parentId: question.id,
        role: "assistant",
        parts: [{ type: "text", content: "Hello!" }],
        model: "anthropic:claude-sonnet-5-5",
        status: "complete",
        error: null,
        errorReason: null,
        createdAt: reply.createdAt,
      },
    ]);
  });

  it("hides other users' Conversations", async () => {
    const owner = await signedIn();
    const conv = await insertConversation(owner.user);
    const other = await signedIn();

    await expect(other.client.conversation.get({ id: conv.id })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("answers NOT_FOUND for an id that isn't a Conversation", async () => {
    const { client } = await signedIn();

    await expect(
      client.conversation.get({ id: "0190a000-0000-7000-8000-000000000000" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("rejects signed-out callers", async () => {
    const client = createTestClient();

    await expect(client.conversation.create({ model: "openai:gpt-5.6" })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    await expect(
      client.conversation.get({ id: "0190a000-0000-7000-8000-000000000000" }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});

describe("conversation.list", () => {
  it("lists only the caller's Conversations, newest Message first", async () => {
    const { user, client } = await signedIn();
    const older = await insertConversation(user, {
      lastMessageAt: new Date("2026-10-01T10:00:00Z"),
    });
    const newer = await insertConversation(user, {
      lastMessageAt: new Date("2026-10-05T10:00:00Z"),
    });
    const other = await signedIn();
    await insertConversation(other.user);

    const list = await client.conversation.list();

    expect(list.map((row) => row.id)).toEqual([newer.id, older.id]);
  });

  it("previews the Active Branch's last Message on one line, with its Model and error flag", async () => {
    const { user, client } = await signedIn();
    const conv = await insertConversation(user, { title: "Recursion", model: "openai:gpt-5.6" });
    const question = await insertMessage({ conversationId: conv.id, role: "user", text: "Hi" });
    await insertMessage({
      conversationId: conv.id,
      parentId: question.id,
      role: "assistant",
      text: "A reply on another Branch",
    });
    await insertMessage({
      conversationId: conv.id,
      parentId: question.id,
      role: "assistant",
      text: "Partial\n\nanswer",
      status: "error",
      active: true,
    });

    const [row] = await client.conversation.list();

    expect(row).toEqual({
      id: conv.id,
      title: "Recursion",
      model: "openai:gpt-5.6",
      lastMessageAt: conv.lastMessageAt,
      preview: "Partial answer",
      hasError: true,
    });
  });

  it("shows an empty Conversation with no preview and no error", async () => {
    const { user, client } = await signedIn();
    await insertConversation(user);

    const [row] = await client.conversation.list();

    expect(row).toMatchObject({ title: null, preview: "", hasError: false });
  });

  it("rejects signed-out callers", async () => {
    await expect(createTestClient().conversation.list()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });
});

describe("conversation.rename", () => {
  it("renames the Conversation without moving it in the list", async () => {
    const { user, client } = await signedIn();
    const conv = await insertConversation(user, {
      lastMessageAt: new Date("2026-10-01T10:00:00Z"),
    });

    await client.conversation.rename({ id: conv.id, title: "  Recursive CTEs  " });

    await expect(client.conversation.list()).resolves.toMatchObject([
      { id: conv.id, title: "Recursive CTEs", lastMessageAt: conv.lastMessageAt },
    ]);
  });

  it("refuses a blank title", async () => {
    const { user, client } = await signedIn();
    const conv = await insertConversation(user);

    await expect(client.conversation.rename({ id: conv.id, title: "   " })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  it("can't rename another user's Conversation", async () => {
    const owner = await signedIn();
    const conv = await insertConversation(owner.user, { title: "Mine" });
    const other = await signedIn();

    await expect(
      other.client.conversation.rename({ id: conv.id, title: "Yours now" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(owner.client.conversation.get({ id: conv.id })).resolves.toMatchObject({
      title: "Mine",
    });
  });
});

describe("conversation.delete", () => {
  it("deletes the Conversation and its Messages for good", async () => {
    const { user, client } = await signedIn();
    const conv = await insertConversation(user);
    const question = await insertMessage({ conversationId: conv.id, role: "user", text: "Hi" });
    await insertMessage({
      conversationId: conv.id,
      parentId: question.id,
      role: "assistant",
      text: "Hello!",
      active: true,
    });

    await client.conversation.delete({ id: conv.id });

    await expect(client.conversation.list()).resolves.toEqual([]);
    await expect(client.conversation.get({ id: conv.id })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(
      getTestDb().select().from(message).where(eq(message.conversationId, conv.id)),
    ).resolves.toEqual([]);
  });

  it("can't delete another user's Conversation", async () => {
    const owner = await signedIn();
    const conv = await insertConversation(owner.user);
    const other = await signedIn();

    await expect(other.client.conversation.delete({ id: conv.id })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(owner.client.conversation.get({ id: conv.id })).resolves.toMatchObject({
      id: conv.id,
    });
  });

  it("rejects signed-out callers for rename and delete", async () => {
    const client = createTestClient();
    const id = "0190a000-0000-7000-8000-000000000000";

    await expect(client.conversation.rename({ id, title: "x" })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    await expect(client.conversation.delete({ id })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });
});
