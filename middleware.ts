import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { verifyAuthCookieSignature, AUTH_COOKIE_NAME, AUTH_SIG_COOKIE_NAME } from '@/lib/security/auth-cookie';

export async function middleware(request: NextRequest) {
  // 0. Security Guard: Detect and strip any credentials/passwords transmitted in URL query parameters
  const sensitiveParams = ['password', 'pass', 'pwd', 'secret', 'newPassword', 'confirmPassword', 'auth_password'];
  const hasSensitiveQuery = sensitiveParams.some((param) => request.nextUrl.searchParams.has(param));

  if (hasSensitiveQuery) {
    const sanitizedUrl = request.nextUrl.clone();
    sensitiveParams.forEach((param) => sanitizedUrl.searchParams.delete(param));
    sanitizedUrl.searchParams.set('error', 'insecure_request');
    return NextResponse.redirect(sanitizedUrl, { status: 308 });
  }

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
      let isSignatureValid = false;
      if (sigCookie) {
        try {
          if (rawHeaderCookie && await verifyAuthCookieSignature(rawHeaderCookie, sigCookie)) {
            isSignatureValid = true;
          } else if (await verifyAuthCookieSignature(authCookie, sigCookie)) {
            isSignatureValid = true;
          } else if (await verifyAuthCookieSignature(encodeURIComponent(authCookie), sigCookie)) {
            isSignatureValid = true;
          } else {
            isSignatureValid = false;
          }
        } catch (cookieSigErr) {
          console.error('[Middleware] Auth cookie signature verification failed safely:', cookieSigErr);
          isSignatureValid = false;
        }
      }

      if (!isSignatureValid) {
        // Tampered cookie or missing signature: reject unverified cookie
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
            } else {
              // Direct payload without embedded signature, but outer signature was validated
              const target = parsed.payload || parsed;
              if (target.is_active === false) {
                isActiveUser = false;
              } else {
                userEmail = target.email || null;
                userRole = target.role || null;
                userId = target.id || null;
              }
            }
          }
        } catch {
          // Corrupt JSON in cookie -> unauthenticated
          isActiveUser = false;
        }
      }
    }
  }

  const isAuthenticated = Boolean(isActiveUser && (userEmail || userId));

  if (isSupabaseLive && isAuthenticated && userRole === 'student' && (pathname.startsWith('/portal') || pathname.startsWith('/api/conference') || pathname.startsWith('/api/attendance'))) {
    // The own_lms_access SELECT policy authorizes this lookup using the verified
    // student's session. Never elevate an LMS-access check to service_role.
    const { data: access, error: accessError } = await supabase.from('student_lms_access').select('enabled').eq('user_id', userId).maybeSingle();
    // G03: Fail-closed. Only explicit enabled === true is permitted; missing row or error must block
    if (accessError || !access || access.enabled !== true) {
      if (pathname.startsWith('/api/')) return NextResponse.json({ error: 'Onboarding checks must be completed before LMS access is activated.' }, { status: 403 });
      return createRedirect(accessError ? '/login?error=access_unavailable' : '/login?error=onboarding_pending');
    }
  }

  // 6. API Route Security & Explicit Classification (ARCH-BUG-01)
  if (pathname.startsWith('/api')) {
    // A. Explicitly Approved Public API Routes
    const isPublicApi =
      pathname === '/api/auth/login' ||
      pathname === '/api/database/health' ||
      (pathname.startsWith('/api/certificates/') && pathname.endsWith('/pdf')) ||
      pathname.startsWith('/api/storage/signed');

    // B. Signed / Authenticated External Webhooks (delegated to handler HMAC & token checks)
    const isWebhookApi = pathname.startsWith('/api/webhooks/');

    if (isPublicApi || isWebhookApi) {
      return response;
    }

    // C. Protected API Routes: Require valid authenticated session
    if (!isAuthenticated) {
      return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
    }

    return response;
  }

  // 7. Public routes accessible without authentication
  // 4. Public routes accessible without authentication – extended for testing and health checks
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

  // 10. Student boundary isolation: students can only access /portal, /certificate/verify, and their individual receipts
  if (isAuthenticated && userRole === 'student') {
    const isPortalRoute = pathname === '/portal' || pathname.startsWith('/portal/');
    const isVerifyRoute = pathname.startsWith('/certificate/verify');
    const isReceiptDetail = pathname.startsWith('/accounts/receipts/') && pathname.length > '/accounts/receipts/'.length;
    const isStatementDetail = pathname.startsWith('/accounts/statements/') && pathname.length > '/accounts/statements/'.length;
    if (!isPortalRoute && !isVerifyRoute && !isReceiptDetail && !isStatementDetail) {
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
        counsellor_lead: '/crm/leads',
        trainer: '/academics/courses',
        placement_coordinator: '/placement',
        onboarding_team: '/onboarding',
        admin: '/dashboard',
      }[userRole || ''] || '/dashboard';
    return createRedirect(fallback);
  }

  // 12. Staff boundary: sensitive admin settings, audit logs, and users directory restricted strictly to super_admin and admin
  if (isAuthenticated && !['super_admin', 'admin'].includes(userRole || '')) {
    const restrictedToAdmins = ['/settings', '/audit-logs', '/audit', '/users', '/todos'];
    if (restrictedToAdmins.some((p) => pathname.startsWith(p))) {
      const fallback =
        {
          student: '/portal',
          support: '/support',
          accountant: '/accounts/fees',
          counsellor: '/crm/leads',
        counsellor_lead: '/crm/leads',
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

  // 15. Financial workspace boundary: Deny-by-default for all /accounts/* routes (NG-03)
  if (isAuthenticated && (pathname === '/accounts' || pathname.startsWith('/accounts/'))) {
    const isSensitiveDesk = ['/accounts/approvals', '/accounts/expenses', '/accounts/vendors', '/accounts/reports'].some((p) => pathname.startsWith(p));
    const isOperationalDesk = ['/accounts/fees', '/accounts/payments', '/accounts/installments', '/accounts/receipts', '/accounts/dues', '/accounts/statements/'].some((p) => pathname.startsWith(p));

    let isAllowed = false;
    if (userRole === 'super_admin' || userRole === 'admin' || userRole === 'accountant') {
      isAllowed = true;
    } else if (userRole === 'counsellor' && isOperationalDesk && !isSensitiveDesk) {
      isAllowed = true;
    } else if (userRole === 'student' && ['/accounts/receipts/', '/accounts/statements/'].some(p => pathname.startsWith(p) && pathname.length > p.length)) {
      isAllowed = true;
    }

    if (!isAllowed) {
      if (userRole === 'counsellor' && isSensitiveDesk) {
        const isJson =
          request.headers.get('accept')?.includes('application/json') ||
          request.headers.get('x-requested-with') === 'XMLHttpRequest';
        if (isJson) {
          return NextResponse.json(
            { success: false, error: 'Forbidden: Counsellor role is not authorized to access Fee Approvals or Financial Analytics.' },
            { status: 403 }
          );
        }
        return new NextResponse(
          `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>403 Forbidden - Access Restricted</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f8fafc; color: #0f172a; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 16px; }
    .card { background: #ffffff; border: 1px solid #fecaca; border-radius: 12px; padding: 32px; max-width: 440px; text-align: center; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); }
    .badge { display: inline-block; padding: 4px 10px; background: #fee2e2; color: #991b1b; font-size: 11px; font-weight: 700; border-radius: 9999px; font-family: monospace; letter-spacing: 0.05em; margin-bottom: 12px; }
    h1 { font-size: 18px; font-weight: 700; color: #450a0a; margin: 0 0 8px 0; }
    p { font-size: 13px; color: #7f1d1d; margin: 0 0 24px 0; line-height: 1.5; }
    .btn { display: inline-block; background: #0A6ED1; color: #ffffff; padding: 8px 16px; font-size: 13px; font-weight: 600; text-decoration: none; border-radius: 6px; }
    .btn:hover { background: #0858a7; }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">403 FORBIDDEN</div>
    <h1>Access Restricted</h1>
    <p>Users with the Counsellor role are not authorized to view or access Fee Approvals or Financial Analytics.</p>
    <a href="/crm/leads" class="btn">Return to CRM Leads</a>
  </div>
</body>
</html>`,
          {
            status: 403,
            headers: {
              'content-type': 'text/html; charset=utf-8',
              'cache-control': 'no-store',
            },
          }
        );
      }

      const fallback =
        {
          student: '/portal',
          counsellor: '/crm/leads',
        counsellor_lead: '/crm/leads',
          trainer: '/academics/courses',
          placement_coordinator: '/placement',
          onboarding_team: '/onboarding',
          support: '/support',
        }[userRole || ''] || '/dashboard';
      return createRedirect(fallback);
    }
  }

  // 16. CRM & Admissions boundary: /crm and /admissions restricted to super_admin, admin, counsellor
  if (isAuthenticated && (pathname.startsWith('/crm') || pathname.startsWith('/admissions'))) {
    if (!['super_admin', 'admin', 'counsellor', 'counsellor_lead'].includes(userRole || '')) {
      const fallback =
        {
          student: '/portal',
          accountant: '/accounts/fees',
          trainer: '/academics/courses',
          placement_coordinator: '/placement',
          onboarding_team: '/onboarding',
          support: '/support',
        }[userRole || ''] || '/dashboard';
      return createRedirect(fallback);
    }
  }

  // 17. Placements boundary: /placement restricted to super_admin, admin, placement_coordinator
  if (isAuthenticated && pathname.startsWith('/placement')) {
    if (!['super_admin', 'admin', 'placement_coordinator'].includes(userRole || '')) {
      const fallback =
        {
          student: '/portal',
          accountant: '/accounts/fees',
          counsellor: '/crm/leads',
        counsellor_lead: '/crm/leads',
          trainer: '/academics/courses',
          onboarding_team: '/onboarding',
          support: '/support',
        }[userRole || ''] || '/dashboard';
      return createRedirect(fallback);
    }
  }

  // 18. Academics & Support boundaries
  if (isAuthenticated && pathname.startsWith('/academics')) {
    if (!['super_admin', 'admin', 'trainer'].includes(userRole || '')) {
      const fallback =
        {
          student: '/portal',
          accountant: '/accounts/fees',
          counsellor: '/crm/leads',
          counsellor_lead: '/crm/leads',
          placement_coordinator: '/placement',
          onboarding_team: '/onboarding',
          support: '/support',
        }[userRole || ''] || '/dashboard';
      return createRedirect(fallback);
    }
  }

  if (isAuthenticated && pathname.startsWith('/support')) {
    if (!['super_admin', 'admin', 'support', 'trainer'].includes(userRole || '')) {
      const fallback =
        {
          student: '/portal',
          accountant: '/accounts/fees',
          counsellor: '/crm/leads',
          counsellor_lead: '/crm/leads',
          placement_coordinator: '/placement',
          onboarding_team: '/onboarding',
        }[userRole || ''] || '/dashboard';
      return createRedirect(fallback);
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
