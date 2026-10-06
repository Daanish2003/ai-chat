import { conversation, message } from "@ai-chat/db/schema/chat";
import { asc, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { saveCredentials } from "../credentials/store";
import type { AppDeps } from "../deps";
import { insertConversation, insertMessage } from "../testing/conversations";
import { createTestDeps } from "../testing/deps";
import { createFakeAdapter, round, runError, text } from "../testing/fake-adapter";
import { insertUser, sessionFor, type TestUser } from "../testing/router-client";
import { type ChatCommand, handleChat } from "./handle-chat";

const anthropicModel = "anthropic:claude-sonnet-5-5";

function chatRequest(command: Partial<ChatCommand> & Record<string, unknown>, extra = {}) {
  // useChat posts an AG-UI RunAgentInput; our command rides in `forwardedProps`.
  return new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: [], forwardedProps: command, ...extra }),
  });
}

/** A signed-in user with Anthropic credentials, an empty Conversation and a scripted adapter. */
async function setup({
  rounds = [round(text("Hello", " there!"))],
  manual = false,
  deps: overrides = {},
}: {
  rounds?: Parameters<typeof createFakeAdapter>[0]["rounds"];
  manual?: boolean;
  deps?: Partial<AppDeps>;
} = {}) {
  const user = await insertUser();
  const fake = createFakeAdapter({ rounds, manual });
  const adapterCalls: Array<{ model: string; credentials: Record<string, string> }> = [];
  const deps = createTestDeps({
    adapterFor: (model, credentials) => {
      adapterCalls.push({ model, credentials });
      return fake.adapter;
    },
    ...overrides,
  });
  await saveCredentials(deps, user.id, {
    service: "anthropic",
    fields: { apiKey: "sk-ant-test-key" },
    hint: "…-key",
    verified: true,
  });
  const chat = await insertConversation(user, { model: "openai:gpt-5.6" });
  const send = (command: Partial<ChatCommand> = {}, as: TestUser | null = user) =>
    handleChat(
      chatRequest({
        conversationId: chat.id,
        parentId: null,
        text: "Hi",
        attachmentIds: [],
        model: anthropicModel,
        webSearch: false,
        ...command,
      }),
      as ? sessionFor(as) : null,
      deps,
    );
  return { user, deps, fake, adapterCalls, chat, send };
}

async function messagesOf(deps: AppDeps, conversationId: string) {
  return deps.db
    .select()
    .from(message)
    .where(eq(message.conversationId, conversationId))
    .orderBy(asc(message.createdAt), asc(message.role));
}

async function conversationRow(deps: AppDeps, id: string) {
  const [row] = await deps.db.select().from(conversation).where(eq(conversation.id, id));
  return row!;
}

