import React from "react";
import { cookies } from "next/headers";
import type { Metadata, Viewport } from "next";
import { Providers } from "@/components/providers";
import { isLocale, type Locale } from "@/lib/i18n";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "NEXORA ERP", template: "%s · NEXORA ERP" },
  description: "Enterprise business management platform — ERP for manufacturing, distribution and logistics.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f7f9" },
    { media: "(prefers-color-scheme: dark)", color: "#14161a" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const store = cookies();
  const cookieLocale = store.get("nexora_locale")?.value;
  const locale: Locale = isLocale(cookieLocale) ? cookieLocale : "en";

  return (
    <html lang={locale} suppressHydrationWarning>
      <body className="min-h-screen font-sans">
        <Providers locale={locale}>{children}</Providers>
      </body>
    </html>
  );
}
