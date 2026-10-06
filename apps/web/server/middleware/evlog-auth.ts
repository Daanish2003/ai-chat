import { defineMiddleware } from "nitro";
import { createAuthMiddleware, type BetterAuthInstance } from "evlog/better-auth";
import { useLogger } from "evlog/nitro/v3";

import { auth } from "../../src/services";

// A middleware, not a plugin "request" hook: user plugin hooks run before the evlog
// module's hook has created the logger. createAuthIdentifier is skipped because it
// reads h3 v1's event shape; Nitro v3 keeps headers and URL on event.req.
const identify = createAuthMiddleware(auth as BetterAuthInstance, {
  exclude: ["/api/auth/**"],
  maskEmail: true,
});

export default defineMiddleware(async (event) => {
  await identify(useLogger(event), event.req.headers, new URL(event.req.url).pathname);
});
