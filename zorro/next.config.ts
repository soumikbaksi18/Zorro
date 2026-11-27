import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  // The libsql client loads a native driver for local files; keep it out of the bundle.
  serverExternalPackages: ["@libsql/client", "libsql"],
  // Version 1 pages (trading bots) are gone.
  async redirects() {
    return [
      { source: "/trade", destination: "/", permanent: true },
      { source: "/bots/:path*", destination: "/", permanent: true },
    ];
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
