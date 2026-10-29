import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@aurora/ui', '@aurora/sdk', '@aurora/types'],
  // `/api/v1/*` is proxied to the API in src/middleware.ts (runtime-configurable target), so the
  // browser talks to the API same-origin and the session cookie stays first-party (ADR-003).
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};

export default nextConfig;
