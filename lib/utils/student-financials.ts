import { isPaymentApproved, unifyDualLedgerPayments } from './dashboard-metrics';

export interface AuthoritativeStudentFinancials {
  totalPayable: number;
  paidAmount: number;
  outstandingDue: number;
  isFinanciallyCleared: boolean;
  feePlansCount: number;
}

/**
 * Calculates a single, authoritative source of truth for a student's
 * fee obligations, verified payments, and outstanding dues.
 * Used identically across Header, Overview, Finance & Ledger, and Certificates.
 */
export function calculateAuthoritativeStudentFinancials(data: {
  student?: any;
  admission?: any;
  feeAccount?: any;
  studentFees?: any[];
  payments?: any[];
  studentPayments?: any[];
  receipts?: any[];
  studentLedger?: any[];
}): AuthoritativeStudentFinancials {
  const {
    student,
    admission,
    feeAccount,
    studentFees = [],
    payments = [],
    studentPayments = [],
  } = data;

  const approvedFees = (studentFees || []).filter(
    (f: any) => f && f.approval_status === 'Approved'
  );

  // 1. Authoritative Total Payable Obligations
  // Deduplicate multiple revisions/benchmark proposals for the same course + category
  let totalPayable = 0;
  if (approvedFees.length > 0) {
    const activeFeeMap = new Map<string, any>();
    const boundFeeId = feeAccount?.student_fee_id || (feeAccount ? `fee-${feeAccount.id}` : null);

    for (const f of approvedFees) {
      const key = `${f.course_id || 'general'}-${f.fee_category || 'tuition'}`;
      if (boundFeeId && f.id === boundFeeId) {
        activeFeeMap.set(key, f);
      } else if (!activeFeeMap.has(key)) {
        activeFeeMap.set(key, f);
      } else {
        const existing = activeFeeMap.get(key);
        if (boundFeeId && existing.id === boundFeeId) {
          // Keep bound fee
        } else if (new Date(f.updated_at || f.created_at || 0) > new Date(existing.updated_at || existing.created_at || 0)) {
          activeFeeMap.set(key, f);
        }
      }
    }
    totalPayable = Array.from(activeFeeMap.values()).reduce(
      (sum: number, f: any) => sum + (Number(f.final_payable) || 0),
      0
    );
  } else if (feeAccount && Number(feeAccount.net_payable) > 0) {
    totalPayable = Number(feeAccount.net_payable);
  } else if (admission && Number(admission.net_payable) > 0) {
    totalPayable = Number(admission.net_payable);
  } else if (student && Number(student.total_fee) > 0) {
    totalPayable = Number(student.total_fee);
  }

  // Standalone posted adjustments do not rewrite the original approved fee.
  const standaloneAdjustments = (data.studentLedger || []).filter(e =>
    ['Fee Adjustment', 'Fee Waiver', 'Discount Approved', 'Debit Note'].includes(e.entry_type)
    && !studentFees.some(f => f.id === e.reference_id));
  totalPayable += [...new Map(standaloneAdjustments.map(e => [e.id, e])).values()]
    .reduce((sum, e) => sum + (Number(e.debit) || 0) - (Number(e.credit) || 0), 0);

  // Explicit empty/pending/reversed payment lists override cached paid totals.
  const hasPaymentRecords = data.payments !== undefined || data.studentPayments !== undefined;
  const canonical = unifyDualLedgerPayments(payments, studentPayments, { receipts: data.receipts });
  const refunds = [...new Map((data.studentLedger || []).filter(e => e.entry_type === 'Refund Processed').map(e => [e.reference_id, e])).values()]
    .reduce((sum, e) => sum + Number(e.debit || 0) - Number(e.credit || 0), 0);
  const verifiedPaidTotal = Math.max(0, canonical.filter(isPaymentApproved).reduce((sum, p) => sum + p.amount, 0) - refunds);
  const paidAmount = hasPaymentRecords ? Number(verifiedPaidTotal.toFixed(2))
    : approvedFees.length > 0 ? approvedFees.reduce((sum, f) => sum + (Number(f.paid_amount) || 0), 0)
    : Number(feeAccount?.paid_amount ?? student?.paid_amount ?? 0);

  // 3. Authoritative Outstanding Due
  const outstandingDue = Math.max(0, totalPayable - paidAmount);

  return {
    totalPayable,
    paidAmount,
    outstandingDue,
    isFinanciallyCleared: outstandingDue <= 0 && totalPayable > 0,
    feePlansCount: approvedFees.length > 0 ? approvedFees.length : 1,
  };
}
