import { citationPrompt } from "../../shared/chat/citations";

/**
 * The system prompts of one Run, in the order the Model reads them: the SDK's own (the citation
 * prompt when the reply may read the web, which users can't edit), then the user's Instructions.
 * The Project's Instructions (spec 5) stack after them, so the more specific level comes last.
 */
export function systemPromptsFor({
  web,
  instructions,
}: {
  /** Whether the reply offers the Web tools (`web_search`, `fetch_url`). */
  web: boolean;
  instructions: string | null;
}): string[] {
  return [...(web ? [citationPrompt] : []), ...(instructions ? [instructions] : [])];
}
