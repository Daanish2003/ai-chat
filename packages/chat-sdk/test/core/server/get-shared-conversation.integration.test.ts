import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { createChatClient } from "../../../core/client/chat-client";
import { createChat } from "../../../core/server/create-chat";
import { conversation } from "../../../core/server/db/schema/chat";
import { insertConversation, insertMessage } from "../../support/conversations";
import { testKeyEncryptionSecret } from "../../support/deps";
import { insertUser, type TestUser } from "../../support/router-client";
import { getTestDb, testDatabaseUrl } from "../../support/test-database";

const basePath = "/api/chat";

/** A `createChat` signed in as `user`, with the owner's calls going through its handler. */
function chatFor(user: TestUser | null) {
  const chat = createChat({
    databaseUrl: testDatabaseUrl,
    getUser: () => (user ? { id: user.id } : null),
    keyEncryptionSecret: testKeyEncryptionSecret,
    basePath,
  });
  const client = createChatClient({
    baseUrl: `http://localhost${basePath}`,
    fetch: chat.handler,
  });
  return { chat, client };
}

describe("chat.getSharedConversation", () => {
  it("returns the snapshot of a shared Conversation, with no user", async () => {
    const owner = await insertUser();
    const conv = await insertConversation(owner, { title: "Recursive CTEs" });
    const question = await insertMessage({
      conversationId: conv.id,
      role: "user",
      text: "Explain CTEs",
    });
    await insertMessage({
      conversationId: conv.id,
      parentId: question.id,
      role: "assistant",
      text: "A CTE names a query.",
      active: true,
    });
    const { client } = chatFor(owner);
    const link = await client.rpc.share.upsert({ conversationId: conv.id });

    const shared = await chatFor(null).chat.getSharedConversation(link.token);

    expect(shared).toMatchObject({ title: "Recursive CTEs" });
    expect(shared?.messages.map(({ role }) => role)).toEqual(["user", "assistant"]);
  });

  it("moves a re-shared link to the current Active Branch under the same token", async () => {
    const owner = await insertUser();
    const conv = await insertConversation(owner, { title: "Branches" });
    const first = await insertMessage({ conversationId: conv.id, role: "user", text: "One" });
    await insertMessage({
      conversationId: conv.id,
      parentId: first.id,
      role: "assistant",
      text: "Reply one",
      active: true,
    });
    const { chat, client } = chatFor(owner);
    const link = await client.rpc.share.upsert({ conversationId: conv.id });
    const before = await chat.getSharedConversation(link.token);
    expect(before?.messages).toHaveLength(2);

    const second = await insertMessage({
      conversationId: conv.id,
      parentId: first.id,
      role: "user",
      text: "Two",
    });
    await insertMessage({
      conversationId: conv.id,
      parentId: second.id,
      role: "assistant",
      text: "Reply two",
      active: true,
    });
    const reshared = await client.rpc.share.upsert({ conversationId: conv.id });
    const after = await chat.getSharedConversation(link.token);

    expect(reshared.token).toBe(link.token);
    expect(after?.messages.map(({ id }) => id)).toEqual([first.id, second.id, expect.any(String)]);
    expect(after?.messages.at(-1)?.parts).toEqual([{ type: "text", content: "Reply two" }]);
  });

  it("returns null for an unknown token", async () => {
    const { chat } = chatFor(null);

    expect(await chat.getSharedConversation("no-such-token")).toBeNull();
  });

  it("returns null once the owner removes the link", async () => {
    const owner = await insertUser();
    const conv = await insertConversation(owner, { title: "Unshared" });
    await insertMessage({ conversationId: conv.id, role: "user", text: "Hi", active: true });
    const { chat, client } = chatFor(owner);
    const link = await client.rpc.share.upsert({ conversationId: conv.id });

    await client.rpc.share.delete({ conversationId: conv.id });

    expect(await chat.getSharedConversation(link.token)).toBeNull();
  });

  it("returns null once the Conversation is deleted", async () => {
    const owner = await insertUser();
    const conv = await insertConversation(owner, { title: "Gone soon" });
    await insertMessage({
      conversationId: conv.id,
      role: "user",
      text: "Bye",
      active: true,
    });
    const { chat, client } = chatFor(owner);
    const link = await client.rpc.share.upsert({ conversationId: conv.id });

    await getTestDb().delete(conversation).where(eq(conversation.id, conv.id));

    expect(await chat.getSharedConversation(link.token)).toBeNull();
  });
});
