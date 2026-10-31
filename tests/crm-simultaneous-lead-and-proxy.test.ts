import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { validateCsrfOrigin } from '@/lib/security/rate-limiter';
import { authenticatePaymentRequest } from '@/lib/auth/payment-session';

describe('Simultaneous Lead Creation & Lead-Code Collision Retry Tests', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('handles simultaneous lead code collision and retries with unique suffix without duplicates', async () => {
    const mockInsert = vi.fn();
    const mockStore = {
      leads: [
        { id: 'lead-prev-1', lead_code: 'LD-2026-001', full_name: 'Lead 1' },
      ],
      courses: [
        { id: 'c1000000-0000-0000-0000-000000000001', course_name: 'SAP FICO' },
      ],
      users: [
        { id: '44444444-4444-4444-4444-444444444444', role: 'counsellor', is_active: true, full_name: 'Ananya Desai' },
      ],
      auditLogs: [],
      persist: vi.fn(),
    };

    vi.doMock('@/lib/services/data-store', () => ({ store: mockStore }));
    vi.doMock('@/lib/supabase/db', () => ({
      isLiveSupabaseEnabled: () => true,
      createClient: () => ({
        from: (table: string) => {
          if (table === 'profiles') {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: {
                      id: '44444444-4444-4444-4444-444444444444',
                      full_name: 'Ananya Desai',
                      role: 'counsellor',
                      is_active: true,
                    },
                    error: null,
                  }),
                }),
              }),
            };
          }
          if (table === 'leads') {
            return {
              select: () => ({
                order: () => ({
                  limit: vi.fn().mockResolvedValue({
                    data: [{ lead_code: 'LD-2026-005' }],
                  }),
                }),
              }),
              insert: mockInsert,
            };
          }
          return {};
        },
      }),
    }));

    const { createLead } = await import('@/lib/services/crm-service');

    // Simulate collision on first attempt for request 2
    let insertCallCount = 0;
    mockInsert.mockImplementation(async (payload) => {
      insertCallCount++;
      if (insertCallCount === 1) {
        // Request 1 succeeds
        return { error: null };
      } else if (insertCallCount === 2) {
        // Request 2 collides with unique constraint
        return { error: { message: 'duplicate key value violates unique constraint "leads_lead_code_key"' } };
      } else {
        // Request 2 retry succeeds
        return { error: null };
      }
    });

    const leadData1 = {
      full_name: 'Simultaneous Candidate 1',
      email: 'candidate1@example.com',
      phone: '9876543210',
      interested_course_id: 'c1000000-0000-0000-0000-000000000001',
      counsellor_id: '44444444-4444-4444-4444-444444444444',
      stage: 'New' as const,
    };

    const leadData2 = {
      full_name: 'Simultaneous Candidate 2',
      email: 'candidate2@example.com',
      phone: '9876543211',
      interested_course_id: 'c1000000-0000-0000-0000-000000000001',
      counsellor_id: '44444444-4444-4444-4444-444444444444',
      stage: 'New' as const,
    };

    // Execute simultaneously
    const [res1, res2] = await Promise.all([
      createLead(leadData1),
      createLead(leadData2),
    ]);

    expect(res1).toBeDefined();
    expect(res2).toBeDefined();
    expect(res1.lead_code).not.toEqual(res2.lead_code);
    expect(res2.lead_code).toMatch(/^LD-2026-\d{3}-\d{4}$/); // Retry appended unique suffix

    // Verify exactly 2 new leads added to store, no duplicates
    const added = mockStore.leads.filter((l) => l.full_name.includes('Simultaneous Candidate'));
    expect(added).toHaveLength(2);
    expect(added[0].lead_code).not.toEqual(added[1].lead_code);
  });

  it('rejects lead creation and does not push corrupt record if retry also fails', async () => {
    const mockStore = {
      leads: [],
      courses: [{ id: 'c1000000-0000-0000-0000-000000000001', course_name: 'SAP FICO' }],
      users: [{ id: '44444444-4444-4444-4444-444444444444', role: 'counsellor', is_active: true }],
      persist: vi.fn(),
    };

    vi.doMock('@/lib/services/data-store', () => ({ store: mockStore }));
    vi.doMock('@/lib/supabase/db', () => ({
      isLiveSupabaseEnabled: () => true,
      createClient: () => ({
        from: (table: string) => {
          if (table === 'profiles') {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { id: '44444444-4444-4444-4444-444444444444', role: 'counsellor', is_active: true },
                  }),
                }),
              }),
            };
          }
          if (table === 'leads') {
            return {
              select: () => ({
                order: () => ({ limit: vi.fn().mockResolvedValue({ data: [] }) }),
              }),
              insert: vi.fn().mockResolvedValue({
                error: { message: 'duplicate key value violates unique constraint "leads_lead_code_key"' },
              }),
            };
          }
          return {};
        },
      }),
    }));

    const { createLead } = await import('@/lib/services/crm-service');

    await expect(
      createLead({
        full_name: 'Failing Candidate',
        email: 'failing@example.com',
        phone: '9876543210',
        interested_course_id: 'c1000000-0000-0000-0000-000000000001',
        counsellor_id: '44444444-4444-4444-4444-444444444444',
        stage: 'New' as const,
      })
    ).rejects.toThrow('Database error creating lead');

    // Store must remain clean
    expect(mockStore.leads).toHaveLength(0);
  });
});

