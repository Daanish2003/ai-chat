import type {
  PlaywrightTestArgs,
  PlaywrightTestOptions,
  PlaywrightWorkerArgs,
  PlaywrightWorkerOptions,
  TestType,
} from "@e2e-types/playwright-test";

import { chatPage } from "./chat-page";
import { slowMarker } from "./fake-ollama";
import type { HostFixture } from "./host";

/**
 * The end-to-end scenarios every Host runs: send and stream, Stop, re-attach on reload, edit and
 * Branch, Shared link, delete. Each Host passes its fixture (`host.ts`) and its `test`; the Host's
 * web server is its own Playwright config's job.
 */
export function registerSharedScenarios(
  test: TestType<
    PlaywrightTestArgs & PlaywrightTestOptions,
    PlaywrightWorkerArgs & PlaywrightWorkerOptions
  >,
  host: HostFixture,
) {
  const { expect } = test;
  const { messageRows, send, signInWithModel } = chatPage(expect, host);

  test.describe("shared scenarios", () => {
    test("the first Message of a new Conversation is sent, streamed and kept", async ({ page }) => {
      await signInWithModel(page);

      await send(page, "Hello from the end-to-end test");

      await expect(page).toHaveURL(host.paths.conversation);
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
      await signInWithModel(page);
      await send(page, "First question");
      await send(page, "Second question");

      await expect(messageRows(page)).toHaveCount(4);
      await expect(messageRows(page).nth(2)).toContainText("Second question");
    });

    test("Stop ends a reply early and marks it Stopped", async ({ page }) => {
      await signInWithModel(page);
      await page.getByLabel("Message", { exact: true }).fill(`Take your time ${slowMarker}`);
      await page.keyboard.press("Enter");

      const stop = page.getByRole("button", { name: "Stop" });
      await expect(messageRows(page).last()).toContainText("You said");
      await stop.click();

      await expect(messageRows(page).last()).toContainText("Stopped");
      await expect(messageRows(page).last()).not.toContainText("That's all.");
      await expect(page.getByRole("button", { name: "Send" })).toBeVisible();
    });

    test("reloading during a streaming reply joins it live until it completes", async ({
      page,
    }) => {
      await signInWithModel(page);
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
      await signInWithModel(page);
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

    test("a Shared link shows the Conversation read-only to anyone", async ({ page, browser }) => {
      await signInWithModel(page);
      await send(page, "Something worth sharing");

      await page.getByRole("button", { name: "Share" }).click();
      const dialog = page.getByRole("dialog");
      await dialog.getByRole("button", { name: "Create link" }).click();
      const url = await dialog.getByText(host.paths.sharedLink).textContent();

      // The link row stays inside the dialog.
      expect(await dialog.evaluate((element) => element.scrollWidth - element.clientWidth)).toBe(0);

      const visitor = await browser.newPage();
      await visitor.goto(url!);
      await expect(visitor.getByText("Something worth sharing").first()).toBeVisible();
      await expect(visitor.getByRole("button", { name: "Edit" })).toHaveCount(0);

      await visitor.goto(host.paths.shared("no-such-token"));
      await expect(visitor.getByText("Shared link not found")).toBeVisible();
      await visitor.close();
    });

    test("deleting a Conversation confirms, then removes it from the panel", async ({ page }) => {
      await signInWithModel(page);
      await send(page, "Delete me");
      await expect(page).toHaveURL(host.paths.conversation);
      const panel = page.getByRole("complementary", { name: "Conversations" });
      await expect(panel.getByRole("link")).toHaveCount(1);

      // The browser's confirm dialog says yes.
      page.once("dialog", (dialog) => dialog.accept());
      await page.getByRole("button", { name: /^Actions for / }).click();
      await page.getByRole("menuitem", { name: "Delete", exact: true }).click();

      await expect(panel.getByRole("link")).toHaveCount(0);
      await expect(page).not.toHaveURL(host.paths.conversation);
    });
  });
}
