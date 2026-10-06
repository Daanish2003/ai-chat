import { describe, expect, it } from "vitest";

import { decryptCredentials, encryptCredentials } from "./encryption";

const secret = "a-key-encryption-secret-of-at-least-32-chars";
const context = "user-1:anthropic";

describe("credential encryption", () => {
  it("decrypts what it encrypted", () => {
    const encrypted = encryptCredentials({ apiKey: "sk-ant-secret" }, { secret, context });

    expect(decryptCredentials(encrypted, { secret, context })).toEqual({ apiKey: "sk-ant-secret" });
  });

  it("never stores the plaintext", () => {
    const encrypted = encryptCredentials({ apiKey: "sk-ant-secret" }, { secret, context });

    expect(encrypted).not.toContain("sk-ant-secret");
  });

  it("encrypts the same credentials differently each time", () => {
    const first = encryptCredentials({ apiKey: "sk-ant-secret" }, { secret, context });
    const second = encryptCredentials({ apiKey: "sk-ant-secret" }, { secret, context });

    expect(first).not.toBe(second);
  });

  it("returns null under a different secret", () => {
    const encrypted = encryptCredentials({ apiKey: "sk-ant-secret" }, { secret, context });

    expect(
      decryptCredentials(encrypted, {
        secret: "another-secret-of-at-least-32-characters",
        context,
      }),
    ).toBeNull();
  });

  it("returns null when the row was moved to another user or service", () => {
    const encrypted = encryptCredentials({ apiKey: "sk-ant-secret" }, { secret, context });

    expect(decryptCredentials(encrypted, { secret, context: "user-2:anthropic" })).toBeNull();
  });

  it("returns null for a value that is not ours", () => {
    expect(decryptCredentials("garbage", { secret, context })).toBeNull();
  });
});

describe("credential encryption against tampering", () => {
  it("returns null when the auth tag was truncated", () => {
    const encrypted = encryptCredentials({ apiKey: "sk-ant-secret" }, { secret, context });
    const [version, iv, tag = "", ciphertext] = encrypted.split(".");
    const truncatedTag = Buffer.from(tag, "base64url").subarray(0, 4).toString("base64url");

    expect(
      decryptCredentials([version, iv, truncatedTag, ciphertext].join("."), { secret, context }),
    ).toBeNull();
  });
});
