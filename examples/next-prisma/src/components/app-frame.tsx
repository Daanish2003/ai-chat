"use client";

import { AppShell } from "@/chat-sdk/ui";
import { Button } from "@/components/ui/button";
import { signOut } from "next-auth/react";
import type { ReactNode } from "react";

export function AppFrame({ userName, children }: { userName: string; children: ReactNode }) {
  return (
    <AppShell
      userMenu={
        <div className="flex items-center gap-2 text-sm">
          <span className="hidden text-muted-foreground sm:inline">{userName}</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void signOut({ callbackUrl: "/sign-in" })}
          >
            Sign out
          </Button>
        </div>
      }
    >
      {children}
    </AppShell>
  );
}
