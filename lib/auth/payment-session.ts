import { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createAdminClient } from '@/lib/supabase/admin';
import { isLiveSupabaseEnabled } from '@/lib/supabase/db';
import { store } from '@/lib/services/data-store';
import { AUTH_COOKIE_NAME, AUTH_SIG_COOKIE_NAME, verifyAuthCookieSignature } from '@/lib/security/auth-cookie';
import { UserProfile } from '@/types';

/** Financial endpoints never accept a user ID, role, or tenant from request data. */
export async function authenticatePaymentRequest(request: NextRequest): Promise<UserProfile> {
  if (request.method !== 'GET') {
    const origin = request.headers.get('origin');
    if (origin && origin !== request.nextUrl.origin) throw new Error('Forbidden: Invalid request origin.');
  }
  let user: UserProfile | undefined;
  if (isLiveSupabaseEnabled()) {
    const client = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!, {
      cookies: { getAll: () => request.cookies.getAll(), setAll: () => {} },
    });
    const token = request.headers.get('authorization')?.replace(/^Bearer /, '');
    const { data, error } = await client.auth.getUser(token);
    if (error || !data.user) throw new Error('Unauthorized: Valid authenticated session required.');
    const profile = await createAdminClient().from('profiles').select('*').eq('id', data.user.id).single();
    if (profile.error) {
      if (/invalid api key|invalid jwt/i.test(profile.error.message)) {
        throw new Error('Payment service configuration error: The server Supabase API key is invalid for the configured project. Contact your administrator.');
      }
      if (profile.error.code === 'PGRST116') throw new Error('Forbidden: Your account has no configured staff profile. Contact your administrator.');
      throw new Error('Payment service unavailable: Could not verify your staff profile. Contact your administrator or retry.');
    }
    if (!profile.data?.tenant_id) throw new Error('Forbidden: Tenant membership is not configured. Ask your administrator to apply the payment workflow migration and verify your profile membership.');
    user = profile.data as UserProfile;
  } else {
    // Compatibility for the local demonstration installation only.
    if (process.env.NODE_ENV === 'production') throw new Error('Unauthorized: Live authentication must be configured.');
    const value = request.headers.get('cookie')?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${AUTH_COOKIE_NAME}=`))?.slice(AUTH_COOKIE_NAME.length + 1);
    const signature = request.cookies.get(AUTH_SIG_COOKIE_NAME)?.value;
    const parsedCookie = request.cookies.get(AUTH_COOKIE_NAME)?.value;
    const signedValue = value && signature && await verifyAuthCookieSignature(value, signature) ? value
      : parsedCookie && signature && await verifyAuthCookieSignature(parsedCookie, signature) ? parsedCookie : null;
    if (!signedValue) throw new Error('Unauthorized: Signed session required.');
    const decoded = JSON.parse(decodeURIComponent(signedValue));
    user = store.users.find((u) => u.id === (decoded.payload || decoded).id);
  }
  if (!user || user.is_active === false) throw new Error('Unauthorized: Active user required.');
  return user;
}
