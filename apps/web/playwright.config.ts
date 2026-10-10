import { defineConfig, devices } from "@playwright/test";

import { baseURL, serverEnv } from "./e2e/env";

/**
 * End-to-end tests against the production build, its own database (`e2e/start-server.ts`) and
 * a fake Ollama host (`packages/chat-sdk/test/e2e/fake-ollama.ts`), so no Provider key is needed. `*.phone.spec.ts`
 * runs on a phone, the rest on a desktop browser.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  // The tests that sign up or sign in through the form may wait out Better Auth's rate limit.
  // The shared scenarios seed their users instead.
  timeout: 90_000,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  globalSetup: "./e2e/global-setup.ts",
  use: { baseURL, trace: "retain-on-failure" },
  projects: [
    {
      name: "desktop",
      // redis.spec.ts needs REDIS_URL, which only a run with Redis provides.
      testIgnore: process.env.REDIS_URL
        ? /\.phone\.spec\.ts$/
        : [/\.phone\.spec\.ts$/, /redis\.spec\.ts$/],
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    { name: "phone", testMatch: /\.phone\.spec\.ts$/, use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: "pnpm build && node e2e/start-server.ts",
    url: `${baseURL}/login`,
    env: serverEnv,
    timeout: 300_000,
    reuseExistingServer: !process.env.CI,
  },
});
