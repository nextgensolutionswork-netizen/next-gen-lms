import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticateApiRequest } from '@/lib/auth/server-session';
import { tenantId } from '@/lib/auth/tenant';
import { store } from '@/lib/services/data-store';
import { getVendors, createVendor } from '@/lib/services/finance-service';
import { isLiveSupabaseEnabled } from '@/lib/supabase/db';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const ALLOWED_CATEGORIES = [
  'Hardware / Server',
  'Marketing',
  'Facility',
  'Software / Cloud',
  'Honorarium',
  'Other',
] as const;

const CreateVendorSchema = z.object({
  id: z.string().uuid().optional(),
  vendor_name: z.string().trim().min(1, 'Vendor name is required').max(200),
  contact_person: z.string().trim().min(1, 'Contact person is required').max(200),
  phone: z.string().trim().min(1, 'Phone is required').max(50).default('+910000000000'),
  email: z.string().trim().email('Valid email is required').max(200),
  category: z.enum(ALLOWED_CATEGORIES).default('Other'),
  gst_number: z.string().trim().max(50).nullable().optional(),
  pan_number: z.string().trim().max(20).nullable().optional(),
  tds_section: z.string().trim().max(20).nullable().optional(),
  tds_rate: z.number().nonnegative().max(100).nullable().optional(),
  address: z.string().trim().max(500).nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
  bank_name: z.string().trim().max(100).nullable().optional(),
  bank_account: z.string().trim().max(50).nullable().optional(),
  bank_account_number: z.string().trim().max(50).nullable().optional(),
  ifsc_code: z.string().trim().max(20).nullable().optional(),
  bank_ifsc: z.string().trim().max(20).nullable().optional(),
  tenant_id: z.string().trim().optional(),
});

export async function GET(req: NextRequest) {
  try {
    store.hydrateFromDisk();

    const auth = await authenticateApiRequest(req, {
      allowedRoles: ['super_admin', 'admin', 'accountant'],
      requiredPermission: 'vendors:read',
    });
    if (auth.errorResponse) {
      return auth.errorResponse;
    }

    const vendors = await getVendors();
    return NextResponse.json({
      success: true,
      vendors,
      total: vendors.length,
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        error: err.message || 'Failed to retrieve vendor registry',
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    store.hydrateFromDisk();

    const auth = await authenticateApiRequest(req, {
      allowedRoles: ['super_admin', 'admin', 'accountant'],
      requiredPermission: 'vendors:write',
    });
    if (auth.errorResponse) {
      return auth.errorResponse;
    }
    const actor = auth.user;

    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Malformed JSON payload.' },
        { status: 400 }
      );
    }

    const parseResult = CreateVendorSchema.safeParse(body);
    if (!parseResult.success) {
      const issues = (parseResult.error as any).issues || [];
      const errorMsg = issues.length > 0 ? issues.map((i: any) => i.message).join(', ') : parseResult.error.message;
      return NextResponse.json(
        { success: false, error: `Validation error: ${errorMsg}` },
        { status: 400 }
      );
    }

    const data = parseResult.data;

    // Tenant boundary check
    const actorTenant = tenantId(actor);
    if (data.tenant_id && data.tenant_id !== actorTenant && actor.role !== 'super_admin') {
      return NextResponse.json(
        { success: false, error: 'Forbidden: Tenant isolation mismatch.' },
        { status: 403 }
      );
    }

    const bankAccount = data.bank_account || data.bank_account_number || undefined;
    const ifscCode = data.ifsc_code || data.bank_ifsc || undefined;

    const vendor = await createVendor(
      {
        vendor_name: data.vendor_name,
        contact_person: data.contact_person,
        phone: data.phone,
        email: data.email,
        category: data.category,
        gst_number: data.gst_number || undefined,
        pan_number: data.pan_number || undefined,
        tds_section: data.tds_section || undefined,
        tds_rate: data.tds_rate ?? undefined,
        address: data.address || undefined,
        notes: data.notes || undefined,
        bank_name: data.bank_name || undefined,
        bank_account_number: bankAccount,
        bank_ifsc: ifscCode,
        is_active: true,
        status: 'Active',
      },
      actor.id
    );

    return NextResponse.json({
      success: true,
      vendor,
    }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        error: err.message || 'Failed to create vendor record',
      },
      { status: 500 }
    );
  }
}
