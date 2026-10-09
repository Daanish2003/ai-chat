import { z } from "zod";

import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/password";

const signUp = z.object({
  email: z.email().transform((email) => email.trim().toLowerCase()),
  password: z.string().min(8).max(200),
  name: z.string().trim().max(80).optional(),
});

/** Creates a Credentials account. The client then signs in with the same email and password. */
export async function POST(request: Request) {
  const parsed = signUp.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { message: "Enter an email and a password of at least 8 characters." },
      { status: 400 },
    );
  }
  const { email, password, name } = parsed.data;
  if (await prisma.user.findUnique({ where: { email } })) {
    return Response.json(
      { message: "An account with this email already exists." },
      { status: 409 },
    );
  }
  const user = await prisma.user.create({
    data: { email, name: name || null, passwordHash: await hashPassword(password) },
  });
  return Response.json({ id: user.id }, { status: 201 });
}
