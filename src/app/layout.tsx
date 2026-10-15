import type { Metadata } from "next";
import { getServerEnv } from "@/infrastructure/config/env";
import "./globals.css";

export const runtime = "nodejs";

export function generateMetadata(): Metadata {
  return {
    metadataBase: new URL(getServerEnv().APP_ORIGIN),
    title: "Make My Marriage",
    description: "A shared space for couples and families to plan their wedding.",
    robots: { index: false, follow: false },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
