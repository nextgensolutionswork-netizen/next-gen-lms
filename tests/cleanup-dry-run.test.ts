import { describe, it, expect } from 'vitest';
import {
  executeCleanupWorkflow,
  validateCleanupPreconditions,
  applySupportedCleanupMutations,
  TARGET_PAYMENT_IDS,
  TARGET_FEE_IDS,
  TARGET_ADMISSION_IDS,
  TARGET_STUDENT_IDS,
  TARGET_LEAD_IDS,
  EXCLUDED_LEAD_IDS,
  QUARANTINE_NOTE,
  WorkflowSnapshot,
  RelationalLead,
} from '@/lib/security/cleanup-dry-run';
import { UserProfile } from '@/types';

describe('Cleanup Dry-Run & Precondition Verification Tests', () => {
  const now = new Date().toISOString();

  const mockAccountant: UserProfile = {
    id: 'usr-accounts',
    email: 'accounts@next-generpsolutions.com',
    full_name: 'Chief Accountant',
    role: 'accountant',
    is_active: true,
    created_at: now,
    updated_at: now,
  };

  function createValidInitialSnapshot(): WorkflowSnapshot {
    return {
      admissions: [
        {
          id: 'adm-1793347994568',
          admission_number: 'ADM-2026-0017',
          lead_id: 'c87713e8-737d-434c-bbf7-6556089cccc1',
          student_name: 'Aarav Patel',
          course_id: 'crs-fico-01',
          status: 'Confirmed',
          course_fee: 45000,
          discount: 0,
          net_payable: 45000,
          payment_plan: 'Full Payment',
          training_mode: 'Online',
          current_employment_status: 'Employed',
          city: 'Hyderabad',
          education: 'B.Tech',
          experience_years: 2,
          dob: '1995-01-01',
          gender: 'Male',
          address: 'Test Address',
          phone: '9876543210',
          email: 'aarav.patel.1793347954569@example.com',
          admission_date: '2026-10-30',
          created_at: now,
          updated_at: now,
        },
        {
          id: 'adm-1793348715329',
          admission_number: 'ADM-2026-0019',
          lead_id: '140cf3cd-40ab-42a5-9e23-261af90f18c7',
          student_name: 'Aarav Patel',
          course_id: 'crs-fico-01',
          status: 'Confirmed',
          course_fee: 45000,
          discount: 0,
          net_payable: 45000,
          payment_plan: 'Full Payment',
          training_mode: 'Online',
          current_employment_status: 'Employed',
          city: 'Hyderabad',
          education: 'B.Tech',
          experience_years: 2,
          dob: '1995-01-01',
          gender: 'Male',
          address: 'Test Address',
          phone: '9876543210',
          email: 'aarav.patel.1793348697293@example.com',
          admission_date: '2026-10-30',
          created_at: now,
          updated_at: now,
        },
      ],
      students: [
        {
          id: 'stu-1793347994569',
          user_id: 'usr-stu-1793347994568',
          admission_id: 'adm-1793347994568',
          student_code: 'STU-FICO-017',
          admission_number: 'ADM-2026-0017',
          full_name: 'Aarav Patel',
          email: 'aarav.patel.1793347954569@example.com',
          phone: '9876543210',
          course_id: 'crs-fico-01',
          joining_date: '2026-10-30',
          status: 'Active',
          total_fee: 45000,
          paid_amount: 0,
          outstanding_amount: 45000,
          attendance_percentage: 0,
          course_progress: 0,
          placement_status: 'Not Started',
          created_at: now,
          updated_at: now,
        },
        {
          id: 'stu-1793348715329',
          user_id: 'usr-stu-1793348715329',
          admission_id: 'adm-1793348715329',
          student_code: 'STU-FICO-019',
          admission_number: 'ADM-2026-0019',
          full_name: 'Aarav Patel',
          email: 'aarav.patel.1793348697293@example.com',
          phone: '9876543210',
          course_id: 'crs-fico-01',
          joining_date: '2026-10-30',
          status: 'Active',
          total_fee: 45000,
          paid_amount: 0,
          outstanding_amount: 45000,
          attendance_percentage: 0,
          course_progress: 0,
          placement_status: 'Not Started',
          created_at: now,
          updated_at: now,
        },
      ],
      studentFees: [
        {
          id: 'fee-fa-1793347994569',
          student_id: 'stu-1793347994569',
          student_name: 'Aarav Patel',
          student_code: 'STU-FICO-017',
          admission_number: 'ADM-2026-0017',
          fee_category: 'Tuition',
          reference_type: 'Course',
          standard_fee: 45000,
          proposed_fee: 45000,
          discount_amount: 0,
          discount_percentage: 0,
          tax_gst_amount: 0,
          additional_charges: 0,
          final_payable: 45000,
          paid_amount: 0,
          outstanding_amount: 45000,
          payment_plan: 'Full Payment',
          number_of_installments: 0,
          first_due_date: '2026-11-01',
          counsellor_id: '44444444-4444-4444-4444-444444444444',
          counsellor_name: 'Ananya Desai',
          approval_status: 'Approved',
          version: 1,
          is_payable: true,
          created_at: now,
          updated_at: now,
        },
        {
          id: 'fee-fa-1793348715329',
          student_id: 'stu-1793348715329',
          student_name: 'Aarav Patel',
          student_code: 'STU-FICO-019',
          admission_number: 'ADM-2026-0019',
          fee_category: 'Tuition',
          reference_type: 'Course',
          standard_fee: 45000,
          proposed_fee: 45000,
          discount_amount: 0,
          discount_percentage: 0,
          tax_gst_amount: 0,
          additional_charges: 0,
          final_payable: 45000,
          paid_amount: 0,
          outstanding_amount: 45000,
          payment_plan: 'Full Payment',
          number_of_installments: 0,
          first_due_date: '2026-11-01',
          counsellor_id: '44444444-4444-4444-4444-444444444444',
          counsellor_name: 'Ananya Desai',
          approval_status: 'Approved',
          version: 1,
          is_payable: true,
          created_at: now,
          updated_at: now,
        },
      ],
      studentPayments: [
        {
          id: 'spr-1793347994589-46rl',
          fee_id: 'fee-fa-1793347994569',
          student_id: 'stu-1793347994569',
          student_name: 'Aarav Patel',
          admission_number: 'ADM-2026-0017',
          fee_category: 'Tuition',
          amount_paid: 20000,
          payment_date: '2026-10-30',
          payment_mode: 'UPI',
          transaction_reference: 'UTR-9823419082',
          recorded_by: '44444444-4444-4444-4444-444444444444',
          recorded_by_name: 'Ananya Desai',
          recorded_by_role: 'counsellor',
          verification_status: 'Pending Verification',
          status: 'Pending Approval',
          created_at: now,
        },
        {
          id: 'spr-1793348715330-tmby',
          fee_id: 'fee-fa-1793348715329',
          student_id: 'stu-1793348715329',
          student_name: 'Aarav Patel',
          admission_number: 'ADM-2026-0019',
          fee_category: 'Tuition',
          amount_paid: 20000,
          payment_date: '2026-10-30',
          payment_mode: 'UPI',
          transaction_reference: 'UTR-1793348707582',
          recorded_by: '44444444-4444-4444-4444-444444444444',
          recorded_by_name: 'Ananya Desai',
          recorded_by_role: 'counsellor',
          verification_status: 'Pending Verification',
          status: 'Pending Approval',
          created_at: now,
        },
      ],
      feeAccounts: [
        {
          id: 'fa-1793347994569',
          student_id: 'stu-1793347994569',
          admission_id: 'adm-1793347994568',
          course_id: 'crs-fico-01',
          original_fee: 45000,
          discount: 0,
          net_payable: 45000,
          paid_amount: 0,
          outstanding_amount: 45000,
          payment_plan: 'Full Payment',
          status: 'Unpaid',
          created_at: now,
          updated_at: now,
        },
        {
          id: 'fa-1793348715329',
          student_id: 'stu-1793348715329',
          admission_id: 'adm-1793348715329',
          course_id: 'crs-fico-01',
          original_fee: 45000,
          discount: 0,
          net_payable: 45000,
          paid_amount: 0,
          outstanding_amount: 45000,
          payment_plan: 'Full Payment',
          status: 'Unpaid',
          created_at: now,
          updated_at: now,
        },
      ],
      users: [
        {
          id: 'usr-stu-1793347994568',
          email: 'aarav.patel.1793347954569@example.com',
          full_name: 'Aarav Patel',
          role: 'student',
          is_active: false,
          created_at: now,
          updated_at: now,
        },
        {
          id: 'usr-stu-1793348715329',
          email: 'aarav.patel.1793348697293@example.com',
          full_name: 'Aarav Patel',
          role: 'student',
          is_active: false,
          created_at: now,
          updated_at: now,
        },
      ],
      approvalHistory: [],
      auditLogs: [],
    };
  }

  function createValidRelationalLeads(): RelationalLead[] {
    const leads: RelationalLead[] = TARGET_LEAD_IDS.map((id, index) => ({
      id,
      lead_code: `LD-2026-${String(index + 7).padStart(3, '0')}`,
      full_name: 'Aarav Patel',
      email: `aarav.patel.${index}@example.com`,
      stage: index === 4 || index === 6 ? 'Converted' : 'New',
    }));

    // Add excluded records that must remain untouched
    leads.push(
      { id: 'c536a793-b385-415a-9067-920464812548', lead_code: 'LD-2026-010', full_name: 'test001', stage: 'New' },
      { id: 'f2f669e1-3df8-452f-92bd-37cef86d154c', lead_code: 'LD-2026-013', full_name: 'Amulya Namsani', stage: 'New' },
      { id: 'befacf79-d5cf-4f07-be09-0400b8ad9054', lead_code: 'LD-2026-006', full_name: 'bharadwaz', stage: 'New' },
      { id: '69926079-3cd7-43f0-9c09-8f278a097117', lead_code: 'LD-2026-015', full_name: 'test002', stage: 'New' },
      { id: '3526d4a6-6bb0-4c5f-96ad-48f4cdab4e84', lead_code: 'LD-2026-016', full_name: 'Mohanreddy Cherpati', stage: 'New' }
    );

    return leads;
  }

  describe('Precondition Fail-Closed Gate', () => {
    it('halts immediately if a test payment was Verified before execution', async () => {
      const snapshot = createValidInitialSnapshot();
      snapshot.studentPayments![0].verification_status = 'Verified';
      snapshot.studentPayments![0].status = 'Approved';

      const relationalLeads = createValidRelationalLeads();

      await expect(
        executeCleanupWorkflow({
          accountantUser: mockAccountant,
          initialRevision: 73n,
          getSnapshot: async () => snapshot,
          getRelationalLeads: async () => relationalLeads,
          commitRpc: async () => 74n,
          updateRelationalLeads: async () => {},
        })
      ).rejects.toThrow(/Precondition failed.*already Verified\/Approved/i);
    });

    it('halts immediately if an excluded record is missing', async () => {
      const snapshot = createValidInitialSnapshot();
      const relationalLeads = createValidRelationalLeads().filter(
        (l) => l.id !== 'c536a793-b385-415a-9067-920464812548' // remove test001!
      );

      await expect(
        executeCleanupWorkflow({
          accountantUser: mockAccountant,
          initialRevision: 73n,
          getSnapshot: async () => snapshot,
          getRelationalLeads: async () => relationalLeads,
          commitRpc: async () => 74n,
          updateRelationalLeads: async () => {},
        })
      ).rejects.toThrow(/Excluded lead 'c536a793-b385-415a-9067-920464812548' is missing/i);
    });

    it('halts immediately on unexpected change to a targeted admission (lead_id mismatch)', async () => {
      const snapshot = createValidInitialSnapshot();
      snapshot.admissions![0].lead_id = 'unauthorized-or-modified-lead-id';
      const relationalLeads = createValidRelationalLeads();

      await expect(
        executeCleanupWorkflow({
          accountantUser: mockAccountant,
          initialRevision: 73n,
          getSnapshot: async () => snapshot,
          getRelationalLeads: async () => relationalLeads,
          commitRpc: async () => 74n,
          updateRelationalLeads: async () => {},
        })
      ).rejects.toThrow(/Target admission 'adm-1793347994568' has unexpected lead_id/i);
    });

    it('halts immediately on unexpected change to a targeted lead (full_name changed to someone else)', async () => {
      const snapshot = createValidInitialSnapshot();
      const relationalLeads = createValidRelationalLeads();
      relationalLeads[0].full_name = 'Rahul Sharma';

      await expect(
        executeCleanupWorkflow({
          accountantUser: mockAccountant,
          initialRevision: 73n,
          getSnapshot: async () => snapshot,
          getRelationalLeads: async () => relationalLeads,
          commitRpc: async () => 74n,
          updateRelationalLeads: async () => {},
        })
      ).rejects.toThrow(/Target lead '.*' has unexpected name 'Rahul Sharma'/i);
    });
  });

  describe('CAS Conflict Handling & Revalidation Loop', () => {
    it('on CAS conflict, reloads and revalidates every precondition; halts if payment became Verified during conflict window', async () => {
      let fetchCount = 0;
      const initialSnapshot = createValidInitialSnapshot();

      // Snapshot returned on second fetch has payment 1 Verified by a concurrent accountant
      const modifiedSnapshot = createValidInitialSnapshot();
      modifiedSnapshot.studentPayments![0].verification_status = 'Verified';
      modifiedSnapshot.studentPayments![0].status = 'Approved';

      const relationalLeads = createValidRelationalLeads();

      let commitAttempts = 0;
      const commitRpc = async () => {
        commitAttempts++;
        if (commitAttempts === 1) {
          throw new Error('Conflict: workflow revision changed (SQLSTATE 40001)');
        }
        return 75n;
      };

      await expect(
        executeCleanupWorkflow({
          accountantUser: mockAccountant,
          initialRevision: 73n,
          getSnapshot: async () => {
            fetchCount++;
            return fetchCount === 1 ? initialSnapshot : modifiedSnapshot;
          },
          getRelationalLeads: async () => relationalLeads,
          commitRpc,
          updateRelationalLeads: async () => {},
        })
      ).rejects.toThrow(/Cleanup conflict revalidation failed on retry 1[\s\S]*already Verified\/Approved[\s\S]*Halting cleanup without overwriting/i);

      expect(commitAttempts).toBe(1); // Never committed with the conflicting snapshot!
    });

    it('on CAS conflict with benign concurrent edit, reloads, revalidates, and successfully commits on retry', async () => {
      let fetchCount = 0;
      const initialSnapshot = createValidInitialSnapshot();
      // Concurrent benign edit: a new course was added to snapshot
      const concurrentSnapshot = createValidInitialSnapshot();
      concurrentSnapshot.courses = [{ id: 'crs-new', title: 'New Course' }];

      const relationalLeads = createValidRelationalLeads();

      let commitAttempts = 0;
      const result = await executeCleanupWorkflow({
        accountantUser: mockAccountant,
        initialRevision: 73n,
        getSnapshot: async () => {
          fetchCount++;
          return fetchCount === 1 ? initialSnapshot : concurrentSnapshot;
        },
        getRelationalLeads: async () => relationalLeads,
        commitRpc: async (_tenant, rev) => {
          commitAttempts++;
          if (commitAttempts === 1) {
            throw new Error('Conflict: workflow revision changed (SQLSTATE 40001)');
          }
          return rev + 1n;
        },
        updateRelationalLeads: async () => {},
      });

      expect(result.success).toBe(true);
      expect(commitAttempts).toBe(2);
      expect(result.revisionCommitted).toBe(75n);
    });

    it('uses getRevision if provided on conflict and commits with tenant ID from actor', async () => {
      let fetchCount = 0;
      const initialSnapshot = createValidInitialSnapshot();
      const concurrentSnapshot = createValidInitialSnapshot();
      const relationalLeads = createValidRelationalLeads();

      let tenantPassed: string | undefined;
      let revisionPassed: bigint | undefined;

      const actorWithTenant: UserProfile = {
        ...mockAccountant,
        tenant_id: 'qa-tenant-isolated',
      };

      const result = await executeCleanupWorkflow({
        accountantUser: actorWithTenant,
        initialRevision: 73n,
        getSnapshot: async () => {
          fetchCount++;
          return fetchCount === 1 ? initialSnapshot : concurrentSnapshot;
        },
        getRevision: async () => 99n,
        getRelationalLeads: async () => relationalLeads,
        commitRpc: async (t, rev) => {
          tenantPassed = t;
          revisionPassed = rev;
          if (fetchCount === 1) {
            throw new Error('Conflict: revision changed');
          }
          return rev + 1n;
        },
        updateRelationalLeads: async () => {},
      });

      expect(result.success).toBe(true);
      expect(tenantPassed).toBe('qa-tenant-isolated');
      expect(revisionPassed).toBe(99n);
    });
  });

  describe('Relational Synchronization Partial-Failure Handling', () => {
    it('captures relational synchronization failure after snapshot commit and flags partial failure for retry', async () => {
      const snapshot = createValidInitialSnapshot();
      const relationalLeads = createValidRelationalLeads();

      const result = await executeCleanupWorkflow({
        accountantUser: mockAccountant,
        initialRevision: 73n,
        getSnapshot: async () => snapshot,
        getRelationalLeads: async () => relationalLeads,
        commitRpc: async () => 74n,
        updateRelationalLeads: async () => {
          throw new Error('Network timeout connecting to PostgREST public.leads');
        },
      });

      expect(result.success).toBe(false);
      expect(result.partialFailure).toBe(true);
      expect(result.revisionCommitted).toBe(74n);
      expect(result.error).toMatch(/Snapshot committed at revision 74, but relational lead synchronization failed/i);
    });
  });

  describe('Idempotency & Repeated Execution', () => {
    it('repeated execution does NOT produce duplicate notes, audit events, or adjustments', async () => {
      const snapshot = createValidInitialSnapshot();
      const relationalLeads = createValidRelationalLeads();

      let committedSnapshot: WorkflowSnapshot | undefined;
      let committedLeads: any[] = [];

      // Run 1: First Execution
      const run1 = await executeCleanupWorkflow({
        accountantUser: mockAccountant,
        initialRevision: 73n,
        getSnapshot: async () => snapshot,
        getRelationalLeads: async () => relationalLeads,
        commitRpc: async (_t, rev, snap) => {
          committedSnapshot = structuredClone(snap);
          return rev + 1n;
        },
        updateRelationalLeads: async (leads) => {
          committedLeads = structuredClone(leads);
        },
      });

      expect(run1.success).toBe(true);
      expect(run1.summary.paymentsRejected).toBe(2);
      expect(run1.summary.feesRejected).toBe(2);
      expect(committedSnapshot!.auditLogs!.length).toBe(2);
      expect(committedSnapshot!.approvalHistory!.length).toBe(2);

      // Verify notes appended once
      for (const lead of committedLeads) {
        expect(lead.notes.split(QUARANTINE_NOTE).length - 1).toBe(1);
      }

      // Run 2: Second Execution over the already-cleaned state
      const alreadyCleanedRelationalLeads = relationalLeads.map((l) => {
        const comm = committedLeads.find((cl) => cl.id === l.id);
        return comm ? { ...l, stage: comm.stage, notes: comm.notes } : l;
      });

      let run2CommittedSnapshot: WorkflowSnapshot | undefined;
      let run2CommittedLeads: any[] = [];

      const run2 = await executeCleanupWorkflow({
        accountantUser: mockAccountant,
        initialRevision: 74n,
        getSnapshot: async () => committedSnapshot!,
        getRelationalLeads: async () => alreadyCleanedRelationalLeads,
        commitRpc: async (_t, rev, snap) => {
          run2CommittedSnapshot = structuredClone(snap);
          return rev + 1n;
        },
        updateRelationalLeads: async (leads) => {
          run2CommittedLeads = structuredClone(leads);
        },
      });

      expect(run2.success).toBe(true);
      // Idempotent: 0 newly rejected, 0 duplicate audit events, 0 duplicate approval history entries
      expect(run2.summary.paymentsRejected).toBe(0);
      expect(run2.summary.feesRejected).toBe(0);
      expect(run2CommittedSnapshot!.auditLogs!.length).toBe(2); // Still 2, not 4!
      expect(run2CommittedSnapshot!.approvalHistory!.length).toBe(2); // Still 2, not 4!

      // Notes should NOT be duplicated
      for (const lead of run2CommittedLeads) {
        expect(lead.notes.split(QUARANTINE_NOTE).length - 1).toBe(1); // Exactly 1 occurrence, not 2!
      }
    });
  });

  describe('Instruction 2: Direct Financial Zeroing is Blocked & Amounts Preserved', () => {
    it('blocks direct financial zeroing and preserves original amounts on StudentFee and StudentFeeAccount', () => {
      const snapshot = createValidInitialSnapshot();
      const initialFeePayable = snapshot.studentFees![0].final_payable;
      const initialFaPayable = snapshot.feeAccounts![0].net_payable;

      expect(initialFeePayable).toBe(45000);
      expect(initialFaPayable).toBe(45000);

      const result = applySupportedCleanupMutations(snapshot, mockAccountant);

      // Verify blocked operations notice is returned
      expect(result.blockedOperations.length).toBeGreaterThan(0);
      expect(result.blockedOperations[0]).toMatch(/Direct zeroing of StudentFeeAccount balances is BLOCKED/i);

      // Original amounts MUST NOT be zeroed
      expect(result.mutatedSnapshot.studentFees![0].final_payable).toBe(45000);
      expect(result.mutatedSnapshot.studentFees![0].proposed_fee).toBe(45000);
      expect(result.mutatedSnapshot.feeAccounts![0].net_payable).toBe(45000);
      expect(result.mutatedSnapshot.feeAccounts![0].original_fee).toBe(45000);
    });
  });
});
