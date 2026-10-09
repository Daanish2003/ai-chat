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

- `button`, `dialog`, `input`, `label`, `popover`, `textarea`, `tooltip`, `attachment`, `hover-card`

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

## Host lifecycle

The server API below is the spec for the SDK (spec #70). Some of it lands in later tickets; until then, `core/server` exports only the parts already built.

```ts
// server: construct at module load (no side effects)
const chat = createChat({ databaseUrl, getUser, keyEncryptionSecret, basePath: "/api/chat" });

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

// your own route for a Shared link page
const data = await chat.getSharedConversation(token);
```

- `getUser(request)` returns `{ id } | null`. The handler answers 401 when it returns `null`.
- `start()` refuses to run while the `chat` schema is behind the bundled migrations.
- `stop()` refuses new Runs with 503 while it drains.

Browser side: create a headless client and wrap your chat pages in the provider.

```tsx
const client = createChatClient({ baseUrl: "/api/chat" });

<ChatProvider client={client} router={router}>
  {children}
</ChatProvider>;
```

The `router` adapter maps the chat pages (`new`, `conversation`, `keys`) to your URLs. It provides `Link`, `navigate(page)`, `useLocation()` and `shareUrl(token)`. Pass your own TanStack Query client as `queryClient` if you have one; otherwise the provider creates its own.
