import { NextRequest, NextResponse } from 'next/server';
import { AUTH_COOKIE_NAME, AUTH_SIG_COOKIE_NAME } from '@/lib/security/auth-cookie';
import { isLiveSupabaseEnabled, getDb } from '@/lib/supabase/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function performLogout(request: NextRequest) {
  if (isLiveSupabaseEnabled()) {
    try {
      const db = getDb();
      await db.auth.signOut();
    } catch {}
  }

  const isJson = request.headers.get('accept')?.includes('application/json');
  const response = isJson
    ? NextResponse.json({ success: true, message: 'Logged out successfully.' })
    : NextResponse.redirect(new URL('/login?notice=logged_out', request.url), { status: 303 });

  response.cookies.set({
    name: AUTH_COOKIE_NAME,
    value: '',
    path: '/',
    maxAge: 0,
  });

  response.cookies.set({
    name: AUTH_SIG_COOKIE_NAME,
    value: '',
    path: '/',
    maxAge: 0,
    httpOnly: true,
  });

  return response;
}

export async function POST(request: NextRequest) {
  return performLogout(request);
}

export async function GET(request: NextRequest) {
  return performLogout(request);
}
