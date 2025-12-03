import { pagesOptions } from '@/app/api/auth/[...nextauth]/pages-options';
import withAuth from 'next-auth/middleware';
import { NextResponse } from 'next/server';

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;

    // If no token, user will be redirected to sign-in by withAuth
    if (!token) {
      return NextResponse.redirect(new URL('/signin', req.url));
    }

    // Allow access if authenticated
    return NextResponse.next();
  },
  {
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
  }
);

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
