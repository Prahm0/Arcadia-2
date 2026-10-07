import type { MetadataRoute } from "next";

const origin = "https://arcadiahq.app";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: origin,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${origin}/support`,
      changeFrequency: "monthly",
      priority: 0.4,
    },
    {
      url: `${origin}/privacy`,
      changeFrequency: "yearly",
      priority: 0.2,
    },
    {
      url: `${origin}/terms`,
      changeFrequency: "yearly",
      priority: 0.2,
    },
    {
      url: `${origin}/refunds`,
      changeFrequency: "yearly",
      priority: 0.2,
    },
  ];
}
