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

  // 4. Verify live Supabase session first if enabled
  if (isSupabaseLive) {
    try {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (error) {
        // No live Supabase session cookie found or network error; fall through to signed cookie verification
      } else if (user) {
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('role, is_active')
          .eq('id', user.id)
          .maybeSingle();

        if (profile && !profileError) {
          if (profile.is_active === false) {
            isActiveUser = false;
          } else {
            userEmail = user.email || null;
            userId = user.id;
            userRole = profile.role;
            isActiveUser = true;
          }
        } else {
          isActiveUser = false;
        }
      }
    } catch {
      // Network/Supabase service error -> fallback to signed cookie check
    }
  }

  // 5. If not authenticated via live session, verify HMAC-signed auth cookie (next_gen_auth_user)
  if (!userId && !userEmail && isActiveUser) {
    const rawHeaderCookie = request.headers.get('cookie')?.split(';').map((p) => p.trim()).find((p) => p.startsWith(`${AUTH_COOKIE_NAME}=`))?.slice(AUTH_COOKIE_NAME.length + 1);
    const authCookie = request.cookies.get(AUTH_COOKIE_NAME)?.value || (rawHeaderCookie ? decodeURIComponent(rawHeaderCookie) : undefined);
    const sigCookie = request.cookies.get(AUTH_SIG_COOKIE_NAME)?.value;

    if (authCookie) {
      let isSignatureValid = true;
      if (sigCookie) {
        if (rawHeaderCookie && await verifyAuthCookieSignature(rawHeaderCookie, sigCookie)) {
          isSignatureValid = true;
        } else if (await verifyAuthCookieSignature(authCookie, sigCookie)) {
          isSignatureValid = true;
        } else if (await verifyAuthCookieSignature(encodeURIComponent(authCookie), sigCookie)) {
          isSignatureValid = true;
        } else {
          isSignatureValid = false;
        }
      }

      if (!isSignatureValid) {
        // Tampered cookie detected: signature does not match!
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
  }

  const isAuthenticated = Boolean(isActiveUser && (userEmail || userId));

  if (isSupabaseLive && isAuthenticated && userRole === 'student' && (pathname.startsWith('/portal') || pathname.startsWith('/api/conference') || pathname.startsWith('/api/attendance'))) {
    const adminKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const checkClient = adminKey ? createServerClient(supabaseUrl, adminKey, { cookies: { getAll: () => [], setAll: () => {} } }) : supabase;
    const { data: access, error: accessError } = await checkClient.from('student_lms_access').select('enabled').eq('user_id', userId).maybeSingle();
    if (!accessError && access?.enabled === false) {
      if (pathname.startsWith('/api/')) return NextResponse.json({ error: 'Onboarding checks must be completed before LMS access is activated.' }, { status: 403 });
      return createRedirect('/login?reason=onboarding_pending');
    }
  }

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

  // 10. Student boundary isolation: students can only access /portal, /certificate/verify, and their receipts
  if (isAuthenticated && userRole === 'student') {
    const isPortalRoute = pathname === '/portal' || pathname.startsWith('/portal/');
    const isVerifyRoute = pathname.startsWith('/certificate/verify');
    const isReceiptRoute = pathname === '/accounts/receipts' || pathname.startsWith('/accounts/receipts/');
    if (!isPortalRoute && !isVerifyRoute && !isReceiptRoute) {
      return createRedirect('/portal');
    }
  }

  // 11. Super Admin boundary: /todos diagnostic probe console restricted strictly to super_admin
  if (isAuthenticated && userRole !== 'super_admin' && (pathname === '/todos' || pathname.startsWith('/todos/'))) {
    const fallback =
      {
        student: '/portal',
        support: '/support',
        accountant: '/accounts/fees',
        counsellor: '/crm/leads',
        trainer: '/academics/courses',
        placement_coordinator: '/placement',
        onboarding_team: '/onboarding',
        admin: '/dashboard',
      }[userRole || ''] || '/dashboard';
    return createRedirect(fallback);
  }

  // 12. Staff boundary: sensitive admin settings, audit logs, and users directory restricted strictly to super_admin and admin
  if (isAuthenticated && !['super_admin', 'admin'].includes(userRole || '')) {
    const restrictedToAdmins = ['/settings', '/audit-logs', '/users', '/todos'];
    if (restrictedToAdmins.some((p) => pathname.startsWith(p))) {
      const fallback =
        {
          student: '/portal',
          support: '/support',
          accountant: '/accounts/fees',
          counsellor: '/crm/leads',
          trainer: '/academics/courses',
          placement_coordinator: '/placement',
          onboarding_team: '/onboarding',
        }[userRole || ''] || '/dashboard';
      return createRedirect(fallback);
    }
  }

  // 13. Onboarding team boundary: onboarding staff strictly restricted to /onboarding workspace
  if (isAuthenticated && userRole === 'onboarding_team') {
    const isOnboardingRoute = pathname === '/onboarding' || pathname.startsWith('/onboarding/');
    const isVerifyRoute = pathname.startsWith('/certificate/verify');
    if (!isOnboardingRoute && !isVerifyRoute) {
      return createRedirect('/onboarding');
    }
  }

  // 14. Protect /onboarding from non-authorized roles (only super_admin, admin, and onboarding_team)
  if (isAuthenticated && (pathname === '/onboarding' || pathname.startsWith('/onboarding/'))) {
    const isAllowedOnboarding = userRole === 'super_admin' || userRole === 'admin' || userRole === 'onboarding_team';
    if (!isAllowedOnboarding) {
      if (userRole === 'student') return createRedirect('/portal');
      if (userRole === 'accountant') return createRedirect('/accounts/fees');
      if (userRole === 'counsellor') return createRedirect('/crm/leads');
      if (userRole === 'trainer') return createRedirect('/academics/courses');
      if (userRole === 'placement_coordinator') return createRedirect('/placement');
      if (userRole === 'support') return createRedirect('/support');
      return createRedirect('/dashboard');
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
