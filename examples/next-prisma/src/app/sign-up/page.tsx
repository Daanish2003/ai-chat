import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { AuthForm } from "@/components/auth-form";

export default async function SignUpPage() {
  if (await auth()) redirect("/c");
  return <AuthForm mode="sign-up" />;
}
