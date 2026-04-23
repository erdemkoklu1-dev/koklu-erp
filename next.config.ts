import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // lucide-react tree-shaking — büyük icon paketini sadece kullanılanları çeker
  serverExternalPackages: ['pdfjs-dist'],
  experimental: {
    optimizePackageImports: ['lucide-react'],
  },
  turbopack: {
    resolveAlias: {
      canvas: './src/lib/canvas-mock.ts',
    },
  },
  webpack: (config) => {
    config.resolve.alias.canvas = false
    return config
  },
};

export default nextConfig;
