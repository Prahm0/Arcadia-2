import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Required by @opennextjs/cloudflare, which bundles the standalone server
  // output into a Worker. Set explicitly so `next build` and the OpenNext
  // bundling step can run as two separate commands.
  output: "standalone",
};

export default nextConfig;
