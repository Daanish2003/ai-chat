import { KeySettingsPage } from "@ai-chat/chat-sdk/ui";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_auth/settings/keys")({
  component: KeySettingsPage,
});
