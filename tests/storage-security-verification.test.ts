import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as signedGet } from '@/app/api/storage/signed/route';
import { POST as signedUrlPost } from '@/app/api/storage/signed-url/route';
import { POST as uploadPost } from '@/app/api/upload/route';
import { createSignedUrl, verifySignedUrlToken, STORAGE_BUCKETS } from '@/lib/services/storage-service';
import { generateAuthCookieSignatureSync } from '@/lib/security/auth-cookie';
import { UserRole } from '@/types';

function createMockAuthRequest(
  url: string,
  method: 'GET' | 'POST' = 'GET',
  role: UserRole = 'student',
  body?: any,
  options: { userId?: string; email?: string } = {}
) {
  const req = new NextRequest(new URL(url, 'http://localhost:3000'), {
    method,
    headers: {
      host: 'localhost:3000',
      origin: 'http://localhost:3000',
      'Content-Type': 'application/json',
    },
    body: body !== undefined ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
  });

  const cookiePayload = JSON.stringify({
    id: options.userId || `usr-${role}-test`,
    email: options.email || `${role}@next-generpsolutions.com`,
    role,
    tenant_id: 'default',
    is_active: true,
  });

  req.cookies.set('next_gen_auth_user', encodeURIComponent(cookiePayload));
  req.cookies.set('next_gen_auth_user_sig', generateAuthCookieSignatureSync(encodeURIComponent(cookiePayload)));

  return req;
}

describe('SEC-BUG-01: Storage Security & Policy Verification Suite', () => {
  it('1. verifies sensitive buckets (receipts, resumes) are marked strictly private', () => {
    expect(STORAGE_BUCKETS.receipts.public).toBe(false);
    expect(STORAGE_BUCKETS.resumes.public).toBe(false);
    expect(STORAGE_BUCKETS['payment-proofs'].public).toBe(false);
    expect(STORAGE_BUCKETS['student-photos'].public).toBe(false);
  });

  it('2. verifies signed URL creation generates valid short-lived token', async () => {
    const bucket = 'receipts';
    const filePath = 'REC-2026-0042.pdf';
    const result = await createSignedUrl(bucket, filePath, 300);

    expect(result.token).toBeDefined();
    expect(result.signedUrl).toContain('bucket=receipts');
    expect(result.signedUrl).toContain('path=REC-2026-0042.pdf');
    expect(result.signedUrl).toContain('expires=');
    expect(result.signedUrl).toContain('signature=');

    // Token must be verifiable
    const url = new URL(result.signedUrl, 'http://localhost:3000');
    const expires = parseInt(url.searchParams.get('expires')!, 10);
    const sig = url.searchParams.get('signature')!;
    expect(verifySignedUrlToken(bucket, filePath, expires, sig)).toBe(true);
  });

  it('3. verifies expired signed URL is strictly denied (HTTP 403 Forbidden)', async () => {
    const expiredTimestamp = Math.floor(Date.now() / 1000) - 30; // Expired 30 seconds ago
    const invalidReq = new NextRequest(
      new URL(
        `http://localhost:3000/api/storage/signed?bucket=receipts&path=test.pdf&expires=${expiredTimestamp}&signature=forged_sig`,
        'http://localhost:3000'
      )
    );

    const res = await signedGet(invalidReq);
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toMatch(/expired|Invalid or forged/i);
  });

  it('4. verifies forged signature on signed URL is strictly rejected (HTTP 403 Forbidden)', async () => {
    const futureTimestamp = Math.floor(Date.now() / 1000) + 3600;
    const req = new NextRequest(
      new URL(
        `http://localhost:3000/api/storage/signed?bucket=receipts&path=secret.pdf&expires=${futureTimestamp}&signature=bad_forged_hash`,
        'http://localhost:3000'
      )
    );

    const res = await signedGet(req);
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toContain('Invalid or forged');
  });

  it('5. verifies malformed signed URL parameters are rejected (HTTP 400 Bad Request)', async () => {
    const req = new NextRequest(new URL('http://localhost:3000/api/storage/signed?bucket=receipts', 'http://localhost:3000'));
    const res = await signedGet(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toContain('Malformed signed URL');
  });

  it('6. verifies unauthorized direct upload to payment-proofs is blocked with HTTP 403 Forbidden', async () => {
    const formData = new FormData();
    const blob = new Blob(['sample pdf content'], { type: 'application/pdf' });
    formData.append('file', blob, 'proof.pdf');
    formData.append('bucket', 'payment-proofs');

    const req = new NextRequest(new URL('http://localhost:3000/api/upload', 'http://localhost:3000'), {
      method: 'POST',
      headers: {
        host: 'localhost:3000',
        origin: 'http://localhost:3000',
      },
      body: formData,
    });

    const res = await uploadPost(req);
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toContain('Use the authenticated payment proof endpoint');
  });
});
