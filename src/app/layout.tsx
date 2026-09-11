import type { Metadata, Viewport } from "next";
import { env } from "@/lib/env";
import "./globals.css";

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#128c7e" };

export const metadata: Metadata = {
  metadataBase: new URL(env.PUBLIC_APP_URL),
  title: { default: "Cybershop - storefronts that sell on WhatsApp", template: "%s | Cybershop" },
  description: "Browse catalogues from shops, academies, salons and services - then message the business directly on WhatsApp.",
  applicationName: "Cybershop",
  other: { "notranslate": "true" },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh antialiased">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
