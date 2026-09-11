import type { MetadataRoute } from "next";
import { env } from "@/lib/env";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: ["/dashboard", "/admin", "/account", "/api", "/w/", "/onboarding", "/login", "/signup"] },
    ],
    sitemap: `${env.PUBLIC_APP_URL.replace(/\/$/, "")}/sitemap.xml`,
    host: env.PUBLIC_APP_URL.replace(/^https?:\/\//, "").replace(/\/$/, ""),
  };
}