describe("handleChat", () => {
  it("streams the reply as server-sent events and saves it complete", async () => {
    const { deps, chat, send } = await setup();

    const response = await send();
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(body).toContain('"delta":"Hello"');
    expect(body).toContain('"delta":" there!"');

    const [question, reply] = await messagesOf(deps, chat.id);
    expect(question).toMatchObject({
      role: "user",
      parentId: null,
      parts: { schemaVersion: 1, parts: [{ type: "text", text: "Hi" }] },
      searchText: "Hi",
      status: "complete",
      model: null,
    });
    expect(reply).toMatchObject({
      role: "assistant",
      parentId: question!.id,
      parts: { schemaVersion: 1, parts: [{ type: "text", text: "Hello there!" }] },
      searchText: "Hello there!",
      status: "complete",
      model: anthropicModel,
      error: null,
    });
  });

  it("makes the reply the Active Branch leaf, bumps lastMessageAt and selects the Model", async () => {
    const { deps, chat, send } = await setup();

    await (await send()).text();

    const [, reply] = await messagesOf(deps, chat.id);
    const after = await conversationRow(deps, chat.id);
    expect(after.activeLeafId).toBe(reply!.id);
    expect(after.model).toBe(anthropicModel);
    expect(after.lastMessageAt.getTime()).toBeGreaterThan(chat.lastMessageAt.getTime());
  });

  it("builds the adapter for the chosen Model from the user's Provider credentials", async () => {
    const { adapterCalls, send } = await setup();

    await (await send()).text();

    expect(adapterCalls).toEqual([
      { model: anthropicModel, credentials: { apiKey: "sk-ant-test-key" } },
    ]);
  });

  it("writes snapshots of the reply while it streams", async () => {
    const { deps, chat, fake, send } = await setup({ manual: true });

    const response = await send();
    const [, reply] = await messagesOf(deps, chat.id);
    expect(reply).toMatchObject({ status: "streaming", parts: { parts: [] } });

    // RUN_STARTED, TEXT_MESSAGE_START, the first delta
    await fake.release(3);
    await expect
      .poll(async () => (await messagesOf(deps, chat.id))[1], { interval: 10 })
      .toMatchObject({
        status: "streaming",
        parts: { parts: [{ type: "text", text: "Hello" }] },
        searchText: "Hello",
      });

    await fake.releaseAll();
    await response.text();
    expect((await messagesOf(deps, chat.id))[1]).toMatchObject({
      status: "complete",
      parts: { parts: [{ type: "text", text: "Hello there!" }] },
    });
  });

  it("rebuilds history from the database, not from the request", async () => {
    const { user, deps, fake } = await setup();
    const chat = await insertConversation(user);
    const question = await insertMessage({ conversationId: chat.id, role: "user", text: "Hi" });
    const reply = await insertMessage({
      conversationId: chat.id,
      parentId: question.id,
      role: "assistant",
      text: "Hello!",
      active: true,
    });
    // Another Branch that must not be sent.
    await insertMessage({ conversationId: chat.id, role: "user", text: "Other Branch" });

    const response = await handleChat(
      chatRequest(
        {
          conversationId: chat.id,
          parentId: reply.id,
          text: "How are you?",
          attachmentIds: [],
          model: anthropicModel,
          webSearch: false,
        },
        { messages: [{ id: "x", role: "user", parts: [{ type: "text", content: "Injected" }] }] },
      ),
      sessionFor(user),
      deps,
    );
    await response.text();

    expect(fake.calls[0]?.messages).toEqual([
      { role: "user", content: "Hi" },
      { role: "assistant", content: "Hello!" },
      { role: "user", content: "How are you?" },
    ]);
    const after = await messagesOf(deps, chat.id);
    const newQuestion = after.find((row) => row.searchText === "How are you?");
    expect(newQuestion?.parentId).toBe(reply.id);
  });

  it("saves a reply that hits a Provider error as error, keeping the text that arrived", async () => {
    const { deps, chat, send } = await setup({
      rounds: [round(text("Partial"), runError("Overloaded"))],
    });

    await (await send()).text();

    expect((await messagesOf(deps, chat.id))[1]).toMatchObject({
      status: "error",
      error: "Overloaded",
      parts: { parts: [{ type: "text", text: "Partial" }] },
    });
  });

  it("registers the run in deps.runs until it ends", async () => {
    const { deps, chat, fake, send } = await setup({ manual: true });

    const response = await send();
    const [, reply] = await messagesOf(deps, chat.id);
    expect([...deps.runs.keys()]).toEqual([reply!.id]);

    await fake.releaseAll();
    await response.text();
    expect(deps.runs.size).toBe(0);
  });
});

describe("handleChat refuses", () => {
  it("a caller without a session with 401", async () => {
    const { deps, chat, send } = await setup();

    const response = await send({}, null);

    expect(response.status).toBe(401);
    expect(await messagesOf(deps, chat.id)).toEqual([]);
  });

  it("another user's Conversation with 404", async () => {
    const { deps, chat, send } = await setup();
    const stranger = await insertUser();

    const response = await send({}, stranger);

    expect(response.status).toBe(404);
    expect(await messagesOf(deps, chat.id)).toEqual([]);
  });

  it("a Model that isn't available with 400", async () => {
    const { deps, chat, send } = await setup();

    const response = await send({ model: "anthropic:claude-2" });

    expect(response.status).toBe(400);
    expect(await messagesOf(deps, chat.id)).toEqual([]);
  });

  it("a Model whose Provider the user has no credentials for with 400", async () => {
    const { deps, chat, send } = await setup();

    const response = await send({ model: "openai:gpt-5.6" });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      message: "Add an OpenAI key or pick another Model",
    });
    expect(await messagesOf(deps, chat.id)).toEqual([]);
  });

  it("a parent from another Conversation with 400", async () => {
    const { user, deps, chat, send } = await setup();
    const elsewhere = await insertConversation(user);
    const foreign = await insertMessage({ conversationId: elsewhere.id, role: "user", text: "Hi" });

    const response = await send({ parentId: foreign.id });

    expect(response.status).toBe(400);
    expect(await messagesOf(deps, chat.id)).toEqual([]);
  });

  it("a malformed command with 400", async () => {
    const { deps, chat, send } = await setup();

    const response = await send({ conversationId: "not-a-uuid" });

    expect(response.status).toBe(400);
    expect(await messagesOf(deps, chat.id)).toEqual([]);
  });
});
