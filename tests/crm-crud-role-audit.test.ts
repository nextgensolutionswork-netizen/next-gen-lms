import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { UserProfile, Lead, Admission, Course } from '@/types';
import { store } from '@/lib/services/data-store';
import {
  createLead,
  getLeads,
  getLeadById,
  updateLeadDetails,
  updateLeadStage,
  bulkAssignLeads,
  getLeadAdmission,
  getLeadHistoricalAdmissionNumber,
  classifyLeadConversion,
} from '@/lib/services/crm-service';
import { PATCH as patchLeadRoute, DELETE as deleteLeadRoute } from '@/app/api/crm/leads/route';
import { resetLeadCache } from '@/lib/services/lead-cache';
import { isPaymentApproved } from '@/lib/utils/dashboard-metrics';

const auth = vi.hoisted(() => vi.fn());
vi.mock('@/lib/auth/payment-session', () => ({ authenticatePaymentRequest: auth }));

const SUPER_ADMIN_ID = '00000000-0000-4000-8000-000000000001';
const ADMIN_ID = '00000000-0000-4000-8000-000000000002';
const COUNSELLOR_LEAD_ID = '2983a160-0764-40c5-ab50-a41cff9f0c68'; // Radhika
const COUNSELLOR_A_ID = '8fac380f-cc47-4209-9a13-e85153529dd1'; // Vineethaa
const COUNSELLOR_B_ID = '3f5ba75a-ba23-4612-be74-e075a7d81f9b'; // Sandhya (Team member of Radhika)
const COUNSELLOR_OTHER_ID = 'fc148d96-cf7c-4189-a0ba-b99eb5826d15'; // Mohan (Separate)

