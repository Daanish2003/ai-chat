# Chat SDK

A chat feature a Host copies into its own source tree. The SDK is one folder with three parts:

- `core/` (`shared`, `server`, `client`, including `client/react`): runtime code the Host never edits. Updating means copying it again.
- `ui/`: React components the Host owns and may change. They sit on the Host's own shadcn primitives.
- `package.json` and `README.md`: copied alongside, for reference. The Host installs the dependencies listed here.

The SDK assumes nothing about the Host's stack beyond the npm packages below. It knows users only by an opaque id.

## Adopting the SDK

From this repo, run the copy script with the destination folder inside your Host:

```sh
pnpm -F @ai-chat/chat-sdk copy ../my-host/src/lib/chat-sdk
```

The destination is resolved from the folder you ran `pnpm` in. The script:

- replaces `core/` on every run and writes `core/VERSION` with the commit hash and the date it was copied (`commit:` and `date:` lines);
- copies `ui/` only when the destination has no `ui/` folder, so your edits to components and `theme.css` survive updates;
- copies `package.json` and `README.md` to the destination root on every run;
- never copies tests or test helpers (`*.test.*` files and `test`, `tests`, `testing`, `__tests__` folders).

### Updating

1. Run the copy script again. `core/VERSION` shows the commit you now run.
2. Your `ui/` is untouched. If the release changed a component you also edited, merge that by hand: diff the new SDK's `ui/` against yours.
3. Install any new dependencies listed below, then run your type check.

## Dependencies

Install these in the Host. Versions come from `package.json` in this folder.

**What `core/` needs:**

- `@tanstack/ai` and the provider packages it uses: `@tanstack/ai-anthropic`, `@tanstack/ai-bedrock`, `@tanstack/ai-byteplus`, `@tanstack/ai-client`, `@tanstack/ai-cloudflare`, `@tanstack/ai-gemini`, `@tanstack/ai-grok`, `@tanstack/ai-groq`, `@tanstack/ai-llmgateway`, `@tanstack/ai-lovable`, `@tanstack/ai-mistral`, `@tanstack/ai-ollama`, `@tanstack/ai-openai`, `@tanstack/ai-openrouter`, `@tanstack/ai-vercel-gateway`
- `@tanstack/react-query`, `react`, `sonner`
- `drizzle-orm` and `pg` (the Postgres driver it uses)
- `redis` (the Redis client, used by `redisRuntime()`)
- `html-to-text` (pinned at 10.0.1), which the `fetch_url` tool uses to turn an HTML page into text. Maintained, MIT, about 15M weekly downloads; the other candidates were `turndown` (converts to Markdown, not text), `@mozilla/readability` (needs a DOM, e.g. `linkedom`) and `node-html-parser`.
- `undici` and `ipaddr.js`, for the SSRF-guarded `fetch` (`core/server/lib/guarded-fetch.ts`). `undici` pins each connection to the address that was checked, and `ipaddr.js` classifies that address. Install `undici` at the major your Node bundles (7.x on Node 24): undici 8's dispatcher is rejected by Node's built-in `fetch`.
- `@orpc/server`, `@orpc/tanstack-query`
- `zod`

**What `ui/` needs (on top of `core/`):**

- `@tanstack/ai-react`
- `lucide-react`
- `sonner`, `react`, `@tanstack/react-query` (already listed above)

**What the `prompt-kit` components need** (they are copied in with `ui/`, see below): `class-variance-authority`, `marked`, `react-markdown`, `remark-breaks`, `remark-gfm`, `shiki`, `use-stick-to-bottom`, `@tailwindcss/typography`.

`core/` imports only npm packages and its own files, so a Host outside this repo can copy and compile it. `examples/next-prisma` is a Host outside this repo that runs it.

## shadcn components

`ui/` imports these from the Host's `@/components/ui/*` (and `@/lib/utils` for `cn`). Add them with the shadcn CLI, which also installs each component's own dependencies:

