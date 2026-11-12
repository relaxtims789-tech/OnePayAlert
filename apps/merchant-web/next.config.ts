import { join } from 'node:path';
import type { NextConfig } from 'next';

const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Lets the e2e build live next to a running dev server without clobbering it.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  poweredByHeader: false,
  // Docker builds set NEXT_OUTPUT=standalone: a self-contained server.js with only the files it needs.
  ...(process.env.NEXT_OUTPUT === 'standalone' ? { output: 'standalone' as const, outputFileTracingRoot: join(__dirname, '../..') } : {}),
  transpilePackages: ['@onepay/ui', '@onepay/web-core'],
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
