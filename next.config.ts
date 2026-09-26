import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

const nextConfig: NextConfig = {
  // Required by @opennextjs/cloudflare, which bundles the standalone server
  // output into a Worker. Set explicitly so `next build` and the OpenNext
  // bundling step can run as two separate commands.
  output: "standalone",
  // Old links and bookmarks land on the page that replaced them: Study Sky
  // merged into Streaks, Focus became Sessions and Rooms moved inside it.
  // Query strings (?eventId=…) carry over.
  async redirects() {
    return [
      { source: "/app/sky", destination: "/app/streaks", permanent: true },
      { source: "/app/focus", destination: "/app/sessions", permanent: true },
      { source: "/app/rooms", destination: "/app/sessions/rooms", permanent: true },
      { source: "/app/rooms/:code", destination: "/app/sessions/rooms/:code", permanent: true },
    ];
  },
};

// withSentryConfig adds a few build-time behaviours (tunnel route to bypass
// ad-blockers, tree-shaking of unused Sentry SDK code, etc). Source-map
// upload is intentionally left off — it needs SENTRY_AUTH_TOKEN and a
// project/org, which we can wire in once the DSN itself is set up. Until
// then, stack traces will use column info without symbolication.
export default withSentryConfig(nextConfig, {
  silent: !process.env.CI,
  telemetry: false,
  webpack: {
    treeshake: {
      removeDebugLogging: true,
    },
  },
});
