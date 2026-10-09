import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: Buffer,
  keyLength: number,
) => Promise<Buffer>;

const KEY_LENGTH = 64;

/** `scrypt$<salt>$<key>`, both base64. Node's scrypt, so there is no bcrypt dependency. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password.normalize("NFKC"), salt, KEY_LENGTH);
  return `scrypt$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltBase64, keyBase64] = stored.split("$");
  if (scheme !== "scrypt" || !saltBase64 || !keyBase64) return false;
  const expected = Buffer.from(keyBase64, "base64");
  const actual = await scrypt(
    password.normalize("NFKC"),
    Buffer.from(saltBase64, "base64"),
    expected.length,
  );
  return timingSafeEqual(expected, actual);
}
