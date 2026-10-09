import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { auth } from "@/auth";
import { AppFrame } from "@/components/app-frame";

/** Everything signed in: the chat pages and Keys & settings. */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  if (!session) redirect("/sign-in");
  return <AppFrame userName={session.user.name ?? session.user.email ?? ""}>{children}</AppFrame>;
}
