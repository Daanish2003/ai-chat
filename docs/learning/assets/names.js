// Every code name the lessons teach, in one list. Lessons load this file with
// <script src="../assets/names.js" data-upto="N"></script> to get the floating "Names?" button,
// which lists the names from Lessons 1..N. reference/names.html renders the full list.
//
// kind: package · file · function · type · table/column · route
window.NAMES = [
  {
    lesson: 1,
    name: "@ai-chat/db",
    kind: "package",
    meaning:
      "The Drizzle tables and the stored shape of Message parts. It imports no other package.",
    example: "packages/db/src/schema/chat.ts defines the conversation and message tables",
  },
  {
    lesson: 1,
    name: "@ai-chat/auth",
    kind: "package",
    meaning: "Better Auth set up on top of the db package: users and sessions.",
    example: "createAuth(ENV, db) in apps/web/src/services.ts",
  },
  {
    lesson: 1,
    name: "@ai-chat/api",
    kind: "package",
    meaning: "All server logic: the oRPC routers, the chat run, credentials, search, sharing.",
    example: "packages/api/src/chat/handle-chat.ts answers POST /api/chat",
  },
  {
    lesson: 1,
    name: "@ai-chat/chat-core",
    kind: "package",
    meaning: "Client logic with no React: pure functions the chat UI calls.",
    example: "branchFrom(messages, id) in packages/chat-core/src/chat.ts",
  },
  {
    lesson: 1,
    name: "@ai-chat/chat-react",
    kind: "package",
    meaning:
      "The chat UI as React components, with no idea which router or URL scheme the host app uses.",
    example: "<ChatView conversation={data} /> in packages/chat-react/src/chat/chat-view.tsx",
  },
  {
    lesson: 1,
    name: "@ai-chat/ui",
    kind: "package",
    meaning: "Generic UI parts (shadcn and prompt-kit) with no chat knowledge.",
    example: "Button, Markdown, ChatContainerRoot",
  },
  {
    lesson: 1,
    name: "apps/web",
    kind: "package",
    meaning: "The host app: TanStack Start routes and the wiring that joins every package.",
    example: "apps/web/src/routes/api/chat.ts is 16 lines and calls handleChat",
  },
  {
    lesson: 1,
    name: "AppDeps (deps)",
    kind: "type",
    meaning:
      "One object with everything the server needs from outside: database, adapters, run registry, limits. Built once at start.",
    example: "createAppDeps({ db, keyEncryptionSecret }) in apps/web/src/services.ts",
  },
  {
    lesson: 1,
    name: "ChatAdapter",
    kind: "type",
    meaning:
      "What the host app gives chat-react: the oRPC client, the chat URL, a Link component and navigate().",
    example:
      'WebChatProvider in apps/web/src/lib/chat-provider.tsx maps { to: "keys" } to /settings/keys',
  },
  {
    lesson: 1,
    name: "appRouter",
    kind: "function",
    meaning:
      "The tree of oRPC procedures (conversation, chat, models, share, …) served at /api/rpc.",
    example: "orpc.conversation.get({ id }) on the client calls conversationRouter.get",
  },
  {
    lesson: 2,
    name: "ChatCommand",
    kind: "type",
    meaning:
      "What the client posts to /api/chat: conversationId, parentId, text?, attachmentIds, model, webSearch. Never the history.",
    example: 'a regenerate of a2 is { conversationId, parentId: "u2", model, … } with no text',
  },
  {
    lesson: 2,
    name: "forwardedProps",
    kind: "type",
    meaning:
      "The field of useChat's request body that carries our own data; handleChat parses only this.",
    example:
      "fetchServerSentEvents(chatUrl, () => ({ body: command.current })) → body becomes forwardedProps",
  },
  {
    lesson: 2,
    name: "branchFrom(messages, id)",
    kind: "function",
    meaning:
      "Finds the parent for an edit or regenerate: the Message just before id on screen, plus the Messages above it.",
    example: 'branchFrom([u1, a1, u2, a2], "u2").parentId → "a1"',
  },
  {
    lesson: 2,
    name: "setPendingFirstMessage / takePendingFirstMessage",
    kind: "function",
    meaning:
      "Hands the first typed text from the new Conversation page to ChatView across the page change, once.",
    example:
      "create → setPendingFirstMessage(id, { text, attachments }) → navigate /c/$id → ChatView sends it",
  },
  {
    lesson: 3,
    name: "handleChat(request, session, deps)",
    kind: "function",
    meaning:
      "The /api/chat handler: every check first, then one locked transaction, then startRun and the SSE response.",
    example: 'another user\'s conversationId → refuse(404, "Conversation not found")',
  },
  {
    lesson: 3,
    name: "refuse(status, message)",
    kind: "function",
    meaning: "Builds an early JSON error Response; nothing has been written when it runs.",
    example: 'refuse(409, "A reply is still streaming in this Conversation")',
  },
  {
    lesson: 3,
    name: '.for("update")',
    kind: "function",
    meaning: "Drizzle's SELECT … FOR UPDATE: locks the Conversation row so concurrent sends queue.",
    example: "tab B waits for tab A's commit, then sees A's streaming row → 409",
  },
  {
    lesson: 3,
    name: "message.status",
    kind: "table/column",
    meaning:
      "streaming, complete, stopped or error. The assistant row starts as streaming with empty parts.",
    example: '{ role: "assistant", status: "streaming", parts: { schemaVersion: 1, parts: [] } }',
  },
  {
    lesson: 4,
    name: "startRun",
    kind: "function",
    meaning:
      "Starts the run for one assistant Message: drains chat() on its own, snapshots the parts, and saves the final status in finally. Returns the chunks for the SSE response at once.",
    example: "startRun(deps, { messageId, adapter, messages }) at the end of handleChat",
  },
  {
    lesson: 4,
    name: "createChunkChannel",
    kind: "function",
    meaning:
      "Hands the run's chunks to at most one reader; once the reader calls return(), it empties its buffer and drops every later chunk.",
    example: "listener.push(chunk) in run.ts; the SSE response is the reader",
  },
  {
    lesson: 4,
    name: "createPartsBuilder",
    kind: "function",
    meaning:
      "Collects a run's stream chunks into stored parts (text, thinking, web_search); the same messageId appends, a new one starts a part. parts() returns a copy for a snapshot.",
    example: 'a: "Hel", a: "lo", b: "Bye" → ["Hello", "Bye"] (packages/api/src/chat/parts.ts)',
  },
  {
    lesson: 4,
    name: "snapshotIntervalMs",
    kind: "type",
    meaning:
      "Least time between two snapshots of a streaming Message; a tick saves only if a chunk arrived since the last one.",
    example: "1,000 ms in defaultLimits (deps.ts); 20 ms in the integration tests",
  },
  {
    lesson: 4,
    name: "errorReasonOf",
    kind: "function",
    meaning: "Turns a Provider's error code or HTTP status into the Message's errorReason.",
    example: '"401" → invalid_key, "429" → rate_limited, anything else → provider_error',
  },
  {
    lesson: 5,
    name: "message.parentId",
    kind: "table/column",
    meaning: "The Message this one continues; null for a root. The only link in the tree.",
    example: 'q2b.parentId = "a1"',
  },
  {
    lesson: 5,
    name: "conversation.activeLeafId",
    kind: "table/column",
    meaning:
      "The leaf of the Active Branch. handleChat sets it to the new reply; switchBranch sets it to newestLeaf.",
    example: 'activeLeafId = "a2b" shows q1 → a1 → q2b → a2b',
  },
  {
    lesson: 5,
    name: "pathTo(nodes, leafId)",
    kind: "function",
    meaning:
      "Walks parentId up from the leaf, then reverses: the Messages from a root to the leaf, oldest first. [] without a leaf.",
    example: 'pathTo(tree, "a2b") → [q1, a1, q2b, a2b] (api/src/chat/branches.ts)',
  },
  {
    lesson: 5,
    name: "loadActiveBranch / loadPath",
    kind: "function",
    meaning:
      "store.ts helpers that load every Message of a Conversation and call pathTo: for conversation.get, and for handleChat's history.",
    example: "loadPath(deps, conversationId, command.parentId)",
  },
  {
    lesson: 6,
    name: "siblingPosition(nodes, node)",
    kind: "function",
    meaning:
      "Where a Message sits among Messages with the same parentId, oldest first: { index, count, previousId, nextId }. Drives ‹ n/m ›.",
    example: 'q2b → { index: 1, count: 2, previousId: "q2", nextId: null }',
  },
  {
    lesson: 6,
    name: "compareAge",
    kind: "function",
    meaning: "Orders Messages by createdAt, then by id (uuidv7 ids sort by creation time).",
    example: 'two siblings at the same ms: "a…" before "b…"',
  },
  {
    lesson: 6,
    name: "newestLeaf(nodes, id)",
    kind: "function",
    meaning:
      "The newest leaf anywhere below id (id itself if it has no children). switchBranch makes it activeLeafId.",
    example: 'newestLeaf(tree, "q1") → "a2b" (m6), not a1b (m4)',
  },
  {
    lesson: 6,
    name: "conversation.switchBranch",
    kind: "route",
    meaning:
      "oRPC procedure behind the arrows: locks the Conversation row, refuses with CONFLICT while a reply streams, else sets activeLeafId = newestLeaf.",
    example: 'orpc.conversation.switchBranch({ messageId: "q1" })',
  },
  {
    lesson: 7,
    name: "deps.runs",
    kind: "type",
    meaning:
      "The run registry: a Map from a streaming assistant Message id to its run's AbortController, in one server process only.",
    example: "stopRun calls deps.runs.get(messageId)?.abort()",
  },
  {
    lesson: 7,
    name: "stopRun",
    kind: "function",
    meaning:
      "Aborts the run when it is in this process; otherwise marks the row stopped, but only if it is still streaming.",
    example: "chat.stop({ messageId }) in packages/api/src/routers/chat.ts calls it",
  },
  {
    lesson: 7,
    name: "untilAborted",
    kind: "function",
    meaning:
      "Yields a stream's chunks until the abort signal fires, racing each next() against it, so adapters that ignore the signal can't hold the run.",
    example: "Ollama's adapter ignores the signal; the loop still stops at once",
  },
  {
    lesson: 7,
    name: "runCapMs",
    kind: "type",
    meaning:
      'Longest a run may take; when it fires, the run is aborted and saved as error "timed out".',
    example: "5 × 60,000 ms in defaultLimits (deps.ts)",
  },
  {
    lesson: 7,
    name: "sweepInterruptedRuns",
    kind: "function",
    meaning:
      'At server start, ends every streaming Message created before boot as error "interrupted" and cancels its running searches.',
    example: "called from apps/web/server/plugins/sweep-interrupted-runs.ts",
  },
  {
    lesson: 8,
    name: "StoredParts",
    kind: "type",
    meaning:
      "Our own versioned shape of a Message's content in message.parts: { schemaVersion: 1, parts: [text | thinking | web_search] }.",
    example: 'storedParts([{ type: "text", text: "Hi" }]) in packages/db/src/message-parts.ts',
  },
  {
    lesson: 8,
    name: "parseStoredParts",
    kind: "function",
    meaning: "Validates a row's parts with zod; throws on an unknown schemaVersion or part type.",
    example: "parseStoredParts(row.parts) in packages/api/src/chat/parts.ts",
  },
  {
    lesson: 8,
    name: "toUIParts",
    kind: "function",
    meaning: "Stored parts → the UIMessage parts useChat draws; drops the thinking signature.",
    example: "web_search part → a tool-call part",
  },
  {
    lesson: 8,
    name: "toModelMessages",
    kind: "function",
    meaning:
      "Stored history → ModelMessage[] for one Provider; thinking only for the Provider that wrote it.",
    example: 'toModelMessages(history, { provider: "openai" }) leaves out Anthropic thinking',
  },
  {
    lesson: 9,
    name: "user_credentials",
    kind: "table/column",
    meaning: "One row per user and service: encrypted fields, hint, verified.",
    example: '(user-1, "anthropic", "v1.…", "…1234", true)',
  },
  {
    lesson: 9,
    name: "encryptCredentials / decryptCredentials",
    kind: "function",
    meaning:
      "AES-256-GCM as v1.<iv>.<tag>.<ciphertext>, bound to userId:service; decrypt returns null on any failure.",
    example:
      'decryptCredentials(v, { secret, context: "user-2:anthropic" }) → null for user-1\'s row',
  },
  {
    lesson: 9,
    name: "loadCredentials",
    kind: "function",
    meaning:
      "The user's decrypted credentials for a service, or null when missing or undecryptable.",
    example: "loadCredentials(deps, userId, model.provider) in handleChat",
  },
  {
    lesson: 9,
    name: "credentialHint",
    kind: "function",
    meaning: 'What the client may see: "…" plus the key\'s last 4 characters, or the Ollama host.',
    example: '{ apiKey: "sk-ant-EXAMPLE-1234" } → "…1234"',
  },
  {
    lesson: 10,
    name: "web_search part",
    kind: "type",
    meaning:
      "One web_search tool call stored in a reply's parts, with its query, state (running, done, error, cancelled) and up to 5 results.",
    example: '{ type: "web_search", query: "tanstack ai", state: "done", results: [...] }',
  },
  {
    lesson: 10,
    name: "createWebSearchTool",
    kind: "function",
    meaning:
      "Builds the web_search server tool for one reply. It records each search in the parts, turns a failure into the error state, and allows at most 3 searches.",
    example:
      "packages/api/src/chat/web-search-tool.ts, called in startRun when webSearch credentials exist",
  },
  {
    lesson: 10,
    name: "numberSources",
    kind: "function",
    meaning:
      "Numbers a Message's Sources in order of first appearance across all its searches, dropping repeats by sourceKey. Computed, never stored.",
    example: "two searches with 4 results, one repeated → Sources 1, 2, 3",
  },
  {
    lesson: 10,
    name: "sourceKey",
    kind: "function",
    meaning:
      "A URL without its #fragment and trailing slash. Two URLs with the same key are the same Source.",
    example: "https://a.dev/x#top and https://a.dev/x/ → https://a.dev/x",
  },
  {
    lesson: 10,
    name: "citationFor",
    kind: "function",
    meaning:
      "The Source a link in a reply points at, or null. A match renders as that Source's numbered citation chip.",
    example: 'citationFor("https://tanstack.com/ai/latest", sources) → Source 1',
  },
  {
    lesson: 11,
    name: "attachment.upload",
    kind: "route",
    meaning:
      "The oRPC procedure that stores one picked file (5 MB at most; image, PDF or UTF-8 text) and returns its AttachmentInfo.",
    example: 'returns { id, filename: "photo.png", mediaType: "image/png", size: 3145728 }',
  },
  {
    lesson: 11,
    name: "message_attachment",
    kind: "table/column",
    meaning:
      "Join table that links a Message to its Attachments in order (messageId, attachmentId, position). Deleting the Message removes its link rows.",
    example: "an edit inserts (M1′, photo, 0); M1's rows stay",
  },
  {
    lesson: 11,
    name: "lockAttachments",
    kind: "function",
    meaning:
      "Inside the send transaction, locks the user's Attachments FOR KEY SHARE so the orphan cleanup skips them. Returns false if one is gone, and the send answers 404.",
    example: "packages/api/src/attachments/store.ts, called before linkAttachments",
  },
  {
    lesson: 11,
    name: "attachmentsForSend",
    kind: "function",
    meaning:
      "Before any write, checks a send's attachments (owned, readable by the Model, 5 MB each, 20 MB per Branch) and loads their bytes for the Provider.",
    example: 'a PDF to a GPT Model → 400 "<label> can\'t read PDFs"',
  },
  {
    lesson: 12,
    name: "shared_link",
    kind: "table/column",
    meaning:
      "One row per Conversation: token, unique conversationId, leafMessageId of the shared Branch, frozen title. A pointer, never a copy.",
    example: "packages/db/src/schema/share.ts; both foreign keys cascade on delete",
  },
  {
    lesson: 12,
    name: "upsertSharedLink",
    kind: "function",
    meaning:
      "Creates the Shared link, or moves leafMessageId to the current Active Branch under the same token. Refused while the newest Message is streaming or error.",
    example: "onConflictDoUpdate on conversationId in packages/api/src/share/store.ts",
  },
  {
    lesson: 12,
    name: "loadSharedConversation",
    kind: "function",
    meaning:
      "What a viewer gets for a token: loadPath up from leafMessageId, with parts and attachments redacted.",
    example: "share.get (a publicProcedure) → /share/$token page",
  },
  {
    lesson: 12,
    name: "redactForShare",
    kind: "function",
    meaning:
      "Allowlist filter: keeps text, tool-call and tool-result parts; thinking, file contents and any new part type are removed.",
    example: "[thinking, text] → [text] in packages/api/src/share/redact.ts",
  },
  {
    lesson: 12,
    name: "redactAttachmentsForShare",
    kind: "function",
    meaning:
      "Turns each attachment into a { filename, mediaType } chip; id, size and bytes stay private.",
    example:
      '{ id, filename: "cat.png", mediaType: "image/png", size: 1234 } → { filename: "cat.png", mediaType: "image/png" }',
  },
  {
    lesson: 13,
    name: "titleConversation",
    kind: "function",
    meaning:
      "Titles an untitled Conversation after a complete run; fire-and-forget, never throws, writes only where title is null.",
    example: "void titleConversation(deps, messageId) in startRun's finally",
  },
  {
    lesson: 13,
    name: "user_settings.titleModel",
    kind: "table/column",
    meaning: "The Model that writes titles; null means the Model that wrote the reply.",
    example: 'settings.setTitleModel({ titleModel: "anthropic:claude-haiku-4-5" })',
  },
  {
    lesson: 13,
    name: "fallbackTitle",
    kind: "function",
    meaning:
      'First ~50 characters of the first Message, cut at a word after character 25, plus "…".',
    example: '"Explain how the Message tree stores Branches when…"',
  },
  {
    lesson: 13,
    name: "awaitingTitle",
    kind: "function",
    meaning:
      "True when untitled, nothing streaming and an assistant Message is complete; drives the top bar's polling.",
    example: "polls conversation.get every 1 s for up to titleWaitMs (30 s)",
  },
  {
    lesson: 14,
    name: "createTestDeps",
    kind: "function",
    meaning:
      "AppDeps for tests: the test database, a fake search client, adapterFor and fetch that throw, and tiny limits. Pass overrides for what a test scripts.",
    example:
      "createTestDeps({ adapterFor: () => fake.adapter }) in packages/api/src/testing/deps.ts",
  },
  {
    lesson: 14,
    name: "createFakeAdapter",
    kind: "function",
    meaning:
      "A scripted TanStack AI adapter: each chatStream call plays the next round; with manual: true each chunk waits for release(n).",
    example: 'createFakeAdapter({ rounds: [round(text("Hello", " there!"))], manual: true })',
  },
  {
    lesson: 14,
    name: "round",
    kind: "function",
    meaning:
      "One scripted model call: RUN_STARTED, the parts' chunks, then RUN_FINISHED (tool_calls or stop); no RUN_FINISHED after a RUN_ERROR.",
    example: 'round(toolCall({ name: "web_search", input })) ends with finishReason "tool_calls"',
  },
  {
    lesson: 14,
    name: "createTestClient",
    kind: "function",
    meaning: "Calls appRouter in the same process, signed in as a test user, with test deps.",
    example: "createTestClient({ user }).share.upsert({ conversationId })",
  },
  {
    lesson: 14,
    name: "TEST_DATABASE_URL",
    kind: "table/column",
    meaning: "The Postgres database integration tests use; tables are truncated before each test.",
    example: "packages/db/src/testing/test-database.ts; set in .github/workflows/ci.yml",
  },
];

(function () {
  const upto = Number(document.currentScript?.dataset.upto ?? Infinity);
  const esc = (s) =>
    String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
  const entry = (n) =>
    `<div class="n"><code>${esc(n.name)}</code> <span class="kind">${esc(n.kind)} · lesson ${n.lesson}</span><div>${esc(n.meaning)}</div><div class="ex">e.g. ${esc(n.example)}</div></div>`;
  window.renderNames = (el, max = Infinity) => {
    el.innerHTML = window.NAMES.filter((n) => n.lesson <= max)
      .map(entry)
      .join("");
  };
  if (!Number.isFinite(upto)) return;
  document.addEventListener("DOMContentLoaded", () => {
    const btn = document.createElement("button");
    btn.className = "names-btn";
    btn.type = "button";
    btn.textContent = "Names?";
    btn.setAttribute("aria-expanded", "false");
    const panel = document.createElement("div");
    panel.className = "names-panel";
    panel.hidden = true;
    window.renderNames(panel, upto);
    btn.addEventListener("click", () => {
      panel.hidden = !panel.hidden;
      btn.setAttribute("aria-expanded", String(!panel.hidden));
    });
    document.body.append(panel, btn);
  });
})();
