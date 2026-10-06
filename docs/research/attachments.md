# Research: storing attachments locally

Ticket: [#4 Storing attachments locally](https://github.com/Daanish2003/ai-chat/issues/4) (child of map #1).
Researched: 2026-10-06. Vocabulary follows `CONTEXT.md` (Conversation, Message, Branch, Shared link).

## Question

Where should file and image attachments be stored in a local Docker Compose setup: Postgres (`bytea`), a local disk volume, or MinIO (S3-compatible)? Which file and image types and sizes do Anthropic and OpenAI accept? Do they offer file-upload APIs, or only inline base64? How does TanStack AI pass attachments to each adapter?

## TL;DR

- **Store the bytes in Postgres** (`bytea`), in a separate `attachment` table that only Messages reference. Never put the bytes inside the Message row. Provider limits keep attachments to a few MB, well under the 1 GB `bytea` limit. Postgres is already the only stateful service, so one `pg_dump` covers everything, and foreign keys handle deletes for Branches and Shared links.
- **Do not use MinIO.** The `minio/minio` GitHub repo is archived and says "THIS REPOSITORY IS NO LONGER MAINTAINED". The community edition is source-only, with no published binaries or images.
- **A local disk volume is the fallback.** Put storage behind a small `AttachmentStore` interface (`put` / `get` / `delete`) so we can switch later.
- **Send attachments to the LLM as inline base64** (TanStack AI `source: { type: 'data' }`), read from Postgres on every request. Do not use URL sources: providers would have to fetch `localhost`, which they can't reach. Do not use provider Files APIs as the store either: Anthropic won't let you download uploaded files, and a file handle only works with the provider that issued it.
- **Use `openaiText` (Responses API), not `openaiChatCompletions`.** The Chat Completions adapter rejects document (PDF) parts.
- **Accept JPEG, PNG, GIF and WebP images, plus PDFs.** Read text-like files (`.txt`, `.md`, `.csv`, code) on the server and send them as **text parts**. Neither TanStack adapter sends non-PDF documents correctly.

## Findings

### 1. Anthropic (Claude API)

**Images** ([Vision](https://platform.claude.com/docs/en/build-with-claude/vision))
- Images go in `image` content blocks. There are three source types: base64, URL, and `file_id` (Files API). On Bedrock and Vertex, only base64 works.
- Formats: `image/jpeg`, `image/png`, `image/gif`, `image/webp`. "Animations are unsupported, and only the first frame is used."
- Max size: **10 MB per image (base64-encoded)** on the direct API, and 5 MB on Bedrock and Google Cloud. Max **8000x8000 px**. If a request has more than 20 images, a stricter limit applies: keep each dimension at or below 2000 px.
- Max images per request: 100 for 200k-context models, and 600 for all other models.
- Request size limit: **32 MB** on the standard endpoints.
- Cost: `⌈w/28⌉ × ⌈h/28⌉` visual tokens. Images are downscaled to a long edge of 1568 px (standard models) or 2576 px (Claude 4.7 and later). Resizing on the client before upload saves bytes, and the model loses no quality.
- The docs warn that multi-turn conversations resend the whole history. With base64, "the full image bytes are included in the payload on every turn".

**PDFs** ([PDF support](https://platform.claude.com/docs/en/build-with-claude/pdf-support))
- PDFs go in `document` blocks. Sources: URL, base64, or `file_id`.
- Max request size: 32 MB. Max pages: **600, or 100 when the request's context window is under 1M tokens**. Password-protected or encrypted PDFs are not supported.
- Each page is converted to an image, and its extracted text goes alongside it. That costs about 1,500–3,000 text tokens per page, plus the image tokens.
- Plain text (`.txt`, `.csv`, `.md`) can go in document blocks when it is uploaded through the Files API as `text/plain`. Binary formats such as `.docx` and `.xlsx` are **not supported**: convert them to text or PDF first.

**Files API** ([Files API](https://platform.claude.com/docs/en/build-with-claude/files))
- Generally available. It no longer needs the `files-api-2025-04-14` beta header. It is not available on Bedrock or Vertex.
- Limits: 500 MB per file and 1 TB per organization. Files can expire automatically after 1 hour to 90 days, or never expire.
- **Files you upload cannot be downloaded** (`downloadable: false`). Only files that tools generate can be downloaded. So the Files API cannot be our store: we couldn't show the attachment back to the user.
- Files are scoped to the workspace, not to an end user. The docs say: "Never accept `file_id` values from end users". File operations are free, and file content is billed as input tokens.

### 2. OpenAI

**Images** ([Images and vision](https://developers.openai.com/api/docs/guides/images-vision))
- Formats: PNG, JPEG, WEBP, and **non-animated** GIF.
- The docs say "up to 512 MB total payload per request" and "up to 1,500 images per request". `detail` can be `low`, `high`, `original` or `auto`.
- Three ways to pass an image: a URL, a base64 data URL (`data:image/...;base64,...`), or a Files API `file_id` (the docs say to use purpose `vision`). In the Responses API that is an `input_image` with `image_url` or `file_id`. Chat Completions uses `image_url`.

**PDFs and other files** ([File inputs](https://developers.openai.com/api/docs/guides/pdf-files))
- "Each file must be under 50 MB. The combined limit across all files in the request is 50 MB."
- The Responses API accepts PDFs plus `.docx`, `.pptx`, `.xlsx`, `.csv` and code files. "Chat Completions accepts only PDF files as `file` content parts."
- Files go in as `input_file`, using one of `file_id`, `file_url` (Responses only) or `file_data` (base64, which needs a `filename`).
- For PDFs on vision models, "the API extracts both text and page images". Other documents get text extraction only.

**Files API** ([Files: create](https://developers.openai.com/api/reference/resources/files/methods/create))
- Limits: 512 MB per file and 2.5 TB per project. Purposes include `vision` and `user_data`. `expires_after` is optional.

### 3. TanStack AI: how attachments reach each adapter

Source: the `TanStack/ai` repo at `a32782c` (2026-10-06): `@tanstack/ai` 0.64.1, `@tanstack/ai-anthropic` 0.19.4, `@tanstack/ai-openai` 0.26.0. Docs: [`docs/advanced/multimodal-content.md`](https://github.com/TanStack/ai/blob/main/docs/advanced/multimodal-content.md).

- **Message format.** A message's `content` is either a `string` or an `Array<ContentPart>`. The part types are `text`, `image`, `audio`, `video` and `document`, and they follow AG-UI. Media parts carry a `source` of one of three kinds ([`packages/ai/src/types.ts`](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts)):
  - `{ type: 'data', value: <base64>, mimeType }`. `mimeType` is required.
  - `{ type: 'url', value, mimeType? }`
  - `{ type: 'file', value: <provider handle>, provider }`. You create the handle with `uploadFile({ adapter: openaiFiles() | anthropicFiles(), ... })` and turn it into a source with `fileSourceFromHandle()`. An adapter rejects a handle that another provider issued.
- **Client side.** `useChat().sendMessage({ content: [...] })` sends parts straight from the UI. The documented upload example uses `FileReader` to turn the file into base64. The docs also say TanStack AI "does not ship a runtime message validator". The server has to validate incoming parts itself, for example with Zod.
- **Anthropic adapter** ([`packages/ai-anthropic/src/adapters/text.ts`](https://github.com/TanStack/ai/blob/main/packages/ai-anthropic/src/adapters/text.ts), `convertContentPartToAnthropic`):
  - `image`: `data` becomes `{type:'base64', media_type}`, `url` becomes `{type:'url'}`, and `file` becomes `{type:'file', file_id}`.
  - `document`: `data` becomes `{type:'base64', media_type: <cast to 'application/pdf'>}`. The adapter only knows PDF sources. **It has no text-document source**, so a `text/plain` document sent as data would be mislabelled. The cast is in the source, but I didn't test this end to end.
  - `metadata` can carry `cache_control`, `citations`, `title`/`filename` and `context`.
  - `audio` and `video` throw an error.
- **OpenAI Responses adapter** (`openaiText`, built on [`packages/openai-base/src/adapters/responses-text.ts`](https://github.com/TanStack/ai/blob/main/packages/openai-base/src/adapters/responses-text.ts), `convertContentPartToInput`):
  - `image` becomes `input_image`, using either a data URL built from `mimeType` or a `file_id`. `detail` comes from metadata and defaults to `auto`.
  - `document` becomes `input_file`. Inline `data` must be **`application/pdf` only**: the adapter checks the MIME type and the `%PDF` magic bytes, and throws for anything else. It wraps the data as a data URL and sends `filename` from `metadata.filename`, defaulting to `document.pdf`.
- **OpenAI Chat Completions adapter** (`openaiChatCompletions`, in [`chat-completions-text.ts`](https://github.com/TanStack/ai/blob/main/packages/openai-base/src/adapters/chat-completions-text.ts)): images work through `image_url` and accept data or URL sources only, not `file_id`. **Document parts throw an error.** The error message says: "use the Responses adapter".
- **Persistence.** `@tanstack/ai-persistence` has a `BlobStore` contract (`put` / `get` with range / `list` / `delete`), but its docs scope it to *generated* media (`withGenerationPersistence`). I found nothing in it for user-uploaded chat attachments. The app has to store those itself.

### 4. Storage options

| | Postgres `bytea` | Local disk volume | MinIO |
|---|---|---|---|
| Extra Compose service | none | none (one more named volume) | one more service |
| Backup | one `pg_dump` | separate volume backup, which can get out of sync with the DB | separate |
| Delete / referential integrity | FKs and cascades, transactional | the app has to garbage-collect orphan files | the app has to garbage-collect orphans |
| Size ceiling | 1 GB per value ([TOAST](https://www.postgresql.org/docs/current/storage-toast.html)) | filesystem | effectively none |
| Maintenance status | core Postgres | n/a | **[repo archived and "no longer maintained"](https://github.com/minio/minio); community edition is source-only, no binary releases** |

- **Postgres facts.** TOAST moves values wider than about 2 kB out of the row. `EXTERNAL` storage (out-of-line, uncompressed) is "recommended for wide `text` and `bytea` columns". It also suits images and PDFs, which are already compressed. The [PostgreSQL wiki](https://wiki.postgresql.org/wiki/BinaryFilesInDB) lists the costs of storing files in the DB: a "performance hit", higher memory use and slower backups. It suggests the filesystem only for "very large files (100MB+)". Our files are capped at around 10 MB by the providers (see above).
- **Drizzle.** `drizzle-orm/pg-core` has a native `bytea()` column type ([docs](https://orm.drizzle.team/docs/column-types/pg)). The repo pins `drizzle-orm` 1.0.0-rc.4 and `pg` 8.x.

## Recommendation

1. **Store attachments in Postgres.** Create an `attachment` table: `id`, `userId`, `filename`, `mimeType`, `sizeBytes`, `sha256`, `width`/`height` (optional), `data bytea` (`ALTER COLUMN data SET STORAGE EXTERNAL`) and `createdAt`. Messages reference attachments through a join table, `message_attachment(messageId, attachmentId, position)`, and never embed the bytes. List queries must never select `data`. Serve the bytes from a dedicated authenticated route.
2. **Put storage behind an `AttachmentStore` interface** (`put` / `get` / `delete`). If DB size ever becomes a problem, we can then move it to a disk volume, or to an S3-compatible store that is still maintained, without touching Message code.
3. **Validate on upload, using the limits both providers share:**
   - Images: `image/jpeg|png|webp|gif`. Treat GIF as a still image. Allow **≤ 5 MB** raw, which is about 6.7 MB base64 and fits Anthropic's 10 MB base64 limit. Optionally downscale on the client to a 2576 px long edge.
   - PDFs: **≤ 10 MB**, no encryption.
   - Text-like files (`text/*`, `.md`, `.csv`, JSON, source code): ≤ about 1 MB, stored as bytes and sent as text.
   - Reject `.docx`, `.xlsx` and similar in v1.
4. **Build the parts on the server when calling `chat()`.** Load the attachment bytes for every Message on the active Branch path and map them to parts:
   - image → `{type:'image', source:{type:'data', value: base64, mimeType}}`
   - PDF → `{type:'document', source:{type:'data', ...}, metadata:{filename}}`
   - text file → `{type:'text', content: "<file name>\n```\n…\n```"}`

   Don't trust parts sent from the client. The client uploads first and sends attachment ids. Use `openaiText` (Responses), not `openaiChatCompletions`.
5. **Watch the total size of each request.** History is resent on every turn, so all attachments on the active Branch count each time. Anthropic caps a request at 32 MB and OpenAI caps files at 50 MB per request. Either cap attachments per Conversation (for example, total ≤ 25 MB) or show a clear error. A later optimisation could cache provider `file_id`s per attachment and provider (`uploadFile` + `fileSourceFromHandle`), but that adds state and is not needed for v1.

## Implications for this app

- **Branches.** Attachments belong to the user Message that carries them. Make them **immutable** and **referenced, not copied**. When a user edits a Message, the new sibling Message can re-link the same attachment ids (or drop or add some) through `message_attachment`, with no duplicated bytes. Regenerating creates a new assistant Message and leaves user attachments alone. This answers the map's open question, "How attachments and Branches interact": edit means re-reference, and regenerate means unchanged.
- **Deleting.** Deleting a Conversation cascades to its Messages and join rows. An attachment row is deleted only when nothing references it any more, whether a Message or a Shared link. In Postgres that is an FK with `ON DELETE RESTRICT` plus a cleanup query, all in one transaction. This is the main reason to choose the DB over disk.
- **Shared links.** A snapshot should reference the attachment ids that exist at share time, not copy the bytes. Immutable attachments make that safe. The public, unauthenticated Shared link view needs its own byte route. It may serve an attachment **only if the snapshot references it**, never by bare attachment id. The snapshot must also survive the owner deleting or editing the Conversation: snapshot-to-attachment references must block deletion, or the snapshot must take ownership.
- **Schema and dependencies are a human decision** (AGENTS.md §6). The table above is a proposal. This approach adds no new dependencies or Compose services.
- **Tool-calls UI and other tickets.** Choose the OpenAI adapter now: Responses (`openaiText`), because PDFs need it. Any ticket that assumes Chat Completions should be updated.

## Could not verify / caveats

- I did not run any of this end to end. The adapter behaviour comes from reading the source at one commit, and TanStack AI is pre-1.0 and moves fast.
- I didn't check whether Anthropic's adapter could send `text/plain` documents through a base64 data source. The source suggests it can't, because it casts the MIME type to `application/pdf`. That's why the recommendation uses text parts.
- I could not confirm OpenAI's "512 MB total payload per request" figure for images from a second page. I used the conservative cross-provider caps above instead.
- I didn't check exact per-image byte limits for OpenAI. The vision guide lists only payload, count and patch limits.
- I didn't benchmark `node-postgres` memory use for `bytea` reads. At ≤ 10 MB per value I don't expect a problem, but this is untested.
- MinIO's status comes from its GitHub README and the repo's `archived` flag. I didn't review min.io's commercial "AIStor Free" licence.
