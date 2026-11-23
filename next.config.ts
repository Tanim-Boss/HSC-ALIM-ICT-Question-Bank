import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Next.js fails the production build on TypeScript errors by default.
  // Lint is enforced separately via `npm run lint` (it is not part of the build).
  reactStrictMode: true,
  poweredByHeader: false,
};

export default nextConfig;
