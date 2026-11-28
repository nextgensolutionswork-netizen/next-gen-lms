import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from '@/middleware';
import { generateAuthCookieSignatureSync } from '@/lib/security/auth-cookie';

function createMockRequest(url: string, cookiePayload?: string) {
  const req = new NextRequest(new URL(url, 'http://localhost:3000'), {
    headers: { host: 'localhost:3000' },
  });
  if (cookiePayload) {
    req.cookies.set('next_gen_auth_user', encodeURIComponent(cookiePayload));
    req.cookies.set('next_gen_auth_user_sig', generateAuthCookieSignatureSync(encodeURIComponent(cookiePayload)));
  }
  return req;
}

describe('ARCH-BUG-01: Middleware Route Classification & API Security', () => {
  describe('A. Public API Routes (Allowed without authentication)', () => {
    it('allows unauthenticated POST to /api/auth/login', async () => {
      const req = createMockRequest('http://localhost:3000/api/auth/login');
      const res = await middleware(req);
      expect(res.status).toBe(200);
    });

    it('allows unauthenticated GET to /api/database/health', async () => {
      const req = createMockRequest('http://localhost:3000/api/database/health');
      const res = await middleware(req);
      expect(res.status).toBe(200);
    });

    it('allows unauthenticated access to /api/storage/signed endpoints', async () => {
      const req = createMockRequest('http://localhost:3000/api/storage/signed?bucket=receipts&path=test.pdf');
      const res = await middleware(req);
      expect(res.status).toBe(200);
    });
  });

  describe('B. Webhook API Routes (Passthrough for cryptographic signature verification)', () => {
    it('allows webhook requests to /api/webhooks/razorpay to reach handler signature verification', async () => {
      const req = createMockRequest('http://localhost:3000/api/webhooks/razorpay');
      const res = await middleware(req);
      expect(res.status).toBe(200);
    });

    it('allows webhook requests to /api/webhooks/telecrm to reach token validation', async () => {
      const req = createMockRequest('http://localhost:3000/api/webhooks/telecrm');
      const res = await middleware(req);
      expect(res.status).toBe(200);
    });
  });

  describe('C. Protected API Routes (Strictly require authentication)', () => {
    it('rejects unauthenticated requests to /api/fees/payments with HTTP 401 JSON', async () => {
      const req = createMockRequest('http://localhost:3000/api/fees/payments');
      const res = await middleware(req);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toBe('Unauthenticated');
    });

    it('rejects unauthenticated requests to /api/crm/leads with HTTP 401 JSON', async () => {
      const req = createMockRequest('http://localhost:3000/api/crm/leads');
      const res = await middleware(req);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toBe('Unauthenticated');
    });

    it('rejects unauthenticated requests to /api/onboarding/cases with HTTP 401 JSON', async () => {
      const req = createMockRequest('http://localhost:3000/api/onboarding/cases');
      const res = await middleware(req);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toBe('Unauthenticated');
    });

    it('allows authenticated requests to protected API routes to pass through with 200', async () => {
      const staffUser = JSON.stringify({
        id: 'usr-admin-1',
        email: 'admin@next-generpsolutions.com',
        role: 'admin',
        is_active: true,
      });
      const req = createMockRequest('http://localhost:3000/api/fees/payments', staffUser);
      const res = await middleware(req);
      expect(res.status).toBe(200);
    });
  });
});
