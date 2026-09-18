import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const allowedEmail = (process.env.ALLOWED_EMAIL || '').trim().toLowerCase();

  if (!supabaseUrl || !supabaseAnonKey) {
    return supabaseResponse;
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options?: any }[]) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        supabaseResponse = NextResponse.next({
          request,
        });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  const path = request.nextUrl.pathname;
  const isPublicRoute =
    path === '/login' ||
    path === '/unauthorized' ||
    path.startsWith('/_next') ||
    path.startsWith('/api/auth');

  // Refresh auth token
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 1. Unauthenticated users accessing protected routes -> /login
  if (!user && !isPublicRoute) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  // 2. Authenticated user checks
  if (user) {
    const userEmail = (user.email || '').trim().toLowerCase();
    const isAuthorized = Boolean(allowedEmail && userEmail === allowedEmail);

    if (!isAuthorized) {
      // Sign out unauthorized user in middleware where response cookies can be modified
      await supabase.auth.signOut();

      // If already on /unauthorized, return response with cleared cookies directly (no loop)
      if (path === '/unauthorized') {
        return supabaseResponse;
      }

      // Redirect to /unauthorized with cleared cookie headers copied
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = '/unauthorized';
      const redirectResponse = NextResponse.redirect(redirectUrl);

      supabaseResponse.cookies.getAll().forEach((cookie) => {
        redirectResponse.cookies.set(cookie.name, cookie.value, cookie);
      });

      return redirectResponse;
    }

    // Authorized user accessing /login -> redirect to /profile
    if (isAuthorized && path === '/login') {
      const url = request.nextUrl.clone();
      url.pathname = '/profile';
      const redirectResponse = NextResponse.redirect(url);
      supabaseResponse.cookies.getAll().forEach((cookie) => {
        redirectResponse.cookies.set(cookie.name, cookie.value, cookie);
      });
      return redirectResponse;
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public assets
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
