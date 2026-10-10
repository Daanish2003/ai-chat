import { expect, test } from "@playwright/test";

import { slowMarker } from "./fake-ollama";
import {
  messageRows,
  send,
  signInAsSeededUser,
  signInAsSeededUserWithModel,
  signInOnForm,
} from "./helpers";

test("the home page sends a signed-out visitor to log in", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
});

test("a seeded user is signed in, and its password signs in on the form", async ({ page }) => {
  const user = await signInAsSeededUser(page);
  await page.goto("/settings/keys");
  await expect(page.getByRole("heading", { name: "Keys & settings" })).toBeVisible();

  await page.context().clearCookies();
  await signInOnForm(page, user.email, user.password);
  await expect(page).toHaveURL(/\/c$/);
});

test("the first Message of a new Conversation is sent, streamed and kept", async ({ page }) => {
  await signInAsSeededUserWithModel(page);

  await send(page, "Hello from the end-to-end test");

  await expect(page).toHaveURL(/\/c\/[\w-]+$/);
  await expect(messageRows(page)).toHaveCount(2);
  await expect(messageRows(page).first()).toContainText("Hello from the end-to-end test");
  await expect(messageRows(page).last()).toContainText("const answer = 42;");
  // A live-listed Model's badge is its name, not its "provider:model" id.
  await expect(messageRows(page).last()).toContainText("e2e-model");
  await expect(messageRows(page).last()).not.toContainText("ollama:");

  await page.reload();
  await expect(messageRows(page)).toHaveCount(2);
  await expect(messageRows(page).last()).toContainText("That's all.");
  await expect(
    page.getByRole("complementary", { name: "Conversations" }).getByRole("link"),
  ).toHaveCount(1);
});

test("a follow-up continues the Conversation", async ({ page }) => {
  await signInAsSeededUserWithModel(page);
  await send(page, "First question");
  await send(page, "Second question");

  await expect(messageRows(page)).toHaveCount(4);
  await expect(messageRows(page).nth(2)).toContainText("Second question");
});

test("Stop ends a reply early and marks it Stopped", async ({ page }) => {
  await signInAsSeededUserWithModel(page);
  await page.getByLabel("Message", { exact: true }).fill(`Take your time ${slowMarker}`);
  await page.keyboard.press("Enter");

  const stop = page.getByRole("button", { name: "Stop" });
  await expect(messageRows(page).last()).toContainText("You said");
  await stop.click();

  await expect(messageRows(page).last()).toContainText("Stopped");
  await expect(messageRows(page).last()).not.toContainText("That's all.");
  await expect(page.getByRole("button", { name: "Send" })).toBeVisible();
});

test("reloading during a streaming reply joins it live until it completes", async ({ page }) => {
  await signInAsSeededUserWithModel(page);
  await page.getByLabel("Message", { exact: true }).fill(`Keep going ${slowMarker}`);
  await page.keyboard.press("Enter");
  await expect(messageRows(page).last()).toContainText("You said");

  await page.reload();

  await expect(page.getByRole("button", { name: "Stop" })).toBeVisible();
  await expect(messageRows(page).last()).toContainText("That's all.");
  await expect(page.getByRole("button", { name: "Send" })).toBeVisible();
  await page.reload();
  await expect(messageRows(page)).toHaveCount(2);
  await expect(messageRows(page).last()).toContainText("That's all.");
});

test("editing a Message and regenerating a reply each start a new Branch", async ({ page }) => {
  await signInAsSeededUserWithModel(page);
  await send(page, "Original question");

  const userRow = messageRows(page).first();
  await userRow.hover();
  await userRow.getByRole("button", { name: "Edit" }).click();
  await userRow.getByLabel("Edit Message").fill("Edited question");
  await userRow.getByRole("button", { name: "Save & submit" }).click();
  await expect(messageRows(page).last()).toContainText("Edited question");
  await expect(messageRows(page).last()).toContainText("That's all.");
  await expect(messageRows(page).first()).toContainText("2/2");

  await messageRows(page).first().getByRole("button", { name: "Previous Branch" }).click();
  await expect(messageRows(page).first()).toContainText("Original question");
  await expect(messageRows(page).first()).toContainText("1/2");

  const reply = messageRows(page).last();
  await reply.hover();
  await reply.getByRole("button", { name: "Regenerate" }).click();
  await expect(messageRows(page).last()).toContainText("2/2");
  await expect(messageRows(page).last()).toContainText("That's all.");
});

test("the palette opens with the platform's shortcut and finds a Message", async ({ page }) => {
  await signInAsSeededUserWithModel(page);
  await send(page, "Remember the word pineapple");
  await page.goto("/c");

  const shortcut = process.platform === "darwin" ? "⌘K" : "Ctrl+K";
  await expect(page.getByRole("banner").locator("kbd")).toHaveText(shortcut);

  await page.keyboard.press(process.platform === "darwin" ? "Meta+K" : "Control+K");
  const palette = page.getByRole("dialog");
  await palette.getByRole("combobox", { name: /^Search Conversations/ }).fill("pineapple");
  const hit = palette.getByRole("group", { name: "In Messages" }).getByRole("option").first();
  await expect(hit).toContainText("pineapple");
  await hit.click();

  await expect(page).toHaveURL(/\/c\/[\w-]+/);
  await expect(messageRows(page).first()).toContainText("Remember the word pineapple");
});

test("a Shared link shows the Conversation read-only to anyone", async ({ page, browser }) => {
  await signInAsSeededUserWithModel(page);
  await send(page, "Something worth sharing");

  await page.getByRole("button", { name: "Share" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Create link" }).click();
  const url = await dialog.getByText(/\/share\//).textContent();

  // The link row stays inside the dialog.
  expect(await dialog.evaluate((element) => element.scrollWidth - element.clientWidth)).toBe(0);

  const visitor = await browser.newPage();
  await visitor.goto(url!);
  await expect(visitor.getByText("Something worth sharing").first()).toBeVisible();
  await expect(visitor.getByRole("button", { name: "Edit" })).toHaveCount(0);

  await visitor.goto("/share/no-such-token");
  await expect(visitor.getByText("Shared link not found")).toBeVisible();
  await visitor.close();
});

test("on a wide screen the composer lines up with the Messages", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1000 });
  await signInAsSeededUserWithModel(page);
  await send(page, "Line me up");

  const avatarColumn = (await messageRows(page).first().locator("> div").boundingBox())!;
  const composer = (await page.getByLabel("Message", { exact: true }).boundingBox())!;
  expect(avatarColumn.width).toBeLessThanOrEqual(896);
  expect(
    Math.abs(composer.x + composer.width / 2 - (avatarColumn.x + avatarColumn.width / 2)),
  ).toBeLessThan(2);
});

test("the Conversation panel stays collapsed after a reload", async ({ page }) => {
  await signInAsSeededUser(page);
  const panel = page.getByRole("complementary", { name: "Conversations" });
  await expect(panel).toBeVisible();

  await page.getByRole("button", { name: "Conversations" }).click();
  await expect(panel).toBeHidden();
  await page.reload();
  await expect(panel).toBeHidden();

  await page.getByRole("button", { name: "Show Conversations" }).click();
  await expect(panel).toBeVisible();
});
