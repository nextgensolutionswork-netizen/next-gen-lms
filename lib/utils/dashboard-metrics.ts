import { Payment } from '@/types';

export const UNASSIGNED_COURSE = '__unassigned__';

const missingKeyMap = new WeakMap<object, string>();
let missingKeyCounter = 0;

/**
 * Returns a canonical deduplication key for a payment record across legacy
 * (`store.payments`) and dual-ledger (`store.studentPayments`) models.
 *
 * Rules:
 * 1. For verified payments with an official receipt number, the receipt number is canonical.
 * 2. For unverified/pending records without a final receipt (which may have synthetic
 *    receipt_number like 'PENDING-spr-...'), strips known prefixes ('pay-spr-', 'spr-pay-',
 *    'pay-', 'spr-') so that both sides of the dual ledger map to the exact same canonical identifier.
 * 3. Separate legitimate installments (with distinct IDs or receipts) remain distinct.
 * 4. Missing identifiers do not collapse unrelated payments together: distinct unidentifiable
 *    payment objects receive distinct unique keys.
 */
export function getCanonicalPaymentKey(record: { id?: string; receipt_number?: string; [key: string]: any }): string {
  if (record.receipt_number && !record.receipt_number.startsWith('PENDING-')) {
    return `receipt:${record.receipt_number.trim()}`;
  }
  let id = record.id ? record.id.trim() : '';
  if (record.receipt_number && record.receipt_number.startsWith('PENDING-')) {
    id = record.receipt_number.replace('PENDING-', '').trim();
  }
  id = id.replace(/^(pay-spr-|spr-pay-|pay-|spr-)/, '');
  if (id) {
    return `id:${id}`;
  }

  // Fallback for records with missing id and receipt: ensure unrelated payments never collapse
  if (typeof record === 'object' && record !== null) {
    let fallback = missingKeyMap.get(record);
    if (!fallback) {
      fallback = `unidentified:${++missingKeyCounter}`;
      missingKeyMap.set(record, fallback);
    }
    return fallback;
  }
  return `unidentified:${++missingKeyCounter}`;
}

export interface UnifiedPaymentRecord extends Omit<Payment, 'status'> {
  status?: string;
  verification_status?: string;
  receipt_status?: string;
  amount_paid?: number;
  fee_id?: string;
  fee_category?: string;
  enrollment_id?: string;
  raw_id?: string;
  student_payment_id?: string;
  bank_upi_reference?: string;
  payment_proof_url?: string;
  recorded_by?: string;
  recorded_by_name?: string;
  recorded_by_role?: string;
  verified_by?: string;
  verified_by_name?: string;
  verified_at?: string;
  updated_at?: string;
  updated_by?: string;
  updated_by_name?: string;
}

/**
 * Unifies and reconciles dual-ledger payments (`store.payments` and `store.studentPayments`).
 * Conflicting mirrored records resolve deterministically using `store.studentPayments`
 * (StudentPaymentRecord) as the authoritative source of truth.
 *
 * Explicit Identity Linkage:
 * - A stale pending legacy mirror (e.g. id 'pay-spr-404', receipt 'PENDING-spr-404')
 *   pairs and unifies with its verified modern record ('spr-404', 'REC-2026-0042')
 *   into a single authoritative entry.
 * - Unrelated installments (distinct installment_id or payment IDs) remain separate.
 * - Voided receipts (status 'Void') deterministically mark associated payments as Voided/Rejected.
 */
