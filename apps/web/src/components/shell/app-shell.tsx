import { Button, buttonVariants } from "@ai-chat/ui/components/button";
import { cn } from "@ai-chat/ui/lib/utils";
import { Link } from "@tanstack/react-router";
import { MessagesSquareIcon, PlusIcon, SearchIcon, SettingsIcon } from "lucide-react";
import { type ReactNode, useState } from "react";

import { ConversationPanel } from "./conversation-panel";
import { TopBar } from "./top-bar";

/** The signed-in layout: icon rail, collapsible Conversation panel, top bar, then the page. */
export function AppShell({ children }: { children: ReactNode }) {
  const [panelOpen, setPanelOpen] = useState(true);

  return (
    <div className="flex min-h-0 flex-1">
      <nav
        aria-label="App"
        className="flex w-12 shrink-0 flex-col items-center gap-1 border-r bg-sidebar py-2"
      >
        <Link
          to="/c"
          aria-label="ai-chat"
          className="mb-2 flex size-8 items-center justify-center bg-primary text-xs font-bold text-primary-foreground"
        >
          ai
        </Link>
        <Link
          to="/c"
          title="New Conversation"
          aria-label="New Conversation"
          className={buttonVariants({ variant: "ghost", size: "icon" })}
        >
          <PlusIcon />
        </Link>
        {/* The ⌘K palette replaces this placeholder. */}
        <Button
          variant="ghost"
          size="icon"
          title="Search (coming soon)"
          aria-label="Search"
          disabled
        >
          <SearchIcon />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          title="Conversations"
          aria-label="Conversations"
          aria-pressed={panelOpen}
          onClick={() => setPanelOpen((open) => !open)}
          className={cn(panelOpen && "bg-sidebar-accent text-primary")}
        >
          <MessagesSquareIcon />
        </Button>
        <div className="flex-1" />
        <Link
          to="/settings/keys"
          title="Keys & settings"
          aria-label="Keys & settings"
          className={buttonVariants({ variant: "ghost", size: "icon" })}
          activeProps={{ className: "bg-sidebar-accent text-primary" }}
        >
          <SettingsIcon />
        </Link>
      </nav>

      {panelOpen && <ConversationPanel />}

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar panelOpen={panelOpen} onOpenPanel={() => setPanelOpen(true)} />
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
