import { describe, it, expect, beforeEach, vi } from 'vitest';
import { store } from '@/lib/services/data-store';
import {
  createLead,
  getLeads,
  DuplicateLeadError,
} from '@/lib/services/crm-service';
import {
  validatePhoneNumber,
  getCanonicalPhoneDigits,
  checkDuplicateLead,
} from '@/lib/utils/phone-validation';
import {
  previewBulkImport,
  executeBulkImport,
} from '@/lib/services/bulk-import-service';
import { POST as leadsApiPost } from '@/app/api/crm/leads/route';
import { NextRequest } from 'next/server';
import { Lead, Admission } from '@/types';

// Mock auth for API route tests
vi.mock('@/lib/auth/payment-session', () => ({
  authenticatePaymentRequest: vi.fn().mockImplementation(async (req: NextRequest) => {
    const roleHeader = req.headers.get('x-test-role') || 'counsellor';
    const idHeader = req.headers.get('x-test-user-id') || 'usr-counsellor-01';
    return {
      id: idHeader,
      role: roleHeader,
      tenant_id: 'default',
      full_name: 'Test Counsellor',
      email: 'counsellor@test.com',
    };
  }),
}));

describe('CRM Duplicate Lead Prevention & Authorized Repeat Inquiries', () => {
  const counsellorId = 'usr-counsellor-01';

  beforeEach(() => {
    // Isolate leads, admissions, auditLogs before each test
    store.leads = [];
    store.admissions = [];
    store.auditLogs = [];
    vi.clearAllMocks();
  });

  // =========================================================================
  // 1. Same Candidate and Phone Submitted Twice
  // =========================================================================
  describe('1. Same candidate and phone submitted twice', () => {
    it('creates the first lead successfully and blocks the second submission as a duplicate', async () => {
      const phone = '98765 43210';
      const email = 'arjun.mehta@example.com';

      // 1st submission: should succeed
      const lead1 = await createLead({
        full_name: 'Arjun Mehta',
        phone,
        country_code: '+91',
        email,
        counsellor_id: counsellorId,
        stage: 'New',
        rejectOnDuplicate: true,
      });

      expect(lead1).toBeDefined();
      expect(lead1.lead_code).toMatch(/^LD-\d{4}-/);
      expect(store.leads).toHaveLength(1);

      // 2nd submission with same phone & candidate: must be rejected with DuplicateLeadError
      await expect(
        createLead({
          full_name: 'Arjun Mehta',
          phone,
          country_code: '+91',
          email,
          counsellor_id: counsellorId,
          stage: 'New',
          rejectOnDuplicate: true,
        })
      ).rejects.toThrowError(DuplicateLeadError);

      // Ensure store still contains only 1 lead
      expect(store.leads).toHaveLength(1);
    });

    it('rejects duplicate lead creation with detailed existing lead reference in the error', async () => {
      const phone = '98123 45678';
      const lead1 = await createLead({
        full_name: 'Suresh Raina',
        phone,
        country_code: '+91',
        email: 'suresh@example.com',
        counsellor_id: counsellorId,
        stage: 'Contacted',
        rejectOnDuplicate: true,
      });

      try {
        await createLead({
          full_name: 'Suresh Raina',
          phone,
          country_code: '+91',
          email: 'suresh@example.com',
          counsellor_id: counsellorId,
          stage: 'New',
          rejectOnDuplicate: true,
        });
        expect.unreachable('Should have thrown DuplicateLeadError');
      } catch (err: any) {
        expect(err).toBeInstanceOf(DuplicateLeadError);
        expect(err.code).toBe('DUPLICATE_LEAD');
        expect(err.existingLead).toBeDefined();
        expect(err.existingLead.id).toBe(lead1.id);
        expect(err.existingLead.lead_code).toBe(lead1.lead_code);
        expect(err.existingLead.full_name).toBe('Suresh Raina');
        expect(err.message).toContain('already exists');
        expect(err.message).toContain(lead1.lead_code);
      }
    });
  });

  // =========================================================================
  // 2. Different Candidate with the Same Phone
  // =========================================================================
  describe('2. Different candidate with the same phone', () => {
    it('blocks creation when a different candidate submits an existing phone number', async () => {
      const sharedPhone = '98222 33344';

      // First candidate registers
      const lead1 = await createLead({
        full_name: 'Pooja Hegde',
        phone: sharedPhone,
        country_code: '+91',
        email: 'pooja.h@example.com',
        counsellor_id: counsellorId,
        stage: 'New',
        rejectOnDuplicate: true,
      });

      // Second candidate attempts to register with same phone
      await expect(
        createLead({
          full_name: 'Rahul Dravid',
          phone: sharedPhone,
          country_code: '+91',
          email: 'rahul.d@example.com',
          counsellor_id: counsellorId,
          stage: 'New',
          rejectOnDuplicate: true,
        })
      ).rejects.toThrowError(DuplicateLeadError);

      expect(store.leads).toHaveLength(1);
      expect(store.leads[0].full_name).toBe('Pooja Hegde');
    });
  });

  // =========================================================================
  // 3. Same Candidate with Different Phone
  // =========================================================================
  describe('3. Same candidate with different phone', () => {
    it('allows creation when the candidate uses a different phone number and distinct email', async () => {
      const lead1 = await createLead({
        full_name: 'Kiran Patel',
        phone: '98333 11111',
        country_code: '+91',
        email: 'kiran.work@example.com',
        counsellor_id: counsellorId,
        stage: 'New',
        rejectOnDuplicate: true,
      });

      const lead2 = await createLead({
        full_name: 'Kiran Patel',
        phone: '98333 22222',
        country_code: '+91',
        email: 'kiran.personal@example.com',
        counsellor_id: counsellorId,
        stage: 'New',
        rejectOnDuplicate: true,
      });

      expect(lead1.id).not.toBe(lead2.id);
      expect(lead1.phone).toContain('98333 11111');
      expect(lead2.phone).toContain('98333 22222');
      expect(store.leads).toHaveLength(2);
    });
  });

  // =========================================================================
  // 4. Simultaneous / Concurrent Submissions (Idempotency Key)
  // =========================================================================
  describe('4. Simultaneous / concurrent submissions', () => {
    it('creates only one lead when duplicate requests share the same idempotency key', async () => {
      const idempotencyKey = 'idemp-test-uuid-001';
      const candidateData = {
        full_name: 'Vikram Batra',
        phone: '98444 88899',
        country_code: '+91',
        email: 'vikram.batra@example.com',
        counsellor_id: counsellorId,
        stage: 'New' as const,
        idempotency_key: idempotencyKey,
        rejectOnDuplicate: true,
      };

      // Fire 5 concurrent requests with the identical idempotency key
      const results = await Promise.all([
        createLead(candidateData),
        createLead(candidateData),
        createLead(candidateData),
        createLead(candidateData),
        createLead(candidateData),
      ]);

      // Exactly 1 lead created in store
      expect(store.leads).toHaveLength(1);

      // All 5 returned leads have the identical ID and lead code
      const firstId = results[0].id;
      const firstCode = results[0].lead_code;
      expect(results.every((r) => r.id === firstId)).toBe(true);
      expect(results.every((r) => r.lead_code === firstCode)).toBe(true);
    });

    it('returns cached lead on replay with idempotency key even after initial insert completed', async () => {
      const idempotencyKey = 'idemp-retry-uuid-002';
      const candidateData = {
        full_name: 'Neha Kakkar',
        phone: '98555 77766',
        country_code: '+91',
        email: 'neha@example.com',
        counsellor_id: counsellorId,
        stage: 'New' as const,
        idempotency_key: idempotencyKey,
        rejectOnDuplicate: true,
      };

      const initial = await createLead(candidateData);
      expect(store.leads).toHaveLength(1);

      // Client retries submission after timeout
      const retryResult = await createLead(candidateData);
      expect(retryResult.id).toBe(initial.id);
      expect(retryResult.lead_code).toBe(initial.lead_code);
      expect(store.leads).toHaveLength(1);
    });
  });

  // =========================================================================
  // 5. CSV Imports Containing Duplicates
  // =========================================================================
  describe('5. CSV imports containing duplicates', () => {
    it('detects duplicate phones against existing database leads and internal duplicates in CSV preview', () => {
      // Existing lead in store
      store.leads.push({
        id: 'lead-existing-01',
        lead_code: 'LD-2026-099',
        full_name: 'Existing Database Lead',
        phone: '+91 98999 11111',
        canonical_phone: '919899911111',
        email: 'existing@test.com',
        stage: 'Follow-up',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      const csvContent = [
        'full_name,email,phone,lead_source,stage',
        'Row 1 Unique,unique1@test.com,+91 98999 22222,Google Ads,New',
        'Row 2 Matches DB,dbmatch@test.com,+91 98999 11111,Meta Ads,New', // Duplicate of existing DB lead
        'Row 3 Internal Dup,dupinfile@test.com,+91 98999 22222,Website,New', // Duplicate of Row 1 within CSV
      ].join('\n');

      const preview = previewBulkImport('leads', csvContent);

      expect(preview.totalRows).toBe(3);
      // Warnings should flag both the DB match and the in-file duplicate
      const phoneWarnings = preview.errors.filter((e) => e.field === 'phone' && e.severity === 'warning');
      expect(phoneWarnings.length).toBeGreaterThanOrEqual(2);

      const dbMatchWarning = phoneWarnings.find((w) => w.message.includes('already exists') || w.message.includes('LD-2026-099'));
      expect(dbMatchWarning).toBeDefined();

      const inFileDupWarning = phoneWarnings.find((w) => w.message.includes('in import file'));
      expect(inFileDupWarning).toBeDefined();
    });

    it('skips duplicate leads during CSV execution and imports only unique records', async () => {
      // Existing lead in store
      store.leads.push({
        id: 'lead-existing-02',
        lead_code: 'LD-2026-100',
        full_name: 'Pre-existing Lead',
        phone: '+91 98777 00001',
        canonical_phone: '919877700001',
        email: 'lead100@test.com',
        stage: 'Interested',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      const csvContent = [
        'full_name,email,phone,lead_source,stage',
        'Unique Candidate,unique@test.com,+91 98777 00002,Google Ads,New', // Unique
        'Duplicate of DB,dupdb@test.com,+91 98777 00001,Website,New', // Duplicate of DB
        'Internal Duplicate,internaldup@test.com,+91 98777 00002,Referral,New', // Duplicate of Row 1
      ].join('\n');

      const result = await executeBulkImport('leads', csvContent, 'usr-admin', 'Admin User', {
        skipInvalidRows: true,
        skipDuplicates: true,
      });

      expect(result.success).toBe(true);
      expect(result.importedCount).toBe(1); // Only Row 1 imported
      expect(result.skippedCount).toBe(2); // Row 2 and Row 3 skipped

      // Store should have initial lead (1) + newly imported unique lead (1) = 2
      expect(store.leads).toHaveLength(2);
      expect(store.leads.some((l) => l.full_name === 'Unique Candidate')).toBe(true);
      expect(store.leads.some((l) => l.full_name === 'Duplicate of DB')).toBe(false);
      expect(store.leads.some((l) => l.full_name === 'Internal Duplicate')).toBe(false);
    });
  });

  // =========================================================================
  // 6. Existing Converted Leads
  // =========================================================================
  describe('6. Existing converted leads', () => {
    it('detects duplicate lead that was already converted to an admission and reports conversion details', async () => {
      const convertedLead: Lead = {
        id: 'lead-converted-01',
        lead_code: 'LD-2026-CONV',
        full_name: 'Ananya Sharma',
        phone: '+91 98111 22334',
        canonical_phone: '919811122334',
        email: 'ananya@example.com',
        stage: 'Converted',
        notes: 'Converted to Admission: ADM-2026-00042',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      store.leads.push(convertedLead);

      const admission: Admission = {
        id: 'adm-0042',
        admission_number: 'ADM-2026-00042',
        student_name: 'Ananya Sharma',
        phone: '+91 98111 22334',
        email: 'ananya@example.com',
        dob: '2000-01-01',
        gender: 'Female',
        address: 'Bandra West',
        city: 'Mumbai',
        education: 'B.Com',
        experience_years: 2,
        current_employment_status: 'Employed',
        course_id: 'crs-fico-01',
        course_name: 'SAP S/4HANA Finance',
        lead_id: 'lead-converted-01',
        training_mode: 'Online',
        admission_date: '2026-01-15',
        course_fee: 40000,
        discount: 0,
        net_payable: 40000,
        payment_plan: 'Full Payment',
        status: 'Active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      store.admissions.push(admission);

      // Check duplicate status
      const match = checkDuplicateLead(
        store.leads,
        { phone: '98111 22334', country_code: '+91' },
        store.admissions
      );

      expect(match.isDuplicate).toBe(true);
      expect(match.isConverted).toBe(true);
      expect(match.admissionNumber).toBe('ADM-2026-00042');
      expect(match.message).toContain('already been converted to admission (ADM-2026-00042)');

      // Attempting to create duplicate lead with rejectOnDuplicate throws
      await expect(
        createLead({
          full_name: 'Ananya Sharma',
          phone: '98111 22334',
          country_code: '+91',
          email: 'ananya.alt@example.com',
          counsellor_id: counsellorId,
          stage: 'New',
          rejectOnDuplicate: true,
        })
      ).rejects.toThrowError(/already been converted to admission/);
    });
  });

  // =========================================================================
  // 7. Authorized Repeat Inquiry Workflow
  // =========================================================================
  describe('7. Authorized repeat inquiry workflow', () => {
    it('allows an authorized repeat inquiry when is_repeat_inquiry is explicitly confirmed with reason', async () => {
      // 1. Existing lead in pipeline
      const originalLead = await createLead({
        full_name: 'Rohit Roy',
        phone: '98333 99988',
        country_code: '+91',
        email: 'rohit.roy@example.com',
        counsellor_id: counsellorId,
        stage: 'Converted',
        rejectOnDuplicate: true,
      });

      expect(store.leads).toHaveLength(1);

      // 2. Candidate contacts institute again 6 months later for another course
      const repeatReason = 'Completed SAP FICO, inquiring for SAP MM weekend batch.';
      const repeatLead = await createLead({
        full_name: 'Rohit Roy',
        phone: '98333 99988',
        country_code: '+91',
        email: 'rohit.roy@example.com',
        counsellor_id: counsellorId,
        stage: 'New',
        is_repeat_inquiry: true,
        repeat_inquiry_reason: repeatReason,
      });

      // Assert repeat lead creation succeeded
      expect(repeatLead).toBeDefined();
      expect(repeatLead.id).not.toBe(originalLead.id);
      expect(repeatLead.is_repeat_inquiry).toBe(true);
      expect(repeatLead.original_lead_id).toBe(originalLead.id);
      expect(repeatLead.repeat_inquiry_reason).toBe(repeatReason);
      expect(repeatLead.notes).toContain('Authorized Repeat Inquiry');

      // Both leads exist in store without overwriting
      expect(store.leads).toHaveLength(2);

      // Original lead is preserved and annotated
      const refreshedOriginal = store.leads.find((l) => l.id === originalLead.id);
      expect(refreshedOriginal).toBeDefined();
      expect(refreshedOriginal?.stage).toBe('Converted'); // Not mutated
      expect(refreshedOriginal?.notes).toContain('Repeat Inquiry Recorded');

      // Audit log recorded
      const repeatAudit = store.auditLogs.find(
        (a) => a.action === 'REPEAT_INQUIRY_CREATED' && a.record_id === repeatLead.id
      );
      expect(repeatAudit).toBeDefined();
      expect(repeatAudit?.new_value?.original_lead_id).toBe(originalLead.id);
    });

    it('rejects repeat inquiry if mandatory reason is empty via API', async () => {
      const req = new NextRequest('http://localhost/api/crm/leads', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-test-role': 'counsellor',
          'x-test-user-id': counsellorId,
        },
        body: JSON.stringify({
          full_name: 'Sunil Gavaskar',
          phone: '98444 00011',
          country_code: '+91',
          email: 'sunil@example.com',
          is_repeat_inquiry: true,
          repeat_inquiry_reason: '', // Missing reason
        }),
      });

      const res = await leadsApiPost(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain('reason is required');
    });
  });

  // =========================================================================
  // 8. Phone Normalization & Canonical Digits Edge Cases
  // =========================================================================
  describe('8. Phone normalization & canonical digits edge cases', () => {
    it('normalizes Indian phone with trunk 0, spaces, and dashes to identical canonical digits', () => {
      const canonical1 = getCanonicalPhoneDigits('+91', '9876543210');
      const canonical2 = getCanonicalPhoneDigits('+91', '09876543210');
      const canonical3 = getCanonicalPhoneDigits('+91', '+91 98765 43210');
      const canonical4 = getCanonicalPhoneDigits('+91', '+91-98765-43210');
      const canonical5 = getCanonicalPhoneDigits(undefined, '9876543210');

      expect(canonical1).toBe('919876543210');
      expect(canonical2).toBe('919876543210');
      expect(canonical3).toBe('919876543210');
      expect(canonical4).toBe('919876543210');
      expect(canonical5).toBe('919876543210');
    });

    it('detects duplicate even when phone formatting differs between submissions', async () => {
      // First submission uses standard formatting: "+91 98765 11122"
      await createLead({
        full_name: 'Formatting Test',
        phone: '98765 11122',
        country_code: '+91',
        email: 'format@example.com',
        counsellor_id: counsellorId,
        stage: 'New',
        rejectOnDuplicate: true,
      });

      // Second submission uses trunk zero: "09876511122"
      await expect(
        createLead({
          full_name: 'Formatting Test 2',
          phone: '09876511122',
          country_code: '+91',
          email: 'format2@example.com',
          counsellor_id: counsellorId,
          stage: 'New',
          rejectOnDuplicate: true,
        })
      ).rejects.toThrowError(DuplicateLeadError);
    });
  });
});
