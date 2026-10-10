import { citationPrompt } from "../../shared/chat/citations";

/**
 * The system prompts of one Run, in the order the Model reads them: the SDK's own (the citation
 * prompt when the reply may search, which users can't edit), then the user's Instructions. The
 * Project's Instructions (spec 5) stack after them, so the more specific level comes last.
 */
export function systemPromptsFor({
  webSearch,
  instructions,
}: {
  webSearch: boolean;
  instructions: string | null;
}): string[] {
  return [...(webSearch ? [citationPrompt] : []), ...(instructions ? [instructions] : [])];
}
