/** Where the end-to-end run's server and fake Ollama live. */

export const port = 3100;
export const baseURL = `http://localhost:${port}`;
export const fakeOllamaPort = 11534;
export const fakeOllamaHost = `http://localhost:${fakeOllamaPort}`;

/**
 * The server's environment: fixed secrets, never used outside these tests. Its database is
 * picked by `start-server.ts`.
 */
export const serverEnv = {
  NODE_ENV: "production",
  PORT: String(port),
  BETTER_AUTH_URL: baseURL,
  BETTER_AUTH_SECRET: "e2e-better-auth-secret-not-for-production",
  KEY_ENCRYPTION_SECRET: "e2e-key-encryption-secret-not-for-production",
  // Mail goes to the capture mailbox, read back through /api/test-mailbox. Nothing is sent, so
  // the Resend key is a placeholder (production requires one).
  EMAIL_TRANSPORT: "capture",
  EMAIL_FROM: "AI Chat <no-reply@example.com>",
  APP_NAME: "AI Chat",
  RESEND_API_KEY: "re_e2e_not_sent",
  // The fake page `fetch_url` reads is served by the fake Ollama host, on localhost (see fake-ollama.ts).
  SSRF_ALLOW_HOSTS: `localhost:${fakeOllamaPort}`,
  // Set only by a run with Redis (`redis.spec.ts`); otherwise the server runs on memory.
  ...(process.env.REDIS_URL ? { REDIS_URL: process.env.REDIS_URL } : {}),
};
