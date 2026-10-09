import { deleteAccount } from "./actions";

import { Button } from "@/components/ui/button";

export default function AccountPage() {
  return (
    <main className="mx-auto flex max-w-lg flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold">Account</h1>
      <form action={deleteAccount} className="flex flex-col gap-3 rounded-lg border p-4">
        <p className="text-sm text-muted-foreground">
          Deleting your account removes your Conversations, Shared links, Attachments and saved
          keys, then your sign-in. This can&apos;t be undone.
        </p>
        <Button type="submit" variant="destructive" className="self-start">
          Delete account
        </Button>
      </form>
    </main>
  );
}
