import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every page is per-user and per-request; no static prerendering (cacheComponents off).
  reactStrictMode: true,
  serverExternalPackages: ["pg", "pg-boss"],
  output: "standalone",
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
