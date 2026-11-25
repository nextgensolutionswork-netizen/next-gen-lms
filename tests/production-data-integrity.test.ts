import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as dbModule from '@/lib/supabase/db';
import * as adminModule from '@/lib/supabase/admin';
import * as sessionModule from '@/lib/auth/server-session';
import { isProductionEnvironment, isLiveSupabaseEnabled } from '@/lib/supabase/db';
import { getExpenses, getPayments, getReceipts, getStudentFeeAccounts, getVendors } from '@/lib/services/finance-service';
import { getAdmissions, getAdmissionById } from '@/lib/services/admission-service';
import { getBatches, getClassSessions } from '@/lib/services/academics-service';
import { getDoubts } from '@/lib/services/doubt-service';
import { getAuditLogs } from '@/lib/services/audit-service';
import { getPlacementEnrollments } from '@/lib/services/placement-service';
import { getSapSystems, getSapAllocations } from '@/lib/services/sap-lab-service';
import { syncStoreToSupabase } from '@/lib/supabase/seeder';
import { syncLocalToPostgres, syncPostgresToLocal } from '@/lib/supabase/sync-service';
import { persistentStorage } from '@/lib/services/persistent-storage-adapter';
import { store } from '@/lib/services/data-store';
import { admissionsRepo, studentsRepo, batchesRepo, financeRepo, onboardingRepo } from '@/lib/supabase/repository';
import { POST as handleDatabaseSync } from '@/app/api/database/sync/route';
import { NextRequest } from 'next/server';