export function unifyDualLedgerPayments(
  legacyPayments: readonly any[] = [],
  studentPayments: readonly any[] = [],
  context: {
    students?: readonly any[];
    courses?: readonly any[];
    studentFees?: readonly any[];
    feeAccounts?: readonly any[];
    receipts?: readonly any[];
  } = {}
): UnifiedPaymentRecord[] {
  const map = new Map<string, UnifiedPaymentRecord>();

  // Helper to detect if a receipt associated with an identifier is Voided (exact stored status 'Void')
  const isReceiptVoid = (id?: string, receiptNumber?: string): boolean => {
    if (!context.receipts || context.receipts.length === 0) return false;
    return context.receipts.some((r) => {
      const numberMatches = receiptNumber && r.receipt_number && r.receipt_number === receiptNumber;
      const idMatches = id && r.payment_id && (r.payment_id === id || `pay-${r.payment_id}` === id || r.payment_id === `pay-${id}`);
      return (numberMatches || idMatches) && r.status === 'Void';
    });
  };

  // 1. Process legacy payments
  for (const p of legacyPayments) {
    const key = getCanonicalPaymentKey(p);
    const receiptVoided = isReceiptVoid(p.id, p.receipt_number) || p.status === 'Voided' || p.status === 'Void' || p.status === 'Refunded';

    map.set(key, {
      ...p,
      amount: typeof p.amount === 'number' && Number.isFinite(p.amount) ? p.amount : 0,
      amount_paid: typeof p.amount === 'number' && Number.isFinite(p.amount) ? p.amount : 0,
      receipt_number: p.receipt_number || `REC-${(p.id || '').slice(-6)}`,
      status: receiptVoided ? (p.status === 'Refunded' ? 'Refunded' : 'Voided') : p.status,
      receipt_status: receiptVoided ? 'Void' : p.receipt_status,
      verification_status: receiptVoided
        ? 'Rejected'
        : p.verification_status ||
          (p.status === 'Success'
            ? 'Verified'
            : p.status === 'Failed'
            ? 'Rejected'
            : 'Pending Verification'),
      recorded_by: p.collected_by,
      recorded_by_name: p.collected_by_name,
      recorded_by_role: 'accountant',
      fee_category: p.course_name || 'Course Fee',
      fee_id: p.fee_account_id,
      raw_id: p.id,
    });
  }

  // 2. Authoritative overlay from studentPayments (StudentPaymentRecord)
  for (const sp of studentPayments) {
    const key = getCanonicalPaymentKey(sp);
    const unPrefixedId = (sp.id || '').replace(/^(pay-spr-|spr-pay-|pay-|spr-)/, '').trim();
    const idKey = unPrefixedId ? `id:${unPrefixedId}` : '';
    const receiptKey = sp.receipt_number && !sp.receipt_number.startsWith('PENDING-')
      ? `receipt:${sp.receipt_number.trim()}`
      : '';

    let existing: UnifiedPaymentRecord | undefined = undefined;
    let matchedKey: string | undefined = undefined;

    // Direct key match
    if (map.has(key)) {
      existing = map.get(key);
      matchedKey = key;
    }

    // Secondary canonical key match (idKey or receiptKey)
    if (!existing && idKey && map.has(idKey)) {
      existing = map.get(idKey);
      matchedKey = idKey;
    } else if (!existing && receiptKey && map.has(receiptKey)) {
      existing = map.get(receiptKey);
      matchedKey = receiptKey;
    }

    // Explicit identity linkage across the map if still not matched
    if (!existing) {
      for (const [mapKey, entry] of map.entries()) {
        const idMatches =
          entry.id === sp.id ||
          entry.id === `pay-${sp.id}` ||
          `spr-${entry.id}` === sp.id ||
          (unPrefixedId && (entry.id || '').replace(/^(pay-spr-|spr-pay-|pay-|spr-)/, '') === unPrefixedId);

        const receiptMatches =
          (sp.receipt_number && entry.receipt_number === sp.receipt_number) ||
          entry.receipt_number === `PENDING-${sp.id}` ||
          (unPrefixedId && entry.receipt_number === `PENDING-spr-${unPrefixedId}`);

        if (idMatches || receiptMatches) {
          // If installment_id is explicitly specified on both and differs, they are separate installments: keep separate!
          if (entry.installment_id && sp.installment_id && entry.installment_id !== sp.installment_id) {
            continue;
          }
          existing = entry;
          matchedKey = mapKey;
          break;
        }
      }
    }

    if (matchedKey && matchedKey !== key) {
      map.delete(matchedKey);
    }

    const student = (context.students || []).find((s) => s.id === sp.student_id);
    const fee = (context.studentFees || []).find((f) => f.id === sp.fee_id);
    const courseId = sp.course_id || fee?.course_id || student?.course_id || existing?.course_id || 'crs-general';
    const course = (context.courses || []).find((c) => c.id === courseId);

    const receiptVoided =
      isReceiptVoid(sp.id, sp.receipt_number) ||
      isReceiptVoid(existing?.id, existing?.receipt_number) ||
      sp.status === 'Voided' ||
      sp.status === 'Void' ||
      existing?.status === 'Voided' ||
      existing?.status === 'Void';

    const finalStatus = receiptVoided
      ? 'Voided'
      : sp.status || (sp.verification_status === 'Verified' ? 'Success' : sp.verification_status === 'Rejected' ? 'Failed' : 'Pending');

    const finalVerificationStatus = receiptVoided
      ? 'Rejected'
      : sp.verification_status || existing?.verification_status;

    const unifiedRecord: UnifiedPaymentRecord = {
      tenant_id: sp.tenant_id || existing?.tenant_id,
      id: sp.id ? (sp.id.startsWith('pay-') ? sp.id : `pay-${sp.id}`) : existing?.id || `pay-${Math.random()}`,
      receipt_number: sp.receipt_number || existing?.receipt_number || (sp.verification_status === 'Verified' ? `REC-${sp.id.slice(-6)}` : `PENDING-${sp.id.slice(-6)}`),
      student_id: sp.student_id || existing?.student_id || '',
      student_name: sp.student_name || existing?.student_name || student?.full_name || '',
      admission_number: sp.admission_number || existing?.admission_number || student?.admission_number || '',
      fee_id: sp.fee_id || existing?.fee_account_id || `fa-${sp.fee_id}`,
      fee_account_id: fee?.fee_account_id || existing?.fee_account_id || `fa-${sp.fee_id}`,
      fee_category: sp.fee_category || course?.course_name || existing?.fee_category || 'Course Fee',
      installment_id: sp.installment_id || existing?.installment_id,
      enrollment_id: sp.enrollment_id || existing?.enrollment_id,
      course_id: courseId,
      course_name: course?.course_name || student?.course_name || existing?.course_name || sp.fee_category || 'General Tuition',
      student_payment_id: sp.id,
      raw_id: sp.id || existing?.id,
      amount:
        typeof sp.amount_paid === 'number' && Number.isFinite(sp.amount_paid)
          ? sp.amount_paid
          : typeof sp.amount === 'number' && Number.isFinite(sp.amount)
          ? sp.amount
          : existing?.amount ?? 0,
      amount_paid:
        typeof sp.amount_paid === 'number' && Number.isFinite(sp.amount_paid)
          ? sp.amount_paid
          : typeof sp.amount === 'number' && Number.isFinite(sp.amount)
          ? sp.amount
          : existing?.amount ?? 0,
      payment_date: sp.payment_date || existing?.payment_date || new Date().toISOString(),
      payment_mode: sp.payment_mode || existing?.payment_mode || 'Cash',
      transaction_reference: sp.transaction_reference || sp.bank_upi_reference || existing?.transaction_reference,
      bank_upi_reference: sp.bank_upi_reference || existing?.bank_upi_reference,
      payment_proof_url: sp.payment_proof_url || existing?.payment_proof_url,
      status: finalStatus,
      receipt_status: receiptVoided ? 'Void' : existing?.receipt_status,
      verification_status: finalVerificationStatus,
      collected_by: sp.recorded_by || existing?.collected_by || 'system',
      collected_by_name: sp.recorded_by_name || existing?.collected_by_name,
      recorded_by: sp.recorded_by || existing?.collected_by || 'system',
      recorded_by_name: sp.recorded_by_name || existing?.collected_by_name,
      recorded_by_role: sp.recorded_by_role || existing?.recorded_by_role || 'counsellor',
      verified_by: sp.verified_by || existing?.verified_by,
      verified_by_name: sp.verified_by_name || existing?.verified_by_name,
      verified_at: sp.verified_at || existing?.verified_at,
      updated_at: sp.updated_at || existing?.updated_at,
      updated_by: sp.updated_by || existing?.updated_by,
      updated_by_name: sp.updated_by_name || existing?.updated_by_name,
      notes: sp.notes || existing?.notes,
      created_at: sp.created_at || existing?.created_at,
    };

    map.set(key, unifiedRecord);
  }

  return Array.from(map.values());
}

