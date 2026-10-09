"use server";

import { redirect } from "next/navigation";

import { auth, signOut } from "@/auth";
import { chat } from "@/lib/chat";
import { prisma } from "@/lib/db";

/**
 * Deletes the signed-in user. The SDK's data goes first, then the Auth.js user, then the session.
 * A failure leaves the user signed in, so they can try again: `deleteUser` is idempotent, and
 * `deleteMany` does nothing for a user already gone.
 */
export async function deleteAccount() {
  const session = await auth();
  if (!session) redirect("/sign-in");
  const userId = session.user.id;
  await chat.deleteUser(userId);
  await prisma.user.deleteMany({ where: { id: userId } });
  await signOut({ redirectTo: "/sign-in" });
}
