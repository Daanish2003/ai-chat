import { randomUUID } from "node:crypto";

import { expect, type Page } from "@playwright/test";

import { fakeOllamaHost } from "./env";
import { type SeededUser, seedUser } from "./seed-user";

const newUser = () => ({
  name: "E2E User",
  email: `e2e-${randomUUID()}@example.com`,
  password: "password1234",
});

/** Signs in as a new seeded, verified user (so tests don't share data) on the new Conversation page. */
export async function signInAsSeededUser(page: Page): Promise<SeededUser> {
  const seeded = await seedUser(page);
  await page.goto("/c");
  await expect(page).toHaveURL(/\/c$/);
  return seeded;
}

/** Signs up through the form, retrying while it is rate limited. */
export async function signUpWithForm(page: Page) {
  await page.goto("/login");
  const user = newUser();
  await page.getByLabel("Name").fill(user.name);
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  const tooMany = page.getByText(/too many requests/i);
  for (let attempt = 0; attempt < 10; attempt++) {
    await page.getByRole("button", { name: "Sign Up" }).click();
    await expect(
      page.getByText(/too many requests/i).or(page.getByRole("navigation", { name: "App" })),
    ).toBeAttached({ timeout: 15_000 });
    if (!(await tooMany.isVisible())) break;
    await page.waitForTimeout(10_000);
  }
  await expect(page).toHaveURL(/\/c$/);
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
