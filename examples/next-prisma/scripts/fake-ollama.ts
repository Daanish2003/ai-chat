/// <reference types="node" />
/**
 * A stand-in Ollama server for trying the chat without a real Provider key. Start it with
 * `pnpm fake-provider`, then add an Ollama credential on Keys & settings with the host
 * http://localhost:11436 (or FAKE_PROVIDER_PORT). Adapted from apps/web/e2e/fake-ollama.ts.
 *
 * `/api/tags` lists `fake-model`; `/api/chat` streams a canned Markdown reply word by word, which
 * echoes the last user Message (or answers in one piece when `stream` is false, as titles ask).
 */
import { createServer } from "node:http";

const port = Number(process.env.FAKE_PROVIDER_PORT ?? 11436);
const model = "fake-model";
const chunkDelayMs = 40;

function reply(prompt: string) {
  return [
    `You said: **${prompt}**.`,
    "",
    "Here is some code:",
    "",
    "```ts",
    "const answer = 42;",
    "```",
    "",
    "That's all.",
  ].join("\n");
}

const server = createServer((request, response) => {
  if (request.url === "/api/tags") {
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ models: [{ name: model }] }));
    return;
  }
  if (request.url !== "/api/chat" || request.method !== "POST") {
    response.statusCode = 404;
    response.end();
    return;
  }
  let body = "";
  request.on("data", (chunk: Buffer) => (body += chunk.toString()));
  request.on("end", () => {
    const { messages, stream = true } = JSON.parse(body) as {
      messages: { role: string; content: string }[];
      stream?: boolean;
    };
    const prompt = messages.filter((message) => message.role === "user").at(-1)?.content ?? "";
    const line = (content: string, done: boolean) =>
      JSON.stringify({
        model,
        created_at: new Date().toISOString(),
        message: { role: "assistant", content },
        done,
        ...(done && { done_reason: "stop", prompt_eval_count: 1, eval_count: 1 }),
      });

    if (!stream) {
      response.setHeader("content-type", "application/json");
      response.end(line("Fake title", true));
      return;
    }
    response.setHeader("content-type", "application/x-ndjson");
    const words = reply(prompt.slice(0, 80)).split(/(?<= )/);
    let index = 0;
    const timer = setInterval(() => {
      if (response.destroyed) return clearInterval(timer);
      if (index < words.length) {
        response.write(`${line(words[index++] ?? "", false)}\n`);
        return;
      }
      clearInterval(timer);
      response.end(`${line("", true)}\n`);
    }, chunkDelayMs);
  });
});

server.listen(port, () => {
  console.log(`Fake Ollama (Provider) listening on http://localhost:${port}`);
});
