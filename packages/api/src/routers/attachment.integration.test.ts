import { attachment, attachmentBlob } from "@ai-chat/db/schema/attachment";
import { getTestDb } from "@ai-chat/db/testing/test-database";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { maxAttachmentBytes } from "../attachments/kinds";
import { insertAttachment, linkTestAttachments } from "../testing/attachments";
import { insertConversation, insertMessage } from "../testing/conversations";
import { createTestClient, insertUser } from "../testing/router-client";

const file = (contents: string | Uint8Array<ArrayBuffer>, name: string, type: string) =>
  new File([contents], name, { type });

describe("attachment.upload", () => {
  it("stores the file and returns its id and metadata", async () => {
    const user = await insertUser();
    const client = createTestClient({ user });

    const uploaded = await client.attachment.upload({
      file: file("# Notes", "notes.md", "text/markdown"),
    });

    expect(uploaded).toEqual({
      id: expect.any(String),
      filename: "notes.md",
      mediaType: "text/markdown",
      size: 7,
    });
    const [blob] = await getTestDb()
      .select()
      .from(attachmentBlob)
      .where(eq(attachmentBlob.attachmentId, uploaded.id));
    expect(blob?.bytes.toString("utf8")).toBe("# Notes");
  });

  it("stores a text file the browser gave no type as text/plain", async () => {
    const client = createTestClient({ user: await insertUser() });

    const uploaded = await client.attachment.upload({ file: file("fn main() {}", "main.rs", "") });

    expect(uploaded.mediaType).toBe("text/plain");
  });

  it("refuses a type that can't be attached", async () => {
    const client = createTestClient({ user: await insertUser() });

    await expect(
      client.attachment.upload({ file: file("<svg/>", "a.svg", "image/svg+xml") }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST", message: expect.stringContaining("a.svg") });
  });

  it("refuses a text file that isn't UTF-8 text", async () => {
    const client = createTestClient({ user: await insertUser() });

    await expect(
      client.attachment.upload({ file: file(new Uint8Array([0xff, 0xfe, 0xfd]), "a.txt", "") }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("refuses a file over 5 MB", async () => {
    const client = createTestClient({ user: await insertUser() });

    await expect(
      client.attachment.upload({
        file: file(new Uint8Array(maxAttachmentBytes + 1), "big.png", "image/png"),
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST", message: expect.stringContaining("5 MB") });
  });

  it("refuses a signed-out caller", async () => {
    await expect(
      createTestClient().attachment.upload({ file: file("x", "a.txt", "text/plain") }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("deletes attachments that no Message uses after 24 hours", async () => {
    const user = await insertUser();
    const longAgo = new Date(Date.now() - 25 * 60 * 60 * 1000);
    const oldOrphan = await insertAttachment(user, { createdAt: longAgo });
    const freshOrphan = await insertAttachment(user);
    const oldLinked = await insertAttachment(user, { createdAt: longAgo });
    const conv = await insertConversation(user);
    const sent = await insertMessage({ conversationId: conv.id, role: "user", text: "Hi" });
    await linkTestAttachments(sent.id, [oldLinked.id]);

    const uploaded = await createTestClient({ user }).attachment.upload({
      file: file("x", "b.txt", "text/plain"),
    });

    const left = await getTestDb().select({ id: attachment.id }).from(attachment);
    expect(left.map((row) => row.id).toSorted()).toEqual(
      [freshOrphan.id, oldLinked.id, uploaded.id].toSorted(),
    );
    expect(left.map((row) => row.id)).not.toContain(oldOrphan.id);
  });
});
