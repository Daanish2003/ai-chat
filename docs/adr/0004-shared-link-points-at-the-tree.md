# A Shared link points at the Message tree instead of copying it

A Shared link is a snapshot of a Conversation's Active Branch, but we don't copy any Messages to take it. Messages are never mutated once written (edit and regenerate insert siblings, ADR 0001), so the path from a root to a given leaf is fixed for as long as the Conversation exists. A `shared_link` row therefore stores only a random `token`, the `conversationId` (unique: at most one link per Conversation), the `leafMessageId` of the shared Branch and a frozen copy of the `title`. Sharing again moves `leafMessageId` to the current Active Branch under the same token. The public page walks up from `leafMessageId` with the same recursive query as the Active Branch, strips thinking parts and reduces attachments to filename and type.

## Considered Options

- **Copy Messages (and attachment bytes) into share tables at share time**: the link would survive deleting its Conversation, but it duplicates parts, needs its own attachment storage and lets "deleted" content stay public.
- **A new independent link on every share**: forgotten links pile up, with no single place to revoke them.

## Consequences

- Deleting a Conversation (or the user) deletes its Shared link; the URL then 404s.
- A Shared link can't be taken while the newest Message on the Active Branch is `streaming` or `error`.
- Attachments are never served publicly, so `message_attachment` doesn't need `RESTRICT` to protect snapshots; it uses the default `NO ACTION`.
- Letting a viewer continue a shared Conversation in their own account would need a real copy; it is out of scope for v1.
