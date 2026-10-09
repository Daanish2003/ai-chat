import type { Metadata } from "next";
import { Geist } from "next/font/google";
import type { ReactNode } from "react";

import { ChatRoot } from "@/components/chat-root";
import { cn } from "@/lib/utils";

import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = { title: "ai-chat · Next.js + Prisma example" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={cn("font-sans", geist.variable)}>
      <body className="h-svh">
        <ChatRoot>{children}</ChatRoot>
      </body>
    </html>
  );
}
