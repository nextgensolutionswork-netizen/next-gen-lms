import { NextRequest, NextResponse } from 'next/server';
import { authenticatePaymentRequest } from '@/lib/auth/payment-session';
import { createClient, isLiveSupabaseEnabled } from '@/lib/supabase/db';
import { createClient as createSessionClient } from '@/lib/supabase/server';
import { searchRecords } from '@/lib/services/global-search';

export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest) {
  const headers = { 'Cache-Control': 'private, no-store' };
  try {
    const actor = await authenticatePaymentRequest(request);
    const query = (request.nextUrl.searchParams.get('q') || '').trim();
    if (query.length > 100) return NextResponse.json({ error: 'Search must be 100 characters or fewer.' }, { status: 400, headers });
    const live = isLiveSupabaseEnabled();
    const results = await searchRecords(actor, query, live ? createSessionClient() : createClient(actor), live);
    return NextResponse.json({ results }, { headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const status = message.startsWith('Unauthorized') ? 401 : message.startsWith('Forbidden') ? 403 : 503;
    return NextResponse.json({ error: status === 401 ? 'Please sign in to search.' : status === 403 ? 'Search access denied.' : 'Search is unavailable. Please try again.' }, { status, headers });
  }
}