- `button`, `dialog`, `input`, `label`, `popover`, `select`, `textarea`, `tooltip`, `attachment`, `hover-card`

The `prompt-kit` components (`chat-container`, `loader`, `markdown`, `prompt-input`, `reasoning`, `scroll-button`, `source`, `system-message`) live in this repo's `packages/ui/src/components/prompt-kit/`. Copy them into your `components/ui/prompt-kit/`, and copy two more files they import: `code-block.tsx` (used by `markdown`) into the same folder, and `packages/ui/src/lib/favicon.ts` to your `lib/favicon.ts` (used by `source`). Change their `@ai-chat/ui/...` imports to your `@/...` alias: `@ai-chat/ui/lib/utils` becomes `@/lib/utils`, and `@ai-chat/ui/components/x` becomes `@/components/ui/x`.

## Tailwind v4

`ui/` uses Tailwind v4 classes. In your global stylesheet, import Tailwind and then the SDK's `theme.css`:

```css
@import "tailwindcss";
@import "tw-animate-css";
@import "./lib/chat-sdk/ui/theme.css";
```

`theme.css` holds one line, `@source ".";`, which tells Tailwind to scan the `ui/` folder wherever it sits. Your shadcn theme variables (`--background`, `--primary`, and so on) must also be defined in your stylesheet. The `prompt-kit` message and reasoning components use the `prose` classes, so add `@plugin "@tailwindcss/typography";` as well.

## Postgres

- The database needs the `pg_trgm` extension. `chat.migrate()` runs `CREATE EXTENSION IF NOT EXISTS pg_trgm` before its migrations and fails naming it, so a role allowed to create extensions (or a database that already has it) is needed.
- The SDK's tables live in the `chat` schema of the Host's database, not in your ORM's schema. Your ORM's migrations never touch them.
- The SDK's migrations are expand-then-contract: they add tables, columns and indexes, and never drop or rename one in the same release. The version still running during a deploy keeps working against the migrated schema.

## Host lifecycle

