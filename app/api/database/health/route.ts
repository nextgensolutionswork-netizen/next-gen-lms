import { NextResponse } from 'next/server';
import { checkDatabaseHealth } from '@/lib/supabase/sync-service';

export async function GET() {
  try {
    const health = await checkDatabaseHealth();
    return NextResponse.json({
      success: true,
      health,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to check database health',
      },
      { status: 500 }
    );
  }
}
