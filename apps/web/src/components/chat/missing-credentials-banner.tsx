import { Link } from "@tanstack/react-router";
import { KeyRoundIcon } from "lucide-react";

/** Above the composer when the selected Model can't be sent to: its Provider has no credentials. */
export function MissingCredentialsBanner({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="flex items-center gap-2 border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
    >
      <KeyRoundIcon className="size-3.5 shrink-0" />
      <span>{message}.</span>
      <Link to="/settings/keys" className="ml-auto underline">
        Key settings
      </Link>
    </div>
  );
}
