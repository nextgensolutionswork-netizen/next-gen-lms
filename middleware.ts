import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { verifyAuthCookieSignature, AUTH_COOKIE_NAME, AUTH_SIG_COOKIE_NAME } from '@/lib/security/auth-cookie';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Supabase may fall back to the Site URL. Preserve callback query parameters
  // and let the browser carry its fragment to login before any dashboard redirect.
  if (pathname === '/') {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    return NextResponse.redirect(loginUrl);
  }

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
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'mock-key';
  const isSupabaseLive = Boolean(supabaseUrl && !supabaseUrl.includes('mock-sap-lms'));

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

  // 4. Check active auth cookie (next_gen_auth_user) and verify HMAC signature
  const authCookie = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  const sigCookie = request.cookies.get(AUTH_SIG_COOKIE_NAME)?.value;

  if (authCookie && !isSupabaseLive) {
    let isSignatureValid = true;
    if (sigCookie) {
      isSignatureValid = await verifyAuthCookieSignature(authCookie, sigCookie);
    }

    if (!isSignatureValid) {
      // Tampered cookie detected: signature does not match!
      // Reject the session as unauthenticated and clear the cookie
      isActiveUser = false;
      userEmail = null;
      userRole = null;
      userId = null;
      response.cookies.set(AUTH_COOKIE_NAME, '', { maxAge: 0, path: '/' });
      response.cookies.set(AUTH_SIG_COOKIE_NAME, '', { maxAge: 0, path: '/' });
    } else {
      try {
        const parsed = JSON.parse(decodeURIComponent(authCookie));
        if (parsed && typeof parsed === 'object') {
          // If payload itself includes an embedded signature, verify it
          if (parsed.sig && parsed.payload) {
            const isPayloadValid = await verifyAuthCookieSignature(JSON.stringify(parsed.payload), parsed.sig);
            if (!isPayloadValid) {
              isActiveUser = false;
              userEmail = null;
              userRole = null;
              userId = null;
              response.cookies.set(AUTH_COOKIE_NAME, '', { maxAge: 0, path: '/' });
              response.cookies.set(AUTH_SIG_COOKIE_NAME, '', { maxAge: 0, path: '/' });
            } else {
              const target = parsed.payload;
              if (target.is_active === false) {
                isActiveUser = false;
              } else {
                userEmail = target.email || null;
                userRole = target.role || null;
                userId = target.id || null;
              }
            }
          } else if (parsed.is_active === false) {
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
  }

  // 5. If live Supabase instance configured, verify session cryptographically with getUser()
  if (isSupabaseLive) {
    try {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (user && !error) {
        const { data: profile, error: profileError } = await supabase
          .from('profiles').select('role, is_active').eq('id', user.id).maybeSingle();
        if (profile && !profileError && profile.is_active !== false) {
          userEmail = user.email || null;
          userId = user.id;
          userRole = profile.role;
        }
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

  // Email callbacks can carry tokens in a fragment, which the server cannot see.
  // Let the login page process them even when a session already exists.
  if (pathname === '/login') return response;

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
