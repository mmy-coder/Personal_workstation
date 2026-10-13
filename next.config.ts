import type { NextConfig } from "next";
const config: NextConfig = {
  poweredByHeader: false,
  devIndicators: false,
  distDir: process.env.NEXT_DIST_DIR || ".next",
  ...(process.env.NEXT_DIST_DIR === ".next-e2e"
    ? { logging: false as const }
    : {}),
};
export default config;
