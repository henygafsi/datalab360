import { pagesOptions } from '@/app/api/auth/[...nextauth]/pages-options';
import withAuth from 'next-auth/middleware';

export default withAuth({
  callbacks: {
    authorized: ({ token }) => {
      // User must be authenticated to access protected routes
      // NextAuth handles session expiration via maxAge in auth-options.ts
      return !!token;
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
    '/explore-design/guided/:path*',
    '/workflow/:path*',
    '/gouvernance/:path*',
    '/bi-dashboard/:path*',
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
