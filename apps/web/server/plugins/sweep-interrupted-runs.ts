import { sweepInterruptedRuns } from "@ai-chat/chat-sdk/server";
import { definePlugin } from "nitro";

import { db } from "../../src/services";

// At boot, no run is going yet: every `streaming` Message was cut off by a restart (ADR 0002).
export default definePlugin(() => {
  sweepInterruptedRuns({ db }).catch((error: unknown) => {
    console.error("Sweeping interrupted runs failed", error);
  });
});
