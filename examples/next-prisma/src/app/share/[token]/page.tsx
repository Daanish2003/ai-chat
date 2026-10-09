import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { SharedConversation } from "@/components/chat-pages";
import { chat } from "@/lib/chat";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { robots: "noindex, nofollow" };

/** A Shared link's public, read-only page, outside the signed-in layout. */
export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const data = await chat.getSharedConversation(token);
  if (!data) notFound();
  return <SharedConversation data={data} />;
}
