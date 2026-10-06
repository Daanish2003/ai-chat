# Web search backend options

Research for [#3](https://github.com/Daanish2003/ai-chat/issues/3) (child of map [#1](https://github.com/Daanish2003/ai-chat/issues/1)). Researched 2026-10-06.

## Question

Which web search backend should the v1 web-search tool use? Compare provider-native search (Anthropic web search tool, OpenAI web search) with Tavily, Exa and Brave Search API on cost/free tier, result quality for chat grounding, citation data, latency, and how each plugs into TanStack AI tool calling for both providers.

## Answer

Two ways to wire search into TanStack AI:

1. **Provider-native.** Use `webSearchTool` from `@tanstack/ai-anthropic/tools` and `@tanstack/ai-openai/tools`. The provider runs the search and returns citations. You need no extra API key and no `execute` code. You do need two tool configs, though, and TanStack AI hands back citation data in two different shapes.
2. **Third-party API as a custom server tool.** Define one `toolDefinition({ name: 'web_search', execute })` that calls Tavily, Exa or Brave. The same tool and the same result shape work for every model. You pick the result schema, so the UI renders one shape.

**Recommendation: Tavily, behind a single custom server tool.** The free tier (1,000 basic searches a month, no card) means v1 search costs $0. The tool works the same on Anthropic and OpenAI. The Message gets one tool-call part shape that we design. Provider-native search is the fallback if Tavily's results turn out weak in practice. It is about $0.01 per search plus tokens, and the main risk is that the two providers return citations in different shapes (see below).

## Comparison

| Backend | Price | Free tier | Citation data you get | Plugs into TanStack AI as |
|---|---|---|---|---|
| Anthropic web search (server tool) | **$10 / 1,000 searches** plus token cost; results count as input tokens in this turn *and later turns*; failed searches not billed [A1] | None (pay as you go) | Inline `web_search_result_location` citations (`url`, `title`, `cited_text` ≤150 chars, `encrypted_index`); results have `url`, `title`, `page_age`, `encrypted_content` [A1] | Provider tool `webSearchTool` from `@tanstack/ai-anthropic/tools` [T1] |
| OpenAI web search (Responses API) | Reasoning models: **$10 / 1k calls** + search content tokens at model input rate. Non-reasoning models: **$25 / 1k calls**, search content tokens free [O2] | None | `url_citation` annotations (`url`, `title`, `start_index`, `end_index`) plus `sources` list of all URLs consulted [O1] | Provider tool `webSearchTool` from `@tanstack/ai-openai/tools` (needs the default `openaiText` Responses adapter) [T1][T4] |
| Tavily | 1 credit basic/fast/ultra-fast, 2 credits advanced; **$0.008 / credit** pay as you go; plans $30–$500/month [V1][V2] | **1,000 credits / month, no card** [V1] | Per result `title`, `url`, `content` snippet, `score`, optional `raw_content`, `published_date`; optional LLM `answer`; `response_time` [V2] | Custom `toolDefinition` with server `execute` [T2] |
| Exa | Search: instant $4, fast/auto $7, deep $12, deep-reasoning $15 per 1k (≤10 results); contents **$1 / 1k pages per content type** (text, highlights, summary) [E1] | **$10 credit, resets monthly, no payment method** [E1] | Per result `title`, `url`, `publishedDate`, `author`, optional `text` / `highlights` (+ scores) / `summary`; `costDollars` breakdown [E2] | Custom `toolDefinition` |
| Brave Search API | Search plan **$5 / 1k requests**, 50 qps; Answers plan $4 / 1k + $5 / M tokens, 2 qps [B1] | **$5 credits / month** (≈1,000 searches); **card required** for identity [B1] | Per result `title`, `url`, `description`, optional up to 5 `extra_snippets` [B2] | Custom `toolDefinition` |

### Cost at hobby scale (worked example: 300 searches/month)

- Tavily basic: 300 credits, inside the free 1,000 → **$0**.
- Brave: 300 × $0.005 = $1.50, inside the $5 credit → **$0** (but needs a card).
- Exa auto + highlights: 300 × ($0.007 + $0.001) = $2.40, inside the $10 credit → **$0**.
- Anthropic native: 300 × $0.01 = **$3** plus the result tokens, which stay in context on later turns of the Conversation.
- OpenAI native: **$3** on reasoning models plus tokens, or **$7.50** on non-reasoning models.

These are arithmetic on the cited list prices. Real token overhead from native search depends on result size and was not measured.

## TanStack AI integration details

Versions read from the TanStack/ai repo at commit `a32782c` (2026-10-06): `@tanstack/ai` 0.64.1, `@tanstack/ai-anthropic` 0.19.4, `@tanstack/ai-openai` 0.26.0.

- **Provider tools** come from each adapter's `/tools` subpath and go in `chat({ tools: [...] })`. The provider runs them, and the agent loop never runs them on our side. They show up as a provider-executed `tool-call` part on the assistant message. TanStack AI keeps their results on the message, so a follow-up `chat()` call that passes in the earlier messages still sees the evidence [T1].
- **Compile-time guard.** Each provider-tool factory returns a `ProviderTool<provider, kind>` brand. The adapter's per-model `supports.tools` then decides whether that tool may be passed to that model. Passing an Anthropic tool to an OpenAI adapter, or to a model without support, is a TypeScript error [T1]. In practice we need **one tools array per provider**, chosen by the model picker.
- **Model support** [T1]: every Anthropic model in TanStack AI's model list supports web search except `claude-opus-5-fast`, which supports no tools. On OpenAI, the GPT-5, O-series, GPT-6 and GPT-4-series models support `webSearchTool`. GPT-3.5 and audio models support none.
- **Name clash**: `webSearchTool()` and a custom function also named `web_search` cannot go in the same array. Doing so throws `DuplicateToolNameError` [T1].
- **Citation shape differs by provider (important for the UI):**
  - *OpenAI*: the adapter automatically adds `include: ['web_search_call.action.sources']`. It turns `url_citation` annotations into a common `metadata.sources` array (`url`, `title?`, `pageAge?`), which you read with `getProviderExecutedMetadata(part)`. The raw `urlCitations` stay under `metadata.openai` [T1][T4].
  - *Anthropic*: the adapter sends the server tool as a provider-executed tool call. The **raw** `web_search_tool_result` content sits under `metadata.anthropic.result` [T3]. It does **not** fill the common `metadata.sources`; the docs list only OpenAI and Gemini for that [T1]. Searching `packages/ai-anthropic/src` found no handling of `citations_delta`, so the inline `web_search_result_location` citations on text blocks are dropped. The UI would have to build the source list from `metadata.anthropic.result`.
  - *Anthropic tool version*: the adapter always sends `type: 'web_search_20250305'` [T3]. Anthropic's newer `web_search_20260209` / `web_search_20260318` versions add dynamic filtering, which cuts token use [A1]. TanStack AI cannot use them yet.
- **Custom server tool** (Tavily, Exa or Brave): `toolDefinition({ name, description, inputSchema, outputSchema }).server(async (args) => ...)`, using a Zod schema. TanStack runs it automatically, adds the result to the conversation history and continues the chat [T2]. The same definition works with both adapters. We choose the output schema, for example `{ results: [{ title, url, snippet, publishedDate? }] }`. The model is then prompted to cite in markdown. You get no character-span citations like the native tools give.
- Tavily, Exa and Brave can all be called with plain `fetch`. No SDK dependency is required (Brave: `GET https://api.search.brave.com/res/v1/web/search`, header `X-Subscription-Token` [B2]).

## Quality and latency

- **No first-party benchmarks compare these on the same footing.** Each vendor describes its own product: Brave sends AI uses to an "LLM Context" endpoint that it calls "benchmarked as the most powerful Search API for AI" [B2], and Tavily and Exa market themselves for agents. I treated none of these as evidence.
- **Latency.** Tavily offers `basic`, `fast` (lower latency) and `ultra-fast` (lowest latency) depths at 1 credit each, and returns `response_time` [V2]. The only latency figure Exa states is for `deep-lite`, at about 4 s [E2]. Anthropic says only that "there will be a pause while the search runs" while streaming, and a long search turn can come back as `stop_reason: "pause_turn"` [A1]. None of the others publish a number.
- **Grounding.** The native tools have the model write the answer with citations tied to exact text spans. With custom tools, the model only sees snippets: Tavily `content` (multiple snippets per URL on basic, fast and advanced depths), Exa `highlights`, or Brave `description` plus `extra_snippets`.

## Could not verify

- How result quality and real latency compare between providers. No neutral primary benchmark exists, and I did not measure them.
- OpenAI's model list. The OpenAI web search guide named `gpt-6-astra`, `gpt-5.5`, `gpt-4.1` and `gpt-4.1-mini` [O1]. TanStack's matrix is broader [T1]. I did not check this per model.
- The exact Tavily plan price per credit tier. The pricing page uses a slider and shows only "$30–$500/month" [V2].
- Brave's AI-use rights. The pricing page says that *storing* results (for example, for LLM training) needs a plan that grants storage rights [B1]. I found no explicit clause on showing results inside a chatbot in what I read. Read the ToS before choosing Brave.
- Whether TanStack AI exposes Anthropic's inline citations in some other way, such as a later version or the raw chunk passthrough. I based this on reading the source, not on running it.

## Implications for this app

- **Recommended v1 design:** one server-side `web_search` `toolDefinition` that calls Tavily (`search_depth: 'basic'`, `max_results` around 5) through `fetch`. It returns `{ title, url, snippet, publishedDate? }[]` and is passed to `chat()` the same way for both Anthropic and OpenAI models. Add a `TAVILY_API_KEY` server env var to `apps/web/.env.schema`. That is a config change, not a new package, unless we choose `@tavily/core` (a new dependency, so a human decision under AGENTS.md §6).
- **The UI ticket ("how tool calls appear")** gets a single shape to render: a `tool-call` part named `web_search`, with our own output schema, the same for every model. If we go provider-native instead, the UI needs two adapters: OpenAI `metadata.sources` and Anthropic `metadata.anthropic.result`. It would also get no inline citation spans from Anthropic.
- **Persistence / Branches.** Native tool results must round-trip exactly. Anthropic's `encrypted_content` is required on later turns, or the request fails with a 400 [A1]. The stored Message parts therefore have to keep the provider metadata untouched. A custom tool's result is plain JSON that we own, which makes saving it to Postgres, editing and regenerating simpler.
- **Cost guard.** No quotas are planned, but a hard cap on searches per reply (`max_uses` natively; for the custom tool, `chat({ agentLoopStrategy })`, which defaults to `maxIterations(5)` model turns [T5]) stops a runaway agent loop from burning credits.
- **Testing ticket.** A custom `execute` can be mocked or replayed from a recorded fixture with no provider involved. Native search can only be tested against recorded provider streams.
- **Fallback.** If Tavily's quality disappoints, switching to native means changing only the tools array and the UI's source extractor. Switching to Exa or Brave means changing only the `execute` body.

## Sources

- [A1] Anthropic, *Web search tool*: https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool
- [O1] OpenAI, *Web search guide*: https://developers.openai.com/api/docs/guides/tools-web-search
- [O2] OpenAI, *Pricing* (tools section): https://developers.openai.com/api/docs/pricing
- [V1] Tavily, *Pricing*: https://www.tavily.com/pricing
- [V2] Tavily, *API credits*: https://docs.tavily.com/documentation/api-credits and *Search endpoint*: https://docs.tavily.com/documentation/api-reference/endpoint/search
- [E1] Exa, *Pricing*: https://exa.ai/pricing
- [E2] Exa, *Search reference*: https://exa.ai/docs/reference/search
- [B1] Brave, *Search API*: https://brave.com/search/api/
- [B2] Brave, *Web search get started*: https://api-dashboard.search.brave.com/app/documentation/web-search/get-started
- [T1] TanStack AI, `docs/tools/provider-tools.md`: https://github.com/TanStack/ai/blob/a32782c3e5674cb94f53adc1cc4e5a51bc11c121/docs/tools/provider-tools.md
- [T2] TanStack AI, `docs/tools/server-tools.md`: https://github.com/TanStack/ai/blob/a32782c3e5674cb94f53adc1cc4e5a51bc11c121/docs/tools/server-tools.md
- [T3] TanStack AI, `packages/ai-anthropic/src/tools/web-search-tool.ts` and `packages/ai-anthropic/src/adapters/text.ts` (server tool result handling): https://github.com/TanStack/ai/tree/a32782c3e5674cb94f53adc1cc4e5a51bc11c121/packages/ai-anthropic/src
- [T4] TanStack AI, `packages/ai-openai/src/adapters/text.ts` (adds `web_search_call.action.sources`) and `packages/openai-base/src/adapters/responses-text.ts` (`metadata.sources`): https://github.com/TanStack/ai/tree/a32782c3e5674cb94f53adc1cc4e5a51bc11c121/packages
- [T5] TanStack AI, `docs/chat/agentic-cycle.md`: https://github.com/TanStack/ai/blob/a32782c3e5674cb94f53adc1cc4e5a51bc11c121/docs/chat/agentic-cycle.md
