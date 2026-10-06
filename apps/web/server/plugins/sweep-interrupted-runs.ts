import { sweepInterruptedRuns } from "@ai-chat/api/chat/run";
import { definePlugin } from "nitro";

import { deps } from "../../src/services";

// At boot, no run is going yet: every `streaming` Message was cut off by a restart (ADR 0002).
export default definePlugin(() => {
  sweepInterruptedRuns(deps).catch((error: unknown) => {
    console.error("Sweeping interrupted runs failed", error);
  });
});
