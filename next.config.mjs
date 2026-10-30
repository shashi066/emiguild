/** @type {import('next').NextConfig} */
const nextConfig = {
  // Optional local asset version avoids stale bundles from other localhost apps.
  ...(process.env.NODE_ENV === 'development' && process.env.LOCAL_ASSET_PREFIX
    ? { assetPrefix: process.env.LOCAL_ASSET_PREFIX }
    : {}),
  // Explicit local hosts only; the Wi-Fi dev session supplies its current IP.
  allowedDevOrigins: (process.env.LOCAL_DEV_ORIGINS ?? 'localhost,127.0.0.1')
    .split(',').map(host => host.trim()).filter(Boolean),
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
    ],
  },
};

export default nextConfig;
