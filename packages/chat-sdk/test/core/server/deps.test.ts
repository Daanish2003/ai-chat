import { describe, expect, it } from "vitest";

import { createAppDeps } from "../../../core/server/deps";
import { memoryRuntime } from "../../../core/server/runtime";
import { BlockedAddressError } from "../../../core/server/lib/guarded-fetch";
import type { Database } from "../../../core/server/db";
import { resolveRateLimits } from "../../../core/server/rate-limits";

describe("createAppDeps", () => {
  it("builds the bundle's fetch with the SSRF guard", async () => {
    const deps = createAppDeps({
      db: {} as Database,
      keyEncryptionSecrets: ["test-secret"],
      runtime: memoryRuntime(),
      hostProviders: [],
      hostTools: [],
      byok: true,
      getQuota: async () => null,
      rateLimits: resolveRateLimits(),
    });

    await expect(deps.fetch("http://127.0.0.1:9/")).rejects.toBeInstanceOf(BlockedAddressError);
  });
});
