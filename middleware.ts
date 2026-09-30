import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. Skip static assets, images, and next internal files
  if (
    pathname.startsWith('/_next') ||
    pathname.includes('.') ||
    pathname === '/favicon.ico'
  ) {
    return NextResponse.next();
  }

  // 2. Initialize response with incoming request headers
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  // Helper to create redirects that preserve session cookies
  function createRedirect(destination: string | URL) {
    const url = typeof destination === 'string' ? new URL(destination, request.url) : destination;
    const redirectRes = NextResponse.redirect(url);
    response.cookies.getAll().forEach((cookie) => {
      redirectRes.cookies.set(cookie.name, cookie.value, cookie);
    });
    return redirectRes;
  }

  // 3. Initialize Supabase SSR client for cookie and session verification
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mock-sap-lms.supabase.co';
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'mock-key';

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: Array<{ name: string; value: string; options?: CookieOptions }>) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({
          request: {
            headers: request.headers,
          },
        });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
      // Backward-compatibility fallbacks
      get(name: string) {
        return request.cookies.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        request.cookies.set({ name, value, ...options });
        response.cookies.set({ name, value, ...options });
      },
      remove(name: string, options: CookieOptions) {
        request.cookies.set({ name, value: '', ...options });
        response.cookies.set({ name, value: '', ...options });
      },
    },
  });

  let userEmail: string | null = null;
  let userRole: string | null = null;
  let userId: string | null = null;
  let isActiveUser: boolean = true;

  // 4. Check active auth cookie (next_gen_auth_user)
  const authCookie = request.cookies.get('next_gen_auth_user')?.value;
  if (authCookie) {
    try {
      const parsed = JSON.parse(decodeURIComponent(authCookie));
      if (parsed && typeof parsed === 'object') {
        if (parsed.is_active === false) {
          isActiveUser = false;
        } else {
          userEmail = parsed.email || null;
          userRole = parsed.role || null;
          userId = parsed.id || null;
        }
      }
    } catch {
      // Corrupt JSON in cookie -> unauthenticated
    }
  }

  // 5. If live Supabase instance configured, verify session cryptographically with getUser()
  const isSupabaseLive = Boolean(supabaseUrl && !supabaseUrl.includes('mock-sap-lms'));
  if (isSupabaseLive) {
    try {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (user && !error) {
        userEmail = user.email || userEmail;
        userId = user.id || userId;
        userRole = user.app_metadata?.role || user.user_metadata?.role || userRole;
      } else {
        // Token invalid or session expired on Supabase Auth
        userEmail = null;
        userId = null;
        userRole = null;
      }
    } catch {
      userEmail = null;
      userId = null;
      userRole = null;
    }
  }

  const isAuthenticated = Boolean(isActiveUser && (userEmail || userId));

  // 6. Handle API routes (pass through with session cookies preserved, without HTML redirect)
  if (pathname.startsWith('/api')) {
    return response;
  }

  // 7. Public routes accessible without authentication
  const isPublicRoute =
    pathname === '/login' ||
    pathname.startsWith('/certificate/verify');

  // 8. Unauthenticated navigation to protected routes (e.g. /dashboard, /support, /portal, /)
  if (!isPublicRoute && !isAuthenticated) {
    const loginUrl = new URL('/login', request.url);
    if (pathname !== '/') {
      loginUrl.searchParams.set('redirectTo', pathname);
    }
    return createRedirect(loginUrl);
  }

  // 9. Authenticated navigation to /login or / -> redirect to role's home view
  if ((pathname === '/login' || pathname === '/') && isAuthenticated) {
    if (userRole === 'student') {
      return createRedirect('/portal');
    }
    if (userRole === 'support') {
      return createRedirect('/support');
    }
    return createRedirect('/dashboard');
  }

  // 10. Student boundary isolation: students can only access /portal and /certificate/verify
  if (isAuthenticated && userRole === 'student') {
    const isPortalRoute = pathname === '/portal' || pathname.startsWith('/portal/');
    const isVerifyRoute = pathname.startsWith('/certificate/verify');
    if (!isPortalRoute && !isVerifyRoute) {
      return createRedirect('/portal');
    }
  }

  // 11. Support staff boundary: support staff restricted from sensitive admin settings & audit logs
  if (isAuthenticated && userRole === 'support') {
    const restrictedToAdmins = ['/settings', '/audit-logs', '/users'];
    if (restrictedToAdmins.some((p) => pathname.startsWith(p))) {
      return createRedirect('/support');
    }
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder static files (images, svg, etc.)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
