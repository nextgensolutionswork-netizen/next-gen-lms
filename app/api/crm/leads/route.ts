import { NextRequest, NextResponse } from 'next/server';
import { createLead, getLeads } from '@/lib/services/crm-service';
import { store } from '@/lib/services/data-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const stage = request.nextUrl.searchParams.get('stage') || undefined;
    const search = request.nextUrl.searchParams.get('search') || undefined;
    const leads = await getLeads({
      stage: stage as any,
      search,
    });
    return NextResponse.json({ success: true, leads });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || 'Failed to fetch leads', leads: store.leads || [] },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const lead = await createLead(body);
    return NextResponse.json({ success: true, lead });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || 'Failed to create lead' },
      { status: 400 }
    );
  }
}

