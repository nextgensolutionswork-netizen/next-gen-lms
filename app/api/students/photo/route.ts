import { NextRequest, NextResponse } from 'next/server';
import { createHash, randomUUID } from 'crypto';
import { mkdir, readFile, writeFile } from 'fs/promises';
import path from 'path';
import os from 'os';
import { authenticatePaymentRequest } from '@/lib/auth/payment-session';
import { tenantId } from '@/lib/auth/tenant';
import { createAdminClient } from '@/lib/supabase/admin';
import { isLiveSupabaseEnabled } from '@/lib/supabase/db';
import { validateFile } from '@/lib/services/storage-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const root = process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME
  ? path.join(os.tmpdir(), 'data', 'student-photos')
  : path.resolve(process.cwd(), 'data', 'student-photos');

const mime: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
};

function fail(error: unknown) {
  const message = error instanceof Error ? error.message : 'Photo operation failed.';
  return NextResponse.json(
    { success: false, error: message },
    { status: message.startsWith('Unauthorized') ? 401 : /Forbidden/.test(message) ? 403 : 400 }
  );
}

export async function POST(request: NextRequest) {
  try {
    const actor = await authenticatePaymentRequest(request);
    if (!['counsellor', 'admin', 'super_admin', 'student', 'onboarding_team'].includes(actor.role)) {
      throw new Error('Forbidden: Authorized access required to upload student photo.');
    }

    const form = await request.formData();
    const file = form.get('file') as File | null;
    if (!file || typeof file.arrayBuffer !== 'function') {
      throw new Error('Please select a student photograph to upload.');
    }

    // Server-side file validation (size <= 2MB, allowed formats: JPG, JPEG, PNG, WEBP)
    const validation = validateFile({ name: file.name, size: file.size, type: file.type }, 'student-photos');
    if (!validation.valid) {
      throw new Error(validation.error || 'Invalid photo file. Please upload a JPG, PNG, or WEBP under 2 MB.');
    }

    const extension = file.name.split('.').pop()!.toLowerCase();
    const objectPath = `${hash(tenantId(actor))}/${randomUUID()}.${extension}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    if (isLiveSupabaseEnabled()) {
      const { error } = await createAdminClient()
        .storage.from('student-photos')
        .upload(objectPath, buffer, { contentType: mime[extension] || 'image/jpeg', upsert: false });
      if (error) throw new Error(error.message);
    } else {
      const target = path.join(root, objectPath);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, buffer, { flag: 'wx' });
    }

    return NextResponse.json({
      success: true,
      bucket: 'student-photos',
      path: objectPath,
      url: `/api/students/photo?path=${encodeURIComponent(objectPath)}`,
    });
  } catch (error) {
    return fail(error);
  }
}

export async function GET(request: NextRequest) {
  try {
    const actor = await authenticatePaymentRequest(request);
    if (!['counsellor', 'accountant', 'admin', 'super_admin', 'student', 'onboarding_team', 'trainer'].includes(actor.role)) {
      throw new Error('Forbidden: Authorized access required to view student photographs.');
    }

    const objectPath = request.nextUrl.searchParams.get('path') || '';
    if (!/^[a-f0-9]{64}\/[a-f0-9-]{36}\.(png|jpe?g|webp)$/i.test(objectPath)) {
      throw new Error('Invalid student photo path.');
    }

    const [tenant] = objectPath.split('/');
    if (tenant !== hash(tenantId(actor))) {
      throw new Error('Forbidden: Photo belongs to another institute tenant.');
    }

    if (isLiveSupabaseEnabled()) {
      const { data, error } = await createAdminClient()
        .storage.from('student-photos')
        .createSignedUrl(objectPath, 300);
      if (error || !data) throw new Error('Student photo not found.');
      return NextResponse.redirect(data.signedUrl, {
        headers: { 'Cache-Control': 'private, no-store' },
      });
    }

    const bytes = await readFile(path.join(root, objectPath));
    const ext = objectPath.split('.').pop()!.toLowerCase();
    return new NextResponse(bytes, {
      headers: {
        'Content-Type': mime[ext] || 'image/jpeg',
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    return fail(error);
  }
}
