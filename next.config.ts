import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  agentRules: false,
  experimental: {
    proxyClientMaxBodySize: "10mb",
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
