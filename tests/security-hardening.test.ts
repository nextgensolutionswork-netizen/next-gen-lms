import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { NextRequest } from 'next/server';
import { middleware } from '@/middleware';
import {
  generateAuthCookieSignature,
  generateAuthCookieSignatureSync,
  verifyAuthCookieSignature,
  verifyAuthCookieSignatureSync,
  AUTH_COOKIE_NAME,
  AUTH_SIG_COOKIE_NAME,
  AUTH_COOKIE_SECRET,
} from '@/lib/security/auth-cookie';
import {
  checkRateLimit,
  resetRateLimitStore,
  validateCsrfOrigin,
  getClientIp,
} from '@/lib/security/rate-limiter';
import { POST as createOrderRouteHandler } from '@/app/api/payments/create-order/route';
import { POST as uploadRouteHandler } from '@/app/api/upload/route';
import { store } from '@/lib/services/data-store';

describe('Security Hardening & Database Compliance Test Suite', () => {
  beforeEach(() => {
    resetRateLimitStore();
    store.hydrateFromDisk();
  });

  // =========================================================================
  // 1. SQL MIGRATION CONTENT VALIDITY
  // =========================================================================
  describe('1. SQL Migration Content Validity (007_gst_and_compliance.sql)', () => {
    const migrationPath = path.join(
      process.cwd(),
      'supabase',
      'migrations',
      '007_gst_and_compliance.sql'
    );

    it('migration file exists on disk and is readable', () => {
      expect(fs.existsSync(migrationPath)).toBe(true);
      const sqlContent = fs.readFileSync(migrationPath, 'utf8');
      expect(sqlContent.length).toBeGreaterThan(100);
    });

    it('adds state, state_code, and gstin to admissions table', () => {
      const sql = fs.readFileSync(migrationPath, 'utf8');
      const admissionsSection = sql.slice(
        sql.indexOf('ALTER TABLE admissions'),
        sql.indexOf('ALTER TABLE students')
      );

      expect(admissionsSection).toMatch(/state\s+VARCHAR\(100\)/i);
      expect(admissionsSection).toMatch(/state_code\s+VARCHAR\(10\)/i);
      expect(admissionsSection).toMatch(/gstin\s+VARCHAR\(20\)/i);
    });

    it('adds state, state_code, and gstin to students table', () => {
      const sql = fs.readFileSync(migrationPath, 'utf8');
      const studentsSection = sql.slice(
        sql.indexOf('ALTER TABLE students'),
        sql.indexOf('ALTER TABLE receipts')
      );

      expect(studentsSection).toMatch(/state\s+VARCHAR\(100\)/i);
      expect(studentsSection).toMatch(/state_code\s+VARCHAR\(10\)/i);
      expect(studentsSection).toMatch(/gstin\s+VARCHAR\(20\)/i);
    });

    it('adds full GST tax breakdown & IRN columns to receipts table', () => {
      const sql = fs.readFileSync(migrationPath, 'utf8');
      const receiptsSection = sql.slice(sql.indexOf('ALTER TABLE receipts'));

      const requiredColumns = [
        /supply_type\s+VARCHAR\(20\)/i,
        /place_of_supply\s+VARCHAR\(100\)/i,
        /place_of_supply_code\s+VARCHAR\(10\)/i,
        /sac_code\s+VARCHAR\(20\)/i,
        /taxable_amount\s+NUMERIC\(12,2\)/i,
        /cgst_rate\s+NUMERIC\(5,2\)/i,
        /cgst_amount\s+NUMERIC\(12,2\)/i,
        /sgst_rate\s+NUMERIC\(5,2\)/i,
        /sgst_amount\s+NUMERIC\(12,2\)/i,
        /igst_rate\s+NUMERIC\(5,2\)/i,
        /igst_amount\s+NUMERIC\(12,2\)/i,
        /total_tax\s+NUMERIC\(12,2\)/i,
        /is_reverse_charge\s+BOOLEAN\s+DEFAULT\s+FALSE/i,
        /irn\s+VARCHAR\(64\)/i,
        /ack_no\s+VARCHAR\(30\)/i,
        /ack_date\s+TIMESTAMPTZ/i,
      ];

      for (const colRegex of requiredColumns) {
        expect(receiptsSection).toMatch(colRegex);
      }
    });

    it('creates appropriate lookup indexes for IRN and GSTIN queries', () => {
      const sql = fs.readFileSync(migrationPath, 'utf8');
      expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS idx_receipts_irn ON receipts\(irn\)/i);
      expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS idx_students_gstin ON students\(gstin\)/i);
      expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS idx_admissions_gstin ON admissions\(gstin\)/i);
    });
  });

  // =========================================================================
  // 2. HMAC SIGNATURE GENERATION & TAMPER REJECTION
  // =========================================================================
  describe('2. HMAC Signature Generation and Tamper Rejection', () => {
    const sampleUserPayload = encodeURIComponent(
      JSON.stringify({
        id: 'usr-student-01',
        email: 'amit.gupta@student.next-gen.com',
        role: 'student',
        full_name: 'Amit Gupta',
        is_active: true,
      })
    );

    it('generates deterministic 64-character hex HMAC-SHA256 signature', async () => {
      const sig = await generateAuthCookieSignature(sampleUserPayload);
      expect(sig).toMatch(/^[a-f0-9]{64}$/);

      const sigSync = generateAuthCookieSignatureSync(sampleUserPayload);
      expect(sigSync).toBe(sig);
    });

    it('verifies valid HMAC signature successfully', async () => {
      const sig = await generateAuthCookieSignature(sampleUserPayload);
      const isValid = await verifyAuthCookieSignature(sampleUserPayload, sig);
      expect(isValid).toBe(true);
      expect(verifyAuthCookieSignatureSync(sampleUserPayload, sig)).toBe(true);
    });

    it('rejects tampered cookie payload where user escalates role to super_admin', async () => {
      const validSig = await generateAuthCookieSignature(sampleUserPayload);

      // Malicious actor modifies cookie to escalate role
      const tamperedPayload = encodeURIComponent(
        JSON.stringify({
          id: 'usr-student-01',
          email: 'amit.gupta@student.next-gen.com',
          role: 'super_admin', // Privilege escalation attempt
          full_name: 'Amit Gupta',
          is_active: true,
        })
      );

      const isValid = await verifyAuthCookieSignature(tamperedPayload, validSig);
      expect(isValid).toBe(false);
      expect(verifyAuthCookieSignatureSync(tamperedPayload, validSig)).toBe(false);
    });

    it('rejects tampered cookie signature with mismatched hash', async () => {
      const forgedSig = 'a'.repeat(64);
      const isValid = await verifyAuthCookieSignature(sampleUserPayload, forgedSig);
      expect(isValid).toBe(false);
      expect(verifyAuthCookieSignatureSync(sampleUserPayload, forgedSig)).toBe(false);
    });

    it('handles empty or malformed inputs safely', async () => {
      expect(await verifyAuthCookieSignature('', 'abc')).toBe(false);
      expect(await verifyAuthCookieSignature('abc', '')).toBe(false);
      expect(verifyAuthCookieSignatureSync('', 'abc')).toBe(false);
      expect(verifyAuthCookieSignatureSync('abc', '')).toBe(false);
    });

    describe('Middleware Integration with HMAC Tamper Rejection', () => {
      it('allows authenticated user with valid signature to access /dashboard', async () => {
        const adminPayload = encodeURIComponent(
          JSON.stringify({
            id: 'usr-admin-01',
            email: 'superadmin@next-generpsolutions.com',
            role: 'super_admin',
            is_active: true,
          })
        );
        const adminSig = await generateAuthCookieSignature(adminPayload);

        const req = new NextRequest(new URL('http://localhost:3000/dashboard'), {
          headers: { host: 'localhost:3000' },
        });
        req.cookies.set(AUTH_COOKIE_NAME, adminPayload);
        req.cookies.set(AUTH_SIG_COOKIE_NAME, adminSig);

        const res = await middleware(req);
        expect(res.status).toBe(200);
      });

      it('rejects tampered auth cookie in middleware and clears cookies', async () => {
        // Legitimate student cookie signed
        const originalStudentPayload = encodeURIComponent(
          JSON.stringify({
            id: 'usr-student-01',
            email: 'student@example.com',
            role: 'student',
            is_active: true,
          })
        );
        const originalSig = await generateAuthCookieSignature(originalStudentPayload);

        // Attacker tampers role to super_admin while reusing old signature
        const tamperedPayload = encodeURIComponent(
          JSON.stringify({
            id: 'usr-student-01',
            email: 'student@example.com',
            role: 'super_admin',
            is_active: true,
          })
        );

        const req = new NextRequest(new URL('http://localhost:3000/dashboard'), {
          headers: { host: 'localhost:3000' },
        });
        req.cookies.set(AUTH_COOKIE_NAME, tamperedPayload);
        req.cookies.set(AUTH_SIG_COOKIE_NAME, originalSig);

        const res = await middleware(req);

        // Must redirect to login because tampering invalidated the session
        expect(res.status).toBe(307);
        const location = res.headers.get('location');
        expect(location).toContain('/login');

        // Verify cookies were cleared in response
        const cookies = res.cookies.getAll();
        const clearedAuth = cookies.find((c) => c.name === AUTH_COOKIE_NAME);
        const clearedSig = cookies.find((c) => c.name === AUTH_SIG_COOKIE_NAME);

        expect(clearedAuth?.value === '' || clearedAuth?.maxAge === 0).toBe(true);
        expect(clearedSig?.value === '' || clearedSig?.maxAge === 0).toBe(true);
      });

      it('rejects tampered signature cookie in middleware and redirects to /login', async () => {
        const req = new NextRequest(new URL('http://localhost:3000/dashboard'), {
          headers: { host: 'localhost:3000' },
        });
        req.cookies.set(AUTH_COOKIE_NAME, sampleUserPayload);
        req.cookies.set(AUTH_SIG_COOKIE_NAME, 'tampered-signature-hash-value-123456');

        const res = await middleware(req);
        expect(res.status).toBe(307);
        expect(res.headers.get('location')).toContain('/login');
      });

      it('enforces role boundaries for legitimately signed student sessions', async () => {
        const studentSig = await generateAuthCookieSignature(sampleUserPayload);

        // Student accessing portal -> 200 OK
        const reqPortal = new NextRequest(new URL('http://localhost:3000/portal'), {
          headers: { host: 'localhost:3000' },
        });
        reqPortal.cookies.set(AUTH_COOKIE_NAME, sampleUserPayload);
        reqPortal.cookies.set(AUTH_SIG_COOKIE_NAME, studentSig);

        const resPortal = await middleware(reqPortal);
        expect(resPortal.status).toBe(200);

        // Student attempting to access admin dashboard -> 307 Redirected to /portal
        const reqDashboard = new NextRequest(new URL('http://localhost:3000/dashboard'), {
          headers: { host: 'localhost:3000' },
        });
        reqDashboard.cookies.set(AUTH_COOKIE_NAME, sampleUserPayload);
        reqDashboard.cookies.set(AUTH_SIG_COOKIE_NAME, studentSig);

        const resDashboard = await middleware(reqDashboard);
        expect(resDashboard.status).toBe(307);
        expect(resDashboard.headers.get('location')).toContain('/portal');
      });
    });
  });

  // =========================================================================
  // 3. RATE LIMITING & CSRF ORIGIN CHECK UTILITY
  // =========================================================================
  describe('3. Rate Limiting & CSRF Origin Check Utility', () => {
    describe('Sliding-Window Rate Limiter', () => {
      it('allows requests within the threshold and reports correct remaining count', () => {
        const ip = '10.0.0.1';
        const limit = 3;
        const windowSec = 60;

        const res1 = checkRateLimit(ip, limit, windowSec);
        expect(res1.allowed).toBe(true);
        expect(res1.remaining).toBe(2);
        expect(res1.resetSeconds).toBeGreaterThan(0);

        const res2 = checkRateLimit(ip, limit, windowSec);
        expect(res2.allowed).toBe(true);
        expect(res2.remaining).toBe(1);

        const res3 = checkRateLimit(ip, limit, windowSec);
        expect(res3.allowed).toBe(true);
        expect(res3.remaining).toBe(0);
      });

      it('blocks requests once limit is reached and provides retry-after resetSeconds', () => {
        const ip = '10.0.0.2';
        const limit = 2;
        const windowSec = 30;

        checkRateLimit(ip, limit, windowSec);
        checkRateLimit(ip, limit, windowSec);

        // 3rd attempt exceeds limit
        const blocked = checkRateLimit(ip, limit, windowSec);
        expect(blocked.allowed).toBe(false);
        expect(blocked.remaining).toBe(0);
        expect(blocked.resetSeconds).toBeGreaterThan(0);
        expect(blocked.resetSeconds).toBeLessThanOrEqual(windowSec);
      });

      it('isolates rate limits independently per IP address', () => {
        const ipA = '192.168.1.100';
        const ipB = '192.168.1.200';
        const limit = 1;
        const windowSec = 60;

        // Exhaust IP A
        const resA1 = checkRateLimit(ipA, limit, windowSec);
        expect(resA1.allowed).toBe(true);

        const resA2 = checkRateLimit(ipA, limit, windowSec);
        expect(resA2.allowed).toBe(false);

        // IP B should still be allowed
        const resB = checkRateLimit(ipB, limit, windowSec);
        expect(resB.allowed).toBe(true);
      });

      it('extracts client IP from proxy headers via getClientIp', () => {
        const reqWithForwarded = new Request('http://localhost:3000', {
          headers: { 'x-forwarded-for': '203.0.113.195, 70.41.3.18' },
        });
        expect(getClientIp(reqWithForwarded)).toBe('203.0.113.195');

        const reqWithRealIp = new Request('http://localhost:3000', {
          headers: { 'x-real-ip': '198.51.100.1' },
        });
        expect(getClientIp(reqWithRealIp)).toBe('198.51.100.1');

        const reqDefault = new Request('http://localhost:3000');
        expect(getClientIp(reqDefault)).toBe('127.0.0.1');
      });
    });

    describe('CSRF Origin Validation', () => {
      it('allows request when Origin matches Host', () => {
        const req = new Request('http://localhost:3000/api/payments/create-order', {
          method: 'POST',
          headers: {
            origin: 'http://localhost:3000',
            host: 'localhost:3000',
          },
        });
        expect(validateCsrfOrigin(req)).toBe(true);
      });

      it('rejects cross-origin request when Origin does not match Host (CSRF attack)', () => {
        const req = new Request('http://localhost:3000/api/payments/create-order', {
          method: 'POST',
          headers: {
            origin: 'http://evil-attacker.com',
            host: 'localhost:3000',
          },
        });
        expect(validateCsrfOrigin(req)).toBe(false);
      });

      it('allows request when Origin is absent and Referer matches Host', () => {
        const req = new Request('http://localhost:3000/api/payments/create-order', {
          method: 'POST',
          headers: {
            referer: 'http://localhost:3000/dashboard/payments',
            host: 'localhost:3000',
          },
        });
        expect(validateCsrfOrigin(req)).toBe(true);
      });

      it('rejects request when Referer does not match Host', () => {
        const req = new Request('http://localhost:3000/api/payments/create-order', {
          method: 'POST',
          headers: {
            referer: 'http://malicious-site.org/phish',
            host: 'localhost:3000',
          },
        });
        expect(validateCsrfOrigin(req)).toBe(false);
      });

      it('allows request when neither Origin nor Referer is present (internal/server-to-server)', () => {
        const req = new Request('http://localhost:3000/api/payments/create-order', {
          method: 'POST',
          headers: {
            host: 'localhost:3000',
          },
        });
        expect(validateCsrfOrigin(req)).toBe(true);
      });

      it('handles malformed Origin or Referer URLs gracefully without throwing', () => {
        const reqBadOrigin = new Request('http://localhost:3000/api/upload', {
          method: 'POST',
          headers: {
            origin: ':::not-a-valid-url:::',
            host: 'localhost:3000',
          },
        });
        expect(validateCsrfOrigin(reqBadOrigin)).toBe(false);

        const reqBadReferer = new Request('http://localhost:3000/api/upload', {
          method: 'POST',
          headers: {
            referer: 'not-a-url',
            host: 'localhost:3000',
          },
        });
        expect(validateCsrfOrigin(reqBadReferer)).toBe(false);
      });
    });

    describe('API Route Rate Limiting & Origin Check Integration', () => {
      it('POST /api/payments/create-order rejects cross-origin CSRF with 403', async () => {
        const req = new NextRequest('http://localhost:3000/api/payments/create-order', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            origin: 'http://attacker.com',
            host: 'localhost:3000',
          },
          body: JSON.stringify({ amount: 1000 }),
        });

        const res = await createOrderRouteHandler(req);
        expect(res.status).toBe(403);
        const data = await res.json();
        expect(data.success).toBe(false);
        expect(data.error).toContain('CSRF');
      });

      it('POST /api/payments/create-order enforces 429 when rate limit is exceeded', async () => {
        const student = store.students[0];
        const feeAccount = store.feeAccounts[0];
        const ip = '198.51.100.42';

        const makeReq = () =>
          new NextRequest('http://localhost:3000/api/payments/create-order', {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'x-forwarded-for': ip,
              origin: 'http://localhost:3000',
              host: 'localhost:3000',
            },
            body: JSON.stringify({
              amount: 5000,
              student_id: student.id,
              course_id: student.course_id,
              fee_account_id: feeAccount.id,
            }),
          });

        // Trigger requests up to limit (15)
        for (let i = 0; i < 15; i++) {
          const res = await createOrderRouteHandler(makeReq());
          expect(res.status).toBe(200);
        }

        // 16th request must trigger rate limit
        const blockedRes = await createOrderRouteHandler(makeReq());
        expect(blockedRes.status).toBe(429);
        const blockedData = await blockedRes.json();
        expect(blockedData.success).toBe(false);
        expect(blockedData.error).toContain('Rate limit exceeded');
        expect(blockedRes.headers.get('Retry-After')).toBeTruthy();
      });

      it('POST /api/upload rejects cross-origin CSRF with 403', async () => {
        const formData = new FormData();
        formData.append('bucket', 'resumes');

        const req = new NextRequest('http://localhost:3000/api/upload', {
          method: 'POST',
          headers: {
            origin: 'http://attacker-site.com',
            host: 'localhost:3000',
          },
          body: formData,
        });

        const res = await uploadRouteHandler(req);
        expect(res.status).toBe(403);
        const data = await res.json();
        expect(data.success).toBe(false);
        expect(data.error).toContain('CSRF');
      });

      it('POST /api/upload enforces 429 when rate limit is exceeded', async () => {
        const ip = '198.51.100.99';
        const makeReq = () => {
          const formData = new FormData();
          formData.append('bucket', 'resumes');
          return new NextRequest('http://localhost:3000/api/upload', {
            method: 'POST',
            headers: {
              'x-forwarded-for': ip,
              origin: 'http://localhost:3000',
              host: 'localhost:3000',
            },
            body: formData,
          });
        };

        // Trigger 30 uploads (the limit)
        for (let i = 0; i < 30; i++) {
          const res = await uploadRouteHandler(makeReq());
          // 400 because no file attached, but rate limiter records the request
          expect(res.status).toBe(400);
        }

        // 31st request must trigger 429 Rate Limit
        const blockedRes = await uploadRouteHandler(makeReq());
        expect(blockedRes.status).toBe(429);
        const data = await blockedRes.json();
        expect(data.success).toBe(false);
        expect(data.error).toContain('Rate limit exceeded');
      });
    });
  });
});
