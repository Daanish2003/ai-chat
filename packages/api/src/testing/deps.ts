import { getTestDb } from "@ai-chat/db/testing/test-database";

import type { AppDeps } from "../deps";
import { createFakeSearchClient } from "./fake-search-client";

/**
 * `AppDeps` for tests: the test database and fakes, with nothing that reaches the network.
 * Pass overrides for the parts a test scripts (for example `adapterFor` returning a fake adapter).
 */
export function createTestDeps(overrides: Partial<AppDeps> = {}): AppDeps {
  return {
    db: getTestDb(),
    adapterFor: (model) => {
      throw new Error(`No fake adapter for model "${model}"; pass adapterFor to createTestDeps`);
    },
    searchClient: createFakeSearchClient(),
    runs: new Map(),
    limits: { snapshotIntervalMs: 20, runCapMs: 2_000 },
    fetch: async (input) => {
      throw new Error(`Unexpected network call in a test: ${String(input)}`);
    },
    ...overrides,
  };
}
