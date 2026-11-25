/**
 * TASK-03 — Financial Reconciliation Engine
 * 7-Level read-only reconciliation. Never auto-corrects production data.
 * Identifies discrepancies and reports them for authorized review.
 */

import { store } from '@/lib/services/data-store';
import { isPaymentApproved, isPaymentPending } from '@/lib/utils/dashboard-metrics';
import { getAuthorizedBankAccounts } from '@/lib/utils/bank-autofill';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ReconciliationDiscrepancy {
  level: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  severity: 'critical' | 'warning' | 'info';
  code: string;
  message: string;
  entity_type: string;
  entity_id?: string;
  expected_value?: string | number;
  actual_value?: string | number;
  recommended_action?: string;
  details?: Record<string, unknown>;
}

export interface ReconciliationLevelResult {
  level: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  label: string;
  checks_executed: number;
  discrepancies: ReconciliationDiscrepancy[];
  passed: boolean;
  checked_at: string;
}

export interface FinancialReconciliationReport {
  tenant_id: string;
  generated_at: string;
  levels: ReconciliationLevelResult[];
  total_discrepancies: number;
  critical_count: number;
  warning_count: number;
  info_count: number;
  external_bank_reconciliation: 'Not Performed' | 'Completed';
  passed: boolean;
  summary: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function twoDP(n: number): number {
  return Math.round(n * 100) / 100;
}

function isCashPayment(mode?: string): boolean {
  return mode?.toLowerCase() === 'cash';
}

function mkDiscrepancy(
  level: ReconciliationDiscrepancy['level'],
  severity: ReconciliationDiscrepancy['severity'],
  code: string,
  message: string,
  entity_type: string,
  entity_id?: string,
  details?: Record<string, unknown>
): ReconciliationDiscrepancy {
  return { level, severity, code, message, entity_type, entity_id, details };
}

// ---------------------------------------------------------------------------
// Level 1 — Student and Admission Integrity
// ---------------------------------------------------------------------------

export function reconcileLevel1(tenantId: string): ReconciliationLevelResult {
  const discrepancies: ReconciliationDiscrepancy[] = [];
  const now = new Date().toISOString();

  const fees = (store.studentFees || []).filter(
    (f) => !tenantId || !f.tenant_id || f.tenant_id === tenantId
  );

  for (const fee of fees) {
    // 1A — Net payable must equal proposed_fee - discount
    const baseFee = fee.proposed_fee ?? fee.standard_fee ?? 0;
    const expectedNet = twoDP(baseFee - (fee.discount_amount || 0));
    const actualNet = twoDP(fee.final_payable || 0);
    if (Math.abs(expectedNet - actualNet) > 0.01) {
      discrepancies.push(
        mkDiscrepancy(
          1,
          'warning',
          'L1-NET-PAYABLE-MISMATCH',
          `Fee ${fee.id}: net payable ${actualNet} does not equal proposed_fee ${baseFee} minus discount ${fee.discount_amount || 0} = ${expectedNet}`,
          'student_fee',
          fee.id,
          { expectedNet, actualNet, proposed_fee: baseFee, discount_amount: fee.discount_amount || 0 }
        )
      );
    }

    // 1B — paid_amount + outstanding_amount should equal final_payable (within tolerance)
    const sumCheck = twoDP((fee.paid_amount || 0) + (fee.outstanding_amount || 0));
    const finalPayable = twoDP(fee.final_payable || 0);
    if (Math.abs(sumCheck - finalPayable) > 0.01) {
      discrepancies.push(
        mkDiscrepancy(
          1,
          'critical',
          'L1-BALANCE-INCONSISTENT',
          `Fee ${fee.id}: paid_amount(${fee.paid_amount || 0}) + outstanding_amount(${fee.outstanding_amount || 0}) = ${sumCheck} != final_payable(${finalPayable})`,
          'student_fee',
          fee.id,
          { paid_amount: fee.paid_amount, outstanding_amount: fee.outstanding_amount, final_payable: fee.final_payable }
        )
      );
    }

    // 1C — outstanding must not be negative
    if ((fee.outstanding_amount || 0) < -0.01) {
      discrepancies.push(
        mkDiscrepancy(
          1,
          'critical',
          'L1-NEGATIVE-OUTSTANDING',
          `Fee ${fee.id}: outstanding_amount is negative (${fee.outstanding_amount})`,
          'student_fee',
          fee.id
        )
      );
    }

    // 1D — approved_total must not exceed proposed_fee when no additional charges
    if (fee.approved_total && fee.proposed_fee && !fee.additional_charges && fee.approved_total > fee.proposed_fee + 0.01) {
      discrepancies.push(
        mkDiscrepancy(
          1,
          'warning',
          'L1-APPROVED-EXCEEDS-PROPOSED',
          `Fee ${fee.id}: approved_total (${fee.approved_total}) exceeds proposed_fee (${fee.proposed_fee})`,
          'student_fee',
          fee.id
        )
      );
    }
  }

  return {
    level: 1,
    label: 'Student & Admission Fee Agreement Integrity',
    checks_executed: fees.length * 4,
    discrepancies,
    passed: discrepancies.filter((d) => d.severity === 'critical').length === 0,
    checked_at: now,
  };
}

// ---------------------------------------------------------------------------
// Level 2 — Payments and Receipts Consistency
// ---------------------------------------------------------------------------

export function reconcileLevel2(tenantId: string): ReconciliationLevelResult {
  const discrepancies: ReconciliationDiscrepancy[] = [];
  const now = new Date().toISOString();

  const payments = (store.studentPayments || []).filter(
    (p) => !tenantId || !p.tenant_id || p.tenant_id === tenantId
  );
  const receipts = (store.receipts || []).filter(
    (r) => !tenantId || !(r as any).tenant_id || (r as any).tenant_id === tenantId
  );

  const receiptNumbersSeen = new Set<string>();

  for (const payment of payments) {
    if (!isPaymentApproved(payment)) continue;

    const linkedReceipt = receipts.find(
      (r) =>
        r.payment_id === payment.id ||
        r.payment_id === `pay-${payment.id}` ||
        (payment.receipt_number && r.receipt_number === payment.receipt_number)
    );

    if (!linkedReceipt) {
      discrepancies.push(
        mkDiscrepancy(
          2,
          'critical',
          'L2-VERIFIED-MISSING-RECEIPT',
          `Payment ${payment.id} is verified but has no linked receipt`,
          'payment',
          payment.id,
          { amount: payment.amount_paid, student: payment.student_name }
        )
      );
    } else {
      const receiptAmount =
        linkedReceipt.payment_amount ??
        (linkedReceipt as any).amount ??
        (linkedReceipt as any).amount_paid ??
        (linkedReceipt as any).amount_received ??
        0;
      if (Math.abs(receiptAmount - payment.amount_paid) > 0.01) {
        discrepancies.push(
          mkDiscrepancy(
            2,
            'critical',
            'L2-RECEIPT-AMOUNT-MISMATCH',
            `Receipt ${linkedReceipt.id} amount (${receiptAmount}) does not match payment ${payment.id} amount (${payment.amount_paid})`,
            'receipt',
            linkedReceipt.id,
            { payment_amount: payment.amount_paid, receipt_amount: receiptAmount }
          )
        );
      }

      const receiptStatus = (linkedReceipt as any)?.receipt_status || linkedReceipt?.status;
      if (receiptStatus === 'Void' || receiptStatus === 'Voided') {
        discrepancies.push(
          mkDiscrepancy(
            2,
            'critical',
            'L2-VERIFIED-PAYMENT-VOIDED-RECEIPT',
            `Verified payment ${payment.id} is linked to a voided receipt ${linkedReceipt.id}`,
            'receipt',
            linkedReceipt.id
          )
        );
      }

      if (linkedReceipt.receipt_number) {
        if (receiptNumbersSeen.has(linkedReceipt.receipt_number)) {
          discrepancies.push(
            mkDiscrepancy(
              2,
              'critical',
              'L2-DUPLICATE-RECEIPT-NUMBER',
              `Duplicate receipt number: ${linkedReceipt.receipt_number}`,
              'receipt',
              linkedReceipt.id
            )
          );
        }
        receiptNumbersSeen.add(linkedReceipt.receipt_number);
      }
    }
  }

  // Receipts linked to rejected payments
  for (const receipt of receipts) {
    const receiptStatus = (receipt as any)?.receipt_status || receipt?.status;
    if (receiptStatus === 'Void' || receiptStatus === 'Voided') continue;
    if (!receipt.payment_id) continue;

    const linkedPayment = payments.find(
      (p) => p.id === receipt.payment_id || `pay-${p.id}` === receipt.payment_id
    );
    if (linkedPayment && linkedPayment.verification_status === 'Rejected') {
      discrepancies.push(
        mkDiscrepancy(
          2,
          'critical',
          'L2-RECEIPT-LINKED-REJECTED-PAYMENT',
          `Receipt ${receipt.id} is linked to rejected payment ${receipt.payment_id}`,
          'receipt',
          receipt.id
        )
      );
    }
  }

  return {
    level: 2,
    label: 'Payments & Receipts Consistency',
    checks_executed: payments.length * 4 + receipts.length,
    discrepancies,
    passed: discrepancies.filter((d) => d.severity === 'critical').length === 0,
    checked_at: now,
  };
}

// ---------------------------------------------------------------------------
// Level 3 — Bank Account Mapping
// ---------------------------------------------------------------------------

export function reconcileLevel3(tenantId: string): ReconciliationLevelResult {
  const discrepancies: ReconciliationDiscrepancy[] = [];
  const now = new Date().toISOString();

  const payments = (store.studentPayments || []).filter(
    (p) => !tenantId || !p.tenant_id || p.tenant_id === tenantId
  );
  const authorizedAccounts = getAuthorizedBankAccounts(undefined, {
    includePending: true,
    includeArchived: true,
  });
  const accountMap = new Map(authorizedAccounts.map((a) => [a.id, a]));

  for (const payment of payments) {
    if (isCashPayment(payment.payment_mode)) continue;

    if (!payment.our_bank_profile_id) {
      const severity = isPaymentApproved(payment) ? 'critical' : 'warning';
      discrepancies.push(
        mkDiscrepancy(
          3,
          severity,
          'L3-MISSING-BANK-PROFILE-ID',
          `Payment ${payment.id} (non-cash, mode=${payment.payment_mode}) has no our_bank_profile_id`,
          'payment',
          payment.id,
          { amount: payment.amount_paid, student: payment.student_name }
        )
      );
      continue;
    }

    const account = accountMap.get(payment.our_bank_profile_id);
    if (!account) {
      discrepancies.push(
        mkDiscrepancy(
          3,
          'critical',
          'L3-INVALID-BANK-PROFILE-ID',
          `Payment ${payment.id} references unknown bank account ID: ${payment.our_bank_profile_id}`,
          'payment',
          payment.id,
          { our_bank_profile_id: payment.our_bank_profile_id }
        )
      );
      continue;
    }

    if ((account as any).tenant_id && (account as any).tenant_id !== tenantId && tenantId !== 'default') {
      discrepancies.push(
        mkDiscrepancy(
          3,
          'critical',
          'L3-CROSS-TENANT-BANK-ACCOUNT',
          `Payment ${payment.id} references a bank account from a different tenant`,
          'payment',
          payment.id,
          { payment_tenant: tenantId, account_tenant: (account as any).tenant_id }
        )
      );
    }

    if (payment.our_bank_account_name && account.account_holder_name) {
      if (payment.our_bank_account_name.trim().toLowerCase() !== account.account_holder_name.trim().toLowerCase()) {
        discrepancies.push(
          mkDiscrepancy(
            3,
            'warning',
            'L3-HOLDER-NAME-MISMATCH',
            `Payment ${payment.id}: recorded holder "${payment.our_bank_account_name}" differs from master "${account.account_holder_name}" for ID ${account.id}`,
            'payment',
            payment.id
          )
        );
      }
    }

    if (isPaymentApproved(payment) && payment.verified_bank_profile_id) {
      if (!accountMap.has(payment.verified_bank_profile_id)) {
        discrepancies.push(
          mkDiscrepancy(
            3,
            'warning',
            'L3-INVALID-VERIFIED-BANK-PROFILE-ID',
            `Payment ${payment.id} verified bank account ID is unknown: ${payment.verified_bank_profile_id}`,
            'payment',
            payment.id
          )
        );
      }
    }
  }

  const bankCollections: Record<string, number> = {};
  for (const payment of payments) {
    if (!isPaymentApproved(payment) || isCashPayment(payment.payment_mode)) continue;
    const bankId = payment.verified_bank_profile_id || payment.our_bank_profile_id || 'unknown';
    bankCollections[bankId] = twoDP((bankCollections[bankId] || 0) + payment.amount_paid);
  }
  if (Object.keys(bankCollections).length > 0) {
    discrepancies.push(
      mkDiscrepancy(
        3,
        'info',
        'L3-BANK-COLLECTION-SUMMARY',
        `Bank-wise verified collections: ${Object.entries(bankCollections)
          .map(([id, amt]) => `${id}: ₹${amt.toLocaleString('en-IN')}`)
          .join(', ')}`,
        'summary',
        undefined,
        { bankCollections }
      )
    );
  }

  return {
    level: 3,
    label: 'Bank Account Mapping Integrity',
    checks_executed: payments.length * 4,
    discrepancies,
    passed: discrepancies.filter((d) => d.severity === 'critical').length === 0,
    checked_at: now,
  };
}

// ---------------------------------------------------------------------------
// Level 4 — Installment Allocations
// ---------------------------------------------------------------------------

export function reconcileLevel4(tenantId: string): ReconciliationLevelResult {
  const discrepancies: ReconciliationDiscrepancy[] = [];
  const now = new Date().toISOString();

  const installments = (store.installments || []).filter(
    (i) => !tenantId || !i.tenant_id || i.tenant_id === tenantId
  );
  const payments = (store.studentPayments || []).filter(
    (p) => !tenantId || !p.tenant_id || p.tenant_id === tenantId
  );

  const paymentsPerInstallment = new Map<string, typeof payments>();
  for (const p of payments) {
    if (!p.installment_id || !isPaymentApproved(p)) continue;
    const list = paymentsPerInstallment.get(p.installment_id) || [];
    list.push(p);
    paymentsPerInstallment.set(p.installment_id, list);
  }

  for (const inst of installments) {
    const instPayments = paymentsPerInstallment.get(inst.id) || [];
    const totalAllocated = twoDP(instPayments.reduce((s, p) => s + p.amount_paid, 0));
    const instAmount = twoDP((inst as any).amount ?? (inst as any).installment_amount ?? 0);

    if (instAmount > 0 && totalAllocated > instAmount + 0.01) {
      discrepancies.push(
        mkDiscrepancy(
          4,
          'critical',
          'L4-INSTALLMENT-OVER-ALLOCATED',
          `Installment ${inst.id}: total allocated (${totalAllocated}) exceeds installment amount (${instAmount})`,
          'installment',
          inst.id,
          { totalAllocated, instAmount }
        )
      );
    }

    const instPaid = twoDP((inst as any).paid_amount ?? 0);
    const instOutstanding = twoDP((inst as any).outstanding_amount ?? (inst as any).balance ?? 0);
    if (instAmount > 0 && Math.abs(instPaid + instOutstanding - instAmount) > 0.01) {
      discrepancies.push(
        mkDiscrepancy(
          4,
          'warning',
          'L4-INSTALLMENT-BALANCE-MISMATCH',
          `Installment ${inst.id}: paid(${instPaid}) + outstanding(${instOutstanding}) = ${twoDP(instPaid + instOutstanding)} != amount(${instAmount})`,
          'installment',
          inst.id
        )
      );
    }
  }

  return {
    level: 4,
    label: 'Installment Allocation Integrity',
    checks_executed: installments.length * 2,
    discrepancies,
    passed: discrepancies.filter((d) => d.severity === 'critical').length === 0,
    checked_at: now,
  };
}

// ---------------------------------------------------------------------------
// Level 5 — Expenses and Settlements
// ---------------------------------------------------------------------------

export function reconcileLevel5(tenantId: string): ReconciliationLevelResult {
  const discrepancies: ReconciliationDiscrepancy[] = [];
  const now = new Date().toISOString();

  const expenses = (store.expenses || []).filter(
    (e) => !tenantId || !(e as any).tenant_id || (e as any).tenant_id === tenantId
  );

  for (const exp of expenses) {
    if (exp.status === 'Settled') {
      if (!exp.reference || !exp.reference.trim()) {
        discrepancies.push(
          mkDiscrepancy(
            5,
            'critical',
            'L5-SETTLED-WITHOUT-REFERENCE',
            `Expense ${exp.id} is Settled but has no transaction reference`,
            'expense',
            exp.id
          )
        );
      }

      if (!exp.settled_by) {
        discrepancies.push(
          mkDiscrepancy(
            5,
            'critical',
            'L5-SETTLED-WITHOUT-SETTLEDBY',
            `Expense ${exp.id} is Settled but has no settled_by user`,
            'expense',
            exp.id
          )
        );
      }

      if (exp.validated_amount !== undefined && Math.abs(exp.validated_amount - exp.amount) > 0.01) {
        discrepancies.push(
          mkDiscrepancy(
            5,
            'warning',
            'L5-SETTLEMENT-AMOUNT-MISMATCH',
            `Expense ${exp.id}: validated_amount (${exp.validated_amount}) != amount (${exp.amount})`,
            'expense',
            exp.id,
            { validated_amount: exp.validated_amount, amount: exp.amount }
          )
        );
      }

      if (exp.bank_account && exp.bank_account.includes('50200088921')) {
        discrepancies.push(
          mkDiscrepancy(
            5,
            'warning',
            'L5-HARDCODED-BANK-ACCOUNT',
            `Expense ${exp.id} uses a hardcoded legacy bank account reference.`,
            'expense',
            exp.id,
            { bank_account: exp.bank_account }
          )
        );
      }
    }

    if (exp.status === 'Rejected' && exp.settled_at) {
      discrepancies.push(
        mkDiscrepancy(
          5,
          'critical',
          'L5-REJECTED-BUT-SETTLED',
          `Expense ${exp.id} is Rejected but has settled_at timestamp`,
          'expense',
          exp.id
        )
      );
    }

    if (exp.amount <= 0 || !Number.isFinite(exp.amount)) {
      discrepancies.push(
        mkDiscrepancy(
          5,
          'critical',
          'L5-NON-POSITIVE-AMOUNT',
          `Expense ${exp.id}: amount (${exp.amount}) must be positive`,
          'expense',
          exp.id
        )
      );
    }
  }

  return {
    level: 5,
    label: 'Expenses & Settlements Integrity',
    checks_executed: expenses.length * 4,
    discrepancies,
    passed: discrepancies.filter((d) => d.severity === 'critical').length === 0,
    checked_at: now,
  };
}

// ---------------------------------------------------------------------------
// Level 6 — Dashboard and Reports Agreement
// ---------------------------------------------------------------------------

export function reconcileLevel6(tenantId: string): ReconciliationLevelResult {
  const discrepancies: ReconciliationDiscrepancy[] = [];
  const now = new Date().toISOString();

  const payments = (store.studentPayments || []).filter(
    (p) => !tenantId || !p.tenant_id || p.tenant_id === tenantId
  );
  const fees = (store.studentFees || []).filter(
    (f) => !tenantId || !f.tenant_id || f.tenant_id === tenantId
  );

  const verifiedCollections = twoDP(
    payments.filter((p) => isPaymentApproved(p)).reduce((s, p) => s + p.amount_paid, 0)
  );
  const pendingCollections = twoDP(
    payments.filter((p) => isPaymentPending(p)).reduce((s, p) => s + p.amount_paid, 0)
  );
  const totalOutstanding = twoDP(fees.reduce((s, f) => s + (f.outstanding_amount || 0), 0));
  const totalNetPayable = twoDP(fees.reduce((s, f) => s + (f.final_payable || 0), 0));

  if (verifiedCollections > totalNetPayable + 0.01 && totalNetPayable > 0) {
    discrepancies.push(
      mkDiscrepancy(
        6,
        'critical',
        'L6-VERIFIED-EXCEEDS-NET-PAYABLE',
        `Verified collections (${verifiedCollections}) exceed total net payable (${totalNetPayable})`,
        'dashboard',
        undefined,
        { verifiedCollections, totalNetPayable }
      )
    );
  }

  discrepancies.push(
    mkDiscrepancy(
      6,
      'info',
      'L6-COLLECTION-SUMMARY',
      `Verified: ₹${verifiedCollections.toLocaleString('en-IN')} | Pending: ₹${pendingCollections.toLocaleString('en-IN')} | Outstanding: ₹${totalOutstanding.toLocaleString('en-IN')} | Net Payable: ₹${totalNetPayable.toLocaleString('en-IN')}`,
      'summary',
      undefined,
      { verifiedCollections, pendingCollections, totalOutstanding, totalNetPayable }
    )
  );

  return {
    level: 6,
    label: 'Dashboard & Reports Consistency',
    checks_executed: 3,
    discrepancies,
    passed: discrepancies.filter((d) => d.severity === 'critical').length === 0,
    checked_at: now,
  };
}

// ---------------------------------------------------------------------------
// Level 7 — Snapshot and Operation Integrity
// ---------------------------------------------------------------------------

export function reconcileLevel7(tenantId: string): ReconciliationLevelResult {
  const discrepancies: ReconciliationDiscrepancy[] = [];
  const now = new Date().toISOString();

  const payments = (store.studentPayments || []).filter(
    (p) => !tenantId || !p.tenant_id || p.tenant_id === tenantId
  );
  const fees = (store.studentFees || []).filter(
    (f) => !tenantId || !f.tenant_id || f.tenant_id === tenantId
  );

  const normalizedVerified = twoDP(
    payments.filter((p) => isPaymentApproved(p)).reduce((s, p) => s + p.amount_paid, 0)
  );
  const normalizedOutstanding = twoDP(fees.reduce((s, f) => s + (f.outstanding_amount || 0), 0));

  const idemKeyMap = new Map<string, string[]>();
  for (const p of payments) {
    if (!p.idempotency_key) continue;
    const existing = idemKeyMap.get(p.idempotency_key) || [];
    existing.push(p.id);
    idemKeyMap.set(p.idempotency_key, existing);
  }
  for (const [key, ids] of idemKeyMap.entries()) {
    if (ids.length > 1) {
      discrepancies.push(
        mkDiscrepancy(
          7,
          'critical',
          'L7-DUPLICATE-IDEMPOTENCY-KEY',
          `Idempotency key "${key}" is used by multiple payment records: ${ids.join(', ')}`,
          'payment',
          ids[0],
          { key, ids }
        )
      );
    }
  }

  for (const p of payments) {
    if (p.verification_status === 'Verified' && p.status === 'Rejected') {
      discrepancies.push(
        mkDiscrepancy(
          7,
          'critical',
          'L7-CONTRADICTORY-STATUS',
          `Payment ${p.id}: verification_status=Verified but status=Rejected`,
          'payment',
          p.id
        )
      );
    }
    if (p.verification_status === 'Rejected' && p.status === 'Approved') {
      discrepancies.push(
        mkDiscrepancy(
          7,
          'critical',
          'L7-CONTRADICTORY-STATUS',
          `Payment ${p.id}: verification_status=Rejected but status=Approved`,
          'payment',
          p.id
        )
      );
    }
  }

  discrepancies.push(
    mkDiscrepancy(
      7,
      'info',
      'L7-NORMALIZED-TOTALS',
      `Normalized verified total: ₹${normalizedVerified.toLocaleString('en-IN')} | Normalized outstanding: ₹${normalizedOutstanding.toLocaleString('en-IN')}`,
      'summary',
      undefined,
      { normalizedVerified, normalizedOutstanding }
    )
  );

  return {
    level: 7,
    label: 'Snapshot & Operation Integrity',
    checks_executed: payments.length * 2 + 1,
    discrepancies,
    passed: discrepancies.filter((d) => d.severity === 'critical').length === 0,
    checked_at: now,
  };
}

// ---------------------------------------------------------------------------
// Master reconciliation runner
// ---------------------------------------------------------------------------

export function runFinancialReconciliation(tenantId = 'default'): FinancialReconciliationReport {
  const levels = [
    reconcileLevel1(tenantId),
    reconcileLevel2(tenantId),
    reconcileLevel3(tenantId),
    reconcileLevel4(tenantId),
    reconcileLevel5(tenantId),
    reconcileLevel6(tenantId),
    reconcileLevel7(tenantId),
  ];

  const allDiscrepancies = levels.flatMap((l) => l.discrepancies);
  const critical = allDiscrepancies.filter((d) => d.severity === 'critical').length;
  const warnings = allDiscrepancies.filter((d) => d.severity === 'warning').length;
  const info = allDiscrepancies.filter((d) => d.severity === 'info').length;
  const passed = levels.every((l) => l.passed);

  return {
    tenant_id: tenantId,
    generated_at: new Date().toISOString(),
    levels,
    total_discrepancies: allDiscrepancies.length,
    critical_count: critical,
    warning_count: warnings,
    info_count: info,
    external_bank_reconciliation: 'Not Performed',
    passed,
    summary: passed
      ? `All 7 reconciliation levels passed. ${warnings} warning(s), ${info} informational note(s).`
      : `Reconciliation found ${critical} critical discrepancy(ies) across 7 levels. Immediate review required.`,
  };
}
