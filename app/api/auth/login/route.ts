import { NextRequest, NextResponse } from 'next/server';
import { verifyUserCredentials } from '@/lib/auth/credentials';
import { getSafeRedirectUrl } from '@/lib/auth/rbac';
import {
  AUTH_COOKIE_NAME,
  AUTH_SIG_COOKIE_NAME,
  AUTH_COOKIE_SECRET,
  generateAuthCookieSignature,
} from '@/lib/security/auth-cookie';
import { validateCsrfOrigin } from '@/lib/security/rate-limiter';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * POST /api/auth/login
 * Secure server-side authentication handler.
 * Supports both JSON API requests and native HTML form POST submissions (when JavaScript is disabled).
 * Guarantees passwords NEVER appear in URLs, logs, or redirect destinations.
 */
export async function POST(request: NextRequest) {
  // 1. CSRF Protection: Validate Origin / Referer against Host
  if (!validateCsrfOrigin(request)) {
    const isJson = request.headers.get('accept')?.includes('application/json');
    if (isJson) {
      return NextResponse.json(
        { success: false, error: 'Invalid request origin or CSRF verification failed.' },
        { status: 403 }
      );
    }
    return NextResponse.redirect(new URL('/login?error=csrf_failed', request.url), {
      status: 303,
    });
  }

  // 2. Parse Credentials from either Form Data (HTML Form POST) or JSON
  let email = '';
  let password = '';
  let redirectTo: string | null = null;
  const contentType = request.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json') || request.headers.get('accept')?.includes('application/json');

  try {
    if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      email = (formData.get('email') as string) || '';
      password = (formData.get('password') as string) || '';
      redirectTo = (formData.get('redirectTo') as string) || null;
    } else {
      const body = await request.json().catch(() => ({}));
      email = body.email || '';
      password = body.password || '';
      redirectTo = body.redirectTo || null;
    }
  } catch {
    if (isJson) {
      return NextResponse.json(
        { success: false, error: 'Invalid request payload.' },
        { status: 400 }
      );
    }
    return NextResponse.redirect(new URL('/login?error=missing_credentials', request.url), {
      status: 303,
    });
  }

  // 3. Verify Credentials Safely
  const verification = await verifyUserCredentials(email, password);

  if (!verification.success || !verification.user) {
    const errorCode = verification.errorCode || 'invalid_credentials';
    if (isJson) {
      return NextResponse.json(
        { success: false, error: verification.error || 'Authentication failed.', errorCode },
        { status: 401 }
      );
    }

    // Redirect back to login with safe error code (ZERO credentials in URL)
    const errorUrl = new URL('/login', request.url);
    errorUrl.searchParams.set('error', errorCode);
    if (redirectTo && !redirectTo.startsWith('/login')) {
      errorUrl.searchParams.set('redirectTo', redirectTo);
    }
    return NextResponse.redirect(errorUrl, { status: 303 });
  }

  const user = verification.user;

  // 4. Construct HMAC-Signed Authentication Session
  const cookiePayload = encodeURIComponent(
    JSON.stringify({
      id: user.id,
      email: user.email,
      full_name: user.full_name,
      role: user.role,
      is_active: user.is_active,
      tenant_id: user.tenant_id,
      phone: user.phone,
      branch_id: user.branch_id,
      avatar_url: user.avatar_url,
      created_at: user.created_at,
    })
  );

  const cookieSignature = await generateAuthCookieSignature(cookiePayload, AUTH_COOKIE_SECRET);
  const destination = getSafeRedirectUrl(user.role, redirectTo);

  // 5. Construct Secure Response with HTTP-Only Cookies
  let response: NextResponse;
  if (isJson && !contentType.includes('application/x-www-form-urlencoded')) {
    response = NextResponse.json({
      success: true,
      user,
      redirectTo: destination,
    });
  } else {
    // 303 See Other forces the browser to issue an HTTP GET to destination
    response = NextResponse.redirect(new URL(destination, request.url), { status: 303 });
  }

  const isProduction = process.env.NODE_ENV === 'production';

  response.cookies.set({
    name: AUTH_COOKIE_NAME,
    value: cookiePayload,
    path: '/',
    maxAge: 604800, // 7 days
    sameSite: 'lax',
    secure: isProduction,
    httpOnly: false, // Accessible to client-side auth context
  });

  response.cookies.set({
    name: AUTH_SIG_COOKIE_NAME,
    value: cookieSignature,
    path: '/',
    maxAge: 604800,
    sameSite: 'lax',
    secure: isProduction,
    httpOnly: true, // Prevents JavaScript tampering with the HMAC signature
  });

  return response;
}
