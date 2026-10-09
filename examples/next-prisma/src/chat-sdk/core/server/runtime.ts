import { createMemoryPubSub, type PubSub } from "./chat/pubsub";
import { createMemoryRunStreams, type RunStreams } from "./chat/run-streams";

/** What carries Runs across processes (ADR 0006). The Host passes one to `createChat`. */
export type ChatRuntime = {
  /** Every Run's chunk log, which its POST response and any joiner read. */
  runStreams: RunStreams;
  /** Control signals between processes, such as Stop. */
  pubsub: PubSub;
};

/** The in-process runtime: Runs live in this process's memory only. */
export function memoryRuntime(): ChatRuntime {
  return { runStreams: createMemoryRunStreams(), pubsub: createMemoryPubSub() };
}
