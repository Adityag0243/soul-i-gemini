import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Proxy middleware to protect admin routes and handle authentication redirects.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  
  // We check for tokens in cookies. 
  // Note: These cookies must have path '/' to be visible on /login page.
  const accessToken = request.cookies.get('accessToken');
  const refreshToken = request.cookies.get('refreshToken');

  const isAuthenticated = !!(accessToken || refreshToken);

  // 1. Protect Admin Routes: Redirect to login if not authenticated
  if (pathname.startsWith('/admin')) {
    if (!isAuthenticated) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
  }

  // 2. Redirect Authenticated Admins: If already logged in, move from /login to dashboard
  if (pathname === '/login') {
    if (isAuthenticated) {
      return NextResponse.redirect(new URL('/admin/dashboard', request.url));
    }
  }

  return NextResponse.next();
}

export default proxy;

// Configure which paths this middleware should run on
export const config = {
  matcher: [
    '/admin/:path*',
    '/login',
  ],
};
