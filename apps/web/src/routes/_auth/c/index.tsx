import { NewConversationPage } from "@ai-chat/chat-react";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

export const Route = createFileRoute("/_auth/c/")({
  /** `?model=` is the Model picked in the top bar; without it, `models.list`'s default. */
  validateSearch: z.object({ model: z.string().optional() }),
  component: NewConversationPage,
});
