"use client";

import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { faviconUrl } from "@/lib/favicon";
import { cn } from "@/lib/utils";
import { createContext, useContext } from "react";

// Vendored from prompt-kit. Changes: favicons request only the hostname (`faviconUrl`), and
// links carry `rel="noopener noreferrer nofollow"`.

const linkRel = "noopener noreferrer nofollow";

const SourceContext = createContext<{
  href: string;
  domain: string;
} | null>(null);

function useSourceContext() {
  const ctx = useContext(SourceContext);
  if (!ctx) throw new Error("Source.* must be used inside <Source>");
  return ctx;
}

export type SourceProps = {
  href: string;
  children: React.ReactNode;
};

export function Source({ href, children }: SourceProps) {
  let domain = "";
  try {
    domain = new URL(href).hostname;
  } catch {
    domain = href.split("/").pop() || href;
  }

  return (
    <SourceContext.Provider value={{ href, domain }}>
      <HoverCard>{children}</HoverCard>
    </SourceContext.Provider>
  );
}

function Favicon({ className, size }: { className: string; size: number }) {
  const { href } = useSourceContext();
  const src = faviconUrl(href);
  return src ? <img src={src} alt="" width={size} height={size} className={className} /> : null;
}

export type SourceTriggerProps = {
  label?: string | number;
  showFavicon?: boolean;
  className?: string;
};

export function SourceTrigger({ label, showFavicon = false, className }: SourceTriggerProps) {
  const { href, domain } = useSourceContext();
  const labelToShow = label ?? domain.replace("www.", "");

  return (
    <HoverCardTrigger
      delay={150}
      closeDelay={0}
      render={
        <a
          href={href}
          target="_blank"
          rel={linkRel}
          className={cn(
            "bg-muted text-muted-foreground hover:bg-muted-foreground/30 hover:text-primary inline-flex h-5 max-w-32 items-center gap-1 overflow-hidden rounded-full py-0 text-xs no-underline transition-colors duration-150",
            showFavicon ? "pr-2 pl-1" : "px-1",
            className,
          )}
        />
      }
    >
      {showFavicon && <Favicon size={14} className="size-3.5 rounded-full" />}
      <span className="truncate tabular-nums text-center font-normal">{labelToShow}</span>
    </HoverCardTrigger>
  );
}

export type SourceContentProps = {
  title: string;
  description: string;
  className?: string;
};

export function SourceContent({ title, description, className }: SourceContentProps) {
  const { href, domain } = useSourceContext();

  return (
    <HoverCardContent className={cn("w-80 p-0 shadow-xs", className)}>
      <a href={href} target="_blank" rel={linkRel} className="flex flex-col gap-2 p-3">
        <div className="flex items-center gap-1.5">
          <Favicon size={16} className="size-4 rounded-full" />
          <div className="text-primary truncate text-sm">{domain.replace("www.", "")}</div>
        </div>
        <div className="line-clamp-2 text-sm font-medium">{title}</div>
        <div className="text-muted-foreground line-clamp-2 text-sm">{description}</div>
      </a>
    </HoverCardContent>
  );
}
