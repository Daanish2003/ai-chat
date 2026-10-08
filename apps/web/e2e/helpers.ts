import { randomUUID } from "node:crypto";

import { expect, type Page } from "@playwright/test";

import { baseURL, fakeOllamaHost } from "./env";

const newUser = () => ({
  name: "E2E User",
  email: `e2e-${randomUUID()}@example.com`,
  password: "password1234",
});

/**
 * Signs up a new user (so tests don't share data) and lands on the new Conversation page.
 * Better Auth allows a few sign-ups per 10 s from one address, so a refused one waits and retries.
 */
export async function signUp(page: Page) {
  for (let attempt = 0; attempt < 10; attempt++) {
    const response = await page.request.post("/api/auth/sign-up/email", {
      data: newUser(),
      headers: { origin: baseURL },
    });
    if (response.status() === 429) {
      await page.waitForTimeout(Number(response.headers()["x-retry-after"] ?? 10) * 1000);
      continue;
    }
    expect(response.ok()).toBe(true);
    await page.goto("/c");
    await expect(page).toHaveURL(/\/c$/);
    return;
  }
  throw new Error("Sign-up stayed rate limited");
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

/** A signed-up user with the fake Ollama, on the new Conversation page. */
export async function signUpWithModel(page: Page) {
  await signUp(page);
  await addFakeOllama(page);
  await page.goto("/c");
  await expect(page.getByRole("button", { name: "Model" })).toContainText("e2e-model");
}

export function messageRows(page: Page) {
  return page.locator("[data-message-id]");
}

/** Sends `text` from the composer and waits for the whole reply. */
export async function send(page: Page, text: string) {
  await page.getByLabel("Message", { exact: true }).fill(text);
  await page.keyboard.press("Enter");
  await expect(messageRows(page).last()).toContainText("That's all.");
}
