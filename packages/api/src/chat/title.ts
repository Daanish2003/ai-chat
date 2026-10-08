import { conversation, message } from "@ai-chat/db/schema/chat";
import { chat } from "@tanstack/ai";
import { and, eq, isNull } from "drizzle-orm";

import { loadCredentials } from "../credentials/store";
import type { AppDeps } from "../deps";
import { loadSettings } from "../settings/store";
import { findModel } from "./models";
import { loadPath } from "./store";

const titlePrompt =
  "Write a short title (at most 6 words) for the conversation below. Reply with the title only: " +
  "no quotes, no trailing punctuation.";

/** How much of each Message the title call reads. */
const promptChars = 2_000;
/** The fallback title's length, before the ellipsis. */
const fallbackChars = 50;
const maxTitleChars = 100;

/**
 * Titles a Conversation after the run of `replyId` ended `complete`, while it has no title.
 * Asks the Title Model (`user_settings.titleModel`, else the Model that wrote the reply) with
 * the user's credentials for its Provider. Without credentials, or when the call fails, the title
 * is the start of the first Message. A title set meanwhile (a manual rename) is never overwritten.
 * Never throws: it runs fire-and-forget at the end of a run.
 */
export async function titleConversation(deps: AppDeps, replyId: string): Promise<void> {
  try {
    const [row] = await deps.db
      .select({
        conversationId: conversation.id,
        userId: conversation.userId,
        title: conversation.title,
        replyModel: message.model,
      })
      .from(message)
      .innerJoin(conversation, eq(conversation.id, message.conversationId))
      .where(eq(message.id, replyId));
    if (!row || row.title !== null) return;

    const path = await loadPath(deps, row.conversationId, replyId);
    const first = path.find((m) => m.role === "user")?.searchText.trim() ?? "";
    const reply = path.at(-1)?.searchText.trim() ?? "";

    const generated = await generateTitle(deps, row.userId, row.replyModel, first, reply);
    const title = generated || fallbackTitle(first);
    if (!title) return;

    await deps.db
      .update(conversation)
      .set({ title })
      .where(and(eq(conversation.id, row.conversationId), isNull(conversation.title)));
  } catch (error) {
    console.error(`Titling the Conversation of Message ${replyId} failed`, error);
  }
}

/** The Title Model's title, or `""` when there are no credentials or the call fails. */
async function generateTitle(
  deps: AppDeps,
  userId: string,
  replyModel: string | null,
  first: string,
  reply: string,
) {
  const { titleModel } = await loadSettings(deps, userId);
  const model = findModel(titleModel ?? replyModel ?? "");
  if (!model) return "";
  const credentials = await loadCredentials(deps, userId, model.provider);
  if (!credentials) return "";
  try {
    const { text } = await chat({
      adapter: deps.adapterFor(model.id, credentials),
      systemPrompts: [titlePrompt],
      messages: [
        {
          role: "user",
          content: `User: ${first.slice(0, promptChars)}\n\nAssistant: ${reply.slice(0, promptChars)}`,
        },
      ],
      stream: false,
    });
    return cleanTitle(text);
  } catch (error) {
    console.error(`Generating a title with ${model.id} failed`, error);
    return "";
  }
}

/** One line, without wrapping quotes or a trailing period. */
function cleanTitle(text: string) {
  return text
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^["'“‘`*#\s]+|["'”’`*\s.]+$/g, "")
    .slice(0, maxTitleChars)
    .trim();
}

/** The first ~50 characters of the first Message, cut at a word where possible. */
function fallbackTitle(first: string) {
  const line = first.replace(/\s+/g, " ").trim();
  if (line.length <= fallbackChars) return line;
  const cut = line.slice(0, fallbackChars);
  const space = cut.lastIndexOf(" ");
  return `${(space > fallbackChars / 2 ? cut.slice(0, space) : cut).trimEnd()}…`;
}
