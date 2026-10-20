import type { Metadata } from "next";
import localFont from "next/font/local";
import { getServerEnv } from "@/infrastructure/config/env";
import "./globals.css";

export const runtime = "nodejs";

const headingFont = localFont({
  src: "./fonts/playfair-display.ttf",
  variable: "--font-heading",
  display: "swap",
  weight: "400 900",
});
const bodyFont = localFont({
  src: "./fonts/plus-jakarta-sans.ttf",
  variable: "--font-body",
  display: "swap",
  weight: "200 800",
});

export function generateMetadata(): Metadata {
  return {
    metadataBase: new URL(getServerEnv().APP_ORIGIN),
    title: "Make My Marriage",
    description:
      "A shared space for couples and families to plan their wedding.",
    robots: { index: false, follow: false },
    icons: { icon: { url: "/brand/logo-mark.svg", type: "image/svg+xml" } },
  };
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${headingFont.variable} ${bodyFont.variable}`}>
      <body>{children}</body>
    </html>
  );
}
