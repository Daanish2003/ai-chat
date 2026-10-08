# ai-chat Architecture Resources

## Knowledge

- [Repo: `CONTEXT.md`](../../CONTEXT.md)
  The domain glossary (Conversation, Message, Branch, Active Branch, Provider, Source, …). Use for: the exact word for every concept; lessons must match it.
- [Repo: `docs/adr/`](../adr/)
  Four ADRs: own Message tree (0001), runs outlive the client (0002), encrypted server-side credentials (0003), Shared link points at the tree (0004). Use for: the "why" behind every design lesson.
- [Turborepo: Package and Task Graph](https://turborepo.com/docs/core-concepts/package-and-task-graph)
  Packages as a directed acyclic graph. Use for: package boundaries and why cycles break builds (Lesson 1). The installed copy is in `node_modules/.pnpm/turbo@*/node_modules/turbo/docs/`.
- [pnpm: Workspaces](https://pnpm.io/workspaces)
  The `workspace:*` protocol that links the packages. Use for: how `@ai-chat/*` imports resolve.
- [TanStack AI docs](https://tanstack.com/ai/latest/docs)
  `chat()`, adapters, `useChat`, stream chunks, SSE. Use for: the run and the client stream (pre-1.0, so check the installed version: `@tanstack/ai` 0.64.1).
- [oRPC: Getting started](https://orpc.dev/docs/getting-started)
  Procedures, routers, the typed client. Use for: `/api/rpc` and `protectedProcedure`.
- [Drizzle ORM](https://orm.drizzle.team/docs/overview)
  Schema, queries, transactions, `for("update")`. Use for: the tables and the send transaction.
- [MDN: Using server-sent events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events)
  Use for: how the reply streams to the browser.
- [MDN: AbortController](https://developer.mozilla.org/en-US/docs/Web/API/AbortController)
  Use for: Stop and the run cap (ADR 0002).
- [TanStack Start overview](https://tanstack.com/router/latest/docs/framework/react/start/overview)
  Use for: server routes in `apps/web/src/routes/api/`.

## Wisdom (Communities)

- [TanStack Discord](https://tlinz.com/discord)
  The TanStack AI, Router and Query maintainers answer there. Use for: questions on `useChat` or `chat()` behaviour that the docs don't cover.
- Code review of real PRs in this repo is the main practice ground: review each agent PR against the lessons.

## Gaps

- No good external write-up on message trees for chat apps; the ADRs and code are the source.
