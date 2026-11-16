import { NextRequest, NextResponse } from 'next/server';
import { authenticatePaymentRequest } from '@/lib/auth/payment-session';
import { getUpcomingPaymentDues, getAllPaymentDues } from '@/lib/services/upcoming-dues-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const actor = await authenticatePaymentRequest(request);

    // Enforce role authorization server-side
    const authorizedRoles = ['super_admin', 'admin', 'accountant', 'counsellor'];
    if (!authorizedRoles.includes(actor.role)) {
      return NextResponse.json(
        { success: false, error: 'Forbidden: You do not possess authorization to view upcoming payment dues.' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const scopeParam = searchParams.get('scope');

    const rawBaseDate =
      searchParams.get('base_date') ||
      searchParams.get('as_of') ||
      request.headers.get('x-reference-date') ||
      request.headers.get('x-base-date') ||
      undefined;

    let baseDate: Date | undefined = undefined;
    if (rawBaseDate) {
      const parsed = new Date(rawBaseDate);
      if (!isNaN(parsed.getTime())) {
        baseDate = parsed;
      }
    }

    const result =
      scopeParam === 'all'
        ? getAllPaymentDues(actor, {
            scope: 'all',
            search: searchParams.get('search') || undefined,
            statusFilter: (searchParams.get('status') as any) || 'all',
            courseId: searchParams.get('course_id') || undefined,
            startDate: searchParams.get('start_date') || undefined,
            endDate: searchParams.get('end_date') || undefined,
            page: parseInt(searchParams.get('page') || '1', 10),
            pageSize: parseInt(searchParams.get('page_size') || '10', 10),
            baseDate,
          })
        : getUpcomingPaymentDues(actor, { baseDate });

    return NextResponse.json(result, {
      headers: {
        'Cache-Control': 'private, no-cache, no-store, must-revalidate',
      },
    });
  } catch (error: any) {
    const message = error?.message || 'Failed to retrieve upcoming payment dues.';
    const status = message.startsWith('Unauthorized') ? 401 : /Forbidden|Access denied/i.test(message) ? 403 : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
