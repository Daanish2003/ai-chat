# Shared run state across processes and runtimes

Research for issue #40 (child of the map #38). Researched on 2026-10-08.

**Question.** Runs outlive the client ([ADR 0002](../adr/0002-runs-outlive-the-client.md)), but the abort registry is a process-local `Map` (`deps.runs`) and a reloaded page only polls. What pluggable pub/sub and run executor support (1) several app processes, (2) Stop from any process, (3) live re-attach to a running stream after reload, and (4) later, serverless Hosts?

**Versions checked.** `@tanstack/ai` 0.64.1 is installed (`packages/api/package.json`); the TanStack AI repo was read at `main` [`778d305`](https://github.com/TanStack/ai/tree/778d30574729ff824654e972c067ea47b9207af4) (0.65.1). Every TanStack feature cited below appears in the changelog at or before 0.64.1. pg-boss was read at 12.37.0 (repo `master`).

---

## Recommendation

Split today's `startRun` into three seams. The Host picks the implementations; the SDK ships an in-memory set (dev, one process) and a Redis set (production).

```ts
import type { StreamChunk } from "@tanstack/ai";

/** Fire-and-forget delivery of control signals between processes. At-most-once is fine. */
interface PubSub {
  publish(channel: string, message: string): Promise<void>;
  /** Resolves once the subscription is live; the returned function unsubscribes. */
  subscribe(channel: string, onMessage: (message: string) => void): Promise<() => Promise<void>>;
}

/** One append-only, replayable chunk log per run (TanStack's StreamDurability contract, keyed by run id). */
interface RunStreams {
  /** Persist a batch; one opaque offset per chunk, in order. */
  append(runId: string, chunks: StreamChunk[]): Promise<string[]>;
  /** Chunks strictly after `after` ("-1" = from the start), then tail until `close`. Parks, never ends early. */
  read(
    runId: string,
    after: string,
    signal?: AbortSignal,
  ): AsyncIterable<{ offset: string; chunk: StreamChunk }>;
  /** End of log: wakes parked readers. Called on every run exit. Also sets a TTL on the log. */
  close(runId: string): Promise<void>;
}

/** Where a run's producer executes. */
interface RunExecutor {
  /** Start the run; resolves once it is accepted, not when it ends. */
  start(run: { messageId: string /* + what startRun needs today */ }): Promise<void>;
}
```

| Seam          | Dev / one process (default)         | Production (default)                                                                         | Later                                                |
| ------------- | ----------------------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `PubSub`      | in-memory (`EventEmitter`)          | **Redis pub/sub** (`PUBLISH` / `SUBSCRIBE`, one dedicated subscriber connection per process) | Postgres `LISTEN/NOTIFY` for Hosts without Redis     |
| `RunStreams`  | in-memory per-run array + waiters   | **Redis Streams** (`XADD`, `XREAD BLOCK`, `XRANGE`, `EXPIRE` after close)                    | Postgres table + `NOTIFY` wake-ups; `durableStream`  |
| `RunExecutor` | **in-process** (today's `startRun`) | **in-process** too: the producer stays in the process that took the POST                     | a queue/workflow executor for serverless (see below) |

How the four requirements fall out:

1. **Several processes.** The producer stays where the POST landed. Everything another process needs (chunks, the Stop signal, status) goes through `RunStreams`, `PubSub` and Postgres. "One run per Conversation" already holds across processes: it locks the Conversation row `FOR UPDATE` (`packages/api/src/chat/handle-chat.ts`).
2. **Stop from any process.** Stop uses two bands, the same split TanStack AI itself uses for its durable runs ([sandbox/takeover.md § Detach vs cancel](https://github.com/TanStack/ai/blob/778d30574729ff824654e972c067ea47b9207af4/docs/sandbox/takeover.md)):
   - **Durable intent in Postgres.** `stopRun` records "cancel requested" on the Message row.
   - **Fast path over `PubSub`.** It publishes on `run:<messageId>:cancel`. The process that owns the run subscribes to that channel when the run starts and aborts its local `AbortController`.

   Redis pub/sub is at-most-once, so a lost message is caught by the durable flag. The run already writes a snapshot every `snapshotIntervalMs` (1 s), so that `UPDATE … RETURNING` can read the flag back at no extra round-trip. Worst case, Stop takes about one snapshot interval.

3. **Live re-attach.** The run appends every chunk to `RunStreams` before handing it to the SSE response. A reloaded page that sees a `streaming` Message joins it with `fetchServerSentEvents(...).joinRun(runId)`, which TanStack's client already has. The client uses `fetchServerSentEvents` today (`packages/chat-react/src/chat/chat-view.tsx`). On the server, a `GET` replays from `-1` and tails. To get this for free, wrap `RunStreams` as a TanStack `StreamDurability` for that run id and serve the `GET` with `resumeServerSentEventsResponse`. The Postgres snapshot stays the source of truth for history. The log is only delivery ([advanced.md § Delivery is not state](https://github.com/TanStack/ai/blob/778d30574729ff824654e972c067ea47b9207af4/docs/resumable-streams/advanced.md#delivery-is-not-state)), so the 1 s polling can go.
4. **Serverless, later.** The same `PubSub` and `RunStreams` work unchanged. Only `RunExecutor` changes: a queue or workflow executor runs the producer outside the request. See [Run executor options](#run-executor-options).

**Process death must change with this.** `sweepInterruptedRuns` marks every `streaming` row created before boot as `error` ("interrupted"). With several processes, one process booting would kill the live runs of all the others. It needs a **lease** instead: each run renews a heartbeat (its snapshot write can do it), and a sweep reaps only rows whose heartbeat expired. TanStack's advice is the same: "Production backends should add a lease/reaper" ([advanced.md § Process death](https://github.com/TanStack/ai/blob/778d30574729ff824654e972c067ea47b9207af4/docs/resumable-streams/advanced.md#process-death)). The existing `message.updatedAt` column could be the heartbeat, but whether a heartbeat column or a "cancel requested" column is added is a **schema decision for a human** (AGENTS.md §6). Adding a Redis client dependency is one too.

**Why not just use TanStack's `toServerSentEventsResponse({ durability })` as-is?** Its producer is the response. Core drains the source into the log while the client is connected and after a disconnect ([advanced.md § Disconnect, stop, and errors](https://github.com/TanStack/ai/blob/778d30574729ff824654e972c067ea47b9207af4/docs/resumable-streams/advanced.md#disconnect-stop-and-errors)). Our run is already decoupled from the response and also writes Postgres snapshots and a final status, so we keep our producer and only borrow the contract and the `GET` / `joinRun` plumbing. The two fit together, but it is **unverified** that `resumeServerSentEventsResponse` accepts a `StreamDurability` built from a run id instead of from the request. The contract reads the run id from `X-Run-Id` or `?runId` ([custom-adapter.md](https://github.com/TanStack/ai/blob/778d30574729ff824654e972c067ea47b9207af4/docs/resumable-streams/custom-adapter.md)), so it should work, but a prototype should confirm it.

---

## TanStack AI: what it offers

- **Resumable streams are a delivery layer.** A durability adapter records every chunk to an ordered log before delivery and tags it with an opaque offset. A reconnecting client sends the last offset and the server replays from the log, with no new model call. The log is per **run**, not per conversation ([resumable-streams/overview.md](https://github.com/TanStack/ai/blob/778d30574729ff824654e972c067ea47b9207af4/docs/resumable-streams/overview.md)).
- **Adapters:** `memoryStream(request)` (in `@tanstack/ai`, "Single process only"), `durableStream(request, options)` (`@tanstack/ai-durable-stream`, talks to an external [Durable Streams](https://durablestreams.com) HTTP backend), and the third-party `upstashStream()` (`@upstash/agentkit-tanstack-ai`, Upstash Redis Streams) ([overview.md](https://github.com/TanStack/ai/blob/778d30574729ff824654e972c067ea47b9207af4/docs/resumable-streams/overview.md), [community-adapters/upstash.md](https://github.com/TanStack/ai/blob/778d30574729ff824654e972c067ea47b9207af4/docs/community-adapters/upstash.md)). There is no first-party adapter for plain Redis or Postgres.
- **The `StreamDurability` contract** has five methods: `resumeFrom`, `append`, `read`, `close` and `snapshot` (source: [`packages/ai/src/stream-durability.ts`](https://github.com/TanStack/ai/blob/778d30574729ff824654e972c067ea47b9207af4/packages/ai/src/stream-durability.ts)). Its rules matter for our `RunStreams` ([custom-adapter.md § The rules that matter](https://github.com/TanStack/ai/blob/778d30574729ff824654e972c067ea47b9207af4/docs/resumable-streams/custom-adapter.md#the-rules-that-matter)):
  - `read` ends **only** on `close()`, never on a terminal chunk, because a tool-calling run emits a `RUN_FINISHED` per iteration.
  - `read` must park rather than end empty while the run is live.
  - `snapshot` never waits.
- **Client:** reconnect after a drop is automatic. `joinRun(runId)` attaches from the start (`offset=-1`) and needs the server `GET` handler. All four HTTP connection adapters expose it ([advanced.md § Attaching to a run by id](https://github.com/TanStack/ai/blob/778d30574729ff824654e972c067ea47b9207af4/docs/resumable-streams/advanced.md#attaching-to-a-run-by-id)).
- **Batching:** `batch` (default 32) and `batchWaitMs` (default 50 ms) trade log writes against text latency ([advanced.md § Batch the log writes](https://github.com/TanStack/ai/blob/778d30574729ff824654e972c067ea47b9207af4/docs/resumable-streams/advanced.md#batch-the-log-writes)). Our `append` should batch the same way, so Redis isn't hit once per token.
- **Cross-host Stop:** TanStack has it only for its persistence/sandbox stack. `requestRunCancel(runs, runId)` sets `cancelRequested` on a `RunStore` record ("the only channel that reaches a run being driven by a _different_ host"), and `RUN_CANCEL_REASON` aborts in-process. Its docs say a cancel endpoint "should do **both**" ([sandbox/takeover.md](https://github.com/TanStack/ai/blob/778d30574729ff824654e972c067ea47b9207af4/docs/sandbox/takeover.md)). We don't use `withPersistence` (ADR 0001), so we copy the pattern rather than the API.
- **Locks:** `withLocks` / `LockStore` in `@tanstack/ai/locks` give a cross-instance mutex ([advanced/locks.md](https://github.com/TanStack/ai/blob/778d30574729ff824654e972c067ea47b9207af4/docs/advanced/locks.md)). We don't need them: the Conversation row lock already does that job.
- **Process death:** "literal process death cannot be guaranteed by `finally` or `close()` alone". It needs a lease and a reaper ([advanced.md § Process death](https://github.com/TanStack/ai/blob/778d30574729ff824654e972c067ea47b9207af4/docs/resumable-streams/advanced.md#process-death)).

---

## Pub/sub and log options

### Redis pub/sub: the production `PubSub`

- "Redis' Pub/Sub exhibits _at-most-once_ message delivery semantics… If the subscriber is unable to handle the message (for example, due to an error or a network disconnect) the message is forever lost." ([redis.io: Pub/Sub](https://redis.io/docs/latest/develop/pubsub/#delivery-semantics))
- With RESP2, a subscribed connection can only issue subscribe commands, `PING`, `QUIT` and `RESET`, so each process needs one **dedicated subscriber connection**. RESP3 lifts that limit (same page).
- Pub/sub ignores database numbers ("Publishing on db 10, will be heard by a subscriber on db 1"), so prefix channels per environment (same page).
- **Fit:** good for Stop, because the durable flag covers loss. It is wrong for chunks: a reloaded page would miss everything published before it subscribed.

### Redis Streams: the production `RunStreams`

- `XADD` returns a monotonic ID per entry (`<ms>-<seq>`, kept monotonic even if the clock goes back). That ID is a ready-made opaque offset. `XREAD … BLOCK <ms> STREAMS key <id>` tails from an ID, `XRANGE` replays a range, and `XADD … MAXLEN ~ n` / `XTRIM` cap growth. Unlike pub/sub, stream entries are persisted, with at-most-once or at-least-once delivery ([redis.io: Streams](https://redis.io/docs/latest/develop/data-types/streams/), [Pub/Sub § Delivery semantics](https://redis.io/docs/latest/develop/pubsub/#delivery-semantics)).
- Shape: one stream per run (`run:<id>:chunks`). `close` appends an end marker and sets `EXPIRE` (for example 1 hour), and `read` loops `XREAD BLOCK` until it sees the marker. No consumer groups: every reader reads everything.
- It is the same mechanism `upstashStream()` uses ("Every chunk is appended to a Redis Stream before it is delivered … on any instance", [upstash.md](https://github.com/TanStack/ai/blob/778d30574729ff824654e972c067ea47b9207af4/docs/community-adapters/upstash.md)). That adapter is tied to Upstash's client, though. Whether it works against a self-hosted Redis is **unverified**.

### Postgres LISTEN/NOTIFY: the no-Redis option

- The payload "must be shorter than 8000 bytes" by default. Notifications are delivered only when the sending transaction commits. Identical payloads on one channel within a transaction fold into one. The queue is 8 GB, and when it is full, "transactions calling `NOTIFY` will fail at commit" ([sql-notify](https://www.postgresql.org/docs/current/sql-notify.html)).
- A session sees only events committed after its `LISTEN`. Earlier ones are not delivered, so the documented pattern is: `LISTEN`, commit, then read state ([sql-listen](https://www.postgresql.org/docs/current/sql-listen.html)). That's fine for a "wake up and re-read the table" signal. It can't serve as a replayable log by itself.
- `LISTEN` does not work through PgBouncer in **transaction** pooling mode ("Never"). `NOTIFY` does ([pgbouncer features](https://www.pgbouncer.org/features.html)). Managed Postgres behind a transaction pooler needs a direct session connection for the listener.
- **Fit:** works as `PubSub`. For `RunStreams` it needs a chunk table plus `NOTIFY` wake-ups, which puts every token batch through WAL. That's acceptable for small Hosts, but the map already puts Redis in production, so this is an alternative, not the default.

---

## Run executor options

The in-process executor (today's `startRun`) covers requirements 1–3 once the log and Stop are shared. A queue only buys **surviving the producer's process** (deploys, crashes) or **running where requests are short-lived** (serverless). For an LLM stream, a retry after a crash re-bills and re-generates from scratch, so any queue executor should run with **no automatic retries**.

| Option          | Backing                      | Stop reaches a running job?                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Live chunks                                                                                                                                                                                             | Fit                                                                                                                     |
| --------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **BullMQ**      | Redis                        | Only **on the worker holding it**: `worker.cancelJob(id)` aborts the processor's `signal` ([docs](https://docs.bullmq.io/guide/workers/cancelling-jobs)). From another process you still need our `PubSub` to reach that worker.                                                                                                                                                                                                                                                       | Not provided; use `RunStreams`                                                                                                                                                                          | A natural long-running worker tier on the same Redis; doesn't remove any of our seams                                   |
| **pg-boss**     | Postgres (`SKIP LOCKED`)     | `cancel()` works on active jobs. The handler's `job.signal` aborts when a **heartbeat** finds the job no longer active, so latency is about `heartbeatSeconds`. Fetch polls every 2 s by default, or uses optional `LISTEN/NOTIFY` wake-up ([workers.md](https://github.com/timgit/pg-boss/blob/master/docs/api/workers.md), [jobs.md](https://github.com/timgit/pg-boss/blob/master/docs/api/jobs.md), [queues.md](https://github.com/timgit/pg-boss/blob/master/docs/api/queues.md)) | Not provided; use `RunStreams`                                                                                                                                                                          | Postgres-only queue; Stop is slower than pub/sub                                                                        |
| **Inngest**     | Hosted / self-hosted service | `cancelOn` "takes effect between steps … it cannot interrupt a `step.run` that has already begun" ([docs](https://www.inngest.com/docs/features/inngest-functions/cancellation/cancel-on-events)). One long LLM step can't be stopped mid-stream that way, so it still needs our `PubSub`.                                                                                                                                                                                             | Inngest Realtime (`publish` to channels/topics, token-scoped `useRealtime`; GA in the TS SDK) ([docs](https://www.inngest.com/docs/features/realtime)). Replay for a late subscriber is **unverified**. | Serverless-friendly, but another service plus a different stream protocol                                               |
| **Trigger.dev** | Hosted / self-hosted service | `runs.cancel` stops task execution and its child runs ([docs](https://trigger.dev/docs/runs)). Whether that means immediately or through an abort hook is **unverified**.                                                                                                                                                                                                                                                                                                              | Realtime streams with resume from `startIndex` ([docs](https://trigger.dev/docs/realtime/streams))                                                                                                      | Tasks are deployed to and run on Trigger.dev's workers, not in the Host ([docs](https://trigger.dev/docs/how-it-works)) |

**Recommendation for serverless (later):** keep `RunExecutor` as the seam and pick the backend when a serverless Host actually exists. The first candidate is an executor that hands the run to a long-running worker over BullMQ, or to Trigger.dev, while `PubSub` and `RunStreams` stay Redis. A platform `waitUntil` (keep the function alive after the response) might be enough for runs under its time limit; this is **unverified** and not researched here.

---

## Unverified / open

- Wiring `RunStreams` as a TanStack `StreamDurability` keyed by our run id and serving it with `resumeServerSentEventsResponse` + `joinRun`: should work per the contract, needs a prototype.
- `upstashStream()` against non-Upstash Redis.
- Inngest Realtime replay for late subscribers; Trigger.dev cancel latency or abort hook; serverless `waitUntil` limits.
- **Human decisions** (AGENTS.md §6): a Redis client dependency and Redis in infrastructure (already in the map's direction), plus schema for the lease/heartbeat and the cancel flag on the Message row.
