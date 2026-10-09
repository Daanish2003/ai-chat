# Example Host: Next.js + Prisma + Auth.js

A second Host for the Chat SDK, deliberately different from `apps/web`: Next.js App Router, Prisma
for `public` (Auth.js users), Auth.js v5 with the Credentials provider, and its own shadcn theme.
The chat lives in `src/chat-sdk/`, a committed copy made by the SDK's copy script. Do not edit its
`core/`; change `packages/chat-sdk` and re-copy.

## Layout

- `src/chat-sdk/`: the copied SDK. `core/` is replaced on every copy; `ui/` is the Host's to edit.
- `src/lib/chat.ts`: `createChat` with `getUser` from `auth()`.
- `src/app/api/chat/[...path]/route.ts`: the catch-all handler under `/api/chat`.
- `src/instrumentation.ts` and `src/instrumentation-node.ts`: `chat.start()` and the SIGTERM drain.
- `src/components/chat-root.tsx`: `<ChatProvider>` with a `router` adapter on `next/link` and `next/navigation`.
- `prisma/schema.prisma`: Auth.js's `User` (with a scrypt `passwordHash`), in `public`.
- `scripts/migrate.ts`, `scripts/fake-ollama.ts`: the chat migration and the fake Provider.

## Setup

Requires Node 24 and a Postgres where the role can create extensions (`pg_trgm`). Set these in the
environment or in a gitignored `.env` (see `.env.example`):

- `DATABASE_URL`
- `AUTH_SECRET`: `openssl rand -base64 32`
- `AUTH_TRUST_HOST=true` for local hosts
- `KEY_ENCRYPTION_SECRET`: keep it stable, since it encrypts saved Provider keys

```sh
pnpm -F @ai-chat/example-next-prisma db:migrate   # prisma migrate deploy, then the chat schema
pnpm -F @ai-chat/example-next-prisma build
pnpm -F @ai-chat/example-next-prisma start         # or dev
```

`db:migrate` runs `prisma migrate deploy` for `public`, then `scripts/migrate.ts`, which calls the
SDK's migrate (the same function `chat.migrate()` uses). Run it before `start`: `chat.start()`
refuses to boot against an unmigrated `chat` schema.

## Trying the chat without a real Provider key

1. Start the fake Provider on a free port (default 11436): `pnpm -F @ai-chat/example-next-prisma fake-provider`.
   Set `FAKE_PROVIDER_PORT` to change it.
2. Sign up at `/sign-up`, then open Keys & settings (`/settings/keys`).
3. Under Ollama, enter the host `http://localhost:11436` and save. The Ollama host is a credential
   the user enters, so the fake Provider is selected there rather than by a server setting.
4. Start a Conversation on `/c`. The Model `fake-model` streams a Markdown reply.

## Verified

Checked with `next build` and `next start` on a free port, then curl against the handler: sign up
(201, and 409 for a duplicate), Auth.js credentials sign-in (a session cookie, and an error for a
wrong password), the 401 for an anonymous chat call, saving the fake Ollama credential, creating a
Conversation, and a streamed Run (`RUN_STARTED`, `TEXT_MESSAGE_*`, `RUN_FINISHED`) whose reply was
saved as the assistant Message. Signed-in `/c`, `/c/<id>` and `/settings/keys` returned 200.
Browser interaction, Shared links and Stop were not exercised.
