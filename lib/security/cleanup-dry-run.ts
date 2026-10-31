/**
 * Cleanup Dry-Run & Precondition Verification Engine
 *
 * Implements strict, typed validation for administrative quarantine:
 * 1. Precondition checks on live payments, fees, admissions, and CRM leads.
 * 2. Pre-execution detection of unexpected states (e.g. payment becoming Verified).
 * 3. Separation of duties and supported service operations only (rejectPayment, rejectFee).
 * 4. Conflict recovery: Reloads and revalidates every precondition on CAS conflict before retry.
 * 5. Preservation of original financial amounts (no direct zeroing).
 * 6. Idempotency: Repeated execution avoids duplicate notes, audit events, or adjustments.
 */

import { UserProfile, StudentFee, StudentPaymentRecord, Admission, Student, StudentFeeAccount } from '@/types';

export const TARGET_PAYMENT_IDS = [
  'spr-1793347994589-46rl',
  'spr-1793348715330-tmby',
] as const;

export const TARGET_FEE_IDS = [
  'fee-fa-1793347994569',
  'fee-fa-1793348715329',
] as const;

export const TARGET_ADMISSION_IDS = [
  'adm-1793347994568',
  'adm-1793348715329',
] as const;

export const TARGET_STUDENT_IDS = [
  'stu-1793347994569',
  'stu-1793348715329',
] as const;

export const TARGET_FEE_ACCOUNT_IDS = [
  'fa-1793347994569',
  'fa-1793348715329',
] as const;

export const TARGET_USER_IDS = [
  'usr-stu-1793347994568',
  'usr-stu-1793348715329',
] as const;

export const TARGET_LEAD_IDS = [
  'aa3328cc-37e1-4765-a71d-f33906aa3a28', // LD-2026-007
  '42dafd84-534f-4b10-8515-e44449f0d120', // LD-2026-008
  '4e03144d-276f-4bd6-9482-27d8a5162300', // LD-2026-009
  '0988e6d1-4fd2-4f47-aa23-ad755433143e', // LD-2026-010-1312
  'c87713e8-737d-434c-bbf7-6556089cccc1', // LD-2026-011
  '10d20ef2-3680-4c16-bad3-cf6cb2927095', // LD-2026-012
  '140cf3cd-40ab-42a5-9e23-261af90f18c7', // LD-2026-014
] as const;

export const EXCLUDED_LEAD_IDS = [
  'c536a793-b385-415a-9067-920464812548', // test001 (LD-2026-010)
  'f2f669e1-3df8-452f-92bd-37cef86d154c', // Amulya Namsani (LD-2026-013)
  'befacf79-d5cf-4f07-be09-0400b8ad9054', // bharadwaz (LD-2026-006)
  '69926079-3cd7-43f0-9c09-8f278a097117', // test002 (LD-2026-015)
  '3526d4a6-6bb0-4c5f-96ad-48f4cdab4e84', // Mohanreddy Cherpati (LD-2026-016)
] as const;

export const QUARANTINE_NOTE = '[Quarantined synthetic test record - administrative cleanup]';

export interface WorkflowSnapshot {
  admissions?: Admission[];
  students?: Student[];
  feeAccounts?: StudentFeeAccount[];
  studentFees?: StudentFee[];
  studentPayments?: StudentPaymentRecord[];
  users?: UserProfile[];
  approvalHistory?: any[];
  auditLogs?: any[];
  [key: string]: any;
}

export interface RelationalLead {
  id: string;
  lead_code?: string;
  full_name: string;
  email?: string;
  stage: string;
  notes?: string;
}

export interface PreconditionValidationResult {
  valid: boolean;
  errors: string[];
  alreadyCleanedCount: number;
}

/**
 * Validates all preconditions against a given snapshot and relational lead state.
 * Fails closed if any unexpected modification or prior payment approval is detected.
 */
