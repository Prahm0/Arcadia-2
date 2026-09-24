import type { MetadataRoute } from "next";

/**
 * Web app manifest, makes Arcadia installable. Users who visit on iOS
 * Safari or Android Chrome can add Arcadia to their home screen and open
 * it standalone (no browser chrome). Arcad's constellation-orb mark is used for
 * both the standard and iOS home-screen icons.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Arcadia",
    short_name: "Arcadia",
    description:
      "Arcadia builds a study plan around your classes, deadlines, training and the rest of your life, then quietly rebuilds it every time something moves.",
    id: "/",
    start_url: "/app",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0a0714",
    theme_color: "#0a0714",
    lang: "en-AU",
    categories: ["education", "productivity", "utilities"],
    icons: [
      {
        src: "/icon.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/apple-icon.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
