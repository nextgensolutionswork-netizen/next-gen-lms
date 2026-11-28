import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUserFromRequest } from '@/lib/auth/server-session';
import { store } from '@/lib/services/data-store';
import {
  createInstituteBrand,
  getInstitutes,
  updateInstituteBrand,
} from '@/lib/services/institute-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const authUser = await getAuthenticatedUserFromRequest(request);
  if (!authUser) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized: Authentication is required.' },
      { status: 401 }
    );
  }
  store.hydrateFromDisk();
  const activeOnly = request.nextUrl.searchParams.get('active_only') === 'true';
  const institutes = getInstitutes({ activeOnly });
  return NextResponse.json({ success: true, institutes }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: NextRequest) {
  try {
    const authUser = await getAuthenticatedUserFromRequest(request);
    if (!authUser) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized: Administrative authentication is required.' },
        { status: 401 }
      );
    }
    if (!['super_admin', 'admin'].includes(authUser.role)) {
      return NextResponse.json(
        { success: false, error: 'Forbidden: Only Super Admin or Admin can manage Institute Master.' },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ success: false, error: 'Invalid request payload.' }, { status: 400 });
    }

    store.hydrateFromDisk();

    if (body.action === 'create') {
      const institute = await createInstituteBrand(authUser, {
        name: body.name,
        code: body.code,
        tagline: body.tagline,
        email: body.email,
        phone: body.phone,
        address: body.address,
      });
      return NextResponse.json({ success: true, institute, institutes: getInstitutes() });
    }

    if (body.action === 'update' || body.action === 'toggle_status') {
      if (!body.id) {
        return NextResponse.json({ success: false, error: 'Institute id is required.' }, { status: 400 });
      }
      const institute = await updateInstituteBrand(authUser, body.id, {
        name: body.name,
        code: body.code,
        is_active: body.is_active,
        tagline: body.tagline,
        email: body.email,
        phone: body.phone,
        address: body.address,
      });
      return NextResponse.json({ success: true, institute, institutes: getInstitutes() });
    }

    return NextResponse.json({ success: false, error: 'Unsupported action.' }, { status: 400 });
  } catch (error: any) {
    const message = error?.message || 'Institute Master operation failed.';
    const status = message.startsWith('Forbidden') ? 403 : 400;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
