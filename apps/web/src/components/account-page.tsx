import { Button } from "@ai-chat/ui/components/button";
import { Input } from "@ai-chat/ui/components/input";
import { Label } from "@ai-chat/ui/components/label";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { authClient } from "@/lib/auth-client";
import { describeUserAgent } from "@/lib/user-agent";

/** Account: the Profile, Email and Active sessions sections of settings. */
export function AccountPage() {
  const { data: current } = authClient.useSession();
  if (!current) return null;

  return (
    <main className="mx-auto w-full max-w-2xl space-y-8 p-6">
      <h1 className="text-xl font-semibold">Account</h1>
      <ProfileSection name={current.user.name} />
      <EmailSection email={current.user.email} />
      <SessionsSection currentSessionId={current.session.id} />
    </main>
  );
}

function ProfileSection({ name }: { name: string }) {
  const [value, setValue] = useState(name);
  const save = useMutation({
    mutationFn: async (newName: string) => {
      const { error } = await authClient.updateUser({ name: newName });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => toast.success("Name updated"),
    onError: (error) => toast.error(error.message),
  });

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium">Profile</h2>
      <form
        className="flex flex-col gap-3 sm:flex-row sm:items-end"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate(value.trim());
        }}
      >
        <div className="flex-1 space-y-2">
          <Label htmlFor="account-name">Name</Label>
          <Input
            id="account-name"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            required
            maxLength={100}
          />
        </div>
        <Button
          type="submit"
          disabled={save.isPending || value.trim() === "" || value.trim() === name}
        >
          Save name
        </Button>
      </form>
    </section>
  );
}

/** The same answer for a free address and one that already has an account, so the form can't tell them apart. */
function EmailSection({ email }: { email: string }) {
  const [value, setValue] = useState("");
  const request = useMutation({
    mutationFn: async (newEmail: string) => {
      const { error } = await authClient.changeEmail({
        newEmail,
        callbackURL: `${window.location.origin}/email-changed`,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      setValue("");
      toast.success("We sent a confirmation to your current address. Open it to continue.");
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium">Email</h2>
      <p className="text-sm text-muted-foreground">Current address: {email}</p>
      <form
        className="flex flex-col gap-3 sm:flex-row sm:items-end"
        onSubmit={(event) => {
          event.preventDefault();
          request.mutate(value.trim());
        }}
      >
        <div className="flex-1 space-y-2">
          <Label htmlFor="account-new-email">New email</Label>
          <Input
            id="account-new-email"
            type="email"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            required
            maxLength={255}
          />
        </div>
        <Button type="submit" disabled={request.isPending || value.trim() === ""}>
          Change email
        </Button>
      </form>
    </section>
  );
}

function SessionsSection({ currentSessionId }: { currentSessionId: string }) {
  const queryClient = useQueryClient();
  const sessionsKey = ["account", "sessions"];
  const sessions = useQuery({
    queryKey: sessionsKey,
    queryFn: async () => {
      const { data, error } = await authClient.listSessions();
      if (error) throw new Error(error.message);
      return data;
    },
  });
  const signOutOthers = useMutation({
    mutationFn: async () => {
      const { error } = await authClient.revokeOtherSessions();
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Other sessions signed out");
      queryClient.invalidateQueries({ queryKey: sessionsKey });
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium">Active sessions</h2>
        <Button
          variant="outline"
          size="sm"
          onClick={() => signOutOthers.mutate()}
          disabled={signOutOthers.isPending}
        >
          Sign out other sessions
        </Button>
      </div>
      {sessions.data ? (
        <ul aria-label="Active sessions" className="divide-y overflow-hidden rounded-xl border">
          {sessions.data.map((session) => (
            <li key={session.id} className="flex flex-col gap-1 p-4 text-sm">
              <span className="font-medium">{describeUserAgent(session.userAgent)}</span>
              <span className="text-muted-foreground">
                {session.id === currentSessionId ? "This device" : "Another device"} · Last used{" "}
                {new Date(session.updatedAt).toLocaleString()}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">Loading sessions…</p>
      )}
    </section>
  );
}
