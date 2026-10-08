---
Status: proposed
---

# apps/web runs in production on Render

`apps/web` runs as one Docker web service on Render, with Render Postgres and Render Key Value, in one region. Render is the only host we compared ([hosting research](../research/hosting.md)) whose request limit (100 minutes) is far above a 5-minute Run, whose shutdown delay reaches 300 s, and whose Postgres is fully managed with `pg_trgm` and point-in-time recovery, at about $36/month.

- **Deploys**: GitHub Actions builds the image on push to `main` (the Varlock build secret is available there), pushes it to GHCR and calls Render's deploy hook. Rolling back is redeploying an earlier tag.
- **Migrations** run in Render's pre-deploy command, `apps/web`'s first, then `chat.migrate()`, before traffic moves. A failure stops the deploy. Every migration must work with the version still running (expand, then contract).
- **Redis from day one.** A zero-downtime deploy runs two processes for up to 300 s, so `redisRuntime()` (ADR 0006) is needed even with one instance, or a reader reconnecting to the new process loses a Run on the old one.
- **Shutdown**: SIGTERM calls `chat.stop()` (250 s drain) under a 300 s shutdown delay; anything left at SIGKILL is the reaper's.
- **Production only**: no staging or preview environments yet. Secrets live in a Render environment group, checked by `.env.schema`.
- **Around it**: DNS at Cloudflare (DNS only, so streams aren't buffered), mail from a verified `mail.` subdomain in Resend, nightly `pg_dump` to Cloudflare R2 kept 30 days on top of Render's point-in-time recovery, logs drained by evlog to Axiom, uptime checks from Better Stack.

## Considered Options

- **Railway**: cheaper, with S3 buckets built in, but its Postgres is partly self-managed and draining defaults to 0 s.
- **Fly.io**: about $45–55/month, 300 s kill timeout, a reported 30 s reset on stalled streams.
- **Hetzner with Coolify or Kamal**: cheapest, but we run and back up the databases ourselves.

## Consequences

- Render has no object storage; an S3-compatible Attachment store, when needed, comes from elsewhere (R2 is the obvious candidate).
- The region can't be changed after creation.
- A domain has to be bought and verified before real mail or production OAuth callbacks work.
