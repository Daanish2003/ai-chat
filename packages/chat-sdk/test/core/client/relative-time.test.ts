import { describe, expect, it } from "vitest";

import { relativeTime } from "../../../core/client/relative-time";

const now = new Date("2026-10-06T12:00:00Z");
const ago = (seconds: number) => new Date(now.getTime() - seconds * 1000);

describe("relativeTime", () => {
  it.each([
    [ago(30), "just now"],
    [ago(5 * 60), "5m ago"],
    [ago(3 * 3600), "3h ago"],
    [ago(2 * 86400), "2d ago"],
  ])("shows %s as %s", (at, expected) => {
    expect(relativeTime(at, now)).toBe(expected);
  });

  it("shows a date from more than a week ago as month and day", () => {
    expect(relativeTime(new Date("2026-09-20T12:00:00Z"), now)).toBe("Sep 20");
  });
});
