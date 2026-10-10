import { fakeOllamaPort } from "./env";
import { startFakeOllama } from "../../../packages/chat-sdk/test/e2e/fake-ollama";

/** Starts the fake Ollama host every test's Ollama credentials point at; stops it after. */
export default async function globalSetup() {
  const server = await startFakeOllama(fakeOllamaPort);
  return () => new Promise<void>((resolve) => server.close(() => resolve()));
}
