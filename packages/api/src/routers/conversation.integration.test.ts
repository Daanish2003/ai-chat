import { message } from "@ai-chat/db/schema/chat";
import { getTestDb } from "@ai-chat/db/testing/test-database";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { handleChat } from "../chat/handle-chat";
import { saveCredentials } from "../credentials/store";
import { insertConversation, insertMessage } from "../testing/conversations";
import { createTestDeps } from "../testing/deps";
import { createFakeAdapter, round, text } from "../testing/fake-adapter";
import { createTestClient, insertUser, sessionFor } from "../testing/router-client";

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
      shared: false,
    });
  });

  it("flags a Conversation that has a Shared link", async () => {
    const { user, client } = await signedIn();
    const conv = await insertConversation(user);
    await insertMessage({ conversationId: conv.id, role: "user", text: "Hi", active: true });
    await client.share.upsert({ conversationId: conv.id });

    await expect(client.conversation.list()).resolves.toMatchObject([{ shared: true }]);
  });

  it("previews the question while its reply hasn't written any text yet", async () => {
    const { user, client } = await signedIn();
    const conv = await insertConversation(user);
    const question = await insertMessage({
      conversationId: conv.id,
      role: "user",
      text: "What is a CTE?",
    });
    await insertMessage({
      conversationId: conv.id,
      parentId: question.id,
      role: "assistant",
      text: "",
      status: "streaming",
      active: true,
    });

    const [row] = await client.conversation.list();

    expect(row).toMatchObject({ preview: "What is a CTE?", hasError: false });
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

describe("conversation.setModel", () => {
  async function withCredentials() {
    const { user, client } = await signedIn();
    for (const service of ["anthropic", "openai"] as const) {
      await saveCredentials(createTestDeps(), user.id, {
        service,
        fields: { apiKey: `${service}-test-key` },
        hint: "…-key",
        verified: true,
      });
    }
    return { user, client };
  }

  it("selects another Model without moving the Conversation in the list", async () => {
    const { user, client } = await withCredentials();
    const conv = await insertConversation(user, { model: "anthropic:claude-sonnet-5-5" });

    await client.conversation.setModel({ id: conv.id, model: "openai:gpt-6-luna" });

    await expect(client.conversation.get({ id: conv.id })).resolves.toMatchObject({
      model: "openai:gpt-6-luna",
    });
    const [listed] = await client.conversation.list();
    expect(listed).toMatchObject({ model: "openai:gpt-6-luna", lastMessageAt: conv.lastMessageAt });
  });

  it("refuses a Model that isn't available", async () => {
    const { user, client } = await withCredentials();
    const conv = await insertConversation(user);

    await expect(
      client.conversation.setModel({ id: conv.id, model: "openai:gpt-2" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("refuses a Model whose Provider the user has no credentials for", async () => {
    const { user, client } = await signedIn();
    const conv = await insertConversation(user);

    await expect(
      client.conversation.setModel({ id: conv.id, model: "openai:gpt-5.6" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(client.conversation.get({ id: conv.id })).resolves.toMatchObject({
      model: conv.model,
    });
  });

  it("can't change another user's Conversation, whatever the Model", async () => {
    const { client } = await signedIn();
    const conv = await insertConversation(await insertUser());

    await expect(
      client.conversation.setModel({ id: conv.id, model: "openai:gpt-5.6" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("rejects signed-out callers", async () => {
    const conv = await insertConversation(await insertUser());

    await expect(
      createTestClient().conversation.setModel({ id: conv.id, model: "openai:gpt-5.6" }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("switches Model mid-Conversation: the next reply is written by the newly selected Model", async () => {
    const user = await insertUser();
    const fake = createFakeAdapter({
      rounds: [round(text("From Claude")), round(text("From GPT"))],
    });
    const adapterModels: string[] = [];
    const deps = createTestDeps({
      adapterFor: (model) => {
        adapterModels.push(model);
        return fake.adapter;
      },
    });
    for (const service of ["anthropic", "openai"] as const) {
      await saveCredentials(deps, user.id, {
        service,
        fields: { apiKey: `${service}-test-key` },
        hint: "…-key",
        verified: true,
      });
    }
    const client = createTestClient({ user, deps });
    // What the client does: send with the Conversation's selected Model, continuing the Active Branch.
    const sendNext = async (text: string) => {
      const current = await client.conversation.get({ id });
      const response = await handleChat(
        new Request("http://localhost/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: [],
            forwardedProps: {
              conversationId: id,
              parentId: current.messages.at(-1)?.id ?? null,
              text,
              attachmentIds: [],
              model: current.model,
              webSearch: false,
            },
          }),
        }),
        sessionFor(user),
        deps,
      );
      await response.text();
    };
    const { id } = await client.conversation.create({ model: "anthropic:claude-sonnet-5-5" });

    await sendNext("First question");
    await client.conversation.setModel({ id, model: "openai:gpt-5.6" });
    await sendNext("Second question");

    const result = await client.conversation.get({ id });
    expect(adapterModels).toEqual(["anthropic:claude-sonnet-5-5", "openai:gpt-5.6"]);
    expect(result.model).toBe("openai:gpt-5.6");
    expect(result.messages.map((m) => [m.role, m.model, m.parts])).toEqual([
      ["user", null, [{ type: "text", content: "First question" }]],
      ["assistant", "anthropic:claude-sonnet-5-5", [{ type: "text", content: "From Claude" }]],
      ["user", null, [{ type: "text", content: "Second question" }]],
      ["assistant", "openai:gpt-5.6", [{ type: "text", content: "From GPT" }]],
    ]);
  });
});
