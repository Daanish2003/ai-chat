import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { createCaptureMailbox } from "../src/capture";
import { renderTemplate } from "../src/templates";

const FROM = "Acme Chat <no-reply@example.com>";
const APP = "Acme Chat";
const TEN_MINUTES = 10 * 60 * 1000;

function clock(start = 1_000_000) {
  let now = start;
  return {
    now: () => now,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

async function messageTo(to: string, url = "https://chat.example.com/verify?token=abc") {
  return renderTemplate("verify-email", to, { appName: APP, url });
}

describe("capture mailbox", () => {
  it("keys messages by a hash of the lowercased address, never the raw address", async () => {
    const mailbox = createCaptureMailbox({ from: FROM });
    await mailbox.sender.send(await messageTo("Person@Example.com"));

    const expected = createHash("sha256").update("person@example.com").digest("hex");
    expect(mailbox.read("person@example.com")).toHaveLength(1);
    expect(mailbox.read("PERSON@example.com")).toHaveLength(1);
    expect(mailbox.keys()).toEqual([expected]);
    expect(mailbox.keys().join("")).not.toContain("person");
  });

  it("returns the messages for an address oldest first, with template, subject and text", async () => {
    const mailbox = createCaptureMailbox({ from: FROM });
    const first = await messageTo("person@example.com", "https://chat.example.com/verify?token=1");
    const second = await messageTo("person@example.com", "https://chat.example.com/verify?token=2");
    await mailbox.sender.send(first);
    await mailbox.sender.send(second);
    await mailbox.sender.send(await messageTo("other@example.com"));

    const messages = mailbox.read("person@example.com");
    expect(messages.map((message) => message.subject)).toEqual([first.subject, second.subject]);
    expect(messages[0]).toMatchObject({ template: "verify-email", subject: first.subject });
    expect(messages[0]?.text).toContain("token=1");
    expect(messages[1]?.text).toContain("token=2");
  });

  it("drops messages ten minutes after they were sent", async () => {
    const time = clock();
    const mailbox = createCaptureMailbox({ from: FROM, now: time.now });
    await mailbox.sender.send(await messageTo("person@example.com"));

    time.advance(TEN_MINUTES - 1);
    expect(mailbox.read("person@example.com")).toHaveLength(1);

    time.advance(1);
    expect(mailbox.read("person@example.com")).toHaveLength(0);
    expect(mailbox.keys()).toEqual([]);
  });

  it("refuses what the header checks refuse", async () => {
    const mailbox = createCaptureMailbox({ from: FROM });
    const message = await messageTo("not-an-address");

    await expect(mailbox.sender.send(message)).rejects.toThrow(/invalid recipient/);
    await expect(
      mailbox.sender.send({ ...(await messageTo("person@example.com")), subject: "bad\nsubject" }),
    ).rejects.toThrow(/one non-empty line/);
    expect(mailbox.keys()).toEqual([]);
  });
});