const superAdmin: UserProfile = {
  id: SUPER_ADMIN_ID,
  role: 'super_admin',
  tenant_id: 'default',
  is_active: true,
  full_name: 'Super Admin',
  email: 'superadmin@example.com',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

const admin: UserProfile = {
  id: ADMIN_ID,
  role: 'admin',
  tenant_id: 'default',
  is_active: true,
  full_name: 'Admin Manager',
  email: 'admin@example.com',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

const counsellorLead: UserProfile = {
  id: COUNSELLOR_LEAD_ID,
  role: 'counsellor_lead',
  tenant_id: 'default',
  is_active: true,
  full_name: 'Radhika (Sales Lead)',
  email: 'radhika@example.com',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

const counsellorA: UserProfile = {
  id: COUNSELLOR_A_ID,
  role: 'counsellor',
  tenant_id: 'default',
  is_active: true,
  full_name: 'Vineethaa',
  email: 'vineethaa@example.com',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

const counsellorB: UserProfile = {
  id: COUNSELLOR_B_ID,
  role: 'counsellor',
  tenant_id: 'default',
  is_active: true,
  full_name: 'Sandhya',
  email: 'sandhya@example.com',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

const counsellorOther: UserProfile = {
  id: COUNSELLOR_OTHER_ID,
  role: 'counsellor',
  tenant_id: 'default',
  is_active: true,
  full_name: 'Mohan Reddy',
  email: 'mohan@example.com',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

const testCourse: Course = {
  id: 'c0000000-0000-4000-8000-000000000001',
  course_code: 'SAP-FICO-101',
  course_name: 'SAP FICO PERSONAL TRAINING',
  category: 'SAP Functional',
  description: 'SAP FICO Personal Training',
  price: 35000,
  duration_weeks: 12,
  status: 'Published',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

describe('TASK 3 — Full CRM CRUD Operations Audit Across All Roles', () => {
  beforeEach(() => {
    resetLeadCache();
    store.users = [superAdmin, admin, counsellorLead, counsellorA, counsellorB, counsellorOther];
    store.courses = [testCourse];
    store.admissions = [];
    store.leads = [];
  });

  afterEach(() => {
    resetLeadCache();
    vi.restoreAllMocks();
  });

  // Operation 1: Create Lead
  describe('1. Create Lead', () => {
    it('allows Counsellor to create lead (auto-assigning counsellor_id to self)', async () => {
      const created = await createLead(
        {
          full_name: 'Lead by Vineethaa',
          phone: '9848011111',
          country_code: '+91',
          email: 'lead1@example.com',
          training_preference: 'Online',
          lead_source: 'Website',
          stage: 'New',
          counsellor_id: COUNSELLOR_A_ID,
        },
        counsellorA
      );
      expect(created.id).toBeDefined();
      expect(created.full_name).toBe('Lead by Vineethaa');
      expect(created.counsellor_id).toBe(COUNSELLOR_A_ID);
    });

    it('allows Admin to create and assign lead to any active counsellor', async () => {
      const created = await createLead(
        {
          full_name: 'Lead by Admin',
          phone: '9848022222',
          country_code: '+91',
          email: 'lead2@example.com',
          training_preference: 'Offline',
          lead_source: 'Referral',
          stage: 'New',
          counsellor_id: COUNSELLOR_OTHER_ID,
        },
        admin
      );
      expect(created.id).toBeDefined();
      expect(created.counsellor_id).toBe(COUNSELLOR_OTHER_ID);
    });
  });

  // Operation 2: View Lead
  describe('2. View Lead', () => {
    it('restricts Counsellor to only view assigned/created leads', async () => {
      const leadA: Lead = {
        id: '11111111-1111-4111-8111-111111111111',
        lead_code: 'LD-001',
        full_name: 'Lead A',
        phone: '9848011111',
        country_code: '+91',
        email: 'leada@example.com',
        stage: 'New',
        counsellor_id: COUNSELLOR_A_ID,
        tenant_id: 'default',
        created_at: '2026-11-20T10:00:00.000Z',
        updated_at: '2026-11-20T10:00:00.000Z',
      };
      const leadOther: Lead = {
        id: '22222222-2222-4222-8222-222222222222',
        lead_code: 'LD-002',
        full_name: 'Lead Other',
        phone: '9848022222',
        country_code: '+91',
        email: 'leadother@example.com',
        stage: 'New',
        counsellor_id: COUNSELLOR_OTHER_ID,
        tenant_id: 'default',
        created_at: '2026-11-20T10:00:00.000Z',
        updated_at: '2026-11-20T10:00:00.000Z',
      };
      store.leads = [leadA, leadOther];

      const visible = await getLeads({}, counsellorA);
      expect(visible.length).toBe(1);
      expect(visible[0].id).toBe(leadA.id);

      // Super Admin sees all leads
      const allLeads = await getLeads({}, superAdmin);
      expect(allLeads.length).toBe(2);
    });
  });

  // Operation 3: Edit Candidate Details
  describe('3. Edit Candidate Details', () => {
    it('allows authorized Counsellor to edit candidate details', async () => {
      const lead: Lead = {
        id: '33333333-3333-4333-8333-333333333333',
        lead_code: 'LD-003',
        full_name: 'Candidate Before',
        phone: '9848033333',
        country_code: '+91',
        email: 'cand@example.com',
        stage: 'Follow-up',
        counsellor_id: COUNSELLOR_A_ID,
        tenant_id: 'default',
        created_at: '2026-11-20T10:00:00.000Z',
        updated_at: '2026-11-20T10:00:00.000Z',
      };
      store.leads = [lead];

      const updated = await updateLeadDetails(
        lead.id,
        {
          full_name: 'Candidate After',
          training_preference: 'Classroom',
          notes: 'Updated contact notes',
        },
        counsellorA.id,
        counsellorA
      );

      expect(updated.full_name).toBe('Candidate After');
      expect(updated.training_preference).toBe('Classroom');
      expect(updated.notes).toBe('Updated contact notes');
      expect(updated.stage).toBe('Follow-up'); // Preserved!
    });
  });

  // Operation 4: Update Lead Stage
  describe('4. Update Lead Stage', () => {
    it('updates pipeline stage with stage notes and timestamp', async () => {
      const lead: Lead = {
        id: '44444444-4444-4444-8444-444444444444',
        lead_code: 'LD-004',
        full_name: 'Pipeline Lead',
        phone: '9848044444',
        country_code: '+91',
        email: 'pipeline@example.com',
        stage: 'New',
        counsellor_id: COUNSELLOR_A_ID,
        tenant_id: 'default',
        created_at: '2026-11-20T10:00:00.000Z',
        updated_at: '2026-11-20T10:00:00.000Z',
      };
      store.leads = [lead];

      const updated = await updateLeadStage(
        lead.id,
        'Contacted',
        'Spoke with candidate. Interested in SAP FICO.',
        counsellorA.id,
        null,
        counsellorA
      );

      expect(updated.stage).toBe('Contacted');
      expect(updated.notes).toContain('Spoke with candidate');
    });
  });

  // Operation 5 & 6: Assign & Reassign Lead
  describe('5 & 6. Assign and Reassign Lead', () => {
    it('allows Admin and Counsellor Lead to reassign leads, but forbids Counsellors', async () => {
      const lead: Lead = {
        id: '55555555-5555-4555-8555-555555555555',
        lead_code: 'LD-005',
        full_name: 'Reassign Candidate',
        phone: '9848055555',
        country_code: '+91',
        email: 'reassign@example.com',
        stage: 'New',
        counsellor_id: COUNSELLOR_A_ID,
        tenant_id: 'default',
        created_at: '2026-11-20T10:00:00.000Z',
        updated_at: '2026-11-20T10:00:00.000Z',
      };
      store.leads = [lead];

      // Counsellor A cannot reassign to Mohan
      await expect(
        updateLeadDetails(lead.id, { counsellor_id: COUNSELLOR_OTHER_ID }, counsellorA.id, counsellorA)
      ).rejects.toThrow('Forbidden: Counsellors cannot reassign leads.');

      // Admin can reassign to Mohan
      const reassigned = await updateLeadDetails(
        lead.id,
        { counsellor_id: COUNSELLOR_OTHER_ID },
        admin.id,
        admin
      );
      expect(reassigned.counsellor_id).toBe(COUNSELLOR_OTHER_ID);
    });
  });

  // Operation 7: Schedule Follow-up
  describe('7. Schedule Follow-up', () => {
    it('schedules follow-up with specific date and time', async () => {
      const lead: Lead = {
        id: '66666666-6666-4666-8666-666666666666',
        lead_code: 'LD-006',
        full_name: 'Follow-up Candidate',
        phone: '9848066666',
        country_code: '+91',
        email: 'followup@example.com',
        stage: 'Contacted',
        counsellor_id: COUNSELLOR_A_ID,
        tenant_id: 'default',
        created_at: '2026-11-20T10:00:00.000Z',
        updated_at: '2026-11-20T10:00:00.000Z',
      };
      store.leads = [lead];

      const followUpDate = '2026-12-05T10:30:00.000Z';
      const updated = await updateLeadStage(
        lead.id,
        'Follow-up',
        'Follow-up scheduled for demo discussion',
        counsellorA.id,
        followUpDate,
        counsellorA
      );

      expect(updated.stage).toBe('Follow-up');
      expect(updated.follow_up_date).toBe(followUpDate);
    });
  });

  // Operation 8: Schedule Demo
  describe('8. Schedule Demo', () => {
    it('schedules demo with demo date and preferences', async () => {
      const lead: Lead = {
        id: '77777777-7777-4777-8777-777777777777',
        lead_code: 'LD-007',
        full_name: 'Demo Candidate',
        phone: '9848077777',
        country_code: '+91',
        email: 'demo@example.com',
        stage: 'Interested',
        counsellor_id: COUNSELLOR_A_ID,
        tenant_id: 'default',
        created_at: '2026-11-20T10:00:00.000Z',
        updated_at: '2026-11-20T10:00:00.000Z',
      };
      store.leads = [lead];

      const demoDate = '2026-12-08T15:00:00.000Z';
      const updated = await updateLeadDetails(
        lead.id,
        {
          stage: 'Demo Scheduled',
          demo_date: demoDate,
          demo_preference: true,
          notes: 'Registered for upcoming SAP FICO live batch demo',
        },
        counsellorA.id,
        counsellorA
      );

      expect(updated.stage).toBe('Demo Scheduled');
      expect(updated.demo_date).toBe(demoDate);
      expect(updated.demo_preference).toBe(true);
    });
  });

  // Operation 9 & 10: Convert Lead & View Admission
  describe('9 & 10. Convert Lead and View Admission', () => {
    it('links converted lead to admission and provides View Admission resolution', async () => {
      const lead: Lead = {
        id: '88888888-8888-4888-8888-888888888888',
        lead_code: 'LD-008',
        full_name: 'Confirmed Student Candidate',
        phone: '9848088888',
        country_code: '+91',
        email: 'confirmed@example.com',
        stage: 'Converted',
        counsellor_id: COUNSELLOR_A_ID,
        tenant_id: 'default',
        notes: 'Converted to Admission: ADM-2026-0030',
        created_at: '2026-11-20T10:00:00.000Z',
        updated_at: '2026-11-20T10:00:00.000Z',
      };
      const admission: Admission = {
        id: 'adm-live-030',
        admission_number: 'ADM-2026-0030',
        lead_id: lead.id,
        student_name: 'Confirmed Student Candidate',
        full_name: 'Confirmed Student Candidate',
        email: 'confirmed@example.com',
        phone: '9848088888',
        course_id: testCourse.id,
        course_name: testCourse.course_name,
        counsellor_id: COUNSELLOR_A_ID,
        status: 'Confirmed',
        tenant_id: 'default',
        payment_plan: 'Full Payment',
        created_at: '2026-11-20T11:00:00.000Z',
        updated_at: '2026-11-20T11:00:00.000Z',
      } as unknown as Admission;

      store.leads = [lead];
      store.admissions = [admission];

      const foundAdmission = getLeadAdmission(lead, store.admissions);
      expect(foundAdmission).toBeDefined();
      expect(foundAdmission?.admission_number).toBe('ADM-2026-0030');

      const classification = classifyLeadConversion(lead, store.admissions);
      expect(classification.status).toBe('active');
      expect(classification.admissionNumber).toBe('ADM-2026-0030');
    });
  });

  // Operation 11 & 12: Edit Historical & Current Converted Leads
  describe('11 & 12. Edit Historical and Current Converted Leads', () => {
    it('safely edits historical converted lead without altering historical conversion badge', async () => {
      const historicalLead: Lead = {
        id: 'b350177a-4915-4a33-8c5e-d6f3b07e452a', // Vinoth Venkataraman
        lead_code: 'LD-2026-b350177a-4915-4a33-8c5e-d6f3b07e452a',
        full_name: 'Vinoth Venkataraman',
        phone: '9094182645',
        country_code: '+91',
        email: 'vinoth@example.com',
        stage: 'Converted',
        counsellor_id: COUNSELLOR_A_ID,
        tenant_id: 'default',
        notes: 'Converted to Admission: ADM-2026-0001',
        created_at: '2026-11-23T12:35:32.000Z',
        updated_at: '2026-11-23T12:35:32.000Z',
      };
      store.leads = [historicalLead];

      const updated = await updateLeadDetails(
        historicalLead.id,
        {
          training_preference: 'Classroom',
          notes: 'Candidate confirmed preferred batch time',
        },
        counsellorA.id,
        counsellorA
      );

      expect(updated.training_preference).toBe('Classroom');
      expect(updated.stage).toBe('Converted');
      expect(getLeadHistoricalAdmissionNumber(updated)).toBe('ADM-2026-0001');

      const classification = classifyLeadConversion(updated, store.admissions);
      expect(classification.status).toBe('historical');
    });
  });

  // Operation 13 & 14: Import & Export Leads
  describe('13 & 14. Import and Export CSV Representation', () => {
    it('supports bulk creation of leads with valid phone and email normalization', async () => {
      const importRows = [
        { full_name: 'Bulk Lead 1', phone: '9848099111', country_code: '+91', email: 'bulk1@example.com', lead_source: 'Meta Ads' as const },
        { full_name: 'Bulk Lead 2', phone: '9848099222', country_code: '+91', email: 'bulk2@example.com', lead_source: 'Google Ads' as const },
      ];

      for (const row of importRows) {
        await createLead({ ...row, stage: 'New', counsellor_id: COUNSELLOR_A_ID }, admin);
      }

      const leads = await getLeads({}, admin);
      expect(leads.some((l) => l.full_name === 'Bulk Lead 1')).toBe(true);
      expect(leads.some((l) => l.full_name === 'Bulk Lead 2')).toBe(true);
    });
  });

  // Operation 15: Archive Lead
  describe('15. Archive Lead', () => {
    it('archives lead by setting pipeline stage to Lost / Not Interested', async () => {
      const lead: Lead = {
        id: '99999999-9999-4999-8999-999999999999',
        lead_code: 'LD-009',
        full_name: 'Inactive Candidate',
        phone: '9848099999',
        country_code: '+91',
        email: 'inactive@example.com',
        stage: 'Follow-up',
        counsellor_id: COUNSELLOR_A_ID,
        tenant_id: 'default',
        created_at: '2026-11-20T10:00:00.000Z',
        updated_at: '2026-11-20T10:00:00.000Z',
      };
      store.leads = [lead];

      const archived = await updateLeadStage(
        lead.id,
        'Lost',
        'Candidate enrolled with another institution',
        counsellorA.id,
        null,
        counsellorA
      );

      expect(archived.stage).toBe('Lost');
    });
  });

  // Operation 16: Delete Lead (Management Only)
  describe('16. Delete Lead (Strict Authorization)', () => {
    it('strictly forbids Counsellor and Counsellor Lead from deleting leads (403)', async () => {
      const lead: Lead = {
        id: 'aaaaaaaa-1111-4aaa-8aaa-aaaaaaaaaaaa',
        lead_code: 'LD-010',
        full_name: 'Protected Lead',
        phone: '9848000111',
        country_code: '+91',
        email: 'prot@example.com',
        stage: 'New',
        counsellor_id: COUNSELLOR_A_ID,
        tenant_id: 'default',
        created_at: '2026-11-20T10:00:00.000Z',
        updated_at: '2026-11-20T10:00:00.000Z',
      };
      store.leads = [lead];

      auth.mockResolvedValue(counsellorA);
      const req = new NextRequest('http://localhost:3000/api/crm/leads', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId: lead.id }),
      });

      const res = await deleteLeadRoute(req);
      expect(res.status).toBe(403);
      expect(store.leads.length).toBe(1); // Not deleted!
    });

    it('allows Super Admin to delete lead', async () => {
      const lead: Lead = {
        id: 'bbbbbbbb-2222-4bbb-8bbb-bbbbbbbbbbbb',
        lead_code: 'LD-011',
        full_name: 'Staging Removable Lead',
        phone: '9848000222',
        country_code: '+91',
        email: 'removable@example.com',
        stage: 'New',
        counsellor_id: COUNSELLOR_A_ID,
        tenant_id: 'default',
        created_at: '2026-11-20T10:00:00.000Z',
        updated_at: '2026-11-20T10:00:00.000Z',
      };
      store.leads = [lead];

      auth.mockResolvedValue(superAdmin);
      const req = new NextRequest('http://localhost:3000/api/crm/leads', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId: lead.id }),
      });

      const res = await deleteLeadRoute(req);
      expect(res.status).toBe(200);
      expect(store.leads.length).toBe(0); // Successfully deleted by admin!
    });
  });

  // Financial Dashboard Verification (Task 5)
  describe('Task 5 — Financial Dashboard Accounting Integrity', () => {
    it('strictly excludes Pending payments from verified collections', () => {
      const pendingPayment = {
        status: 'Pending',
        verification_status: 'Pending',
        amount: 25000,
      };
      expect(isPaymentApproved(pendingPayment)).toBe(false);
    });

    it('qualifies Verified payment as approved collection', () => {
      const verifiedPayment = {
        status: 'Success',
        verification_status: 'Verified',
        amount: 35000,
      };
      expect(isPaymentApproved(verifiedPayment)).toBe(true);
    });

    it('strictly excludes Rejected and Voided payments from verified collections', () => {
      const rejectedPayment = {
        status: 'Failed',
        verification_status: 'Rejected',
        amount: 35000,
      };
      const voidedPayment = {
        status: 'Voided',
        verification_status: 'Verified',
        amount: 35000,
      };
      expect(isPaymentApproved(rejectedPayment)).toBe(false);
      expect(isPaymentApproved(voidedPayment)).toBe(false);
    });
  });
});
