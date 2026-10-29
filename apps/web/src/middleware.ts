import { type NextRequest, NextResponse } from 'next/server';

/**
 * Presence check only: the API validates the session on every call (ADR-003). This just keeps
 * signed-out visitors from seeing an empty shell flash before the redirect.
 */
export function middleware(request: NextRequest) {
  const hasSession = request.cookies.has('aurora_session');
  const { pathname } = request.nextUrl;
  if (!hasSession && pathname !== '/login') {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }
  if (hasSession && pathname === '/login') {
    const url = request.nextUrl.clone();
    url.pathname = '/home';
    url.search = '';
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next|favicon.ico).*)'],
};
