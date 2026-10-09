"use client";

import { signIn } from "next-auth/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function AuthForm({ mode }: { mode: "sign-in" | "sign-up" }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const signingUp = mode === "sign-up";

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "");
    const password = String(form.get("password") ?? "");
    setPending(true);
    setError(null);
    if (signingUp) {
      const response = await fetch("/api/sign-up", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password, name: String(form.get("name") ?? "") }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { message?: string } | null;
        setError(body?.message ?? "Could not create the account.");
        setPending(false);
        return;
      }
    }
    const result = await signIn("credentials", { email, password, redirect: false });
    if (!result || result.error) {
      setError("That email and password don't match an account.");
      setPending(false);
      return;
    }
    router.replace("/c");
    router.refresh();
  }

  return (
    <main className="mx-auto flex min-h-svh max-w-sm flex-col justify-center gap-6 p-6">
      <h1 className="text-2xl font-semibold">{signingUp ? "Create an account" : "Sign in"}</h1>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        {signingUp && (
          <div className="grid gap-2">
            <Label htmlFor="name">Name (optional)</Label>
            <Input id="name" name="name" autoComplete="name" />
          </div>
        )}
        <div className="grid gap-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete={signingUp ? "new-password" : "current-password"}
            minLength={signingUp ? 8 : undefined}
            required
          />
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Button type="submit" disabled={pending}>
          {signingUp ? "Create account" : "Sign in"}
        </Button>
      </form>
      <p className="text-sm text-muted-foreground">
        {signingUp ? "Have an account? " : "New here? "}
        <Link className="underline" href={signingUp ? "/sign-in" : "/sign-up"}>
          {signingUp ? "Sign in" : "Create an account"}
        </Link>
      </p>
    </main>
  );
}