The server API below is the spec for the SDK (spec #70). Some of it lands in later tickets; until then, `core/server` exports only the parts already built.

```ts
// server: construct at module load (no side effects)
const chat = createChat({ databaseUrl, getUser, keyEncryptionSecrets, basePath: "/api/chat" });

// one catch-all route on your framework, for every chat call and the Shared link read
export const handler = (request: Request) => chat.handler(request);

// deploy step, once per deploy
await chat.migrate();

// boot and shutdown
await chat.start();
// drains local Runs for up to 250 s; a SIGTERM listener stops Node from exiting by itself
process.on("SIGTERM", () => void chat.stop().finally(() => process.exit(0)));

// when your app deletes a user
await chat.deleteUser(String(user.id));

// when your app exports a user's data: one JSON-ready document (version 1), never credentials
const copy = await chat.exportUser(String(user.id));

// your own route for a Shared link page
const data = await chat.getSharedConversation(token);
```

- `getUser(request)` returns `{ id } | null`. The handler answers 401 when it returns `null`.
- `GET <basePath>/export` answers the signed-in user's export as a JSON download (`chat-export-<date>.json`), the same document as `exportUser`. The `ExportDataButton` in `ui/` calls it.
- `start()` refuses to run while the `chat` schema is behind the bundled migrations.
- `stop()` refuses new Runs with 503 while it drains, then closes the runtime's connections.

## Several processes: `redisRuntime()`

A Run is shared between the processes of your app through its `runtime`. The default, `memoryRuntime()`, keeps Runs in one process's memory, which is fine for local development and for a Host that runs as a single process.

**Use `redisRuntime()` when more than one process can serve chat requests, including the overlap of a zero-downtime deploy.** Without it, a reader who reconnects to the other process loses the Run, and a Stop sent there does nothing.

```ts
const chat = createChat({
  databaseUrl,
  getUser,
  keyEncryptionSecrets,
  basePath: "/api/chat",
  runtime: redisRuntime({ url: process.env.REDIS_URL! }),
});
```

- `url`: a `redis://` URL (or `rediss://`). Required.
- `prefix`: prepended to every key and channel the SDK writes. Default `chat:`. Set it when the SDK shares a Redis with your own data.

Nothing connects when you build `createChat` or `redisRuntime()`. The first use opens one command connection and one subscriber connection for the process, and `stop()` closes them after the drain, so the process exits cleanly on SIGTERM.

Redis holds each Run's chunk log while the Run is live and for an hour after it ends. Postgres stays the source of truth for Conversations and Messages.

## Rotating the key encryption secret

Stored Provider and Tool credentials are encrypted under `keyEncryptionSecrets`: the first secret encrypts, and every secret decrypts (ADR 0010). Rotate on an event, such as a suspected leak or someone with access leaving, not on a schedule. Rotating is a runbook, not an outage:

1. Put the new secret first in `keyEncryptionSecrets` (in `apps/web`, `KEY_ENCRYPTION_SECRET` becomes the new one and the old one moves to `KEY_ENCRYPTION_SECRET_PREVIOUS`), and deploy. Every process must hold the new keyring before the next step.
2. Run `await chat.rotateKeys()` once, as a one-off command from your image (in `apps/web`: `node scripts/rotate-keys.ts`). Never run it in the pre-deploy step: the old version still running writes under the old key until the deploy finishes. It works in batches and is safe to re-run. It returns `{ reencrypted, unreadable }`.
3. If `unreadable` is 0, remove the old secret and deploy again. If it isn't, find the rows under a key you no longer hold before removing it: a row under a removed key reads as missing, so its user re-enters the credential.

`start()` never refuses to boot because rows are unreadable; it logs the counts instead.

## Who pays for Runs

- `hostProviders` are the Host's own credentials, from your environment (never stored): `[{ provider, credentials, models: [...] }]`. Each model is `{ modelId, label?, images?, pdfs?, tools?, maxOutputTokens, inputUsdPerMillion, outputUsdPerMillion }`. `maxOutputTokens` is required: the Host's output cap for a Run on that model, handed to `adapterFor` (the production adapters don't apply it yet). The prices are per 1M tokens and kept with the model. Capability flags default to off unless the model is curated, in which case its curated flags apply. A Tool goes in the same list as `{ tool: "tavily", credentials, pricePerSearchUsd }`: a Host Tavily key that searches for users with no Tavily key of their own, each search recorded at that fixed price.
- `byok` (default `true`) lets users run on their own Provider credentials. Set it independently of `hostProviders`: `byok: false` with `hostProviders` is a company Host that runs only its own keys.
- A user's own key for a Provider always wins over the Host's. The Model list marks the Models that run on Host credentials.
- `start()` throws with neither `hostProviders` nor `byok`.
- `getQuota` caps what each user may spend on Host credentials. It is a function `(userId) => { budgetUsd, window: 'day' | 'month' } | null`, or one fixed Quota for everyone. `null` (or leaving it out) is unlimited. Windows are fixed UTC days or calendar months. Spend is measured in money from each Run's cost (the Provider's reported cost, else tokens times the model's price). A Run on Host credentials is refused with HTTP 402 and `code: "quota_exceeded"`, plus `resetsAt`, once the window's spend reaches the budget. A Run that has started finishes, so it can go over the budget by one Run's cost. A user's own key is never checked. Users read their Quota as a percentage, the window and its reset time through the `quota.read` procedure, never as money. The composer shows a meter from 80%, and at the limit the Host Models are disabled with the reset time. A Host can render its own content there with `<AppShell quotaExceeded={...}>`.

```ts
const chat = createChat({
  // ...
  getQuota: async (userId) => ({ budgetUsd: 0.5, window: "day" }),
});
```

Three modes, chosen by those two options:

- **Host only** (`hostProviders`, `byok: false`): a company Host. Users chat on the Models you offer. With `byok` off, the credential sections of the keys page and every "add your key" prompt are hidden; the Instructions and Title Model sections stay. Saving a credential is rejected with `FORBIDDEN`; listing and deleting the credentials a user already has still work.
- **User keys only** (no `hostProviders`, `byok: true`): every reply runs on the user's own keys, as before.
- **Both** (`hostProviders` and `byok: true`, the default): a user's own key wins for its Provider; otherwise the Host's Models answer.

```ts
const chat = createChat({
  databaseUrl,
  getUser,
  keyEncryptionSecrets,
  basePath: "/api/chat",
  hostProviders: [
    {
      provider: "anthropic",
      credentials: { apiKey: process.env.ANTHROPIC_API_KEY! },
      models: [
        {
          modelId: "claude-haiku-4-5",
          maxOutputTokens: 1024,
          inputUsdPerMillion: 1,
          outputUsdPerMillion: 5,
        },
      ],
    },
  ],
  byok: true,
});
```

## The Host's tools

`tools` lets the Model call your own code on your server. Write each tool with TanStack AI's `toolDefinition(...).server(fn)` and pass the list to `createChat`. `fn` gets the call's arguments, and `context.context` holds `{ userId, conversationId }`, typed by passing `HostToolContext` to `.server<HostToolContext>(...)`. Every call shows in the reply as one collapsible row, and a Shared link shows only that the tool was used, never its arguments or result. A tool that throws fails only its own call. A reply makes at most 10 tool calls across the Host's tools. A tool's name must not be `web_search` or `fetch_url`, the SDK's own web tools.

## The Web toggle

The composer's **Web** toggle covers two built-in tools: `web_search` (needs a Tavily key, the user's own or the Host's) and `fetch_url`, which reads one page at an http or https URL the user gave or a search returned. `fetch_url` needs no key, so without a Tavily key Web means fetch only, and the tooltip says so. The toggle is on by default and remembered per browser. It is unavailable, with the reason in its tooltip, when the Model has no tools. A fetched page is a Source, numbered with the search results and cited the same way.

`fetch_url` takes HTML, plain text, Markdown and JSON (no PDFs or other binaries), refuses a body over 2 MB, cuts text to 20,000 characters, times out after 10 seconds, and makes at most 5 fetches per reply. It goes through `deps.fetch`, the guarded fetch, and ignores robots.txt.

```ts
const serverTime = toolDefinition({
  name: "server_time",
  description: "The current time on the server, in UTC.",
  inputSchema: z.object({}),
}).server<HostToolContext>(() => ({ now: new Date().toISOString() }));

createChat({ /* ... */ tools: [serverTime] });
```

Host tools run without an approval step. To give a tool its own look in the chat, edit `ui/chat/tool-call-row.tsx` in your copy: the copy never overwrites `ui/`.

## Rate limits

Run starts are limited per user, and the counters live in the `runtime`, so the limit holds across every process that shares it. The default is 20 Run starts a minute. A Run start over the limit answers 429 with `Retry-After` (in seconds), and the chat UI tells the user to try again in a moment.

Override a limit in `createChat`. Each limit is optional, and `false` turns it off:

```ts
const chat = createChat({
  // ...
  rateLimits: { runStart: { limit: 30, windowSeconds: 60 } },
});
```

Only Run starts are limited so far. Sign-up, sign-in and password reset stay with your own auth.

Browser side: create a headless client and wrap your chat pages in the provider.

```tsx
const client = createChatClient({ baseUrl: "/api/chat" });

<ChatProvider client={client} router={router}>
  {children}
</ChatProvider>;
```

The `router` adapter maps the chat pages (`new`, `conversation`, `keys`) to your URLs. It provides `Link`, `navigate(page)`, `useLocation()` and `shareUrl(token)`. Pass your own TanStack Query client as `queryClient` if you have one; otherwise the provider creates its own.
