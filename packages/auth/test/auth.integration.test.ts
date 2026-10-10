import { createDb } from "@ai-chat/db";
import { account, user } from "@ai-chat/db/schema/auth";
import { createMemorySender, type EmailSender } from "@ai-chat/email";
import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";

import { type AuthConfig, type AuthLogger, createAuth } from "../src/index";

const BASE = "http://localhost:3000";
const env: AuthConfig = {
  BETTER_AUTH_URL: BASE,
  BETTER_AUTH_SECRET: "auth-integration-secret-0123456789abcdef",
  APP_NAME: "Acme Chat",
};
const database = createDb({ DATABASE_URL: process.env.TEST_DATABASE_URL ?? "" });

afterAll(async () => {
  await database.$client.end();
});

function makeLogger() {
  return { error: vi.fn<AuthLogger["error"]>() } satisfies AuthLogger;
}

function signUp(auth: ReturnType<typeof createAuth>, email: string, password: string) {
  return post(auth, "/sign-up/email", { name: "Someone", email, password });
}

function post(auth: ReturnType<typeof createAuth>, path: string, body: unknown) {
  return auth.handler(
    new Request(`${BASE}/api/auth${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: BASE },
      body: JSON.stringify(body),
    }),
  );
}

async function userRow(email: string) {
  const rows = await database
    .select({ id: user.id, name: user.name, emailVerified: user.emailVerified })
    .from(user)
    .where(eq(user.email, email));
  return rows;
}

async function passwordHashOf(userId: string) {
  const [row] = await database
    .select({ password: account.password })
    .from(account)
    .where(eq(account.userId, userId));
  return row?.password;
}

describe("sign-up and email verification", () => {
  it("answers a new and an existing email the same, and leaves the existing account alone", async () => {
    const sender = createMemorySender();
    const auth = createAuth(env, database, sender, makeLogger());

    const fresh = await signUp(auth, "owner@example.com", "owner-password-1");
    const [owner] = await userRow("owner@example.com");
    const ownerHash = await passwordHashOf(owner.id);

    const existing = await post(auth, "/sign-up/email", {
      name: "Intruder",
      email: "owner@example.com",
      password: "intruder-password-1",
    });

    expect(fresh.status).toBe(200);
    expect(existing.status).toBe(fresh.status);
    const freshBody = (await fresh.json()) as Record<string, unknown>;
    const existingBody = (await existing.json()) as Record<string, unknown>;
    expect(Object.keys(existingBody).sort()).toEqual(Object.keys(freshBody).sort());
    expect(existingBody.token).toBeNull();

    const rows = await userRow("owner@example.com");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: "Someone", emailVerified: false });
    expect(await passwordHashOf(owner.id)).toBe(ownerHash);
  });

  it("refuses sign-in before verification with 403, and sends a fresh link", async () => {
    const sender = createMemorySender();
    const auth = createAuth(env, database, sender, makeLogger());
    await signUp(auth, "waiting@example.com", "waiting-password-1");

    const response = await post(auth, "/sign-in/email", {
      email: "waiting@example.com",
      password: "waiting-password-1",
    });

    expect(response.status).toBe(403);
    await vi.waitFor(() => expect(sender.messages).toHaveLength(2));
    const last = sender.messages.at(-1);
    expect(last).toMatchObject({ to: "waiting@example.com", template: "verify-email" });
    expect(last?.link).toContain("/api/auth/verify-email?token=");
  });

  it("a sender that throws neither fails the request nor goes unlogged", async () => {
    const failing: EmailSender = {
      send: vi.fn(async () => {
        throw new Error("provider is down");
      }),
    };
    const logger = makeLogger();
    const auth = createAuth(env, database, failing, logger);

    const response = await signUp(auth, "unlucky@example.com", "unlucky-password-1");

    expect(response.status).toBe(200);
    await vi.waitFor(() => expect(logger.error).toHaveBeenCalledTimes(1));
    expect(logger.error.mock.calls[0][0]).toMatchObject({ action: "email.send" });
  });
});

describe("forgotten password", () => {
  const RESET_TO = `${BASE}/reset-password`;

  async function verifiedUser(
    auth: ReturnType<typeof createAuth>,
    email: string,
    password: string,
  ) {
    await signUp(auth, email, password);
    await database.update(user).set({ emailVerified: true }).where(eq(user.email, email));
  }

  function requestReset(auth: ReturnType<typeof createAuth>, email: string) {
    return post(auth, "/request-password-reset", { email, redirectTo: RESET_TO });
  }

  function resetMails(sender: { messages: { template: string }[] }) {
    return sender.messages.filter((message) => message.template === "reset-password");
  }

  // The reset link's token, read from the link the sender received.
  function tokenFrom(link: string | undefined) {
    const match = /\/reset-password\/([^?]+)/.exec(link ?? "");
    if (!match) throw new Error(`no reset token in "${link}"`);
    return match[1];
  }

  function resetWith(auth: ReturnType<typeof createAuth>, token: string, newPassword: string) {
    return post(auth, "/reset-password", { token, newPassword });
  }

  it("answers an existing and a missing email the same, and mails only the existing one", async () => {
    const sender = createMemorySender();
    const auth = createAuth(env, database, sender, makeLogger());
    await verifiedUser(auth, "reset-me@example.com", "reset-password-1");

    const existing = await requestReset(auth, "reset-me@example.com");
    const missing = await requestReset(auth, "nobody-here@example.com");

    expect(existing.status).toBe(200);
    expect(missing.status).toBe(existing.status);
    expect(await missing.json()).toEqual(await existing.json());
    await vi.waitFor(() => expect(resetMails(sender)).toHaveLength(1));
    expect(resetMails(sender)[0]).toMatchObject({
      to: "reset-me@example.com",
      template: "reset-password",
    });
  });

  it("a reset token works once; the second use is refused", async () => {
    const sender = createMemorySender();
    const auth = createAuth(env, database, sender, makeLogger());
    await verifiedUser(auth, "once@example.com", "old-password-1");
    await requestReset(auth, "once@example.com");
    await vi.waitFor(() => expect(resetMails(sender)).toHaveLength(1));
    const token = tokenFrom(sender.lastLinkTo("once@example.com"));

    const first = await resetWith(auth, token, "new-password-1");
    const second = await resetWith(auth, token, "newer-password-2");

    expect(first.status).toBe(200);
    expect(second.status).toBe(400);
    const signIn = await post(auth, "/sign-in/email", {
      email: "once@example.com",
      password: "new-password-1",
    });
    expect(signIn.status).toBe(200);
  });

  it("signs out every other session after a reset, and mails the password-changed notice", async () => {
    const sender = createMemorySender();
    const auth = createAuth(env, database, sender, makeLogger());
    await verifiedUser(auth, "sessions@example.com", "old-password-1");
    const other = await post(auth, "/sign-in/email", {
      email: "sessions@example.com",
      password: "old-password-1",
    });
    const cookie = other.headers
      .getSetCookie()
      .map((value) => value.split(";")[0])
      .join("; ");
    const session = (headers: Record<string, string>) =>
      auth.handler(new Request(`${BASE}/api/auth/get-session`, { headers }));
    expect(await (await session({ cookie })).json()).toMatchObject({
      user: { email: "sessions@example.com" },
    });

    await requestReset(auth, "sessions@example.com");
    await vi.waitFor(() => expect(resetMails(sender)).toHaveLength(1));
    const token = tokenFrom(sender.lastLinkTo("sessions@example.com"));
    await resetWith(auth, token, "new-password-1");

    expect(await (await session({ cookie })).json()).toBeNull();
    await vi.waitFor(() =>
      expect(sender.messages.map((message) => message.template)).toContain("password-changed"),
    );
  });
});

describe("change password", () => {
  async function signedInCookie(
    auth: ReturnType<typeof createAuth>,
    email: string,
    password: string,
  ) {
    await signUp(auth, email, password);
    await database.update(user).set({ emailVerified: true }).where(eq(user.email, email));
    const signIn = await post(auth, "/sign-in/email", { email, password });
    return signIn.headers
      .getSetCookie()
      .map((value) => value.split(";")[0])
      .join("; ");
  }

  function changePassword(
    auth: ReturnType<typeof createAuth>,
    cookie: string,
    currentPassword: string,
    newPassword: string,
  ) {
    return auth.handler(
      new Request(`${BASE}/api/auth/change-password`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: BASE, cookie },
        body: JSON.stringify({ currentPassword, newPassword }),
      }),
    );
  }

  it("mails the password-changed notice once the password is changed", async () => {
    const sender = createMemorySender();
    const auth = createAuth(env, database, sender, makeLogger());
    const cookie = await signedInCookie(auth, "changer@example.com", "old-password-1");

    const changed = await changePassword(auth, cookie, "old-password-1", "new-password-1");

    expect(changed.status).toBe(200);
    await vi.waitFor(() =>
      expect(sender.messages).toContainEqual(
        expect.objectContaining({ to: "changer@example.com", template: "password-changed" }),
      ),
    );
  });

  it("refuses a wrong current password and mails no notice", async () => {
    const sender = createMemorySender();
    const auth = createAuth(env, database, sender, makeLogger());
    const cookie = await signedInCookie(auth, "guesser@example.com", "old-password-1");

    const refused = await changePassword(auth, cookie, "not-the-password-1", "new-password-1");

    expect(refused.status).toBe(400);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(sender.messages.map((message) => message.template)).not.toContain("password-changed");
  });
});

describe("change email", () => {
  // The database persists between runs, so every run uses its own addresses.
  const run = randomUUID().slice(0, 8);
  const OLD = `old-address-${run}@example.com`;
  const NEW = `new-address-${run}@example.com`;
  const TAKEN = `taken-${run}@example.com`;
  const REQUESTER = `requester-${run}@example.com`;
  const FREE = `free-${run}@example.com`;
  const RETURN_TO = `${BASE}/email-changed`;

  async function signedIn(auth: ReturnType<typeof createAuth>, email: string) {
    await signUp(auth, email, "mover-password-1");
    await database.update(user).set({ emailVerified: true }).where(eq(user.email, email));
    const response = await post(auth, "/sign-in/email", { email, password: "mover-password-1" });
    return response.headers
      .getSetCookie()
      .map((value) => value.split(";")[0])
      .join("; ");
  }

  function requestChange(auth: ReturnType<typeof createAuth>, cookie: string, newEmail: string) {
    return auth.handler(
      new Request(`${BASE}/api/auth/change-email`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: BASE, cookie },
        body: JSON.stringify({ newEmail, callbackURL: RETURN_TO }),
      }),
    );
  }

  // Opens an emailed link with the given session, the way a browser would.
  function open(auth: ReturnType<typeof createAuth>, link: string | undefined, cookie: string) {
    return auth.handler(new Request(link ?? "", { headers: { cookie } }));
  }

  function changeMails(sender: { messages: { template: string; to: string }[] }) {
    return sender.messages.filter(
      (message) =>
        message.template.startsWith("change-email") || message.template === "verify-new-email",
    );
  }

  it("sends the confirmation to the current address, and changes nothing until the new one is verified", async () => {
    const sender = createMemorySender();
    const auth = createAuth(env, database, sender, makeLogger());
    const cookie = await signedIn(auth, OLD);

    const response = await requestChange(auth, cookie, NEW);

    expect(response.status).toBe(200);
    await vi.waitFor(() => expect(changeMails(sender)).toHaveLength(1));
    expect(changeMails(sender)[0]).toMatchObject({ to: OLD, template: "change-email-confirm" });
    expect(await userRow(OLD)).toHaveLength(1);
    expect(await userRow(NEW)).toHaveLength(0);

    const confirmed = await open(auth, sender.lastLinkTo(OLD), cookie);
    expect(confirmed.status).toBe(302);
    await vi.waitFor(() => expect(changeMails(sender)).toHaveLength(2));
    expect(changeMails(sender)[1]).toMatchObject({ to: NEW, template: "verify-new-email" });
    expect(await userRow(OLD)).toHaveLength(1);
    expect(await userRow(NEW)).toHaveLength(0);

    const verified = await open(auth, sender.lastLinkTo(NEW), cookie);
    expect(verified.status).toBe(302);
    expect(await userRow(NEW)).toHaveLength(1);
    expect(await userRow(OLD)).toHaveLength(0);
  });

  it("answers an address that already has an account the same as a free one, and changes no account", async () => {
    const sender = createMemorySender();
    const auth = createAuth(env, database, sender, makeLogger());
    await signUp(auth, TAKEN, "taken-password-1");
    const cookie = await signedIn(auth, REQUESTER);

    const taken = await requestChange(auth, cookie, TAKEN);
    const free = await requestChange(auth, cookie, FREE);

    expect(taken.status).toBe(free.status);
    expect(await taken.json()).toEqual(await free.json());
    await vi.waitFor(() => expect(changeMails(sender)).toHaveLength(1));
    expect(changeMails(sender)).toEqual([expect.objectContaining({ to: REQUESTER })]);
    expect(await userRow(REQUESTER)).toHaveLength(1);
    expect(await userRow(TAKEN)).toHaveLength(1);
  });
});
