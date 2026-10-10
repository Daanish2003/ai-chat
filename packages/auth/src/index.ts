import type { Database } from "@ai-chat/db";
import * as schema from "@ai-chat/db/schema/auth";
import { type EmailMessage, type EmailSender, renderTemplate } from "@ai-chat/email";
import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2";
import { betterAuth } from "better-auth";
import { tanstackStartCookies } from "better-auth/tanstack-start";

export type AuthConfig = {
  BETTER_AUTH_URL: string;
  BETTER_AUTH_SECRET: string;
  APP_NAME: string;
};

// Where a failed background send is reported. evlog's `log` fits this shape.
export type AuthLogger = {
  error(entry: { action: string; message: string; error: unknown }): void;
};

export function createAuth(
  env: AuthConfig,
  database: Database,
  sender: EmailSender,
  logger: AuthLogger,
) {
  // Sends run without being awaited, so a slow or failing provider never holds the request up
  // (a timing signal, per Better Auth's guidance). A failure is logged, never thrown.
  function sendInBackground(message: Promise<EmailMessage>, what: string) {
    void message
      .then((rendered) => sender.send(rendered))
      .catch((error: unknown) =>
        logger.error({
          action: "email.send",
          message: `${what} email failed to send`,
          error,
        }),
      );
  }

  return betterAuth({
    database: drizzleAdapter(database, {
      provider: "pg",
      schema,
    }),
    trustedOrigins: [env.BETTER_AUTH_URL],
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        sendInBackground(
          renderTemplate("reset-password", user.email, { appName: env.APP_NAME, url }),
          "password reset",
        );
      },
      // Runs once the new password is saved, before the other sessions are revoked.
      onPasswordReset: async ({ user }) => {
        sendInBackground(
          renderTemplate("password-changed", user.email, { appName: env.APP_NAME }),
          "password changed",
        );
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }) => {
        sendInBackground(
          renderTemplate("verify-email", user.email, { appName: env.APP_NAME, url }),
          "verification",
        );
      },
    },
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    plugins: [tanstackStartCookies()],
  });
}

export type Session = ReturnType<typeof createAuth>["$Infer"]["Session"];
