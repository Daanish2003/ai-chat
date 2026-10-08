# MCP and tools in TanStack AI

Research for [#44](https://github.com/Daanish2003/ai-chat/issues/44) (child of map [#38](https://github.com/Daanish2003/ai-chat/issues/38)). Researched 2026-10-08.

## Question

What does TanStack AI support for MCP (remote HTTP/SSE servers, stdio, OAuth to MCP servers), for custom server tools beyond our `web_search`, and for tools that need user approval before they run? Which tools are worth offering first in a chat app (fetching a URL, a code interpreter or sandbox)? What are the security risks of letting real users connect their own MCP servers from a hosted app (SSRF, credential storage, prompt injection), and how do we mitigate them?

## Recommendation

1. **Ship custom server tools before MCP.** The next tool should be `fetch_url`, a custom `toolDefinition().server()` like `web_search` ([`packages/api/src/chat/web-search-tool.ts`](../../packages/api/src/chat/web-search-tool.ts)). It works the same on every Provider, and it needs the same SSRF guard that MCP needs, so we build the guard once. Hold off on a code interpreter. Provider-hosted code execution only exists for Anthropic, OpenAI and Gemini, each with its own result shape. A self-hosted sandbox is new infrastructure, and that is a human decision (AGENTS.md §6).
2. **When MCP comes, start with an operator-curated allowlist of remote servers.** Users connect their own account to a server we list. They do not paste in arbitrary URLs. Use Streamable HTTP only, OAuth per user through `authProvider`, and store tokens encrypted the way ADR 0003 stores credentials. Every MCP tool needs approval by default. Filter tools by name, never by server-declared annotations.
3. **Arbitrary user-supplied MCP URLs come last, if at all.** Allow them only behind an egress proxy (the MCP spec names Stripe's Smokescreen) plus a guarded `fetch`, with approval on every call. **Never offer stdio** in the hosted app. A user-chosen stdio command is remote code execution on our server.
4. **Approval is supported but not free for us.** `needsApproval` pauses the run with an interrupt. Our runs, stored Message parts and Message statuses (ADR 0001/0002) have no "waiting for the user" state and no resume path. Adding one means a schema change, which is a human decision.
5. **Version note.** `@tanstack/ai-mcp@0.8.0` (latest) needs `@tanstack/ai ^0.65.0`. We have `0.64.1`. `@tanstack/ai-mcp@0.7.0` is the release that matches ours (`^0.64.0`). Adding the package is a new dependency, which is also a human decision.

## What TanStack AI supports

Versions read: `@tanstack/ai` 0.64.1 (installed, `packages/api/package.json`). `@tanstack/ai-mcp` 0.7.0 and 0.8.0 from the npm tarballs (only `client.ts` and `server/create-server.ts` differ between them). `@modelcontextprotocol/client` 2.3.1 (npm tarball). TanStack/ai docs at `main` ([`778d305`](https://github.com/TanStack/ai/tree/778d30574729ff824654e972c067ea47b9207af4/docs)).

### MCP client (`@tanstack/ai-mcp`)

| Capability                                                                    | Status                                                                                                                                                                                                                                                                                                                                                                                                  | Source                                                |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Streamable HTTP transport                                                     | Yes: `transport: { type: 'http', url, headers?, fetch?, authProvider? }`                                                                                                                                                                                                                                                                                                                                | `src/transport.ts` [T1]                               |
| SSE transport                                                                 | Yes: `type: 'sse'`, same options. The MCP SDK marks `SSEClientTransport` deprecated.                                                                                                                                                                                                                                                                                                                    | `src/transport.ts` [T1]; SDK `dist/index.mjs` [S1]    |
| stdio                                                                         | Yes, Node only, from the `@tanstack/ai-mcp/stdio` subpath (`stdioTransport({ command, args, env, cwd })`)                                                                                                                                                                                                                                                                                               | `src/transport.ts`, `src/stdio.ts` [T1]               |
| Static auth                                                                   | `headers: { Authorization: 'Bearer …' }`                                                                                                                                                                                                                                                                                                                                                                | [T1], [T2]                                            |
| OAuth 2.1 (MCP authorization)                                                 | `authProvider: OAuthClientProvider` from `@modelcontextprotocol/client`. The transport attaches the token, refreshes it and retries on 401. For the interactive redirect flow, you build `StreamableHTTPClientTransport` yourself, keep a reference, call `transport.finishAuth(code)` in the callback route, and then pass the transport in. `createMCPClient` does not expose its internal transport. | [T2] (docs/tools/mcp.md "OAuth"), skill `ai-mcp` [T3] |
| Into `chat()`                                                                 | Spread `await client.tools()` into `tools`, or pass `chat({ mcp: { clients, connection: 'close' \| 'keep-alive', lazyTools, onDiscoveryError } })`. `mcp` exists on `chat()` in our installed 0.64.1 (`activities/chat/index.ts:518`).                                                                                                                                                                  | [T2], installed source                                |
| Typed tools                                                                   | `client.tools([toolDefinition(...)])` binds `callTool` behind typed definitions and acts as a name allowlist. It throws `MCPToolNotFoundError` when a name is missing.                                                                                                                                                                                                                                  | [T3]                                                  |
| Several servers                                                               | `createMCPClients({ github: {...}, linear: {...} })` prefixes tool names with each key                                                                                                                                                                                                                                                                                                                  | [T3]                                                  |
| Tool policy                                                                   | `toolFilter(tool)` hides tools. `needsApproval(tool)` marks tools for approval (auto-discovery path only). Both receive the raw MCP tool.                                                                                                                                                                                                                                                               | `src/types.ts:134,147`, `src/tools.ts:722` [T1]       |
| Abort                                                                         | The run's `abortSignal` is passed to `callTool` automatically                                                                                                                                                                                                                                                                                                                                           | [T3]                                                  |
| Spec version                                                                  | Tries spec `2026-07-28` first, then falls back to the 2025 handshake                                                                                                                                                                                                                                                                                                                                    | [T3]                                                  |
| Resources, prompts, MCP Apps (`ui://` widgets), MCP input/sampling interrupts | Supported                                                                                                                                                                                                                                                                                                                                                                                               | [T3]                                                  |
| Hosting our own MCP server                                                    | `createMCPServer` from `@tanstack/ai-mcp/server`, with `jwtVerifier` and `introspectionVerifier`                                                                                                                                                                                                                                                                                                        | [T3]                                                  |

**Lifecycle trap.** `chat()` runs tools while the stream is consumed, so the client must close in middleware `onFinish`/`onAbort`/`onError`, or through `mcp.connection: 'close'`. Closing it in a `try/finally` around the `return` is too early [T3]. Our `startRun` drains the stream inside its own async block (`packages/api/src/chat/run.ts`), so a `finally` there would also be safe.

**Provider-hosted MCP is a different thing.** OpenAI's adapter has an `mcpTool` provider tool (`@tanstack/ai-openai/tools`), and the Anthropic adapter passes `modelOptions.mcp_servers` with the `mcp-client-2025-04-04` beta (`ai-anthropic/src/adapters/text.ts:221`). In both, the Provider's servers connect to the MCP server, which moves the SSRF exposure off our network. They work on one Provider each, though, and they don't fit a multi-Provider app with the user's own keys. Not researched further.

### Custom server tools

This is the pattern `web_search` already uses: `toolDefinition({ name, description, inputSchema, outputSchema?, needsApproval?, lazy? }).server(async (input, ctx) => …)`. `ctx.toolCallId` and `ctx.abortSignal` are available [T4]. `lazy: true` hides rarely used tools behind a discovery tool to save tokens [T4]. Client tools (`.client()`) run in the browser [T4].

Provider tools available in our installed adapters (`ai-*/src/tools/`): Anthropic `webFetchTool`, `codeExecutionTool`, `bashTool`, `textEditorTool`, `memoryTool`, `computerUseTool`. OpenAI `codeInterpreterTool`, `fileSearchTool`, `mcpTool`, `shellTool`. Gemini `codeExecutionTool`, `urlContextTool`, `googleSearchTool`. OpenRouter `webSearchTool`, `webFetchTool` [T5].

TanStack's own sandbox packages, `@tanstack/ai-code-mode` (0.4.21) plus `@tanstack/ai-isolate-node` or `-quickjs`, let the model write TypeScript that orchestrates _our tools_ in an isolate. That is not a general Python or data code interpreter for users. `@tanstack/ai-sandbox` (0.5.19) runs coding-agent harnesses (npm descriptions).

### Tool approval

- `needsApproval: true` on a definition pauses the run before the tool executes. The stream ends with `RUN_FINISHED` with `outcome.type === 'interrupt'` [T6]. Approval works for server and client tools. Approval can carry `editedArgs`, which replace the arguments and are re-validated against `inputSchema`. With an `approvalSchema`, a reject `payload` reaches the model as the failed tool result. Reject is not cancel [T6].
- The client renders `useChat().interrupts` and calls `interrupt.resolveInterrupt(true | false)` [T6].
- The server resumes by passing `parentRunId` and `resume` into `chat()` (`chatParamsFromRequest`). The docs say it "needs no database: the browser sends the message history and the `resume` decision back" [T6]. Both fields exist on `chat()` in 0.64.1 (`activities/chat/index.ts:542,551`).
- **What it means for us (inference, not tested).** We build `messages` on the server from our own Message tree (`handle-chat.ts`, ADR 0001), and `startRun` marks a Message `complete` on any `RUN_FINISHED`. To support approval we need four things. First, a Message status or part state for "waiting for approval" (the `message_status` enum in `packages/db/src/schema/chat.ts`). Second, a stored tool-call part: `parts.ts` stores only `text`, `thinking` and `web_search` today. Third, a resume endpoint that rebuilds the paused call from stored parts and passes `resume`. Fourth, a run cap that does not count time spent waiting. Whether `resume` works with history we rebuild on the server, rather than history the browser sends, is **unverified**.

## Which tools first

| Tool                                       | Value in a chat app                                                                                       | Cost and risk                                                                                                                                       | Verdict                                                                            |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `fetch_url` (custom server tool)           | High: "summarise this link" is the most common follow-up to search, and it reuses the Sources/citation UI | Our server fetches attacker-chosen URLs, so it is a classic SSRF sink. Fetched pages carry indirect prompt injection.                               | **First.** Build it on the SSRF-guarded fetch below. No Tool credential is needed. |
| Provider `webFetchTool` / `urlContextTool` | Same value, with no SSRF on our side                                                                      | Anthropic, Gemini and OpenRouter only, each with a different citation shape (the same problem as native search in [web-search.md](./web-search.md)) | Fallback only                                                                      |
| Code interpreter                           | High for data and maths questions                                                                         | No cross-Provider option. A self-hosted sandbox is infrastructure (HITL). Provider versions are per-Provider and per-model.                         | **Defer** to its own ticket                                                        |
| Curated remote MCP servers                 | Opens up integrations (GitHub, Linear, …)                                                                 | OAuth client work, token storage, approval UX                                                                                                       | **Second**, after approval exists                                                  |
| User-supplied MCP URLs                     | Power users                                                                                               | All the risks below                                                                                                                                 | **Last / maybe never**                                                             |

## Security of user-connected MCP servers

The MCP spec's [Security Best Practices](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/0a11bf68c7ec4473526ec15589f592afcd12d1e8/docs/docs/2026-07-28/tutorials/security/security_best_practices.mdx) [M1] (2026-07-28 version) and the [authorization security considerations](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/0a11bf68c7ec4473526ec15589f592afcd12d1e8/docs/specification/2026-07-28/basic/authorization/security-considerations.mdx) [M2] are the primary guidance.

### SSRF

**Risk.** In a hosted app, our server is the MCP client. A user-supplied URL, and every OAuth discovery URL a malicious server returns (`resource_metadata` in `WWW-Authenticate`, `authorization_servers`, `token_endpoint` …), can point at `169.254.169.254` cloud metadata, `localhost:6379` Redis, or private ranges. DNS rebinding and redirect chains get around naive checks [M1 §SSRF]. The spec says server-deployed clients **MUST** consider SSRF when fetching OAuth URLs [M1].

What the libraries already do (verified in source):

- `@tanstack/ai-mcp` does **no** URL validation. `resolveTransport` passes `new URL(input.url)` straight to the SDK transport (`src/transport.ts`).
- `@modelcontextprotocol/client` 2.3.1 refuses a non-HTTPS, non-loopback **token endpoint** (`assertSecureTokenEndpoint`). Its transports default to `redirectPolicy: 'same-origin'`: a redirect to another origin fails the request, OAuth requests included. It has **no private-IP blocking** [S1]. A custom `fetch` passed to the transport is used for MCP requests and for the OAuth discovery and token requests (`fetchFn: this._fetchWithInit`) [S1]. Whether older 2.x releases have `redirectPolicy` is **unverified**. `ai-mcp` allows `^2.0.0`.

Mitigations, from the spec [M1]:

- Require `https://` for user-supplied URLs (no `http://` outside development).
- Block private and reserved ranges (`10/8`, `172.16/12`, `192.168/16`, `127/8`, `::1`, `169.254/16`, `fc00::/7`, `fe80::/10`) per RFC 9728 §7.7. Do it with a maintained library, not a hand-written parser: the spec warns about octal, hex and IPv4-mapped tricks.
- Resolve DNS once, check the IP, and connect to that same IP (pin it) to beat rebinding (TOCTOU).
- Validate each redirect hop. Keep the SDK's `same-origin` default.
- Route outbound MCP and `fetch_url` traffic through an egress proxy (Smokescreen or similar). This is the only control that also covers code we don't own.
- Wiring: pass the guarded `fetch` as `transport.fetch` (supported by `HttpTransportConfig`/`SseTransportConfig` in ai-mcp) so it covers both MCP traffic and OAuth discovery. Use the same `fetch` for `fetch_url`.

### Credential storage

**Risk.** Stored access and refresh tokens are the prize. "Clients and servers **MUST** implement secure token storage" (OAuth 2.1 §7.1) [M2 §Token Theft]. Broad scopes widen the blast radius [M1 §Scope Minimization].

Mitigations:

- Store per-user MCP OAuth tokens (and any static bearer tokens) like Tool credentials: encrypted with AES-256-GCM under `KEY_ENCRYPTION_SECRET`, server-side, never readable by the client (ADR 0003). A new `service` kind or table is a schema decision (HITL). The open "key rotation for `KEY_ENCRYPTION_SECRET`" item on #38 gets more urgent.
- Implement `OAuthClientProvider` on top of that store: `tokens()`, `saveTokens()`, `codeVerifier`, and so on.
- Request minimal scopes and step up progressively [M1].
- Include the `resource` parameter (RFC 8707) so tokens are bound to the audience [M2]. The SDK handles this inside `auth()`, but **it was not traced line by line**.
- Client registration for a hosted app: pre-registered client, then Client ID Metadata Documents (we host an HTTPS `client.json`), then Dynamic Client Registration, which the 2026-07-28 spec deprecates [M3].
- Never log tokens or MCP request headers (evlog).
- Our own token is never passed through to the MCP server, and theirs never to anything else ("token passthrough" is forbidden) [M1].

### Prompt injection and tool poisoning

**Risk.** Tool descriptions, tool results, resources and fetched pages all enter the model's context, and a malicious server controls all of them. The spec does not use the phrase "prompt injection". It covers the risk as: tool annotations (`readOnlyHint` etc.) are untrusted unless they come from a trusted server; "Tools represent arbitrary code execution"; hosts must get consent before invoking any tool; clients should show tool inputs to the user before calling, "to avoid malicious or accidental data exfiltration", and should validate tool results before passing them to the LLM ([spec overview, Security and Trust & Safety](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/0a11bf68c7ec4473526ec15589f592afcd12d1e8/docs/specification/2026-07-28/index.mdx) [M4]; [server/tools.mdx](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/0a11bf68c7ec4473526ec15589f592afcd12d1e8/docs/specification/2026-07-28/server/tools.mdx) [M5]). OWASP LLM01:2025 calls this indirect prompt injection and lists least privilege, human approval for high-risk actions, and segregating untrusted content [O1].

Mitigations:

- Approval by default on every MCP tool. The spec says there "SHOULD always be a human in the loop with the ability to deny tool invocations" [M5]. Show the full arguments before approval (the exfiltration channel).
- Never let annotations waive approval on a server we don't trust. TanStack's own docs say the same and recommend `toolFilter` by **name** for untrusted servers [T2].
- Least privilege: one Conversation only gets the MCP servers the user enabled for it. Don't mix an untrusted server's tools with tools that can read other private data in the same run, because that is the cross-tool exfiltration path. (This last point is a design inference, not a spec quote.)
- Cap tool calls per reply, as `web_search` already does with `maxSearchesPerReply`, and rate limit (the spec says servers MUST rate limit; we should too as the client) [M5].
- Label MCP results as untrusted in the system prompt. This is weak on its own (OWASP) [O1].

### stdio and MCP Apps

- stdio from a hosted app means running a user-chosen command on our host. The spec's "Local MCP Server Compromise" and "stdio in proxy scenarios" sections require exact-command consent and sandboxing even on a user's own machine [M1]. For a multi-user server: **don't**.
- MCP Apps render server-supplied HTML in an iframe. If we ever support them, they need a separate sandbox origin (`MCPAppResource` takes a `sandbox.url`) [T3], plus the OAuth-URL scheme checks (`javascript:` etc.) and CSP from [M1 §OAuth Authorization URL Validation].

## Unverified

- Nothing here was run. No MCP server was connected, and no approval round-trip was tested in this repo.
- Whether `chat({ resume })` rebuilds a paused call from history we rebuild on the server (ADR 0001) rather than history the browser sends.
- The OAuth redirect flow through the `finishAuth` escape hatch. Audience (`resource`) handling inside the SDK `auth()` was not traced.
- `redirectPolicy` behaviour in `@modelcontextprotocol/client` releases before 2.3.1.
- Provider code-execution pricing and per-model availability. Provider-hosted MCP (`mcpTool`, `mcp_servers`) beyond confirming it exists.
- The `ai-core/tool-calling` skill bundled with 0.64.1 declares `library_version: '0.42.0'` in its frontmatter. Its claims were cross-checked against the installed source where it mattered (`mcp`, `resume`, `needsApproval`).

## Sources

- [T1] `@tanstack/ai-mcp` 0.7.0 and 0.8.0 npm tarballs, `src/transport.ts`, `src/types.ts`, `src/tools.ts`, `src/client.ts`, `package.json` (`https://registry.npmjs.org/@tanstack/ai-mcp/-/ai-mcp-0.7.0.tgz`)
- [T2] TanStack AI docs, [docs/tools/mcp.md](https://github.com/TanStack/ai/blob/778d30574729ff824654e972c067ea47b9207af4/docs/tools/mcp.md)
- [T3] `@tanstack/ai-mcp` 0.7.0 bundled skill `skills/ai-mcp/SKILL.md`
- [T4] `@tanstack/ai` 0.64.1 bundled skill `ai-core/tool-calling` (loaded with `pnpm dlx @tanstack/intent@latest load @tanstack/ai#ai-core/tool-calling`), plus installed `node_modules/@tanstack/ai/src`
- [T5] TanStack AI docs, [docs/tools/provider-tools.md](https://github.com/TanStack/ai/blob/778d30574729ff824654e972c067ea47b9207af4/docs/tools/provider-tools.md); installed `ai-anthropic`, `ai-openai`, `ai-gemini` `src/tools/`
- [T6] TanStack AI docs, [docs/interrupts/tool-approval.md](https://github.com/TanStack/ai/blob/778d30574729ff824654e972c067ea47b9207af4/docs/interrupts/tool-approval.md) and [docs/tools/tool-approval.md](https://github.com/TanStack/ai/blob/778d30574729ff824654e972c067ea47b9207af4/docs/tools/tool-approval.md)
- [S1] `@modelcontextprotocol/client` 2.3.1 npm tarball, `dist/index.mjs` (`assertSecureTokenEndpoint`, transport constructors) and `dist/index-B-4n9P0J.d.mts` (`redirectPolicy`, `fetch` option docs)
- [M1] MCP, [Security Best Practices (2026-07-28)](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/0a11bf68c7ec4473526ec15589f592afcd12d1e8/docs/docs/2026-07-28/tutorials/security/security_best_practices.mdx)
- [M2] MCP spec 2026-07-28, [Authorization: Security Considerations](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/0a11bf68c7ec4473526ec15589f592afcd12d1e8/docs/specification/2026-07-28/basic/authorization/security-considerations.mdx)
- [M3] MCP spec 2026-07-28, [Authorization: Client Registration](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/0a11bf68c7ec4473526ec15589f592afcd12d1e8/docs/specification/2026-07-28/basic/authorization/client-registration.mdx)
- [M4] MCP spec 2026-07-28, [Overview: Security and Trust & Safety](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/0a11bf68c7ec4473526ec15589f592afcd12d1e8/docs/specification/2026-07-28/index.mdx)
- [M5] MCP spec 2026-07-28, [Server: Tools](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/0a11bf68c7ec4473526ec15589f592afcd12d1e8/docs/specification/2026-07-28/server/tools.mdx)
- [O1] OWASP GenAI, [LLM01:2025 Prompt Injection](https://genai.owasp.org/llmrisk/llm01-prompt-injection/)
