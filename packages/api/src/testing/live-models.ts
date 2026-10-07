/**
 * A `deps.fetch` that answers the live Model list requests: OpenRouter's models API with
 * `openRouter` (ids that support tools) and any Ollama host's `/api/tags` with `ollama` (installed
 * Model names). Anything else is an unexpected network call. Records the URLs it was called with.
 */
export function liveModelsFetch({
  openRouter = [],
  ollama = [],
}: {
  openRouter?: string[];
  ollama?: string[];
}) {
  const urls: string[] = [];
  const fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    urls.push(url);
    if (url === "https://openrouter.ai/api/v1/models") {
      return Response.json({
        data: openRouter.map((id) => ({
          id,
          name: `OpenRouter ${id}`,
          architecture: { input_modalities: ["text"] },
          supported_parameters: ["tools"],
        })),
      });
    }
    if (url.endsWith("/api/tags")) {
      return Response.json({ models: ollama.map((name) => ({ name, model: name })) });
    }
    throw new Error(`Unexpected network call in a test: ${url}`);
  }) as typeof globalThis.fetch;
  return { fetch, urls };
}
