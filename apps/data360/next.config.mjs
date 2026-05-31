import './src/env.mjs';
/** @type {import('next').NextConfig} */

const nextConfig = {
  reactStrictMode: false, // Disabled to prevent double API calls in development
  async rewrites() {
    const upstream = process.env.API_PROXY_UPSTREAM || 'http://api.datalab360.io';
    return [
      // NOTE: the former '/api/mapping/:path*' rewrite was removed (2026-05-29) —
      // the backend has no '/mapping' router; the mapping wizard calls
      // '/explore-design/guided/*' directly via apiClient. See AsBuilt — Contract Coverage.
      {
        source: '/api-proxy/:path*',
        destination: `${upstream}/:path*`,
      },
    ];
  },
  // Permanent 308 redirects keep the old French slug stable for bookmarks
  // and external links after the rename to /governance.
  async redirects() {
    return [
      {
        source: '/gouvernance',
        destination: '/governance',
        permanent: true,
      },
      {
        source: '/gouvernance/:path*',
        destination: '/governance/:path*',
        permanent: true,
      },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'randomuser.me',
        pathname: '/api/portraits/**',
      },
      {
        protocol: 'https',
        hostname: 'cloudflare-ipfs.com',
        pathname: '/ipfs/**',
      },
      {
        protocol: 'https',
        hostname: 'avatars.githubusercontent.com',
        pathname: '/u/**',
      },
      {
        protocol: 'https',
        hostname: 'picsum.photos',
      },
      {
        protocol: 'https',
        hostname: 'flagcdn.com',
      },
      {
        protocol: 'https',
        hostname: 'utfs.io',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
      {
        protocol: 'https',
        hostname: 's3.amazonaws.com',
        pathname: '/redqteam.com/isomorphic-furyroad/public/**',
      },
      {
        protocol: 'https',
        hostname: 'isomorphic-furyroad.s3.amazonaws.com',
      },
      {
        protocol: 'https',
        hostname: 'isomorphic-furyroad.vercel.app',
      },
    ],
  },
  transpilePackages: ['core'],
};

export default nextConfig;
