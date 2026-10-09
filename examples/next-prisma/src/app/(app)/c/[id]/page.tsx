import { ConversationRoute } from "@/components/chat-pages";

export default async function ConversationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ message?: string }>;
}) {
  const [{ id }, { message }] = await Promise.all([params, searchParams]);
  return <ConversationRoute id={id} message={message} />;
}
