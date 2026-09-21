import path from "path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import("next").NextConfig} */
const nextConfig = {
  serverExternalPackages: ["sharp", "bcryptjs", "systeminformation"],
  experimental: {
    cpus: 1,
    webpackMemoryOptimizations: true,
  },
  webpack(config) {
    config.parallelism = 1;
    return config;
  },
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
