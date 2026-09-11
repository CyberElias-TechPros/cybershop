import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * PGlite ships a WASM bundle + node fs access; bundling it through webpack breaks
   * its virtual filesystem (path/URL errors). Keep it a real require() at runtime.
   */
  serverExternalPackages: ["@electric-sql/pglite", "postgres"],
  // Media lives on the shared host (media.<domain>); list hosts you point at here.
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
      ...(process.env.MEDIA_DEV_HOST ? [{ protocol: "http" as const, hostname: process.env.MEDIA_DEV_HOST }] : []),
    ],
  },
  experimental: {
    serverActions: { bodySizeLimit: "12mb" },
  },
};

export default nextConfig;
