# Provider credentials are stored server-side, encrypted; we don't use TanStack's client BYOK

Every run is paid for with the user's own Provider credentials (and web search with their own Tool credential); the app holds no keys of its own. TanStack AI ships BYOK helpers (`defineByok`, `useByok`, `getByokKey(request, …)`) that keep keys in the browser and send them with each request, but runs outlive the client (ADR 0002) and titles are generated server-side after the first run, so the server must be able to reach a key with nobody connected. We store credentials in a `user_credentials` table (`userId`, `service`, encrypted JSON, a short display hint), one row per user and service, with each service's fields defined by a zod schema in code. The JSON is encrypted with AES-256-GCM under `KEY_ENCRYPTION_SECRET` (Varlock), and the client can write credentials but never read them back: it only sees the hint (e.g. "…abcd").

## Considered Options

- **TanStack's client BYOK**: no secrets at rest on our side, but a run or title can't continue once the tab closes.
- **Plaintext in Postgres**: simplest, but a database dump leaks every user's keys.
- **Server keys in env, with user keys as an override**: rejected. The app should not pay for other users' runs.

## Consequences

- No key rotation in v1. If `KEY_ENCRYPTION_SECRET` changes, stored credentials fail to decrypt, are treated as missing, and users re-enter them.
- A user with no Provider credentials can't chat, and a user with no Tavily credential has no web search.
- We still reuse each adapter's `/byok` provider definitions for labels, but not its key store.
