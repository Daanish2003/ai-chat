import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

import type { Credentials } from "../deps";

type Options = {
  /** `KEY_ENCRYPTION_SECRET`. */
  secret: string;
  /** Binds the ciphertext to its row (`userId:service`), so a row copied elsewhere won't decrypt. */
  context: string;
};

const VERSION = "v1";
const ALGORITHM = "aes-256-gcm";
/** Full-length tags only: Node would otherwise accept a truncated tag on decrypt. */
const AUTH_TAG_LENGTH = 16;

function deriveKey(secret: string) {
  return Buffer.from(hkdfSync("sha256", secret, "", "ai-chat user_credentials", 32));
}

/** Encrypts credentials with AES-256-GCM, as `v1.<iv>.<tag>.<ciphertext>` in base64url (ADR 0003). */
export function encryptCredentials(credentials: Credentials, { secret, context }: Options): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, deriveKey(secret), iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  cipher.setAAD(Buffer.from(context));
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(credentials), "utf8"),
    cipher.final(),
  ]);
  return [VERSION, iv, cipher.getAuthTag(), ciphertext]
    .map((part) => (typeof part === "string" ? part : part.toString("base64url")))
    .join(".");
}

/** Decrypts `encryptCredentials` output; `null` when it can't (wrong secret, other row, corrupt). */
export function decryptCredentials(
  encrypted: string,
  { secret, context }: Options,
): Credentials | null {
  const [version, iv, tag, ciphertext, ...rest] = encrypted.split(".");
  if (version !== VERSION || !iv || !tag || !ciphertext || rest.length > 0) return null;
  try {
    const decipher = createDecipheriv(ALGORITHM, deriveKey(secret), Buffer.from(iv, "base64url"), {
      authTagLength: AUTH_TAG_LENGTH,
    });
    decipher.setAAD(Buffer.from(context));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(ciphertext, "base64url")),
      decipher.final(),
    ]).toString("utf8");
    return JSON.parse(plaintext) as Credentials;
  } catch {
    return null;
  }
}
