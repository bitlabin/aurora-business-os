import { type NextRequest, NextResponse } from 'next/server';

const API_PREFIX = '/api/v1/';

/**
 * Where the web server forwards API calls. Read per request (not at build time) so one build of
 * the web app runs against a local API (`pnpm dev`), the compose network (`http://api:4000`) or a
 * deployed API without being rebuilt.
 */
function apiBaseUrl(): string {
  return (
    process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'
  );
}

/**
 * Two jobs, both deliberately thin:
 *
 * 1. `/api/v1/*` is proxied to the API so the browser only ever talks to the web origin. The
 *    HttpOnly session cookie set by the API is therefore a first-party cookie and no CORS is
 *    involved (ADR-003).
 * 2. Presence check of the session cookie for pages. The API validates the session on every call;
 *    this just keeps signed-out visitors from seeing an empty shell flash before the redirect.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith(API_PREFIX)) {
    const target = new URL(pathname + request.nextUrl.search, apiBaseUrl());
    return NextResponse.rewrite(target);
  }

  const hasSession = request.cookies.has('aurora_session');
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
  matcher: ['/api/v1/:path*', '/((?!api|_next|favicon.ico).*)'],
};
