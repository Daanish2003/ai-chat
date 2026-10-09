import type { Source } from "@ai-chat/api/shared/chat/sources";
import { Markdown } from "@ai-chat/ui/components/prompt-kit/markdown";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { replyComponents, ReplySources } from "./source-chips";

const sources: Source[] = [
  { number: 1, url: "https://tanstack.com/ai", title: "TanStack AI", snippet: "Docs" },
  { number: 2, url: "https://example.com/blog", title: "Blog", snippet: "Post" },
];

const render = (markdown: string) =>
  renderToStaticMarkup(
    createElement(
      ReplySources.Provider,
      { value: sources },
      createElement(Markdown, { components: replyComponents, children: markdown }),
    ),
  );

describe("a reply's links", () => {
  it("render a link to one of this Message's Sources as its numbered citation chip", () => {
    const html = render("Lazy tools ([tanstack.com](https://tanstack.com/ai)).");

    expect(html).toMatch(
      /<a href="https:\/\/tanstack\.com\/ai"[^>]*data-slot="hover-card-trigger"><span[^>]*>1<\/span><\/a>/,
    );
    expect(html).not.toContain(">tanstack.com<");
  });

  it("leave any other link plain, opening in a new tab without referrer or endorsement", () => {
    const html = render("See [the spec](https://other.dev/spec).");

    expect(html).toContain(
      '<a href="https://other.dev/spec" target="_blank" rel="noopener noreferrer nofollow">the spec</a>',
    );
  });

  it("give citation chips the same new-tab rel", () => {
    expect(render("([x](https://example.com/blog))")).toContain(
      'target="_blank" rel="noopener noreferrer nofollow"',
    );
  });
});
