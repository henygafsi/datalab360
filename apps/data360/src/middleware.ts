import { pagesOptions } from '@/app/api/auth/[...nextauth]/pages-options';
import withAuth from 'next-auth/middleware';

export default withAuth({
  callbacks: {
    authorized: ({ token }) => {
      // User must be authenticated to access protected routes
      if (!token) {
        return false;
      }

      // Check if token is expired (optional, for extra security)
      if (token.exp && typeof token.exp === 'number' && Date.now() / 1000 > token.exp) {
        return false;
      }

      return true;
    },
  },
  pages: {
    ...pagesOptions,
  },
});

export const config = {
  // Protect all dashboard routes - unauthenticated users will be redirected to /signin
  matcher: [
    '/',
    '/account-overview',
    '/data-source-connection/:path*',
    '/mapping/:path*',
    '/workflow/:path*',
    '/gouvernance/:path*',
    '/bi-reporting/:path*',
    '/data-quality/:path*',
    '/executive',
    '/financial',
    '/analytics',
    '/logistics/:path*',
    '/ecommerce/:path*',
    '/support/:path*',
    '/file/:path*',
    '/file-manager',
    '/invoice/:path*',
    '/forms/profile-settings/:path*',
  ],
};
