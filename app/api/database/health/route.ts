import { NextRequest, NextResponse } from 'next/server';
import { checkDatabaseHealth } from '@/lib/supabase/sync-service';
import { authenticateApiRequest } from '@/lib/auth/server-session';

export async function GET(request: NextRequest) {
  const auth = await authenticateApiRequest(request, { allowedRoles: ['super_admin', 'admin'] });
  if (auth.errorResponse) return auth.errorResponse;
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
