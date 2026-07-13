import type { NextConfig } from "next";

/*
 * Static export for GitHub Pages. The app has no API routes, middleware, or
 * server actions (verified — it's client-rendered with localStorage-backed
 * mock data), so `output: "export"` produces a fully static `out/` directory.
 *
 * GITHUB_PAGES=true is set only by the Pages build step; local `next dev`
 * and `next build` are unaffected and serve from the root as before.
 */
const isGithubPages = process.env.GITHUB_PAGES === "true";
const basePath = isGithubPages ? "/myhouse-mypro" : "";

const nextConfig: NextConfig = {
  output: "export",
  basePath,
  assetPrefix: basePath ? `${basePath}/` : undefined,
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