export function courseBucket(courseId: string | undefined, courseIds: ReadonlySet<string>): string {
  return courseId && courseIds.has(courseId) ? courseId : UNASSIGNED_COURSE;
}

// Preserve historical course attribution. Only missing/general attribution may
// fall back to the linked fee account, then the student's current course.
export function paymentCourseBucket(
  payment: { course_id?: string; fee_account_id?: string; student_id: string },
  courseIds: ReadonlySet<string>,
  feeAccounts: readonly { id: string; course_id?: string }[],
  students: readonly { id: string; course_id?: string }[],
): string {
  const courseId = payment.course_id && payment.course_id !== 'crs-general'
    ? payment.course_id
    : feeAccounts.find((f) => f.id === payment.fee_account_id)?.course_id;
  return courseBucket(
    courseId && courseId !== 'crs-general'
      ? courseId
      : students.find((s) => s.id === payment.student_id)?.course_id,
    courseIds,
  );
}

export function formatDashboardPercentage(numerator: number, denominator: number): string {
  return denominator > 0 ? `${((numerator / denominator) * 100).toFixed(1)}%` : 'N/A';
}

export interface PaymentApprovalMetrics {
  approvedAmount: number;
  approvedCount: number;
  pendingAmount: number;
  pendingCount: number;
}

