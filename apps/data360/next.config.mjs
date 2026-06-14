import './src/env.mjs';
/** @type {import('next').NextConfig} */

const nextConfig = {
  reactStrictMode: false, // Disabled to prevent double API calls in development
  // Do NOT 308-strip trailing slashes. The backend's canonical routes (e.g.
  // GET /api/recommendations/) are the trailing-slash form. Without this,
  // Next strips the slash on /api-proxy/.../  → the upstream FastAPI then 307s
  // to an ABSOLUTE cross-origin URL, and the browser drops the Authorization
  // header on that cross-origin redirect → spurious 401 "Not authenticated".
  // Keeping the slash lets the rewrite proxy straight to the canonical route.
  skipTrailingSlashRedirect: true,
  async rewrites() {
    const upstream = process.env.API_PROXY_UPSTREAM || 'http://api.datalab360.io';
    return [
      // The catch-all `:path*` rewrite below drops the TRAILING SLASH when it
      // forwards, so endpoints whose canonical upstream route ends in `/`
      // (FastAPI routers with a `@router.get("/")` root, e.g. the
      // recommendations list) get proxied to the no-slash form. The upstream's
      // `redirect_slashes` then 307s to the ABSOLUTE slash URL, and the browser
      // drops the Authorization header on that cross-origin redirect → a
      // spurious 401 "Not authenticated". Forward these roots WITH the slash
      // intact so the proxy hits the canonical 200 route directly (no redirect).
      // Requires `skipTrailingSlashRedirect: true` so the slash survives matching.
      {
        source: '/api-proxy/api/recommendations/',
        destination: `${upstream}/api/recommendations/`,
      },
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
