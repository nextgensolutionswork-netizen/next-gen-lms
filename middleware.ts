import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. Skip Next.js internal files, static assets, and images
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.includes('.') ||
    pathname === '/favicon.ico'
  ) {
    return NextResponse.next();
  }

  // 2. Identify public routes
  const isPublicRoute =
    pathname === '/login' ||
    pathname === '/' ||
    pathname.startsWith('/certificate/verify');

  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  // 3. Inspect active authentication cookie
  const authCookie = request.cookies.get('next_gen_auth_user')?.value;
  let userRole: string | null = null;
  let userEmail: string | null = null;

  if (authCookie) {
    try {
      const parsed = JSON.parse(decodeURIComponent(authCookie));
      userRole = parsed.role;
      userEmail = parsed.email;
    } catch {}
  }

  // 4. If Supabase is configured with real URL, sync cookies with Supabase Auth
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const isSupabaseLive = supabaseUrl && !supabaseUrl.includes('mock-sap-lms');

  if (isSupabaseLive) {
    const supabase = createServerClient(
      supabaseUrl!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return request.cookies.get(name)?.value;
          },
          set(name: string, value: string, options: CookieOptions) {
            request.cookies.set({ name, value, ...options });
            response = NextResponse.next({
              request: {
                headers: request.headers,
              },
            });
            response.cookies.set({ name, value, ...options });
          },
          remove(name: string, options: CookieOptions) {
            request.cookies.set({ name, value: '', ...options });
            response = NextResponse.next({
              request: {
                headers: request.headers,
              },
            });
            response.cookies.set({ name, value: '', ...options });
          },
        },
      }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (user?.email) {
      userEmail = user.email;
    }
  }

  const isAuthenticated = Boolean(userEmail || authCookie);

  // 5. If user is authenticated and hits /login, redirect to their home page
  if (pathname === '/login' && isAuthenticated) {
    if (userRole === 'student') {
      return NextResponse.redirect(new URL('/portal', request.url));
    } else if (userRole === 'support') {
      return NextResponse.redirect(new URL('/support', request.url));
    }
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  // 6. Protect private routes against unauthenticated visitors
  if (!isPublicRoute && !isAuthenticated) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirectTo', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // 7. Role-based Route Boundary Protection
  if (isAuthenticated && userRole === 'student') {
    const staffOnlyPrefixes = ['/users', '/settings', '/audit-logs', '/accounts/expenses', '/crm'];
    const isAccessingStaffOnly = staffOnlyPrefixes.some((p) => pathname.startsWith(p));
    if (isAccessingStaffOnly) {
      return NextResponse.redirect(new URL('/portal', request.url));
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
