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
};
