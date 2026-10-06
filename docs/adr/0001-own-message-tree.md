# We own the Message tree instead of using TanStack AI persistence

TanStack AI's persistence (`@tanstack/ai-persistence` `withPersistence`) keeps one linear transcript per thread and deletes later Messages on edit or regenerate, which rules out Branches. So we store Messages ourselves in Drizzle as a tree (`message.parentId`, `conversation.activeLeafId`) and hydrate `useChat` from the Active Branch, rebuilding history from the database on the server. Message `parts` are stored as jsonb in our own zod-validated shape (with a `schemaVersion`), not TanStack's `UIMessage` shape, and converted at one boundary module: TanStack AI is pre-1.0 and changing fast, and a library upgrade must not break stored history.

## Considered Options

- **`withPersistence` as-is**: incompatible with Branches.
- **Storing TanStack's `UIMessage` parts verbatim**: less code, but couples the database to a pre-1.0 type.
- **A `message_part` table**: parts are always read and written with their Message, so it only adds joins.

## Consequences

- Attachments are not parts. They are linked through a `message_attachment` join table so foreign keys can protect Shared link snapshots.
- Every TanStack AI upgrade only needs the boundary converter checked.
