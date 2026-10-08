import { describe, expect, it } from "vitest";

import { faviconUrl } from "./favicon";

describe("faviconUrl", () => {
  it("asks the favicon service for the hostname only, never the page's path or query", () => {
    const url = faviconUrl("https://docs.example.com/private/page?token=secret#part");

    expect(url).toBe("https://www.google.com/s2/favicons?sz=64&domain=docs.example.com");
    expect(url).not.toContain("private");
    expect(url).not.toContain("secret");
  });

  it("is null for something that isn't a URL", () => {
    expect(faviconUrl("not a url")).toBeNull();
  });
});
