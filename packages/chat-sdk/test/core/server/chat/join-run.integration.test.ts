import { message } from "../../../../core/server/db/schema/chat";
import { asc, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { saveCredentials } from "../../../../core/server/credentials/store";
import type { AppDeps } from "../../../../core/server/deps";
import { insertConversation } from "../../../support/conversations";
import { createTestDeps } from "../../../support/deps";
import { createFakeAdapter, round, text } from "../../../support/fake-adapter";
import { insertUser, sessionFor, type TestUser } from "../../../support/router-client";
import { handleChat } from "../../../../core/server/chat/handle-chat";
import { handleJoin } from "../../../../core/server/chat/join-run";

const anthropicModel = "anthropic:claude-sonnet-5-5";

/** A signed-in user with a Conversation and a manual scripted adapter: the test releases each chunk. */
async function setup() {
  const user = await insertUser();
  const fake = createFakeAdapter({
    rounds: [round(text("Hello", " there", "!"))],
    manual: true,
  });
  const deps = createTestDeps({ adapterFor: () => fake.adapter });
  await saveCredentials(deps, user.id, {
    service: "anthropic",
    fields: { apiKey: "sk-ant-test-key" },
    hint: "…-key",
    verified: true,
  });
  const conv = await insertConversation(user, {
    model: anthropicModel,
    title: "Test Conversation",
  });
  const send = () =>
    handleChat(
      new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [],
          forwardedProps: {
            conversationId: conv.id,
            parentId: null,
            text: "Hi",
            attachmentIds: [],
            model: anthropicModel,
            webSearch: false,
          },
        }),
      }),
      sessionFor(user),
      deps,
    );
  return { user, deps, fake, conv, send };
}

function joinRequest(runId: string, headers: Record<string, string> = {}) {
  return new Request(`http://localhost/api/chat?offset=-1&runId=${runId}`, { headers });
}

async function assistantIdOf(deps: AppDeps, conversationId: string) {
  const rows = await deps.db
    .select()
    .from(message)
    .where(eq(message.conversationId, conversationId))
    .orderBy(asc(message.createdAt));
  return rows.find((row) => row.role === "assistant")!;
}

describe("joining a Run", () => {
  it("a reader that joins mid-Run gets every chunk from the start, then the rest live, then the end", async () => {
    const { user, deps, fake, conv, send } = await setup();
    const posting = await send();
    const reply = await assistantIdOf(deps, conv.id);

    await fake.release(3);
    const join = await handleJoin(joinRequest(reply.id), sessionFor(user), deps);
    expect(join.status).toBe(200);
    expect(join.headers.get("content-type")).toContain("text/event-stream");
    expect(await assistantIdOf(deps, conv.id)).toMatchObject({ status: "streaming" });

    const joined = join.text();
    await fake.releaseAll();
    const posted = await posting.text();

    expect(await joined).toBe(posted);
    expect(posted).toContain('"delta":"Hello"');
    expect(posted).toContain('"delta":"!"');
    expect(await assistantIdOf(deps, conv.id)).toMatchObject({ status: "complete" });
  });

  it("joining a Run that has ended replays all of it", async () => {
    const { user, deps, fake, conv, send } = await setup();
    const posting = await send();
    await fake.releaseAll();
    const posted = await posting.text();
    const reply = await assistantIdOf(deps, conv.id);

    const join = await handleJoin(joinRequest(reply.id), sessionFor(user), deps);

    expect(await join.text()).toBe(posted);
  });

  it("a reconnect with Last-Event-ID resumes strictly after that event", async () => {
    const { user, deps, fake, conv, send } = await setup();
    const posting = await send();
    await fake.releaseAll();
    const posted = await posting.text();
    const reply = await assistantIdOf(deps, conv.id);
    const firstId = /^id: (.+)$/m.exec(posted)![1]!;

    const join = await handleJoin(
      joinRequest(reply.id, { "Last-Event-ID": firstId }),
      sessionFor(user),
      deps,
    );
    const resumed = await join.text();

    expect(resumed).not.toContain(`id: ${firstId}\n`);
    expect(resumed.length).toBeLessThan(posted.length);
    expect(posted.endsWith(resumed)).toBe(true);
  });

  it("refuses a Run that is not in the signed-in user's Conversation", async () => {
    const { deps, fake, conv, send } = await setup();
    const posting = await send();
    await fake.releaseAll();
    await posting.text();
    const reply = await assistantIdOf(deps, conv.id);
    const someoneElse: TestUser = await insertUser();

    const join = await handleJoin(joinRequest(reply.id), sessionFor(someoneElse), deps);

    expect(join.status).toBe(404);
  });

  it("refuses a join without a session", async () => {
    const { deps, fake, conv, send } = await setup();
    const posting = await send();
    await fake.releaseAll();
    await posting.text();
    const reply = await assistantIdOf(deps, conv.id);

    const join = await handleJoin(joinRequest(reply.id), null, deps);

    expect(join.status).toBe(401);
  });
});
