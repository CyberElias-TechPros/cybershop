import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  poweredByHeader: false,
  allowedDevOrigins: ['*.e2b.app', '*.arena.ai', 'localhost', '127.0.0.1'],
};

export default nextConfig;
