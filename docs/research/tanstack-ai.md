# What TanStack AI gives us

Research for issue #2 (child of the v1 map, #1). Researched on 2026-10-06.

**Versions checked** (npm `latest` = repo `main` at commit [`a32782c`](https://github.com/TanStack/ai/tree/a32782c3e5674cb94f53adc1cc4e5a51bc11c121)):

| Package | Version | Role |
| --- | --- | --- |
| `@tanstack/ai` | 0.64.1 | Server core: `chat()`, tools, SSE/NDJSON response helpers |
| `@tanstack/ai-client` | 0.36.2 | Headless `ChatClient`, connection adapters |
| `@tanstack/ai-react` | 0.29.4 | `useChat`, plus the headless UI at `@tanstack/ai-react/ui` |
| `@tanstack/ai-anthropic` | 0.19.4 | Claude adapter + `/tools` (web search, …) |
| `@tanstack/ai-openai` | 0.26.0 | OpenAI adapter (Responses API by default) + `/tools` |
| `@tanstack/ai-persistence` | 0.7.2 | Optional server persistence middleware (`withPersistence`) |

Sources are the docs in the repo's `docs/` folder (the same Markdown that tanstack.com/ai renders) and the package source. Links below point to the repo at the commit above. "Docs:" means a docs page; "Source:" means I checked the implementation.

---

## 1. React chat hook and the message/parts format

**`useChat(options)`** from `@tanstack/ai-react` wraps the headless `ChatClient`.
Docs: [api/ai-react.md](https://github.com/TanStack/ai/blob/a32782c3e5674cb94f53adc1cc4e5a51bc11c121/docs/api/ai-react.md)

- Options: `connection` (or `fetcher`) is required. The others are `tools` (client tools), `initialMessages`, `threadId`, `forwardedProps` (extra JSON sent to the server; `body` is a deprecated alias), `persistence`, `onResponse`/`onChunk`/`onFinish`/`onError`, and `context`.
- Returns `messages`, `sendMessage(content | MultimodalContent, options?)`, `append`, `reload`, `stop`, `isLoading`, `error`, `setMessages`, `clear`, `addToolResult`, `addToolApprovalResponse`.
- `sendMessage(text, { body })` shallow-merges per-call JSON into `forwardedProps` for that request only ([chat/connection-adapters.md](https://github.com/TanStack/ai/blob/a32782c3e5674cb94f53adc1cc4e5a51bc11c121/docs/chat/connection-adapters.md#server-sent-events-sse)). This is how a per-message model choice or attachment ids reach the server.

**`UIMessage`** (source: [`packages/ai/src/types.ts` L594–684](https://github.com/TanStack/ai/blob/a32782c3e5674cb94f53adc1cc4e5a51bc11c121/packages/ai/src/types.ts#L594-L684)):

```ts
interface UIMessage {
  id: string
  role: 'system' | 'user' | 'assistant' | 'activity'
  parts: MessagePart[]
  createdAt?: Date
  name?: string
  metadata?: Record<string, any> // TanStack writes under metadata.tanstack (model, runId, …)
}
type MessagePart =
  | TextPart            // { type: 'text', content }
  | ImagePart | AudioPart | VideoPart | DocumentPart // { type, source: data | url | file }
  | ToolCallPart        // { type: 'tool-call', id, name, arguments, input?, state, output?, approval?, metadata? }
  | ToolResultPart      // { type: 'tool-result', toolCallId, content, state, error?, outcome? }
  | ThinkingPart        // { type: 'thinking', content, signature?, redacted? }
  | ActivityPart | StructuredOutputPart | UIResourcePart | SubagentPart
```

- **There is no parent pointer or branch concept.** A `UIMessage` has no `parentId`, and the docs never mention branches or message trees. (I searched all of `docs/` for branch/parent/regenerate/edit.)
- On the server, `chat()` takes `UIMessage[]` or `ModelMessage[]` and converts them itself. `ModelMessage` has `role: 'user' | 'assistant' | 'tool'`, `content: string | ContentPart[]`, `toolCalls`, `thinking`, an optional `id`, and `metadata`. There is no `system` role: system text goes in `chat({ systemPrompts })` ([advanced/multimodal-content.md](https://github.com/TanStack/ai/blob/a32782c3e5674cb94f53adc1cc4e5a51bc11c121/docs/advanced/multimodal-content.md#validating-dynamic-messages)).
- **`reload()` only regenerates the last turn.** It deletes everything after the last user message and re-streams (source: [`chat-client.ts` `reload()`](https://github.com/TanStack/ai/blob/a32782c3e5674cb94f53adc1cc4e5a51bc11c121/packages/ai-client/src/chat-client.ts#L2835-L2862)). The Vercel migration guide maps Vercel's `regenerate()` to `reload()`.
- To edit or regenerate an older Message, you call `setMessages(pathUpToThatMessage)` and then `sendMessage`/`append` yourself.
- **Rendering helpers.** `@tanstack/ai-react/ui` has a headless `createChatHook` factory and a `TextPart` component that renders markdown, with code highlighting through `@tanstack/highlight` ([ui/react.md](https://github.com/TanStack/ai/blob/a32782c3e5674cb94f53adc1cc4e5a51bc11c121/docs/ui/react.md), [ui/markdown.md](https://github.com/TanStack/ai/blob/a32782c3e5674cb94f53adc1cc4e5a51bc11c121/docs/ui/markdown.md)). It ships no default markup or styles.
- The separate `@tanstack/ai-react-ui` package is **deprecated**. Use the `/ui` subpath instead.

## 2. Server streaming API, and how it mounts in TanStack Start

### Wire protocol

`chat()` returns an `AsyncIterable<StreamChunk>` in [AG-UI](https://docs.ag-ui.com) event format ([chat/stream-events.md](https://github.com/TanStack/ai/blob/a32782c3e5674cb94f53adc1cc4e5a51bc11c121/docs/chat/stream-events.md)). The event types are:

- `RUN_STARTED`
- `TEXT_MESSAGE_START` / `CONTENT` / `END`
- `TOOL_CALL_START` / `ARGS` / `END`
- `REASONING_*`
- `RUN_FINISHED` or `RUN_ERROR`, which carry usage and `metadata.tanstack.finishReason`

Two ids frame every stream:

- `threadId` is the conversation.
- `runId` is one execution. One user turn plus all its tool loops is a single run.

### Server route (the documented path)

([getting-started/quick-start.md](https://github.com/TanStack/ai/blob/a32782c3e5674cb94f53adc1cc4e5a51bc11c121/docs/getting-started/quick-start.md), [advanced/runtime-adapter-switching.md](https://github.com/TanStack/ai/blob/a32782c3e5674cb94f53adc1cc4e5a51bc11c121/docs/advanced/runtime-adapter-switching.md#full-example))

```ts
// apps/web/src/routes/api/chat.ts  (same shape as our existing api/rpc/$.ts)
export const Route = createFileRoute('/api/chat')({
  server: { handlers: { POST: async ({ request }) => {
    const { messages, threadId, runId, forwardedProps } = await chatParamsFromRequest(request)
    const abortController = new AbortController()
    const stream = chat({ adapter: anthropicText('claude-sonnet-4-6'), messages, threadId, runId, abortController })
    return toServerSentEventsResponse(stream, { abortController })
  } } },
})
```

The client side is `useChat({ connection: fetchServerSentEvents('/api/chat') })`. Some details:

- `chatParamsFromRequest` parses the AG-UI body and throws a 400 `Response` if the body is invalid.
- `toHttpResponse` (NDJSON) is the alternative transport.
- Cookies go along by default (`credentials: 'same-origin'`), so Better-Auth sessions work. You would still check the session in the handler yourself.

### Can it go through oRPC instead?

Yes. Both sides are documented, but nobody has documented this exact pairing end to end.

- **Client side.** `rpcStream((messages, data, signal) => AsyncIterable<StreamChunk>)` and `stream(...)` exist for RPC frameworks ([connection-adapters.md § RPC Streams](https://github.com/TanStack/ai/blob/a32782c3e5674cb94f53adc1cc4e5a51bc11c121/docs/chat/connection-adapters.md#rpc-streams)). The factory receives the `AbortSignal` (source: [`connection-adapters.ts` `rpcStream`](https://github.com/TanStack/ai/blob/a32782c3e5674cb94f53adc1cc4e5a51bc11c121/packages/ai-client/src/connection-adapters.ts#L2711-L2731)).
- **The Promise gap.** An oRPC client call returns a **Promise** of an async iterator. `rpcStream`/`stream` want the iterable synchronously. Either use the `fetcher` option, which accepts a Promise resolving to an `AsyncIterable<StreamChunk>` and gets `{ signal }`, or wrap the call: `async function* () { yield* await client.chat.send(input, { signal }) }`.
- **Server side.** oRPC procedures stream with async-generator handlers ("event iterators") over SSE. The handler gets a `signal` that aborts when the client disconnects. The client can stop the stream with `{ signal }` or `iterator.return()` (oRPC docs: [event-iterator](https://orpc.dev/docs/event-iterator), [client/event-iterator](https://orpc.dev/docs/client/event-iterator)). A procedure can therefore `yield* chat({ …, abortController })`, with the controller tied to oRPC's `signal`.
- **What you give up.** `rpcStream`/`stream` never receive `runContext` (`threadId`, `runId`, client-tool list, headers) ([connection-adapters.md § Custom Request-Scoped Adapters](https://github.com/TanStack/ai/blob/a32782c3e5674cb94f53adc1cc4e5a51bc11c121/docs/chat/connection-adapters.md#custom-request-scoped-adapters)). You pass ids in your own input. You also lose the built-in `persistence: true` hydrate and resume plumbing unless you supply the `hydrate`/`joinRun` handlers yourself.
- **What you gain.** One typed API surface, and the existing `protectedProcedure` auth middleware.

**Assessment.** oRPC streaming fits technically. The SSE server route is the well-trodden path, and it sits next to `/api/rpc/$` in the same way. I did not build either variant (see "Not verified").

## 3. Stopping a reply mid-generation

- **Client.** `stop()` aborts the in-flight request ([chat/streaming.md § Cancel a run](https://github.com/TanStack/ai/blob/a32782c3e5674cb94f53adc1cc4e5a51bc11c121/docs/chat/streaming.md#3-cancel-a-run)). `AbortError` is expected and is not surfaced as an error.
- **Server.** Pass one `AbortController` to both `chat({ abortController })` and `toServerSentEventsResponse(stream, { abortController })`.
  - When the client disconnects, the response stream's `cancel()` aborts that controller, which stops the provider request (source: [`stream-to-response.ts` L237–260](https://github.com/TanStack/ai/blob/a32782c3e5674cb94f53adc1cc4e5a51bc11c121/packages/ai/src/stream-to-response.ts#L237-L260)).
  - With a durable stream configured, a disconnect *detaches* instead: the run keeps going so a reload can rejoin it. In that mode Stop needs an explicit out-of-band cancel.
- **What the transcript keeps.** Text received before the stop stays in `messages`. `onFinish` does not fire.
  - If you persist manually, save the partial assistant Message on abort.
  - With `withPersistence`, an abort marks the run `aborted`. The transcript is only saved at finish, and optionally every ~1s with `snapshotStreaming: true`. So a stopped reply's partial text is **not** saved unless snapshots are on ([persistence/chat-persistence.md § What gets persisted](https://github.com/TanStack/ai/blob/a32782c3e5674cb94f53adc1cc4e5a51bc11c121/docs/persistence/chat-persistence.md#what-gets-persisted-and-when)).

## 4. Anthropic and OpenAI adapters, and switching models per request

- **Construction.** `anthropicText(model)` and `openaiText(model)` read `ANTHROPIC_API_KEY` / `OPENAI_API_KEY`. `createAnthropicChat(model, apiKey)` and `createOpenaiChat(model, apiKey)` take an explicit key.
- **Models are fixed per adapter.** The model is the factory's first argument and is typed to a literal union. There is no separate `model` parameter on `chat()`.
- **OpenAI endpoint.** `openaiText` uses the **Responses API**. `openaiChatCompletions` targets `/v1/chat/completions` instead ([adapters/openai.md](https://github.com/TanStack/ai/blob/a32782c3e5674cb94f53adc1cc4e5a51bc11c121/docs/adapters/openai.md#chat-completions-api)).
- **Switching per request.** Build a server-side map such as `{ anthropic: () => anthropicText('…'), openai: () => openaiText('…') }` and pick from `forwardedProps.provider`/`model` on each request ([advanced/runtime-adapter-switching.md](https://github.com/TanStack/ai/blob/a32782c3e5674cb94f53adc1cc4e5a51bc11c121/docs/advanced/runtime-adapter-switching.md)).
- **Model lists.** Runtime arrays are exported for validation: `ANTHROPIC_MODELS` (15 ids, including `claude-sonnet-5`, `claude-opus-4-8`, `claude-haiku-4-5`, `claude-sonnet-4-6`) and `OPENAI_CHAT_MODELS` (source: [`ai-anthropic/src/model-meta.ts` L699](https://github.com/TanStack/ai/blob/a32782c3e5674cb94f53adc1cc4e5a51bc11c121/packages/ai-anthropic/src/model-meta.ts#L699-L717), `ai-openai/src/model-meta.ts` L2775). Display names and pricing are not exported as data. The app has to own its picker list.
- **Sampling options.** `temperature`, `max_tokens`, `thinking`, and similar go in `modelOptions`, typed per model. The Anthropic `max_tokens` default is the model's full output ceiling ([adapters/anthropic.md](https://github.com/TanStack/ai/blob/a32782c3e5674cb94f53adc1cc4e5a51bc11c121/docs/adapters/anthropic.md#max_tokens-default)).
- **Thinking.** Both providers stream thinking as `thinking` parts. Rules differ per Claude model: adaptive-only versus budget.
- **One-shot calls.** `chat({ stream: false })` returns a `Promise<string>`, which suits auto-generated titles. `summarize()` also exists ([api/ai.md](https://github.com/TanStack/ai/blob/a32782c3e5674cb94f53adc1cc4e5a51bc11c121/docs/api/ai.md)).
- **Risk: switching provider mid-Conversation.** Provider-specific artefacts stay in the history.
  - The OpenAI adapter silently drops foreign provider-executed tool calls, such as Anthropic web-search results. It also skips thinking signatures it cannot unpack (source: `openai-base/src/adapters/responses-text.ts` L2304–2364).
  - The Anthropic adapter forwards **any** thinking `signature` as a Claude signature (source: `ai-anthropic/src/adapters/text.ts` L957–971). An OpenAI reasoning signature in the history could therefore be rejected by Anthropic.
  - The docs do not cover cross-provider history. **Unverified; test it.** The likely mitigation is to strip `thinking` parts from history when the provider changes.

## 5. Tool calling: server, client and isomorphic tools

([overview](https://github.com/TanStack/ai/blob/a32782c3e5674cb94f53adc1cc4e5a51bc11c121/docs/getting-started/overview.md), [chat/agentic-cycle.md](https://github.com/TanStack/ai/blob/a32782c3e5674cb94f53adc1cc4e5a51bc11c121/docs/chat/agentic-cycle.md), [tools/provider-tools.md](https://github.com/TanStack/ai/blob/a32782c3e5674cb94f53adc1cc4e5a51bc11c121/docs/tools/provider-tools.md))

- **Defining tools.** `toolDefinition({ name, description, inputSchema, outputSchema })` uses Zod or any Standard Schema.
  - `.server(fn)` gives a server tool, passed to `chat({ tools })`.
  - `.client(fn)` gives a client tool, passed to `useChat({ tools })` and run automatically in the browser.
  - `needsApproval: true` adds an approval step (`addToolApprovalResponse`).
- **The loop.** `chat()` runs the loop server-side: model → tools → model, all within **one run and one stream**.
  - The default bound is `maxIterations(5)` model turns. Change it with `agentLoopStrategy`.
  - Since 0.64.0, the server tools of one turn run in parallel (`toolExecution: 'sequential'` opts out) ([CHANGELOG 0.64.0](https://github.com/TanStack/ai/blob/a32782c3e5674cb94f53adc1cc4e5a51bc11c121/packages/ai/CHANGELOG.md)).
- **In the UI.** Tool calls show up as `tool-call` parts with a `state`. Results are `tool-result` parts.
- **Web search needs no search API.** Both adapters ship the provider's **native** web search on a `/tools` subpath:
  - `webSearchTool` from `@tanstack/ai-anthropic/tools` (`{ name: 'web_search', type: 'web_search_20250305', max_uses }`)
  - `webSearchTool` from `@tanstack/ai-openai/tools`
- **How provider tools behave.** These are "provider-executed": they run on the provider's side, arrive as a `tool-call` part with `metadata.providerExecuted: true`, and are never run by the agent loop. Their results round-trip into the next turn automatically. A type-level guard rejects a provider tool on a model that does not support it.
- **Reading search sources.**
  - OpenAI exposes a normalized `metadata.sources: [{ url, title?, pageAge? }]` via `getProviderExecutedMetadata(part)`.
  - **Anthropic does not.** Its raw result block sits under `metadata.anthropic.result` (source: `ai-anthropic/src/adapters/text.ts` L1164–1191).
  - I found no handling of Anthropic `citations_delta` in the adapter, so Claude's inline text citations are probably not surfaced in the stream (not verified at runtime).
  - A source list in the UI needs a small per-provider normalizer.

## 6. Multimodal input (images and files)

([advanced/multimodal-content.md](https://github.com/TanStack/ai/blob/a32782c3e5674cb94f53adc1cc4e5a51bc11c121/docs/advanced/multimodal-content.md), [advanced/files-api.md](https://github.com/TanStack/ai/blob/a32782c3e5674cb94f53adc1cc4e5a51bc11c121/docs/advanced/files-api.md))

- **Content parts.** `ImagePart`, `DocumentPart` (PDF), `AudioPart` and `VideoPart` each take a `source`, which is one of:
  - `{ type: 'data', value: base64, mimeType }`
  - `{ type: 'url', value }`
  - `{ type: 'file', value: providerFileId, provider }` (a provider Files API handle, from `uploadFile({ adapter: anthropicFiles() | openaiFiles() })`)
- **Provider support.** Claude takes text, image and PDF. GPT-5.x takes text, image and PDF. Each model's support is typed through `supports.input`.
- **Client.** `sendMessage({ content: [{ type: 'text', … }, { type: 'image', source }] })`. The documented upload example base64-encodes the `File` in the browser.
- **Gotcha:** `useChat` posts the **whole message history** on every send, so inline base64 attachments would be re-uploaded on every turn. Also, a `url` source must be reachable by the provider, which our local Docker setup is not.
- **Pattern the docs point at.** Send `attachmentIds` in `sendMessage(…, { body })` and resolve them on the server ([connection-adapters.md](https://github.com/TanStack/ai/blob/a32782c3e5674cb94f53adc1cc4e5a51bc11c121/docs/chat/connection-adapters.md#server-sent-events-sse)). In other words: upload to our own store first, then build `data` sources server-side right before `chat()`.
- **No runtime validator.** TanStack AI does not ship one for incoming messages. Validate with Zod yourself.

## 7. Built-in persistence and message-history hooks

([persistence/overview.md](https://github.com/TanStack/ai/blob/a32782c3e5674cb94f53adc1cc4e5a51bc11c121/docs/persistence/overview.md), [chat-persistence.md](https://github.com/TanStack/ai/blob/a32782c3e5674cb94f53adc1cc4e5a51bc11c121/docs/persistence/chat-persistence.md), [client-persistence.md](https://github.com/TanStack/ai/blob/a32782c3e5674cb94f53adc1cc4e5a51bc11c121/docs/persistence/client-persistence.md), [build-your-own-adapter.md](https://github.com/TanStack/ai/blob/a32782c3e5674cb94f53adc1cc4e5a51bc11c121/docs/persistence/build-your-own-adapter.md))

### What exists

- **Server: `withPersistence(persistence)`** from `@tanstack/ai-persistence` is a `chat()` middleware.
  - It needs a `messages` store with two functions: `loadThread(threadId)` and `saveThread(threadId, fullTranscript)`, a full overwrite. Optional stores are `runs` (status running/completed/failed/aborted, usage, timings), `interrupts`, `metadata`, `activities`, and others.
  - You write the store over your own DB in about 40 lines.
  - The package ships agent skills, with a Drizzle recipe, and a conformance test suite (`@tanstack/ai-persistence/testkit`).
- **Client.**
  - `useChat({ threadId, persistence: true })` is server-authoritative. It hydrates via a `GET` that returns `reconstructChat(persistence, request, { authorize })`, supports paging with `history: { pageSize }`, and rejoins an in-flight run.
  - Alternatively, `persistence: localStoragePersistence()` / `indexedDBPersistence()` keeps the history in the browser.
- **Resumable streams.** These are a separate layer: `durability: { adapter: memoryStream(request) }`, or `@tanstack/ai-durable-stream`. They survive a reload mid-reply.
- **Lighter hooks.** You can skip the persistence package: `onFinish` on the client, or iterate the stream / use `StreamProcessor` / `onFinish` middleware on the server, and save Messages yourself.

### Why it clashes with Branches

The model is **one linear transcript per `threadId`**. When `withPersistence` gets incoming messages, it merges them by id. The last incoming id that already exists in storage becomes a cutoff, and **stored messages after it are dropped**. That is how `reload()` removes the old assistant reply ([chat-persistence.md § Keep every stored message](https://github.com/TanStack/ai/blob/a32782c3e5674cb94f53adc1cc4e5a51bc11c121/docs/persistence/chat-persistence.md#keep-every-stored-message)).

So used as-is, edit or regenerate **destroys the old Branch**. To keep Branches, choose one of:

- (a) Do not use `withPersistence`. Own persistence in Drizzle as a Message tree with `parentId`, write it from our own handler, and seed `useChat` with `initialMessages` (the active Branch's path). Use `setMessages` when the user switches Branch.
- (b) Write a custom `messages` store whose `saveThread` only **inserts** new ids with a parent link and never deletes siblings, and whose `loadThread` returns the active path. This is plausible but works against the documented "full overwrite" contract, so the conformance suite would likely fail. Not verified.

## 8. Maturity and known gaps

- **Pre-1.0 with very fast churn.**
  - `@tanstack/ai` was first published 2025-12-04 and has 95 published versions; it is now 0.64.1.
  - There were about 14 minor releases between 2026-08-27 and 2026-10-02. Minor bumps carry behaviour changes (for example 0.64.0 made server tools run in parallel by default).
  - The repo has about 3.2k stars and 47 open issues (GitHub API, 2026-10-06). It is maintained by tannerlinsley, alemtuzlak and kevinvandy.
  - The docs are extensive and current.
- **Breadth.** It covers a lot beyond v1: MCP, subagents, interrupts, media generation, sandboxes, devtools (`@tanstack/ai-devtools`), OTel middleware, and BYOK.
- **Gaps relevant to us:**
  - No branching or message-tree model (§1, §7).
  - Anthropic web-search sources are not normalized, and Claude text citations are probably not surfaced (§5).
  - Cross-provider history is undocumented and risky with thinking enabled (§4).
  - oRPC streaming is documented generically (`rpcStream`) but not with an oRPC example (§2).
  - Partial replies are not persisted on Stop unless you save them yourself or turn on snapshots (§3).
  - No runtime message validation (§6).
  - `@tanstack/ai-react-ui` is deprecated in favour of `@tanstack/ai-react/ui` (§1).

## Not verified

- I did not run any code. Everything here comes from the docs and from reading source at commit `a32782c`.
- I did not confirm that TanStack Start's Nitro (`nitro@3.0.260903-beta`) propagates a client disconnect into the `ReadableStream.cancel()` that triggers server-side abort.
- I did not try oRPC event iterators carrying `StreamChunk` objects through `fetcher`/`rpcStream` end to end.
- I did not test cross-provider history replay (Claude to GPT and back) with thinking or web search in the history.
- I did not confirm that Anthropic `citations_delta` is dropped; I only found no code that handles it.
- Model id lists change often. Re-read `ANTHROPIC_MODELS` / `OPENAI_CHAT_MODELS` from the installed version.

---

## Implications for this app

1. **Streaming endpoint.** Prefer a plain TanStack Start server route, `routes/api/chat.ts`, with `chatParamsFromRequest` → `chat()` → `toServerSentEventsResponse`, plus `fetchServerSentEvents` on the client.
   - Check the session there, using the same `createContext` as `/api/rpc`.
   - Keep oRPC for everything non-streaming: the Conversation list, rename/delete, history search, Branch switching, uploads, Shared links.
   - oRPC streaming is a viable alternative (`fetcher` + an event-iterator procedure) if we want one API surface. Treat it as a small spike, not the default.
2. **Data model (reshapes the schema ticket).** TanStack AI gives us a linear `UIMessage { id, role, parts[] }` per `threadId`, and no tree.
   - Store Messages ourselves as a tree: `message.parentId`, plus `conversation.activeLeafId` or something similar.
   - Store `parts` as `jsonb` in TanStack's `MessagePart` shape, so hydrating is just `initialMessages`.
   - Map `threadId` to the Conversation id.
   - **Do not use `withPersistence` as-is.** Its id-cutoff merge deletes the old Branch on edit or regenerate.
3. **Edit/regenerate.** These are app logic, not library features. `reload()` only redoes the latest turn.
   - On edit or regenerate, insert a sibling node, then `setMessages(pathToParent)` and `sendMessage`/`append`.
   - The server should rebuild history from the DB path, not trust the client array.
4. **Stop.** Wire one `AbortController` into `chat()` and `toServerSentEventsResponse`. Save the partial assistant Message on abort (marked stopped) in our own handler.
5. **Model picker.** Keep an app-owned allowlist of `{ provider, modelId, label }`, validated against `ANTHROPIC_MODELS` / `OPENAI_CHAT_MODELS`.
   - Send the choice per message through `sendMessage(text, { body: { model } })` and resolve the adapter server-side.
   - Store the model on each assistant Message. TanStack already writes `metadata.tanstack.model`.
   - Strip `thinking` parts when replaying history to a different provider.
6. **Web search.** Use the providers' native `webSearchTool` for each provider. No third-party search API or key is needed.
   - The UI renders `tool-call` parts where `providerExecuted` is true.
   - Write a small normalizer for sources: OpenAI `metadata.sources`, Anthropic `metadata.anthropic.result`.
7. **Attachments.** Upload first, through oRPC to our own storage with a DB row. Send `attachmentIds` in `body`, and build base64 `data` parts server-side before `chat()`. This avoids re-posting base64 every turn and avoids needing public URLs.
   - Claude and GPT-5.x both accept images and PDFs.
   - Optional later: the provider Files API handles.
8. **Titles.** Use `chat({ adapter: cheapModel, stream: false, … })` after the first exchange.
9. **Markdown and code.** Use `TextPart` from `@tanstack/ai-react/ui` with `@tanstack/highlight`, or our own renderer. The `/ui` layer is headless, so it fits shadcn.
10. **Pin versions.** Pin exact versions of `@tanstack/ai*`: the packages are pre-1.0 and change weekly. Adding these dependencies is a human decision (AGENTS.md §6).
