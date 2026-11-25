import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  // The Trade page became Bots.
  async redirects() {
    return [{ source: "/trade", destination: "/bots", permanent: true }];
  },
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
