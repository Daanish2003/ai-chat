import { expect, type Locator, type Page } from "@playwright/test";

import { baseURL, fakeOllamaHost } from "./env";
import { type SeededUser, seedUser } from "./seed-user";

/** Retries after a 429 from Better Auth's per-IP limit on sign-in and password change. */
const MAX_RATE_LIMIT_RETRIES = 3;

/**
 * Clicks a form's submit button and waits for Better Auth's response to `path`. Better Auth allows
 * 3 requests per 10 seconds from one IP to sign-in and password-change endpoints, and every test
 * shares that IP, so a 429 waits out its `X-Retry-After` window and submits again. The form keeps
 * its values after an error, so a retry needs no refill.
 */
export async function submitAuthForm(page: Page, button: Locator, path: string) {
  for (let retry = 0; ; retry++) {
    const response = page.waitForResponse(
      (r) => r.url().includes(path) && r.request().method() === "POST",
    );
    await button.click();
    const result = await response;
    if (result.status() !== 429 || retry === MAX_RATE_LIMIT_RETRIES) return result;
    const retryAfter = Number(result.headers()["x-retry-after"] ?? 10);
    await page.waitForTimeout((retryAfter + 1) * 1000);
  }
}

/** Signs in on the login form, backing off on a rate limit. Returns the sign-in response. */
export async function signInOnForm(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByRole("button", { name: "Already have an account? Sign In" }).click();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  return submitAuthForm(
    page,
    page.getByRole("button", { name: "Sign In" }),
    "/api/auth/sign-in/email",
  );
}

/** Signs in as a new seeded, verified user (so tests don't share data) on the new Conversation page. */
export async function signInAsSeededUser(page: Page): Promise<SeededUser> {
  const seeded = await seedUser(page);
  await page.goto("/c");
  await expect(page).toHaveURL(/\/c$/);
  return seeded;
}

export type CapturedMail = { template: string; subject: string; text: string };

/** The messages the capture mailbox holds for `email`, oldest first. */
export async function mailboxFor(page: Page, email: string): Promise<CapturedMail[]> {
  const response = await page.request.get(`${baseURL}/api/test-mailbox`, { params: { email } });
  expect(response.ok()).toBe(true);
  return response.json();
}

/** Waits until the mailbox holds `count` messages for `email` (sends run after the response). */
export async function waitForMail(page: Page, email: string, count = 1): Promise<CapturedMail[]> {
  let messages: CapturedMail[] = [];
  await expect
    .poll(async () => (messages = await mailboxFor(page, email)).length, { timeout: 15_000 })
    .toBeGreaterThanOrEqual(count);
  return messages;
}

/** The verification link in a message's plain text. */
export function verificationLink(mail: CapturedMail): string {
  const match = /https?:\/\/\S*verify-email\?token=\S+/.exec(mail.text);
  if (!match) throw new Error(`no verification link in "${mail.subject}"`);
  return match[0];
}

/** Saves Ollama credentials pointing at the fake Ollama host, so its Model can be picked. */
export async function addFakeOllama(page: Page) {
  await page.goto("/settings/keys");
  const row = page.getByRole("listitem").filter({ hasText: "Ollama" });
  await row.getByRole("button", { name: "Add" }).click();
  await page.getByLabel("Host").fill(fakeOllamaHost);
  await page.getByRole("button", { name: "Check & save" }).click();
  await expect(row.getByText("Verified")).toBeVisible();
}

/** A seeded user with the fake Ollama, on the new Conversation page. */
export async function signInAsSeededUserWithModel(page: Page) {
  await signInAsSeededUser(page);
  await addFakeOllama(page);
  await page.goto("/c");
  await expect(page.getByRole("button", { name: "Model" })).toContainText("e2e-model");
}

export function messageRows(page: Page) {
  return page.locator("[data-message-id]");
}

/** Sends `text` from the composer and waits for the whole reply. */
export async function send(page: Page, text: string) {
  // The composer ignores Enter while a reply streams; its button reads "Send" only once it is done.
  const sendButton = page.getByRole("button", { name: "Send", exact: true });
  await expect(sendButton).toBeVisible();
  await page.getByLabel("Message", { exact: true }).fill(text);
  await page.keyboard.press("Enter");
  await expect(messageRows(page).last()).toContainText("That's all.");
  await expect(sendButton).toBeVisible();
}
