import { NextRequest, NextResponse } from 'next/server';
import { authenticatePaymentRequest } from '@/lib/auth/payment-session';
import { getAllPaymentDues } from '@/lib/services/upcoming-dues-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const actor = await authenticatePaymentRequest(request);

    // Enforce role authorization server-side
    const authorizedRoles = ['super_admin', 'admin', 'accountant', 'counsellor'];
    if (!authorizedRoles.includes(actor.role)) {
      return NextResponse.json(
        { success: false, error: 'Forbidden: You do not possess authorization to view student payment due dates.' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const scopeParam = searchParams.get('scope');
    const scope = scopeParam === 'next3days' ? 'next3days' : 'all';
    const search = searchParams.get('search') || undefined;
    const statusParam = searchParams.get('status');
    const statusFilter = (statusParam as any) || 'all';
    const courseId = searchParams.get('course_id') || undefined;
    const startDate = searchParams.get('start_date') || undefined;
    const endDate = searchParams.get('end_date') || undefined;
    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSize = parseInt(searchParams.get('page_size') || '10', 10);

    const result = getAllPaymentDues(actor, {
      scope,
      search,
      statusFilter,
      courseId,
      startDate,
      endDate,
      page,
      pageSize,
    });

    return NextResponse.json(result, {
      headers: {
        'Cache-Control': 'private, no-cache, no-store, must-revalidate',
      },
    });
  } catch (error: any) {
    const message = error?.message || 'Failed to retrieve student payment due dates.';
    const status = message.startsWith('Unauthorized') ? 401 : /Forbidden|Access denied/i.test(message) ? 403 : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