/**
 * Evaluates whether a payment qualifies as verified, collected revenue.
 *
 * Enforces strict workflow precedence:
 * 1. Terminal negative / uncollected statuses take absolute precedence:
 *    Any record marked 'Failed', 'Refunded', 'Voided', or 'Rejected' (in either
 *    status or verification_status) is NOT approved, even if previously verified.
 * 2. Incomplete / pending settlement takes precedence over verification flags:
 *    If status is 'Pending'/'Pending Approval' or verification_status is
 *    'Pending Verification'/'Pending', the payment is pending and NOT approved.
 * 3. Verified collections:
 *    Only records with verification_status === 'Verified' (or in legacy models without
 *    verification_status, status === 'Success'|'Approved') qualify as approved collections.
 */
export function isPaymentApproved(payment: { status?: string; verification_status?: string; receipt_status?: string }): boolean {
  if (
    payment.status === 'Failed' ||
    payment.status === 'Refunded' ||
    payment.status === 'Voided' ||
    payment.status === 'Void' ||
    payment.status === 'Rejected' ||
    payment.verification_status === 'Rejected' ||
    payment.verification_status === 'Failed' ||
    payment.verification_status === 'Refunded' ||
    payment.verification_status === 'Void' ||
    payment.verification_status === 'Voided' ||
    payment.receipt_status === 'Void' ||
    payment.receipt_status === 'Voided'
  ) {
    return false;
  }

  if (
    payment.status === 'Pending' ||
    payment.status === 'Pending Approval' ||
    payment.verification_status === 'Pending Verification' ||
    payment.verification_status === 'Pending'
  ) {
    return false;
  }

  if (payment.verification_status) {
    return payment.verification_status === 'Verified';
  }
  return payment.status === 'Success' || payment.status === 'Approved';
}

/**
 * Evaluates whether a payment is currently pending accountant verification or clearance.
 *
 * Enforces strict workflow precedence:
 * 1. Terminal negative statuses are never pending.
 * 2. Approved collections are never pending.
 * 3. Records with 'Pending Verification' / 'Pending' or status 'Pending' / 'Pending Approval'
 *    are classified as pending.
 */
