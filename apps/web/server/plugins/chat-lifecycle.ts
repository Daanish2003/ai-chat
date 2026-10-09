import { definePlugin } from "nitro";

import { chat } from "../../src/services";

// Boot: the chat's reaper runs now and every 30 s, so a Run whose process died shows as
// interrupted (ADR 0006). SIGTERM: local Runs get up to 250 s to finish before the process exits.
export default definePlugin(async () => {
  await chat.start();
  process.once("SIGTERM", () => {
    chat.stop().finally(() => process.exit(0));
  });
});
