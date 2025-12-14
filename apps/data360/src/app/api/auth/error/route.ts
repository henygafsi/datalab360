import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Handle /api/auth/error route
 * Redirects to the signin page with error parameter preserved
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const error = searchParams.get('error') || 'Default';

  // Redirect to signin page with error parameter
  const signinUrl = new URL('/signin', request.url);
  signinUrl.searchParams.set('error', error);

  return NextResponse.redirect(signinUrl);
}

export async function POST(request: NextRequest) {
  return GET(request);
}
