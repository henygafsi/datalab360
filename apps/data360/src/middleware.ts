import { pagesOptions } from '@/app/api/auth/[...nextauth]/pages-options';
import withAuth from 'next-auth/middleware';

export default withAuth({
  pages: {
    ...pagesOptions,
  },
});

export const config = {
  // restricted routes
  matcher: [
    '/',
    '/account-overview',
    '/data-source-connection/:path*',
    '/mapping/:path*',
    '/workflow/:path*',
    '/gouvernance/:path*',
    '/bi-reporting/:path*',
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
