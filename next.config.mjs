import path from "path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Baseline security headers applied to every response.
 *
 * Deliberately conservative: only `frame-ancestors` is set in the CSP so
 * Next.js inline hydration scripts keep working without a nonce pipeline,
 * while clickjacking and MIME sniffing are closed off.
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

/** @type {import("next").NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["sharp", "bcryptjs", "systeminformation"],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
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