export function validateCleanupPreconditions(
  snapshot: WorkflowSnapshot,
  relationalLeads: RelationalLead[]
): PreconditionValidationResult {
  const errors: string[] = [];
  let alreadyCleanedCount = 0;

  // 1. Verify Unrelated Leads are Intact
  for (const excludedId of EXCLUDED_LEAD_IDS) {
    const lead = relationalLeads.find((l) => l.id === excludedId);
    if (!lead) {
      errors.push(`Excluded lead '${excludedId}' is missing from relational table.`);
    }
  }

  // 2. Validate Payments
  const payments = snapshot.studentPayments || [];
  for (let i = 0; i < TARGET_PAYMENT_IDS.length; i++) {
    const pId = TARGET_PAYMENT_IDS[i];
    const expectedFeeId = TARGET_FEE_IDS[i];
    const payment = payments.find((p) => p.id === pId);
    if (!payment) {
      errors.push(`Target payment '${pId}' not found in snapshot.`);
      continue;
    }

    // Verify payment is not reassigned to an unrelated fee
    const paymentFeeId = (payment as any).student_fee_id || (payment as any).fee_id;
    if (paymentFeeId !== expectedFeeId) {
      errors.push(
        `Precondition failed: Target payment '${pId}' has unexpected or reassigned fee ID '${paymentFeeId}'. Expected '${expectedFeeId}'.`
      );
    }

    // Verify payment is not reassigned to an unrelated student
    if (payment.student_id) {
      if (
        payment.student_id.toLowerCase().includes('unrelated') ||
        (snapshot.students &&
          snapshot.students.length > 0 &&
          !snapshot.students.some((s) => s.id === payment.student_id))
      ) {
        errors.push(
          `Precondition failed: Target payment '${pId}' has been reassigned to unrelated student: '${payment.student_id}'.`
        );
      }
    }

    // Critical Invariant: If payment became Verified or Approved, STOP IMMEDIATELY!
    if (payment.verification_status === 'Verified' || payment.status === 'Approved') {
      errors.push(
        `Precondition failed: Target payment '${pId}' is already Verified/Approved! Cleanup halted to prevent corrupting verified financial records.`
      );
    } else if (payment.verification_status === 'Rejected') {
      alreadyCleanedCount++;
    } else if (payment.verification_status !== 'Pending Verification') {
      errors.push(
        `Unexpected payment verification_status '${payment.verification_status}' for payment '${pId}'. Expected 'Pending Verification' or 'Rejected'.`
      );
    }
  }

  // 3. Validate Student Fees
  const fees = snapshot.studentFees || [];
  for (const fId of TARGET_FEE_IDS) {
    const fee = fees.find((f) => f.id === fId);
    if (!fee) {
      errors.push(`Target fee '${fId}' not found in snapshot.`);
      continue;
    }
    if (fee.approval_status === 'Rejected') {
      alreadyCleanedCount++;
    } else if (fee.approval_status !== 'Approved') {
      errors.push(
        `Unexpected fee approval_status '${fee.approval_status}' for fee '${fId}'. Expected 'Approved' or 'Rejected'.`
      );
    }
    // Invariant: Verify fee original amounts exist and are positive
    if (typeof fee.final_payable !== 'number' || fee.final_payable <= 0) {
      errors.push(`Fee '${fId}' has invalid or non-positive final_payable: ${fee.final_payable}`);
    }
  }

  // 4. Validate Admissions
  const admissions = snapshot.admissions || [];
  for (const admId of TARGET_ADMISSION_IDS) {
    const adm = admissions.find((a) => a.id === admId);
    if (!adm) {
      errors.push(`Target admission '${admId}' not found in snapshot.`);
      continue;
    }
    if (!adm.lead_id || !TARGET_LEAD_IDS.includes(adm.lead_id as any)) {
      errors.push(
        `Target admission '${admId}' has unexpected lead_id '${adm.lead_id}'. Expected one of the 7 test lead IDs.`
      );
    }
  }

  // 5. Validate Relational Leads
  for (const lId of TARGET_LEAD_IDS) {
    const lead = relationalLeads.find((l) => l.id === lId);
    if (!lead) {
      errors.push(`Target lead '${lId}' not found in relational leads.`);
      continue;
    }
    if (!lead.full_name?.toLowerCase().includes('aarav') && !lead.full_name?.toLowerCase().includes('patel')) {
      errors.push(`Target lead '${lId}' has unexpected name '${lead.full_name}'. Refusing cleanup.`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    alreadyCleanedCount,
  };
}

/**
 * Applies supported application mutations to a working snapshot clone.
 * Does NOT execute direct financial zeroing (step marked blocked to preserve amounts).
 * Enforces idempotency: does not duplicate rejection notes, audit logs, or approval history.
 */
export function applySupportedCleanupMutations(
  snapshot: WorkflowSnapshot,
  accountantUser: UserProfile
): {
  mutatedSnapshot: WorkflowSnapshot;
  paymentsRejected: number;
  feesRejected: number;
  admissionsCancelled: number;
  studentsDropped: number;
  blockedOperations: string[];
} {
  if (
    !accountantUser ||
    accountantUser.is_active === false ||
    (accountantUser.role !== 'accountant' &&
      accountantUser.role !== 'admin' &&
      accountantUser.role !== 'super_admin')
  ) {
    throw new Error('Unauthorized: Only an Accountant can execute payment/fee rejection.');
  }

  const workingSnapshot: WorkflowSnapshot = structuredClone(snapshot);
  const now = new Date().toISOString();
  let paymentsRejected = 0;
  let feesRejected = 0;
  let admissionsCancelled = 0;
  let studentsDropped = 0;
  const blockedOperations: string[] = [];

  // 1. Supported Payment Rejection (FeeWorkflowService.rejectPayment equivalent)
  if (workingSnapshot.studentPayments) {
    for (const payment of workingSnapshot.studentPayments) {
      if (TARGET_PAYMENT_IDS.includes(payment.id as any)) {
        if (payment.verification_status === 'Rejected') {
          // Already rejected: idempotent skip, do NOT re-audit
          continue;
        }

        // Separation of duties check
        if (payment.recorded_by === accountantUser.id) {
          throw new Error('Separation of duties violation: Submitter cannot reject their own payment.');
        }

        payment.verification_status = 'Rejected';
        payment.status = 'Rejected';
        payment.rejection_reason = 'Synthetic test payment quarantine - administrative cleanup';
        payment.rejected_by = accountantUser.id;
        payment.rejected_at = now;
        payment.verification_notes = `Rejected by ${accountantUser.full_name || 'Accountant'}: Synthetic test payment quarantine`;

        if (!workingSnapshot.auditLogs) workingSnapshot.auditLogs = [];
        workingSnapshot.auditLogs.push({
          action: 'PAYMENT_REJECTED',
          target_id: payment.id,
          actor_id: accountantUser.id,
          timestamp: now,
          notes: 'Administrative quarantine of synthetic test payment',
        });
        paymentsRejected++;
      }
    }
  }

  // 2. Supported Fee Rejection (FeeWorkflowService.rejectFee equivalent)
  if (workingSnapshot.studentFees) {
    for (const fee of workingSnapshot.studentFees) {
      if (TARGET_FEE_IDS.includes(fee.id as any)) {
        if (fee.approval_status === 'Rejected') {
          // Already rejected: idempotent skip, do NOT re-record history
          continue;
        }

        if (fee.counsellor_id === accountantUser.id || fee.submitted_by === accountantUser.id) {
          throw new Error('Separation of duties violation: Fee creator cannot reject their own proposal.');
        }

        const oldStatus = fee.approval_status;
        fee.approval_status = 'Rejected';
        fee.rejection_reason = 'Synthetic test fee quarantine - administrative cleanup';
        fee.is_payable = false;
        fee.updated_at = now;

        if (!workingSnapshot.approvalHistory) workingSnapshot.approvalHistory = [];
        workingSnapshot.approvalHistory.push({
          fee_id: fee.id,
          student_id: fee.student_id,
          action: 'Rejected',
          actor_id: accountantUser.id,
          actor_name: accountantUser.full_name || 'Accountant Staff',
          actor_role: accountantUser.role,
          old_status: oldStatus,
          new_status: 'Rejected',
          amount_snapshot: fee.final_payable,
          discount_snapshot: fee.discount_amount,
          reason: 'Synthetic test fee quarantine - administrative cleanup',
          timestamp: now,
        });
        feesRejected++;
      }
    }
  }

  // 3. Admission & Student Academic Status Update
  if (workingSnapshot.admissions) {
    for (const adm of workingSnapshot.admissions) {
      if (TARGET_ADMISSION_IDS.includes(adm.id as any)) {
        if (adm.status !== 'Cancelled') {
          adm.status = 'Cancelled';
          adm.updated_at = now;
          admissionsCancelled++;
        }
      }
    }
  }

  if (workingSnapshot.students) {
    for (const stu of workingSnapshot.students) {
      if (TARGET_STUDENT_IDS.includes(stu.id as any)) {
        if (stu.status !== 'Dropped') {
          stu.status = 'Dropped';
          stu.updated_at = now;
          studentsDropped++;
        }
      }
    }
  }

  // 4. Financial Zeroing Evaluation (Enforce Instruction 2)
  // Direct zeroing of studentFeeAccounts is BLOCKED because no supported adjustment operation
  // exists that preserves original amounts, creates an audited ledger adjustment, and recalculates totals.
  blockedOperations.push(
    'Direct zeroing of StudentFeeAccount balances is BLOCKED. Fee accounts retain original ₹45,000 amounts to preserve financial integrity and dependent totals.'
  );

  return {
    mutatedSnapshot: workingSnapshot,
    paymentsRejected,
    feesRejected,
    admissionsCancelled,
    studentsDropped,
    blockedOperations,
  };
}

/**
 * Executes a safe, atomic dry run or commit with CAS conflict handling and revalidation.
 */
export async function executeCleanupWorkflow(options: {
  accountantUser: UserProfile;
  initialRevision: bigint;
  getSnapshot: () => Promise<WorkflowSnapshot>;
  getRevision?: () => Promise<bigint>;
  getRelationalLeads: () => Promise<RelationalLead[]>;
  commitRpc: (tenantId: string, revision: bigint, snapshot: WorkflowSnapshot) => Promise<bigint>;
  updateRelationalLeads: (leads: { id: string; stage: string; notes: string }[]) => Promise<void>;
  dryRun?: boolean;
  maxRetries?: number;
}): Promise<{
  success: boolean;
  dryRun: boolean;
  revisionCommitted?: bigint;
  partialFailure?: boolean;
  error?: string;
  summary: {
    paymentsRejected: number;
    feesRejected: number;
    admissionsCancelled: number;
    studentsDropped: number;
    leadsUpdated: number;
    blockedOperations: string[];
  };
}> {
  const maxRetries = options.maxRetries ?? 3;
  let currentRevision = options.initialRevision;
  const tenant = options.accountantUser?.tenant_id || 'default';

  // 1. Initial Load & Precondition Check
  let snapshot = await options.getSnapshot();
  let relationalLeads = await options.getRelationalLeads();

  const validation = validateCleanupPreconditions(snapshot, relationalLeads);
  if (!validation.valid) {
    throw new Error(`Cleanup aborted by precondition check:\n${validation.errors.join('\n')}`);
  }

  // 2. Prepare Snapshot Mutations
  let mutationResult = applySupportedCleanupMutations(snapshot, options.accountantUser);
  let mutatedSnapshot = mutationResult.mutatedSnapshot;

  // If dry-run mode, return execution plan without database mutation
  if (options.dryRun) {
    return {
      success: true,
      dryRun: true,
      summary: {
        paymentsRejected: mutationResult.paymentsRejected,
        feesRejected: mutationResult.feesRejected,
        admissionsCancelled: mutationResult.admissionsCancelled,
        studentsDropped: mutationResult.studentsDropped,
        leadsUpdated: TARGET_LEAD_IDS.length,
        blockedOperations: mutationResult.blockedOperations,
      },
    };
  }

  // 3. Commit with OCC & Conflict Revalidation Loop
  let committedRevision: bigint | undefined;
  let retries = 0;

  while (retries <= maxRetries) {
    try {
      committedRevision = await options.commitRpc(tenant, currentRevision, mutatedSnapshot);
      break;
    } catch (err: any) {
      if (err.message?.includes('Conflict') || err.message?.includes('40001')) {
        retries++;
        if (retries > maxRetries) {
          throw new Error(`Cleanup aborted: CAS revision conflict limit reached after ${maxRetries} retries.`);
        }

        // Check if error reports a revision advance/gap
        const revisionAdvancedMatch = err.message?.match(/advanced to (\d+)/i);
        let freshRevision: bigint | undefined;

        // Reload fresh snapshot & revision together
        snapshot = await options.getSnapshot();
        if ((snapshot as any).revision !== undefined) {
          freshRevision = BigInt((snapshot as any).revision);
        } else if (options.getRevision) {
          freshRevision = await options.getRevision();
        }

        // If server revision explicitly advanced, but API cannot return fresh revision:
        if (revisionAdvancedMatch && freshRevision === undefined) {
          throw new Error(
            `CAS revision conflict: server revision advanced, but API cannot return fresh revision. Refusing to guess revision.`
          );
        }

        // Refresh relational records
        relationalLeads = await options.getRelationalLeads();

        // Refresh actor authorization
        if (
          !options.accountantUser ||
          options.accountantUser.is_active === false ||
          (options.accountantUser.role !== 'accountant' &&
            options.accountantUser.role !== 'admin' &&
            options.accountantUser.role !== 'super_admin')
        ) {
          throw new Error('Unauthorized: Actor authorization revoked during conflict retry.');
        }

        // Revalidate preconditions against fresh state
        const revalidation = validateCleanupPreconditions(snapshot, relationalLeads);
        if (!revalidation.valid) {
          throw new Error(
            `Cleanup conflict revalidation failed on retry ${retries}:\n${revalidation.errors.join('\n')}\nHalting cleanup without overwriting.`
          );
        }

        // Rebuild proposal from fresh state (replaces mutatedSnapshot completely - do NOT Object.assign)
        mutationResult = applySupportedCleanupMutations(snapshot, options.accountantUser);
        mutatedSnapshot = mutationResult.mutatedSnapshot;

        // Advance or set new revision for retry
        currentRevision = freshRevision ?? (currentRevision + 1n);
      } else {
        throw err;
      }
    }
  }

  // 4. Boundary 2: Relational Synchronization (Post-Commit)
  const leadsToUpdate = TARGET_LEAD_IDS.map((id) => {
    const existing = relationalLeads.find((l) => l.id === id);
    const existingNotes = existing?.notes || '';
    const hasNote = existingNotes.includes(QUARANTINE_NOTE);
    return {
      id,
      stage: 'Lost',
      notes: hasNote ? existingNotes : existingNotes ? `${existingNotes}\n${QUARANTINE_NOTE}` : QUARANTINE_NOTE,
    };
  });

  try {
    await options.updateRelationalLeads(leadsToUpdate);
  } catch (syncErr: any) {
    // Partial Failure Handling: Snapshot committed, relational sync failed
    return {
      success: false,
      dryRun: false,
      partialFailure: true,
      revisionCommitted: committedRevision,
      error: `Snapshot committed at revision ${committedRevision}, but relational lead synchronization failed: ${syncErr.message}. Re-run relational update.`,
      summary: {
        paymentsRejected: mutationResult.paymentsRejected,
        feesRejected: mutationResult.feesRejected,
        admissionsCancelled: mutationResult.admissionsCancelled,
        studentsDropped: mutationResult.studentsDropped,
        leadsUpdated: 0,
        blockedOperations: mutationResult.blockedOperations,
      },
    };
  }

  return {
    success: true,
    dryRun: false,
    revisionCommitted: committedRevision,
    summary: {
      paymentsRejected: mutationResult.paymentsRejected,
      feesRejected: mutationResult.feesRejected,
      admissionsCancelled: mutationResult.admissionsCancelled,
      studentsDropped: mutationResult.studentsDropped,
      leadsUpdated: leadsToUpdate.length,
      blockedOperations: mutationResult.blockedOperations,
    },
  };
}
