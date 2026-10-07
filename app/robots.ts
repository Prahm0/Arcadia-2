import type { MetadataRoute } from "next";

const origin = "https://arcadiahq.app";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/app/",
        "/login",
        "/register",
        "/forgot-password",
        "/reset-password",
      ],
    },
    sitemap: `${origin}/sitemap.xml`,
    host: origin,
  };
}