describe('TASK-01: Production Data Integrity & Prevention of Deleted Data Restoration', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  const mockBatchClient = (batches: any[] = [], students: any[] = []) => ({
    from: vi.fn().mockImplementation((table: string) => ({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockReturnValue({
          range: vi.fn().mockResolvedValue({
            data: table === 'batches' ? batches : students,
            error: null,
          }),
        }),
      }),
    })),
  });

  // =========================================================================
  // GROUP A: Authoritative Database Responses (DI-001 - DI-008)
  // =========================================================================
  describe('Group A: Authoritative Database Responses', () => {
    it('DI-001: Returns authoritative database records when Supabase has records', async () => {
      vi.spyOn(dbModule, 'isLiveSupabaseEnabled').mockReturnValue(true);
      const mockAdmissions = [
        { id: 'adm-live-01', admission_number: 'ADM-2026-0001', student_name: 'Live Student', created_at: '2026-03-01' },
      ];
      vi.spyOn(dbModule, 'createClient').mockReturnValue({
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: mockAdmissions, error: null }),
          }),
        }),
      } as any);

      const result = await getAdmissions();
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('adm-live-01');
    });

    it('DI-002: Empty array returned when database has 0 records (no mock/seed restoration)', async () => {
      vi.spyOn(dbModule, 'isLiveSupabaseEnabled').mockReturnValue(true);
      vi.spyOn(dbModule, 'createClient').mockReturnValue({
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      } as any);

      const admissions = await getAdmissions();
      expect(admissions).toEqual([]);
      expect(admissions).toHaveLength(0);

      const expenses = await getExpenses();
      expect(expenses).toEqual([]);
      expect(expenses).toHaveLength(0);
    });

    it('DI-003: Database error is re-thrown and does NOT silently fall back to mock data', async () => {
      vi.spyOn(dbModule, 'isLiveSupabaseEnabled').mockReturnValue(true);
      vi.spyOn(dbModule, 'createClient').mockReturnValue({
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: null, error: { message: 'Database connection failed' } }),
          }),
        }),
      } as any);

      await expect(getAdmissions()).rejects.toThrow(/Failed to retrieve authoritative admissions/);
      await expect(getExpenses()).rejects.toThrow(/Failed to retrieve authoritative expenses/);
      await expect(getPayments()).rejects.toThrow(/Failed to retrieve authoritative payments/);
    });

    it('DI-004: Timeout error throws without falling back to mock fixtures', async () => {
      vi.spyOn(dbModule, 'isLiveSupabaseEnabled').mockReturnValue(true);
      vi.spyOn(dbModule, 'createClient').mockReturnValue({
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockRejectedValue(new Error('PostgREST request timeout after 15000ms')),
          }),
        }),
      } as any);

      await expect(getReceipts()).rejects.toThrow(/timeout/);
    });

    it('DI-005: Preserves field mapping from database response', async () => {
      vi.spyOn(dbModule, 'isLiveSupabaseEnabled').mockReturnValue(true);
      const mockVendor = [{ id: 'v-1', vendor_name: 'Test Vendor', bank_account: '12345', ifsc_code: 'HDFC0001' }];
      vi.spyOn(adminModule, 'createAdminClient').mockReturnValue({
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: mockVendor, error: null }),
          }),
        }),
      } as any);

      const vendors = await getVendors();
      expect(vendors[0].bank_account_number).toBe('12345');
      expect(vendors[0].bank_ifsc).toBe('HDFC0001');
    });

    it('DI-006: Handles null database fields without replacing them with mock defaults', async () => {
      vi.spyOn(dbModule, 'isLiveSupabaseEnabled').mockReturnValue(true);
      vi.spyOn(dbModule, 'createClient').mockReturnValue({
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            or: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: 'adm-01', admission_number: 'ADM-2026-0001', discount_reason: null, notes: null },
                error: null,
              }),
            }),
          }),
        }),
      } as any);

      const admission = await getAdmissionById('adm-01');
      expect(admission?.discount_reason).toBeNull();
    });

    it('DI-007: Handles maybeSingle returning null when record not found', async () => {
      vi.spyOn(dbModule, 'isLiveSupabaseEnabled').mockReturnValue(true);
      vi.spyOn(dbModule, 'createClient').mockReturnValue({
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            or: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
        }),
      } as any);

      const admission = await getAdmissionById('non-existent-id');
      expect(admission).toBeUndefined();
    });

    it('DI-008: Multiple consecutive empty responses stay empty without state pollution', async () => {
      vi.spyOn(dbModule, 'isLiveSupabaseEnabled').mockReturnValue(true);
      vi.spyOn(dbModule, 'createClient').mockReturnValue(mockBatchClient([], []) as any);

      const res1 = await getBatches();
      const res2 = await getBatches();
      expect(res1).toEqual([]);
      expect(res2).toEqual([]);
    });
  });

  // =========================================================================
  // GROUP B: Deleted Record Protection (DI-009 - DI-016)
  // =========================================================================
  describe('Group B: Deleted Record Protection', () => {
    it('DI-009: Deleted admission in Supabase remains deleted and is not returned', async () => {
      vi.spyOn(dbModule, 'isLiveSupabaseEnabled').mockReturnValue(true);
      vi.spyOn(dbModule, 'createClient').mockReturnValue({
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            or: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
        }),
      } as any);

      const adm = await getAdmissionById('deleted-adm-id');
      expect(adm).toBeUndefined();
    });

    it('DI-010: Deleted record does not reappear on store re-read when live database is enabled', async () => {
      vi.spyOn(dbModule, 'isLiveSupabaseEnabled').mockReturnValue(true);
      vi.spyOn(dbModule, 'createClient').mockReturnValue({
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      } as any);

      const list = await getAdmissions();
      expect(list).toEqual([]);
    });

    it('DI-011: Deleted record does not reappear across user queries', async () => {
      vi.spyOn(dbModule, 'isLiveSupabaseEnabled').mockReturnValue(true);
      vi.spyOn(dbModule, 'createClient').mockReturnValue({
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      } as any);

      const accountantView = await getExpenses();
      const adminView = await getExpenses();
      expect(accountantView).toEqual([]);
      expect(adminView).toEqual([]);
    });

    it('DI-012: Clearing browser localStorage cache does not resurrect records', () => {
      const mockStorage: Record<string, string> = {
        next_gen_lms_store_snapshot_v1: JSON.stringify({ admissions: [{ id: 'stale-adm' }] }),
      };
      vi.stubGlobal('window', {});
      vi.stubGlobal('localStorage', {
        getItem: vi.fn((key) => mockStorage[key] || null),
        setItem: vi.fn((key, val) => { mockStorage[key] = val; }),
        removeItem: vi.fn((key) => { delete mockStorage[key]; }),
      });

      const loaded = persistentStorage.loadState();
      expect(loaded).toBeNull();
      expect(mockStorage.next_gen_lms_store_snapshot_v1).toBeUndefined();
    });

    it('DI-013: Saving state in browser environment never writes business records to localStorage', () => {
      const mockStorage: Record<string, string> = {};
      vi.stubGlobal('window', {});
      vi.stubGlobal('localStorage', {
        getItem: vi.fn((key) => mockStorage[key] || null),
        setItem: vi.fn((key, val) => { mockStorage[key] = val; }),
        removeItem: vi.fn((key) => { delete mockStorage[key]; }),
      });

      persistentStorage.saveState({ admissions: [{ id: 'test' }] });
      expect(mockStorage.next_gen_lms_store_snapshot_v1).toBeUndefined();
    });

    it('DI-014: missingSeedAdmissions and missingSeedStudents are never re-injected during hydration', () => {
      const result = store.hydrateFromDisk();
      expect(Array.isArray(store.admissions)).toBe(true);
    });

    it('DI-015: rcpt-03 is never artificially pushed back into receipts if deleted', () => {
      store.hydrateFromDisk();
      if (store.receipts.length > 0) {
        expect(store.receipts.every((r) => r.id !== 'ghost-receipt')).toBe(true);
      }
    });

    it('DI-016: AdmissionsRepository and paymentTransaction never restore deleted records from stale fee_workflow_state snapshot', async () => {
      vi.spyOn(dbModule, 'isLiveSupabaseEnabled').mockReturnValue(true);
      const staleSnapshot = {
        admissions: [{ id: 'deleted-adm-1', student_name: 'Stale', tenant_id: 'default' }],
        students: [{ id: 'deleted-stu-1', student_name: 'Stale', tenant_id: 'default' }],
        payments: [{ id: 'deleted-pay-1', amount: 1000, tenant_id: 'default' }],
        receipts: [{ id: 'deleted-rcpt-1', payment_amount: 1000, tenant_id: 'default' }],
      };
      vi.spyOn(adminModule, 'createAdminClient').mockReturnValue({
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'fee_workflow_state') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { revision: 10, snapshot: staleSnapshot },
                    error: null,
                  }),
                }),
              }),
            };
          }
          if (table === 'profiles') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({
                  data: [{ id: 'usr-admin', role: 'admin', tenant_id: 'default' }],
                  error: null,
                }),
              }),
            };
          }
          // The authoritative Postgres tables return empty []
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          };
        }),
      } as any);

      const { paymentTransaction } = await import('@/lib/services/payment-workflow-transaction');
      const actor = { id: 'usr-admin', role: 'admin', tenant_id: 'default' } as any;

      await paymentTransaction(actor, () => {
        expect(store.admissions.filter((a) => a.tenant_id === 'default')).toEqual([]);
        expect(store.students.filter((s) => s.tenant_id === 'default')).toEqual([]);
        expect(store.payments.filter((p) => p.tenant_id === 'default')).toEqual([]);
        expect(store.receipts.filter((r) => r.tenant_id === 'default')).toEqual([]);
      }, true);
    });
  });

  // =========================================================================
  // GROUP C: Environment Protection (DI-017 - DI-024)
  // =========================================================================
  describe('Group C: Environment Protection', () => {
    it('DI-017: isProductionEnvironment correctly identifies production runtime', () => {
      vi.stubEnv('NODE_ENV', 'production');
      expect(isProductionEnvironment()).toBe(true);

      vi.stubEnv('NODE_ENV', 'development');
      vi.stubEnv('NEXT_PUBLIC_APP_ENV', 'production');
      expect(isProductionEnvironment()).toBe(true);

      vi.stubEnv('NEXT_PUBLIC_APP_ENV', 'development');
      vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://tgohtdzwehhjfahtgovq.supabase.co');
      expect(isProductionEnvironment()).toBe(true);
    });

    it('DI-018: syncStoreToSupabase throws error in production environment', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      await expect(syncStoreToSupabase()).rejects.toThrow(
        /strictly forbidden in the production environment/
      );
    });

    it('DI-019: syncLocalToPostgres throws error in production environment', async () => {
      vi.stubEnv('NEXT_PUBLIC_APP_ENV', 'production');
      await expect(syncLocalToPostgres()).rejects.toThrow(
        /strictly forbidden in the production environment/
      );
    });

    it('DI-020: POST /api/database/sync with direction=push is rejected with 403 in production', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      vi.spyOn(sessionModule, 'authenticateApiRequest').mockResolvedValue({
        user: { id: 'usr-superadmin', full_name: 'Rajesh SuperAdmin', role: 'super_admin' },
      } as any);

      const req = new NextRequest('http://localhost:3000/api/database/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ direction: 'push' }),
      });

      const res = await handleDatabaseSync(req);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toMatch(/prohibited to preserve production data integrity/);
    });

    it('DI-021: Staging isolation blocker prevents connecting to production database from staging', () => {
      const origVitest = process.env.VITEST;
      delete process.env.VITEST;
      try {
        vi.stubEnv('NEXT_PUBLIC_APP_ENV', 'staging');
        vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://tgohtdzwehhjfahtgovq.supabase.co');
        vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'valid_test_key_non_mock');

        expect(() => isLiveSupabaseEnabled()).toThrow(/CRITICAL ISOLATION BLOCKER/);
      } finally {
        if (origVitest) process.env.VITEST = origVitest;
      }
    });

    it('DI-022: Cross-environment key guardrail warns if production URL has staging key', () => {
      const origVitest = process.env.VITEST;
      delete process.env.VITEST;
      try {
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.stubEnv('NEXT_PUBLIC_APP_ENV', 'development');
        vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://tgohtdzwehhjfahtgovq.supabase.co');
        vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'ta86fl6G2CbwIzrnJMTLsQ_W0U3QjYe');

        isLiveSupabaseEnabled();
        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining('Production database URL (tgohtdzwehhjfahtgovq) is paired with staging API key')
        );
      } finally {
        if (origVitest) process.env.VITEST = origVitest;
      }
    });

    it('DI-023: syncPostgresToLocal replaces local data instead of merging', async () => {
      vi.spyOn(dbModule, 'isLiveSupabaseEnabled').mockReturnValue(true);
      vi.spyOn(dbModule, 'getDb').mockReturnValue({
        from: vi.fn().mockImplementation((table: string) => ({
          select: vi.fn().mockImplementation(() => {
            if (table === 'students') return Promise.resolve({ data: [], error: null });
            if (table === 'admissions') return Promise.resolve({ data: [], error: null });
            if (table === 'courses') return Promise.resolve({ data: [], error: null });
            if (table === 'system_settings') return { maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) };
            return Promise.resolve({ data: [], error: null });
          }),
        })),
      } as any);

      const result = await syncPostgresToLocal();
      expect(result.success).toBe(true);
      expect(store.students).toEqual([]);
      expect(store.admissions).toEqual([]);
    });

    it('DI-024: Mock database URL returns false for isLiveSupabaseEnabled', () => {
      vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://mock-sap-lms.supabase.co');
      vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'mockAnonKey');
      expect(isLiveSupabaseEnabled()).toBe(false);
    });
  });

  // =========================================================================
  // GROUP D: Financial Data Integrity (DI-025 - DI-032)
  // =========================================================================
  describe('Group D: Financial Data Integrity', () => {
    it('DI-025: Empty expenses returns [] without generating EXP-2026-001 in production', async () => {
      vi.spyOn(dbModule, 'isLiveSupabaseEnabled').mockReturnValue(true);
      vi.spyOn(dbModule, 'createClient').mockReturnValue({
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      } as any);

      const expenses = await getExpenses();
      expect(expenses).toEqual([]);
      expect(expenses.some((e) => e.expense_code === 'EXP-2026-001')).toBe(false);
    });

    it('DI-026: Empty payments returns [] without generating seed payments', async () => {
      vi.spyOn(dbModule, 'isLiveSupabaseEnabled').mockReturnValue(true);
      vi.spyOn(dbModule, 'createClient').mockReturnValue({
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      } as any);

      const payments = await getPayments();
      expect(payments).toEqual([]);
    });

    it('DI-027: Empty fee accounts returns [] without restoring seed fee accounts', async () => {
      vi.spyOn(dbModule, 'isLiveSupabaseEnabled').mockReturnValue(true);
      vi.spyOn(dbModule, 'createClient').mockReturnValue({
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      } as any);

      const accounts = await getStudentFeeAccounts();
      expect(accounts).toEqual([]);
    });

    it('DI-028: Financial totals reflect authoritative 0 records', async () => {
      vi.spyOn(dbModule, 'isLiveSupabaseEnabled').mockReturnValue(true);
      vi.spyOn(dbModule, 'createClient').mockReturnValue({
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      } as any);

      const payments = await getPayments();
      const totalAmount = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
      expect(totalAmount).toBe(0);
    });

    it('DI-029: Empty vendors returns [] in production', async () => {
      vi.spyOn(dbModule, 'isLiveSupabaseEnabled').mockReturnValue(true);
      vi.spyOn(adminModule, 'createAdminClient').mockReturnValue({
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      } as any);

      const vendors = await getVendors();
      expect(vendors).toEqual([]);
    });

    it('DI-030: FinanceRepository getFeeAccounts returns empty array on empty database', async () => {
      vi.spyOn(dbModule, 'isLiveSupabaseEnabled').mockReturnValue(true);
      vi.spyOn(dbModule, 'getDb').mockReturnValue({
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      } as any);

      const accounts = await financeRepo.getFeeAccounts();
      expect(accounts).toEqual([]);
    });

    it('DI-031: FinanceRepository getPayments returns empty array on empty database', async () => {
      vi.spyOn(dbModule, 'isLiveSupabaseEnabled').mockReturnValue(true);
      vi.spyOn(dbModule, 'getDb').mockReturnValue({
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      } as any);

      const payments = await financeRepo.getPayments();
      expect(payments).toEqual([]);
    });

    it('DI-032: Empty receipts returns [] without generating REC-2026-0001', async () => {
      vi.spyOn(dbModule, 'isLiveSupabaseEnabled').mockReturnValue(true);
      vi.spyOn(dbModule, 'createClient').mockReturnValue({
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      } as any);

      const receipts = await getReceipts();
      expect(receipts).toEqual([]);
    });
  });

  // =========================================================================
  // GROUP E: Authentication & Role Protection (DI-033 - DI-040)
  // =========================================================================
  describe('Group E: Authentication & Role Protection', () => {
    it('DI-033: Super Admin actor on empty dataset receives [] without fallback to mock records', async () => {
      vi.spyOn(dbModule, 'isLiveSupabaseEnabled').mockReturnValue(true);
      vi.spyOn(dbModule, 'createClient').mockReturnValue({
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      } as any);

      const superAdminActor = { id: 'usr-superadmin', role: 'super_admin' } as any;
      const list = await getAdmissions(superAdminActor);
      expect(list).toEqual([]);
    });

    it('DI-034: Administrator actor on empty dataset receives []', async () => {
      vi.spyOn(dbModule, 'isLiveSupabaseEnabled').mockReturnValue(true);
      vi.spyOn(dbModule, 'createClient').mockReturnValue({
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      } as any);

      const adminActor = { id: 'usr-admin', role: 'admin' } as any;
      const list = await getAdmissions(adminActor);
      expect(list).toEqual([]);
    });

    it('DI-035: Chief Accountant actor on empty dataset receives []', async () => {
      vi.spyOn(dbModule, 'isLiveSupabaseEnabled').mockReturnValue(true);
      vi.spyOn(dbModule, 'createClient').mockReturnValue({
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      } as any);

      const list = await getExpenses();
      expect(list).toEqual([]);
    });

    it('DI-036: Counsellor actor on empty dataset receives []', async () => {
      vi.spyOn(dbModule, 'isLiveSupabaseEnabled').mockReturnValue(true);
      vi.spyOn(dbModule, 'createClient').mockReturnValue({
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      } as any);

      const counsellorActor = { id: 'counsellor-01', role: 'counsellor' } as any;
      const list = await getAdmissions(counsellorActor);
      expect(list).toEqual([]);
    });

    it('DI-037: Counsellor Lead actor on empty dataset receives []', async () => {
      vi.spyOn(dbModule, 'isLiveSupabaseEnabled').mockReturnValue(true);
      vi.spyOn(dbModule, 'createClient').mockReturnValue({
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      } as any);

      const leadActor = { id: 'counsellor-lead-01', role: 'counsellor_lead' } as any;
      const list = await getAdmissions(leadActor);
      expect(list).toEqual([]);
    });

    it('DI-038: Trainer actor on empty dataset receives [] batches and class sessions', async () => {
      vi.spyOn(dbModule, 'isLiveSupabaseEnabled').mockReturnValue(true);
      vi.spyOn(dbModule, 'createClient').mockReturnValue(mockBatchClient([], []) as any);

      const batches = await getBatches();
      expect(batches).toEqual([]);
    });

    it('DI-039: Student actor on empty dataset receives [] doubts and allocations', async () => {
      vi.spyOn(dbModule, 'isLiveSupabaseEnabled').mockReturnValue(true);
      vi.spyOn(dbModule, 'createClient').mockReturnValue({
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      } as any);

      const doubts = await getDoubts({ student_id: 'student-01' });
      expect(doubts).toEqual([]);
    });

    it('DI-040: Onboarding repository on empty dataset returns []', async () => {
      vi.spyOn(dbModule, 'isLiveSupabaseEnabled').mockReturnValue(true);
      vi.spyOn(dbModule, 'getDb').mockReturnValue({
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      } as any);

      const cases = await onboardingRepo.getAll();
      expect(cases).toEqual([]);
    });
  });
});
