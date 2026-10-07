import { conversation, message } from "@ai-chat/db/schema/chat";
import { asc, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { saveCredentials } from "../credentials/store";
import type { AppDeps } from "../deps";
import { insertConversation, insertMessage } from "../testing/conversations";
import { createTestDeps } from "../testing/deps";
import { liveModelsFetch } from "../testing/live-models";
import { createFakeAdapter, round, runError, text, thinking } from "../testing/fake-adapter";
import { createTestClient, insertUser, sessionFor, type TestUser } from "../testing/router-client";
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
  // Set `lastMessageAt` explicitly so the database's clock (the default) can't skew the bump assertion.
  const conv = await insertConversation(user, {
    model: "openai:gpt-5.6",
    lastMessageAt: new Date(Date.now() - 60_000),
  });
  const send = (command: Partial<ChatCommand> = {}, as: TestUser | null = user) =>
    handleChat(
      chatRequest({
        conversationId: conv.id,
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
  return { user, deps, fake, adapterCalls, conv, send };
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
  it("streams the assistant Message as server-sent events and saves it complete", async () => {
    const { deps, conv, send } = await setup();

    const response = await send();
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(body).toContain('"delta":"Hello"');
    expect(body).toContain('"delta":" there!"');

    const [question, reply] = await messagesOf(deps, conv.id);
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

  it("makes the assistant Message the Active Branch leaf, bumps lastMessageAt and selects the Model", async () => {
    const { deps, conv, send } = await setup();

    await (await send()).text();

    const [, reply] = await messagesOf(deps, conv.id);
    const after = await conversationRow(deps, conv.id);
    expect(after.activeLeafId).toBe(reply!.id);
    expect(after.model).toBe(anthropicModel);
    expect(after.lastMessageAt.getTime()).toBeGreaterThan(conv.lastMessageAt.getTime());
  });

  it("builds the adapter for the chosen Model from the user's Provider credentials", async () => {
    const { adapterCalls, send } = await setup();

    await (await send()).text();

    expect(adapterCalls).toEqual([
      { model: anthropicModel, credentials: { apiKey: "sk-ant-test-key" } },
    ]);
  });

  it("writes snapshots of the assistant Message while it streams", async () => {
    const { deps, conv, fake, send } = await setup({ manual: true });

    const response = await send();
    const [, reply] = await messagesOf(deps, conv.id);
    expect(reply).toMatchObject({ status: "streaming", parts: { parts: [] } });

    // RUN_STARTED, TEXT_MESSAGE_START, the first delta
    await fake.release(3);
    await expect
      .poll(async () => (await messagesOf(deps, conv.id))[1], { interval: 10 })
      .toMatchObject({
        status: "streaming",
        parts: { parts: [{ type: "text", text: "Hello" }] },
        searchText: "Hello",
      });

    await fake.releaseAll();
    await response.text();
    expect((await messagesOf(deps, conv.id))[1]).toMatchObject({
      status: "complete",
      parts: { parts: [{ type: "text", text: "Hello there!" }] },
    });
  });

  it("rebuilds history from the database, not from the request", async () => {
    const { user, deps, fake } = await setup();
    const conv = await insertConversation(user);
    const question = await insertMessage({ conversationId: conv.id, role: "user", text: "Hi" });
    const reply = await insertMessage({
      conversationId: conv.id,
      parentId: question.id,
      role: "assistant",
      text: "Hello!",
      active: true,
    });
    // Another Branch that must not be sent.
    await insertMessage({ conversationId: conv.id, role: "user", text: "Other Branch" });

    const response = await handleChat(
      chatRequest(
        {
          conversationId: conv.id,
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
    const after = await messagesOf(deps, conv.id);
    const newQuestion = after.find((row) => row.searchText === "How are you?");
    expect(newQuestion?.parentId).toBe(reply.id);
  });

  it("saves an assistant Message that hits a Provider error as error, keeping the text that arrived", async () => {
    const { deps, conv, send } = await setup({
      rounds: [round(text("Partial"), runError("Overloaded"))],
    });

    await (await send()).text();

    expect((await messagesOf(deps, conv.id))[1]).toMatchObject({
      status: "error",
      error: "Overloaded",
      parts: { parts: [{ type: "text", text: "Partial" }] },
    });
  });

  it("keeps running to the end when the client disconnects", async () => {
    const { deps, conv, fake, send } = await setup({ manual: true });

    const response = await send();
    const reader = response.body!.getReader();
    await fake.release(3);
    await reader.read();
    await reader.cancel();
    await fake.releaseAll();

    await expect
      .poll(async () => (await messagesOf(deps, conv.id))[1], { interval: 10 })
      .toMatchObject({
        status: "complete",
        parts: { parts: [{ type: "text", text: "Hello there!" }] },
      });
    expect(deps.runs.size).toBe(0);
  });

  it("ends a run that hits the cap as error, timed out, keeping the text that arrived", async () => {
    const { deps, conv, fake, send } = await setup({
      manual: true,
      deps: { limits: { snapshotIntervalMs: 20, runCapMs: 100 } },
    });

    const response = await send();
    await fake.release(3);
    await response.text();

    expect((await messagesOf(deps, conv.id))[1]).toMatchObject({
      status: "error",
      error: "timed out",
      errorReason: null,
      parts: { parts: [{ type: "text", text: "Hello" }] },
    });
    expect(deps.runs.size).toBe(0);
  });

  it.each([
    // Anthropic's SDK errors carry only the HTTP status, which the adapter reports as the code.
    { code: "401", reason: "invalid_key" },
    { code: "403", reason: "invalid_key" },
    { code: "invalid_api_key", reason: "invalid_key" },
    { code: "429", reason: "rate_limited" },
    { code: "rate_limit_exceeded", reason: "rate_limited" },
    { code: "insufficient_quota", reason: "rate_limited" },
    { code: "529", reason: "provider_error" },
    { code: undefined, reason: "provider_error" },
  ])("saves a Provider error with code $code as reason $reason", async ({ code, reason }) => {
    const { deps, conv, send } = await setup({ rounds: [round(runError("It failed", code))] });

    await (await send()).text();

    expect((await messagesOf(deps, conv.id))[1]).toMatchObject({
      status: "error",
      error: "It failed",
      errorReason: reason,
    });
  });

  it("saves an error the adapter throws with its HTTP status as the reason", async () => {
    const fake = createFakeAdapter({ rounds: [] });
    const { deps, conv, send } = await setup({
      deps: {
        adapterFor: () => ({
          ...fake.adapter,
          // oxlint-disable-next-line require-yield
          chatStream: async function* () {
            throw Object.assign(new Error("Unauthorized"), { status: 401 });
          },
        }),
      },
    });

    await (await send()).text();

    expect((await messagesOf(deps, conv.id))[1]).toMatchObject({
      status: "error",
      error: "Unauthorized",
      errorReason: "invalid_key",
    });
  });

  it("registers the run in deps.runs until it ends", async () => {
    const { deps, conv, fake, send } = await setup({ manual: true });

    const response = await send();
    const [, reply] = await messagesOf(deps, conv.id);
    expect([...deps.runs.keys()]).toEqual([reply!.id]);

    await fake.releaseAll();
    await response.text();
    expect(deps.runs.size).toBe(0);
  });
});

/** An adapter that sends some text, then hangs and ignores the abort signal (like Ollama's). */
function deafAdapter() {
  const fake = createFakeAdapter({ rounds: [] });
  return {
    ...fake.adapter,
    chatStream: async function* () {
      yield* round(text("Hello")).slice(0, 3);
      await new Promise(() => {});
    },
  };
}

describe("chat.stop", () => {
  it("stops reading an adapter that ignores the abort signal", async () => {
    const { user, deps, conv, send } = await setup({ deps: { adapterFor: deafAdapter } });
    const response = await send();
    const [, reply] = await messagesOf(deps, conv.id);
    await expect.poll(() => deps.runs.has(reply!.id)).toBe(true);

    await createTestClient({ user, deps }).chat.stop({ messageId: reply!.id });

    await response.text();
    expect((await messagesOf(deps, conv.id))[1]).toMatchObject({
      status: "stopped",
      parts: { parts: [{ type: "text", text: "Hello" }] },
    });
  });

  it("times out an adapter that ignores the abort signal", async () => {
    const { deps, conv, send } = await setup({
      deps: { adapterFor: deafAdapter, limits: { snapshotIntervalMs: 20, runCapMs: 100 } },
    });

    await (await send()).text();

    expect((await messagesOf(deps, conv.id))[1]).toMatchObject({
      status: "error",
      error: "timed out",
    });
  });

  it("aborts the run, which ends stopped and keeps the text that arrived", async () => {
    const { user, deps, conv, fake, send } = await setup({ manual: true });
    const response = await send();
    const [, reply] = await messagesOf(deps, conv.id);
    await fake.release(3);

    await createTestClient({ user, deps }).chat.stop({ messageId: reply!.id });

    await response.text();
    expect((await messagesOf(deps, conv.id))[1]).toMatchObject({
      status: "stopped",
      error: null,
      parts: { parts: [{ type: "text", text: "Hello" }] },
    });
    expect(deps.runs.size).toBe(0);
  });

  it("marks a streaming Message with no run in this process stopped", async () => {
    const { user, deps } = await setup();
    const conv = await insertConversation(user);
    const question = await insertMessage({ conversationId: conv.id, role: "user", text: "Hi" });
    const reply = await insertMessage({
      conversationId: conv.id,
      parentId: question.id,
      role: "assistant",
      text: "Half",
      status: "streaming",
    });

    await createTestClient({ user, deps }).chat.stop({ messageId: reply.id });

    expect((await messagesOf(deps, conv.id))[1]).toMatchObject({
      status: "stopped",
      parts: { parts: [{ type: "text", text: "Half" }] },
    });
  });

  it("leaves a Message that already ended alone", async () => {
    const { user, deps } = await setup();
    const conv = await insertConversation(user);
    const reply = await insertMessage({ conversationId: conv.id, role: "assistant", text: "Done" });

    await createTestClient({ user, deps }).chat.stop({ messageId: reply.id });

    expect((await messagesOf(deps, conv.id))[0]).toMatchObject({ status: "complete" });
  });

  it("answers NOT_FOUND for another user's Message, without stopping it", async () => {
    const { deps, conv, fake, send } = await setup({ manual: true });
    const response = await send();
    const [, reply] = await messagesOf(deps, conv.id);
    const stranger = await insertUser();

    await expect(
      createTestClient({ user: stranger, deps }).chat.stop({ messageId: reply!.id }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    expect(deps.runs.has(reply!.id)).toBe(true);
    await fake.releaseAll();
    await response.text();
  });
});

describe("handleChat refuses", () => {
  it("a caller without a session with 401", async () => {
    const { deps, conv, send } = await setup();

    const response = await send({}, null);

    expect(response.status).toBe(401);
    expect(await messagesOf(deps, conv.id)).toEqual([]);
  });

  it("another user's Conversation with 404", async () => {
    const { deps, conv, send } = await setup();
    const stranger = await insertUser();

    const response = await send({}, stranger);

    expect(response.status).toBe(404);
    expect(await messagesOf(deps, conv.id)).toEqual([]);
  });

  it("a Model that isn't available with 400", async () => {
    const { deps, conv, send } = await setup();

    const response = await send({ model: "anthropic:claude-2" });

    expect(response.status).toBe(400);
    expect(await messagesOf(deps, conv.id)).toEqual([]);
  });

  it("a Model whose Provider the user has no credentials for with 400", async () => {
    const { deps, conv, send } = await setup();

    const response = await send({ model: "openai:gpt-5.6" });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      message: "Add an OpenAI key or pick another Model",
    });
    expect(await messagesOf(deps, conv.id)).toEqual([]);
  });

  it("a parent from another Conversation with 400", async () => {
    const { user, deps, conv, send } = await setup();
    const elsewhere = await insertConversation(user);
    const foreign = await insertMessage({ conversationId: elsewhere.id, role: "user", text: "Hi" });

    const response = await send({ parentId: foreign.id });

    expect(response.status).toBe(400);
    expect(await messagesOf(deps, conv.id)).toEqual([]);
  });

  it("a Model whose adapter can't be built, before writing anything", async () => {
    const { deps, conv, send } = await setup({
      deps: {
        adapterFor: () => {
          throw new Error("No adapter");
        },
      },
    });

    await expect(send()).rejects.toThrow("No adapter");
    expect(await messagesOf(deps, conv.id)).toEqual([]);
  });

  it("a second run in a Conversation that has a streaming Message with 409", async () => {
    const { deps, conv, fake, send } = await setup({ manual: true });
    const first = await send();

    const second = await send({ text: "Again" });

    expect(second.status).toBe(409);
    expect(await messagesOf(deps, conv.id)).toHaveLength(2);
    await fake.releaseAll();
    await first.text();
  });

  it("a malformed command with 400", async () => {
    const { deps, conv, send } = await setup();

    const response = await send({ conversationId: "not-a-uuid" });

    expect(response.status).toBe(400);
    expect(await messagesOf(deps, conv.id)).toEqual([]);
  });
});

/** `minutesAgo` minutes before now, so seeded Messages are older than the ones a send writes. */
const ago = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000);

/** Seeds "Hi" → "Hello!" as the Active Branch of the `setup` Conversation. */
async function seedExchange(conversationId: string) {
  const question = await insertMessage({
    conversationId,
    role: "user",
    text: "Hi",
    createdAt: ago(10),
  });
  const reply = await insertMessage({
    conversationId,
    parentId: question.id,
    role: "assistant",
    text: "Hello!",
    model: "openai:gpt-5.6",
    createdAt: ago(9),
    active: true,
  });
  return { question, reply };
}

describe("handleChat Branches", () => {
  it("edits a Message into a sibling Branch, keeping the old one", async () => {
    const { deps, conv, fake, send } = await setup();
    const { question, reply } = await seedExchange(conv.id);
    const follow = await insertMessage({
      conversationId: conv.id,
      parentId: reply.id,
      role: "user",
      text: "Tell me more",
      createdAt: ago(8),
    });

    // Editing "Tell me more" sends the command with its sibling's parent.
    await (await send({ parentId: follow.parentId, text: "Tell me less" })).text();

    const rows = await messagesOf(deps, conv.id);
    expect(rows.map((row) => row.id)).toContain(follow.id);
    const edited = rows.find((row) => row.searchText === "Tell me less");
    expect(edited).toMatchObject({ role: "user", parentId: reply.id });
    const newReply = rows.find((row) => row.parentId === edited!.id);
    expect((await conversationRow(deps, conv.id)).activeLeafId).toBe(newReply!.id);
    expect(fake.calls[0]?.messages).toEqual([
      { role: "user", content: "Hi" },
      { role: "assistant", content: "Hello!" },
      { role: "user", content: "Tell me less" },
    ]);
    expect(question.parentId).toBeNull();
  });

  it("edits the first Message into a new root", async () => {
    const { deps, conv, fake, send } = await setup();
    const { question } = await seedExchange(conv.id);

    await (await send({ parentId: null, text: "Hey" })).text();

    const roots = (await messagesOf(deps, conv.id)).filter((row) => row.parentId === null);
    expect(roots.map((row) => row.searchText)).toEqual(["Hi", "Hey"]);
    expect(roots[0]!.id).toBe(question.id);
    expect(fake.calls[0]?.messages).toEqual([{ role: "user", content: "Hey" }]);
  });

  it("regenerates a reply as a sibling assistant Message with the current Model", async () => {
    const { deps, conv, fake, send } = await setup();
    const { question, reply } = await seedExchange(conv.id);

    const response = await send({ parentId: question.id, text: undefined });
    await response.text();

    expect(response.status).toBe(200);
    const rows = await messagesOf(deps, conv.id);
    expect(rows).toHaveLength(3);
    const regenerated = rows.find((row) => row.id !== reply.id && row.role === "assistant");
    expect(regenerated).toMatchObject({
      parentId: question.id,
      model: anthropicModel,
      status: "complete",
      parts: { parts: [{ type: "text", text: "Hello there!" }] },
    });
    expect(fake.calls[0]?.messages).toEqual([{ role: "user", content: "Hi" }]);
    const after = await conversationRow(deps, conv.id);
    expect(after.activeLeafId).toBe(regenerated!.id);
    expect(after.model).toBe(anthropicModel);
    expect(after.lastMessageAt.getTime()).toBeGreaterThan(conv.lastMessageAt.getTime());
  });

  it("refuses to regenerate without a parent with 400", async () => {
    const { deps, conv, send } = await setup();

    const response = await send({ parentId: null, text: undefined });

    expect(response.status).toBe(400);
    expect(await messagesOf(deps, conv.id)).toEqual([]);
  });

  it("refuses to regenerate under an assistant Message with 400", async () => {
    const { deps, conv, send } = await setup();
    const { reply } = await seedExchange(conv.id);

    const response = await send({ parentId: reply.id, text: undefined });

    expect(response.status).toBe(400);
    expect(await messagesOf(deps, conv.id)).toHaveLength(2);
  });

  it("continues the Active Branch after switching to another one", async () => {
    const { user, deps, conv, fake, send } = await setup();
    const { question, reply } = await seedExchange(conv.id);
    await insertMessage({
      conversationId: conv.id,
      parentId: question.id,
      role: "assistant",
      text: "Howdy!",
      createdAt: ago(8),
      active: true,
    });
    const client = createTestClient({ user, deps });

    await client.conversation.switchBranch({ messageId: reply.id });
    // The client sends the next Message under the last one it shows.
    const shown = await client.conversation.get({ id: conv.id });
    await (await send({ parentId: shown.messages.at(-1)!.id, text: "And then?" })).text();

    expect(fake.calls[0]?.messages).toEqual([
      { role: "user", content: "Hi" },
      { role: "assistant", content: "Hello!" },
      { role: "user", content: "And then?" },
    ]);
    const after = await client.conversation.get({ id: conv.id });
    expect(after.messages.map((m) => m.parts)).toEqual([
      [{ type: "text", content: "Hi" }],
      [{ type: "text", content: "Hello!" }],
      [{ type: "text", content: "And then?" }],
      [{ type: "text", content: "Hello there!" }],
    ]);
    expect(after.messages[1]?.siblings).toMatchObject({ index: 0, count: 2 });
  });
});

describe("handleChat thinking", () => {
  /** A first send whose reply thinks before it answers, then a follow-up on `model`. */
  async function thinkThenFollowUp(model: string) {
    const ctx = await setup({
      rounds: [round(thinking("Pondering", " hard."), text("Hello!")), round(text("Sure."))],
    });
    await saveCredentials(ctx.deps, ctx.user.id, {
      service: "openai",
      fields: { apiKey: "sk-openai-test-key" },
      hint: "…-key",
      verified: true,
    });
    const body = await (await ctx.send()).text();
    const [, reply] = await messagesOf(ctx.deps, ctx.conv.id);
    await (await ctx.send({ parentId: reply!.id, text: "Go on", model })).text();
    return { ...ctx, body, reply: reply! };
  }

  it("streams the model's thinking and saves it as a thinking part, kept out of searchText", async () => {
    const { body, reply } = await thinkThenFollowUp(anthropicModel);

    expect(body).toContain("REASONING_MESSAGE_CONTENT");
    expect(reply).toMatchObject({
      parts: {
        schemaVersion: 1,
        parts: [
          { type: "thinking", text: "Pondering hard." },
          { type: "text", text: "Hello!" },
        ],
      },
      searchText: "Hello!",
      status: "complete",
    });
  });

  it("sends the thinking back to the same Provider", async () => {
    const { fake } = await thinkThenFollowUp(anthropicModel);

    expect(fake.calls[1]?.messages).toEqual([
      { role: "user", content: "Hi" },
      { role: "assistant", content: "Hello!", thinking: [{ content: "Pondering hard." }] },
      { role: "user", content: "Go on" },
    ]);
  });

  it("strips the thinking when the Provider changed, keeping it stored", async () => {
    const { deps, fake, reply } = await thinkThenFollowUp("openai:gpt-5.6");

    expect(fake.calls[1]?.messages).toEqual([
      { role: "user", content: "Hi" },
      { role: "assistant", content: "Hello!" },
      { role: "user", content: "Go on" },
    ]);
    const [stored] = await deps.db.select().from(message).where(eq(message.id, reply.id));
    expect(stored?.parts).toEqual(reply.parts);
  });
});

describe("handleChat with live-listed Models", () => {
  it("streams a reply from a Model installed on the user's Ollama host", async () => {
    const live = liveModelsFetch({ ollama: ["qwen3:8b"] });
    const { user, deps, adapterCalls, conv, send } = await setup({ deps: { fetch: live.fetch } });
    await saveCredentials(deps, user.id, {
      service: "ollama",
      fields: { host: "http://ollama.test:11434" },
      hint: "http://ollama.test:11434",
      verified: true,
    });

    const response = await send({ model: "ollama:qwen3:8b" });
    await response.text();

    expect(response.status).toBe(200);
    expect(adapterCalls).toEqual([
      { model: "ollama:qwen3:8b", credentials: { host: "http://ollama.test:11434" } },
    ]);
    expect(await conversationRow(deps, conv.id)).toMatchObject({ model: "ollama:qwen3:8b" });
  });

  it("refuses an OpenRouter Model that isn't on the live list with 400", async () => {
    const live = liveModelsFetch({ openRouter: ["openai/gpt-5.5"] });
    const { user, deps, adapterCalls, send } = await setup({ deps: { fetch: live.fetch } });
    await saveCredentials(deps, user.id, {
      service: "openrouter",
      fields: { apiKey: "sk-or-test" },
      hint: "…test",
      verified: true,
    });

    const response = await send({ model: "openrouter:openai/gpt-4o" });

    expect(response.status).toBe(400);
    expect(adapterCalls).toEqual([]);
  });
});