export function isPaymentPending(payment: { status?: string; verification_status?: string; receipt_status?: string }): boolean {
  if (
    payment.status === 'Failed' ||
    payment.status === 'Refunded' ||
    payment.status === 'Voided' ||
    payment.status === 'Void' ||
    payment.status === 'Rejected' ||
    payment.verification_status === 'Rejected' ||
    payment.verification_status === 'Failed' ||
    payment.verification_status === 'Refunded' ||
    payment.verification_status === 'Void' ||
    payment.verification_status === 'Voided' ||
    payment.receipt_status === 'Void' ||
    payment.receipt_status === 'Voided'
  ) {
    return false;
  }

  if (isPaymentApproved(payment)) {
    return false;
  }

  return (
    payment.verification_status === 'Pending Verification' ||
    payment.verification_status === 'Pending' ||
    payment.status === 'Pending' ||
    payment.status === 'Pending Approval'
  );
}

export function calculatePaymentApprovalMetrics(
  payments: readonly {
    amount: number;
    status?: string;
    verification_status?: string;
    receipt_status?: string;
  }[]
): PaymentApprovalMetrics {
  let approvedAmount = 0;
  let approvedCount = 0;
  let pendingAmount = 0;
  let pendingCount = 0;

  for (const p of payments) {
    const amt = typeof p.amount === 'number' && Number.isFinite(p.amount) ? Math.max(0, p.amount) : 0;

    if (isPaymentApproved(p)) {
      approvedAmount += amt;
      approvedCount += 1;
    } else if (isPaymentPending(p)) {
      pendingAmount += amt;
      pendingCount += 1;
    }
  }

  return {
    approvedAmount,
    approvedCount,
    pendingAmount,
    pendingCount,
  };
}

export interface EnrollmentMetrics {
  newEnrollmentsCount: number;
  activeStudentsCount: number;
}

export function calculateEnrollmentMetrics<
  A extends {
    id?: string;
    student_id?: string;
    admission_number?: string;
    status?: string;
    course_id?: string;
  },
  S extends {
    id?: string;
    status?: string;
    course_id?: string;
  }
>(
  admissionsInPeriod: readonly A[],
  allStudents: readonly S[],
  matchesCourseFn?: (courseId?: string) => boolean
): EnrollmentMetrics {
  const seenStudentIds = new Set<string>();
  let newEnrollmentsCount = 0;

  for (const a of admissionsInPeriod) {
    // Exclude cancelled, withdrawn, or draft admissions
    if (a.status === 'Cancelled' || a.status === 'Draft' || a.status === 'On Hold') {
      continue;
    }

    if (matchesCourseFn && !matchesCourseFn(a.course_id)) {
      continue;
    }

    const identifier = a.student_id || a.admission_number || a.id;
    if (identifier) {
      if (seenStudentIds.has(identifier)) continue;
      seenStudentIds.add(identifier);
    }
    newEnrollmentsCount += 1;
  }

  const activeStudentsCount = allStudents.filter((s) => {
    if (s.status !== 'Active') return false;
    if (matchesCourseFn && !matchesCourseFn(s.course_id)) return false;
    return true;
  }).length;

  return {
    newEnrollmentsCount,
    activeStudentsCount,
  };
}

/**
 * Selects, sorts, and limits recent verified fee collections for dashboard display.
 *
 * Selection order:
 * 1. Filter eligible verified collections using isPaymentApproved
 *    (strictly excluding pending, rejected, failed, refunded, and void records).
 * 2. Sort by collection/verification timestamp in descending order (most recent first),
 *    with a deterministic fallback on payment ID.
 * 3. Apply the recent-list limit last.
 */
export function getRecentVerifiedCollections<T extends {
  id?: string;
  amount?: number;
  status?: string;
  verification_status?: string;
  receipt_status?: string;
  verified_at?: string;
  payment_date?: string;
  created_at?: string;
}>(
  payments: readonly T[],
  limit: number = 5
): T[] {
  return payments
    .filter((p) => isPaymentApproved(p))
    .sort((a, b) => {
      const timeB = new Date(b.verified_at || b.payment_date || b.created_at || '').getTime() || 0;
      const timeA = new Date(a.verified_at || a.payment_date || a.created_at || '').getTime() || 0;
      if (timeB !== timeA) return timeB - timeA;
      return (b.id || '').localeCompare(a.id || '');
    })
    .slice(0, limit);
}
