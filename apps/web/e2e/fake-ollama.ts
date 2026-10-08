/// <reference types="node" />
import { createServer, type Server } from "node:http";

/** The Model the fake Ollama host lists as installed. */
export const fakeModel = "e2e-model";

/** A reply long enough to see streaming, with Markdown and a code block. */
export function fakeReply(prompt: string) {
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

/** Reply word by word, this far apart; a prompt with `slowMarker` is slow enough to Stop. */
const chunkDelayMs = 40;
const slowChunkDelayMs = 400;
export const slowMarker = "[slow]";

/**
 * A stand-in Ollama server: `/api/tags` lists `fakeModel`, `/api/chat` streams `fakeReply` of the
 * last user Message as NDJSON (or answers in one piece when `stream` is false, as title
 * generation asks).
 */
export function startFakeOllama(port: number): Promise<Server> {
  const server = createServer((request, response) => {
    if (request.url === "/api/tags") {
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ models: [{ name: fakeModel }] }));
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
      const text = fakeReply(prompt.slice(0, 80));
      const line = (content: string, done: boolean) =>
        JSON.stringify({
          model: fakeModel,
          created_at: new Date().toISOString(),
          message: { role: "assistant", content },
          done,
          ...(done && { done_reason: "stop", prompt_eval_count: 1, eval_count: 1 }),
        });

      if (!stream) {
        response.setHeader("content-type", "application/json");
        response.end(line("E2E title", true));
        return;
      }
      response.setHeader("content-type", "application/x-ndjson");
      const words = text.split(/(?<= )/);
      let index = 0;
      const timer = setInterval(
        () => {
          if (response.destroyed) return clearInterval(timer);
          if (index < words.length) {
            response.write(`${line(words[index++] ?? "", false)}\n`);
            return;
          }
          clearInterval(timer);
          response.end(`${line("", true)}\n`);
        },
        prompt.includes(slowMarker) ? slowChunkDelayMs : chunkDelayMs,
      );
    });
  });
  return new Promise((resolve) => server.listen(port, () => resolve(server)));
}
