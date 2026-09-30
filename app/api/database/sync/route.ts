import { NextRequest, NextResponse } from 'next/server';
import {
  syncLocalToPostgres,
  syncPostgresToLocal,
} from '@/lib/supabase/sync-service';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const direction = body.direction || 'push';

    let result;
    if (direction === 'pull') {
      result = await syncPostgresToLocal();
    } else {
      result = await syncLocalToPostgres();
    }

    return NextResponse.json({
      success: result.success,
      data: result,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Database synchronization failed',
      },
      { status: 500 }
    );
  }
}
