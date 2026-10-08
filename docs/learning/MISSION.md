# Mission: The ai-chat chat architecture

## Why

Agents wrote most of the chat feature. The goal is to own it end to end: to change it, review AI-written PRs against it, explain and defend its design, and extend it with new features and ADRs without needing an agent to explain the code first.

## Success looks like

- Trace one sent Message from the composer through `/api/chat`, the run and Postgres, and back to the screen, naming the file at each step.
- Explain the Message tree (Branches, Active Branch, edit, regenerate) and the four ADRs from memory, including what each one rules out.
- Review a PR and catch boundary mistakes: a wrong package, an upward import, history sent from the client, a mutated Message.
- Make a real change to the chat feature (for example a new Message part or a new run guard) with tests, unaided.

## Constraints

- Starts from almost no knowledge of the code (October 2026).
- Short lessons: about 10–15 minutes each, pictures first (see `.claude/skills/teach/LESSON-STYLE.md`).
- Ground truth is the repo itself: code, `CONTEXT.md` and `docs/adr/`.

## Out of scope

- Auth internals (Better Auth) beyond "who is the user".
- UI styling and the generic `@ai-chat/ui` components.
- Deployment and Docker.
