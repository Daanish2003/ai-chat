import { describe, expect, it } from "vitest";

import { checkCredentials } from "./check";

type Call = { url: string; headers: Headers };

function stubFetch(respond: () => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), headers: new Headers(init?.headers) });
    return respond();
  }) as typeof globalThis.fetch;
  return { fetch, calls };
}

const json = (status: number, body: unknown = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("checkCredentials for Anthropic", () => {
  it("lists models with the key and counts a 200 as verified", async () => {
    const { fetch, calls } = stubFetch(() => json(200, { data: [] }));

    const result = await checkCredentials("anthropic", { apiKey: "sk-ant-good" }, fetch);

    expect(result).toEqual({ status: "verified" });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("https://api.anthropic.com/v1/models?limit=1");
    expect(calls[0]?.headers.get("x-api-key")).toBe("sk-ant-good");
    expect(calls[0]?.headers.get("anthropic-version")).toBe("2023-06-01");
  });

  it("rejects a key Anthropic answers 401 to as invalid", async () => {
    const { fetch } = stubFetch(() => json(401, { type: "error" }));

    const result = await checkCredentials("anthropic", { apiKey: "sk-ant-typo" }, fetch);

    expect(result).toEqual({
      status: "rejected",
      reason: "invalid_key",
      message: "Anthropic rejected this API key.",
    });
  });
});

describe("checkCredentials for OpenAI", () => {
  it("lists models with a bearer token and counts a 200 as verified", async () => {
    const { fetch, calls } = stubFetch(() => json(200, { data: [] }));

    const result = await checkCredentials("openai", { apiKey: "sk-good" }, fetch);

    expect(result).toEqual({ status: "verified" });
    expect(calls[0]?.url).toBe("https://api.openai.com/v1/models");
    expect(calls[0]?.headers.get("authorization")).toBe("Bearer sk-good");
  });

  it("rejects a key OpenAI answers 403 to as invalid", async () => {
    const { fetch } = stubFetch(() => json(403));

    const result = await checkCredentials("openai", { apiKey: "sk-no-scope" }, fetch);

    expect(result).toEqual({
      status: "rejected",
      reason: "invalid_key",
      message: "OpenAI rejected this API key.",
    });
  });

  it("counts a rate-limited answer as verified, since the key authenticated", async () => {
    const { fetch } = stubFetch(() => json(429));

    await expect(checkCredentials("openai", { apiKey: "sk-busy" }, fetch)).resolves.toEqual({
      status: "verified",
    });
  });

  it("rejects with provider_error when the Provider fails", async () => {
    const { fetch } = stubFetch(() => json(503));

    const result = await checkCredentials("openai", { apiKey: "sk-good" }, fetch);

    expect(result).toEqual({
      status: "rejected",
      reason: "provider_error",
      message: "Couldn't check the key with OpenAI (HTTP 503). Try again.",
    });
  });

  it("rejects with provider_error when the Provider can't be reached", async () => {
    const { fetch } = stubFetch(() => {
      throw new TypeError("fetch failed");
    });

    const result = await checkCredentials("openai", { apiKey: "sk-good" }, fetch);

    expect(result).toEqual({
      status: "rejected",
      reason: "provider_error",
      message: "Couldn't reach OpenAI to check the key. Try again.",
    });
  });
});
