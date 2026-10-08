import { Button, buttonVariants } from "@ai-chat/ui/components/button";
import { cn } from "@ai-chat/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { MessagesSquareIcon, PlusIcon, SearchIcon, SettingsIcon } from "lucide-react";
import { type ReactNode, useState } from "react";

import { useChatAdapter } from "../provider";
import { CommandPalette } from "./command-palette";
import { ConversationPanel } from "./conversation-panel";
import { TopBar } from "./top-bar";

/**
 * The signed-in layout: icon rail, collapsible Conversation panel, top bar, then the page.
 * `userMenu` is the host app's account menu, shown at the top bar's right end.
 */
export function AppShell({ children, userMenu }: { children: ReactNode; userMenu?: ReactNode }) {
  const { orpc, Link } = useChatAdapter();
  const [panelOpen, setPanelOpen] = useState(true);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const models = useQuery(orpc.models.list.queryOptions());
  const noCredentials = models.data?.models.length === 0;

  return (
    <div className="flex min-h-0 flex-1">
      <nav
        aria-label="App"
        className="flex w-12 shrink-0 flex-col items-center gap-1 border-r bg-sidebar py-2"
      >
        <Link
          page={{ to: "new" }}
          aria-label="ai-chat"
          className="mb-2 flex size-8 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground"
        >
          ai
        </Link>
        {noCredentials ? (
          <Button
            variant="ghost"
            size="icon"
            title="Add Provider credentials to start"
            aria-label="New Conversation"
            disabled
          >
            <PlusIcon />
          </Button>
        ) : (
          <Link
            page={{ to: "new" }}
            title="New Conversation"
            aria-label="New Conversation"
            className={buttonVariants({ variant: "ghost", size: "icon" })}
          >
            <PlusIcon />
          </Link>
        )}
        <Button
          variant="ghost"
          size="icon"
          title="Search (⌘K / Ctrl+K)"
          aria-label="Search"
          aria-haspopup="dialog"
          onClick={() => setPaletteOpen(true)}
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
          page={{ to: "keys" }}
          title="Keys & settings"
          aria-label="Keys & settings"
          className={buttonVariants({ variant: "ghost", size: "icon" })}
          activeClassName="bg-sidebar-accent text-primary"
        >
          <SettingsIcon />
        </Link>
      </nav>

      {panelOpen && <ConversationPanel />}

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          panelOpen={panelOpen}
          onOpenPanel={() => setPanelOpen(true)}
          onOpenSearch={() => setPaletteOpen(true)}
          userMenu={userMenu}
        />
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  );
}
