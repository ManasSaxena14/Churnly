import type { NextConfig } from "next";

// The browser talks only to this site; /api/* is forwarded to the FastAPI
// backend. Same-origin requests keep the login cookie first-party, so it
// works in every browser (Safari blocks cross-site cookies) and no CORS
// setup is needed. Set BACKEND_URL (or NEXT_PUBLIC_API_URL) on the host.
const BACKEND = (process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/+$/, "");

const nextConfig: NextConfig = {
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${BACKEND}/:path*` }];
  },
};

export default nextConfig;
