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
