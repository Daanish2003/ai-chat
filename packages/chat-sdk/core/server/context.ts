import type { Session } from "@ai-chat/auth";

import type { AppDeps } from "./deps";

export type Context = {
  session: Session | null;
  deps: AppDeps;
};
