import { NextResponse } from 'next/server';
import { checkDatabaseHealth } from '@/lib/supabase/sync-service';
import { isLiveSupabaseEnabled } from '@/lib/supabase/db';
import { extractProjectIdentifier } from '@/lib/security/database-preflight';

export async function GET() {
  try {
    const health = await checkDatabaseHealth();
    const isLive = isLiveSupabaseEnabled();

    const databaseProject = isLive
      ? extractProjectIdentifier(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.DATABASE_URL)
      : 'mock-sap-lms';

    const storageProject = isLive
      ? extractProjectIdentifier(process.env.NEXT_PUBLIC_SUPABASE_URL)
      : 'mock-sap-lms';

    const storageBackend = isLive ? 'supabase_storage' : 'local_disk_mock';

    return NextResponse.json({
      success: true,
      health,
      databaseProject,
      storageProject,
      storageBackend,
      storageBucket: 'payment-proofs',
      isLive,
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
