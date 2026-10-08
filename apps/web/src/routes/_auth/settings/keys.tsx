import { KeySettingsPage } from "@ai-chat/chat-react";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_auth/settings/keys")({
  component: KeySettingsPage,
});