describe('Proxy-Origin & CSRF Exception Isolation Tests', () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    (process.env as any).NODE_ENV = originalEnv;
  });

  describe('validateCsrfOrigin', () => {
    it('allows localhost:3001 origin when server host is localhost:3000 in development/test', () => {
      (process.env as any).NODE_ENV = 'development';
      const req = new Request('http://localhost:3000/api/fees/proof', {
        headers: {
          origin: 'http://localhost:3001',
          host: 'localhost:3000',
        },
      });
      expect(validateCsrfOrigin(req)).toBe(true);
    });

    it('allows forwarded host from reverse proxy', () => {
      (process.env as any).NODE_ENV = 'development';
      const req = new Request('http://localhost:3000/api/fees/proof', {
        headers: {
          origin: 'http://localhost:3001',
          host: 'localhost:3000',
          'x-forwarded-host': 'localhost:3001',
        },
      });
      expect(validateCsrfOrigin(req)).toBe(true);
    });

    it('strictly rejects untrusted third-party origins in development', () => {
      (process.env as any).NODE_ENV = 'development';
      const maliciousOrigins = [
        'https://evil.com',
        'http://localhost.evil.com:3001',
        'http://evil-localhost:3000',
        'http://localhost:3000.attacker.com',
        'https://malicious-site.org',
      ];

      for (const origin of maliciousOrigins) {
        const req = new Request('http://localhost:3000/api/fees/proof', {
          headers: {
            origin,
            host: 'localhost:3000',
          },
        });
        expect(validateCsrfOrigin(req)).toBe(false);
      }
    });

    it('strictly rejects localhost port mismatch in production mode', () => {
      (process.env as any).NODE_ENV = 'production';
      const req = new Request('http://localhost:3000/api/fees/proof', {
        headers: {
          origin: 'http://localhost:3001',
          host: 'localhost:3000',
        },
      });
      expect(validateCsrfOrigin(req)).toBe(false);
    });

    it('allows matching origin and host in production mode', () => {
      (process.env as any).NODE_ENV = 'production';
      const req = new Request('https://app.nextgen-lms.com/api/fees/proof', {
        headers: {
          origin: 'https://app.nextgen-lms.com',
          host: 'app.nextgen-lms.com',
        },
      });
      expect(validateCsrfOrigin(req)).toBe(true);
    });
  });

  describe('authenticatePaymentRequest Origin Gate', () => {
    it('rejects POST from untrusted origin with Forbidden error', async () => {
      (process.env as any).NODE_ENV = 'development';
      const req = new NextRequest('http://localhost:3000/api/fees/proof', {
        method: 'POST',
        headers: {
          origin: 'https://attacker-origin.com',
        },
      });

      await expect(authenticatePaymentRequest(req)).rejects.toThrow('Forbidden: Invalid request origin.');
    });

    it('rejects POST from subdomain lookalike attacker with Forbidden error', async () => {
      (process.env as any).NODE_ENV = 'development';
      const req = new NextRequest('http://localhost:3000/api/fees/proof', {
        method: 'POST',
        headers: {
          origin: 'http://localhost.evil.com',
        },
      });

      await expect(authenticatePaymentRequest(req)).rejects.toThrow('Forbidden: Invalid request origin.');
    });

    it('allows localhost:3001 POST to localhost:3000 in development mode without throwing origin error', async () => {
      (process.env as any).NODE_ENV = 'development';
      const req = new NextRequest('http://localhost:3000/api/fees/proof', {
        method: 'POST',
        headers: {
          origin: 'http://localhost:3001',
        },
      });

      // It will pass the origin check, and only fail downstream on session / auth
      try {
        await authenticatePaymentRequest(req);
      } catch (err: any) {
        expect(err.message).not.toContain('Invalid request origin');
      }
    });
  });
});
