import { defineConfig } from "vitest/config";

const testFiles = ["{apps,packages}/*/src/**/*.test.ts"];
const integrationTestFiles = ["{apps,packages}/*/src/**/*.integration.test.ts"];

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          include: testFiles,
          exclude: integrationTestFiles,
        },
      },
      {
        // Integration tests share one Postgres database (TEST_DATABASE_URL),
        // so their files run one at a time.
        test: {
          name: "integration",
          include: integrationTestFiles,
          fileParallelism: false,
          globalSetup: ["packages/db/src/testing/global-setup.ts"],
          setupFiles: ["packages/db/src/testing/setup.ts"],
        },
      },
    ],
  },
});
