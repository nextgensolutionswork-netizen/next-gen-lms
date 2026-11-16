import { isPaymentApproved } from './dashboard-metrics';

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

  // 2. Authoritative Verified Payments (Deduplicated by receipt_number / transaction reference / id)
  const processedKeys = new Set<string>();
  let verifiedPaidTotal = 0;

  const allPayments = [
    ...(payments || []).map((p: any) => ({
      ...p,
      amount: Number(p.amount ?? p.amount_paid ?? 0),
    })),
    ...(studentPayments || []).map((sp: any) => ({
      ...sp,
      amount: Number(sp.amount_paid ?? sp.amount ?? 0),
    })),
  ];

  for (const p of allPayments) {
    if (!p || !isPaymentApproved(p)) continue;
    const key =
      p.receipt_number ||
      p.transaction_reference ||
      p.bank_upi_reference ||
      p.id?.replace(/^pay-|^spr-/, '');
    if (key && processedKeys.has(key)) continue;
    if (key) processedKeys.add(key);

    verifiedPaidTotal += Number(p.amount) || 0;
  }

  // Fallback to approved fee paid_amount if no raw payment list was provided
  let paidAmount = 0;
  if (processedKeys.size > 0) {
    paidAmount = verifiedPaidTotal;
  } else if (approvedFees.length > 0) {
    paidAmount = approvedFees.reduce(
      (sum: number, f: any) => sum + (Number(f.paid_amount) || 0),
      0
    );
  } else if (feeAccount && Number(feeAccount.paid_amount) > 0) {
    paidAmount = Number(feeAccount.paid_amount);
  } else if (student && Number(student.paid_amount) > 0) {
    paidAmount = Number(student.paid_amount);
  }

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
