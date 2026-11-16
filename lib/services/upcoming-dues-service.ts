import { store } from '@/lib/services/data-store';
import { tenantId } from '@/lib/auth/tenant';
import { getInstituteTimezone, getTodayInInstituteTimezone, stepDate } from '@/lib/utils/schedule-date';
import type {
  UserProfile,
  PaymentDueStatus,
  UpcomingPaymentDueItem,
  UpcomingPaymentDuesResponse,
  AllPaymentDuesSummary,
  AllPaymentDuesPagination,
  AllPaymentDuesResponse,
  Student,
  Admission,
  StudentFee,
  Lead,
} from '@/types';

/**
 * Validates whether an authenticated Counsellor has permission to access a student's record.
 * Respects:
 * 1. Tenant boundary
 * 2. Branch boundary (if configured on user and student/admission)
 * 3. Assigned-student relationship (admission counsellor, student fee counsellor, or lead counsellor)
 */
export function isCounsellorAuthorizedForStudent(
  counsellor: UserProfile,
  studentId: string,
  snapshot?: {
    students?: Student[];
    admissions?: Admission[];
    studentFees?: StudentFee[];
    leads?: Lead[];
  }
): boolean {
  if (counsellor.role !== 'counsellor') {
    return true; // Super admins, admins, accountants handled separately
  }

  const students = snapshot?.students || store.students || [];
  const admissions = snapshot?.admissions || store.admissions || [];
  const studentFees = snapshot?.studentFees || store.studentFees || [];
  const leads = snapshot?.leads || store.leads || [];

  const student = students.find((s) => s.id === studentId);
  if (!student) return false;

  // 1. Tenant isolation check
  if (tenantId(counsellor) !== tenantId(student)) {
    return false;
  }

  // 2. Branch isolation check
  if (counsellor.branch_id && (student as any).branch_id && counsellor.branch_id !== (student as any).branch_id) {
    return false;
  }

  // 3. Admission link check
  const admission = admissions.find(
    (a) => a.id === student.admission_id || a.admission_number === student.admission_number
  );
  if (admission) {
    const admissionBranch = (admission as any).branch_id;
    if (counsellor.branch_id && admissionBranch && counsellor.branch_id !== admissionBranch) {
      return false;
    }
    if (
      admission.counsellor_id === counsellor.id ||
      (admission.counsellor_name && counsellor.full_name && admission.counsellor_name.trim().toLowerCase() === counsellor.full_name.trim().toLowerCase())
    ) {
      return true;
    }
  }

  // 4. Student Fee link check
  const fee = studentFees.find((f) => f.student_id === student.id);
  if (fee && fee.counsellor_id === counsellor.id) {
    return true;
  }

  // 5. Lead link check
  if (admission?.lead_id) {
    const lead = leads.find((l) => l.id === admission.lead_id);
    if (lead && lead.counsellor_id === counsellor.id) {
      return true;
    }
  }

  // 6. Direct student counsellor attribution
  if ((student as any).counsellor_id === counsellor.id) {
    return true;
  }

  return false;
}

/**
 * Calculates the 3 consecutive calendar dates (today, tomorrow, in 2 days)
 * in the configured institute timezone (Asia/Kolkata).
 */
export function getUpcoming3DaysDates(
  baseDate: Date = new Date(),
  timeZone: string = getInstituteTimezone()
) {
  const dateToday = getTodayInInstituteTimezone(baseDate, timeZone);
  const dateTomorrow = stepDate(dateToday, 'day', 1);
  const dateIn2Days = stepDate(dateToday, 'day', 2);
  const targetDates = new Set([dateToday, dateTomorrow, dateIn2Days]);
  return { dateToday, dateTomorrow, dateIn2Days, targetDates };
}

let defaultReferenceDate: Date | null = null;

/**
 * Sets an optional global default reference date for upcoming dues calculation.
 * Useful for deterministic testing, time-travel audits, or report generation.
 */
export function setDefaultUpcomingDuesReferenceDate(date: Date | null): void {
  defaultReferenceDate = date;
}

export function getDefaultUpcomingDuesReferenceDate(): Date | null {
  return defaultReferenceDate;
}

/**
 * Classifies an obligation's payment status based on its due date relative to today.
 */
export function classifyPaymentDueStatus(
  dueDate: string,
  dateToday: string,
  dateTomorrow: string,
  dateIn2Days: string
): PaymentDueStatus {
  const cleanDueDate = dueDate.trim();
  if (cleanDueDate < dateToday) return 'Overdue';
  if (cleanDueDate === dateToday) return 'Due Today';
  if (cleanDueDate === dateTomorrow) return 'Due Tomorrow';
  if (cleanDueDate === dateIn2Days) return 'Due in 2 Days';
  return 'Upcoming';
}

export interface PaymentDuesQueryOptions {
  scope?: 'next3days' | 'all';
  search?: string;
  statusFilter?: 'all' | 'overdue' | 'today' | 'next3days' | 'upcoming';
  courseId?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  pageSize?: number;
  baseDate?: Date;
  timeZone?: string;
}

/**
 * Core retrieval engine for Student Payment Due Dates.
 *
 * Supports both:
 * - scope: 'next3days' (for Dashboard card: Today, Tomorrow, In 2 Days)
 * - scope: 'all' (for dedicated Due Dates view: Overdue, Today, In 3 Days, and Upcoming)
 *
 * Enforces role permissions, deduplication, balance integrity, and exclusions.
 */
export function getAllPaymentDues(
  actor: UserProfile,
  options?: PaymentDuesQueryOptions
): AllPaymentDuesResponse {
  // Authorization check: Only authorized administrative/financial roles and counsellors
  const allowedRoles = ['super_admin', 'admin', 'accountant', 'counsellor'];
  if (!actor || !allowedRoles.includes(actor.role) || actor.is_active === false) {
    throw new Error('Unauthorized: Access to payment dues is restricted.');
  }

  store.reconcileDualLedgers();

  const timeZone = options?.timeZone || getInstituteTimezone();
  const baseDate = options?.baseDate || defaultReferenceDate || new Date();
  const scope = options?.scope || 'all';

  // Compute reference calendar dates in configured institute timezone
  const { dateToday, dateTomorrow, dateIn2Days, targetDates } = getUpcoming3DaysDates(baseDate, timeZone);

  const allDues: UpcomingPaymentDueItem[] = [];
  const processedKeys = new Set<string>();

  // 1. Process explicit installment records in store.installments
  const installments = store.installments || [];
  for (const inst of installments) {
    // Tenant check
    if (tenantId(inst) !== tenantId(actor)) continue;

    // Obligation must have a recorded valid due date ("Do not invent due dates where none are recorded")
    if (!inst.due_date || typeof inst.due_date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(inst.due_date.trim())) {
      continue;
    }
    const cleanDueDate = inst.due_date.trim();

    // Obligation status check: exclude cancelled, voided, waived, written off, settled, or fully paid
    const instStatus = (inst.status as unknown as string) || '';
    const instStatusNorm = instStatus.toLowerCase().replace(/[-_]/g, ' ').trim();
    if (
      instStatusNorm === 'cancelled' ||
      instStatusNorm === 'waived' ||
      instStatusNorm === 'void' ||
      instStatusNorm === 'voided' ||
      instStatusNorm === 'written off' ||
      instStatusNorm === 'settled' ||
      instStatusNorm === 'paid' ||
      instStatusNorm === 'refunded'
    ) {
      continue;
    }

    // Balance check: Remaining payable balance must be greater than zero
    const scheduledAmount = Number(inst.amount) || 0;
    const verifiedPaidAmount = Number(inst.paid_amount) || 0;
    const remainingBalance = Math.max(0, Number((scheduledAmount - verifiedPaidAmount).toFixed(2)));
    if (remainingBalance <= 0) continue;

    // Check associated fee account status: exclude discontinued, waived, or written-off fee accounts
    const feeAccount = (store.feeAccounts || []).find(
      (fa) => fa.id === inst.fee_account_id || fa.student_id === inst.student_id
    );
    const faStatus = (feeAccount?.status as unknown as string) || '';
    const faStatusNorm = faStatus.toLowerCase().replace(/[-_]/g, ' ').trim();
    if (
      faStatusNorm.includes('discontinued') ||
      faStatusNorm === 'waived' ||
      faStatusNorm === 'void' ||
      faStatusNorm === 'voided' ||
      faStatusNorm === 'paid' ||
      faStatusNorm === 'settled' ||
      faStatusNorm === 'written off' ||
      feeAccount?.discontinuation_record ||
      (feeAccount && feeAccount.outstanding_amount <= 0 && (feeAccount.paid_amount || 0) > 0)
    ) {
      continue;
    }

    // Counsellor authorization check
    if (actor.role === 'counsellor' && !isCounsellorAuthorizedForStudent(actor, inst.student_id)) {
      continue;
    }

    // Student & Course lookup
    const student = (store.students || []).find((s) => s.id === inst.student_id);
    const admission = (store.admissions || []).find(
      (a) => a.id === student?.admission_id || a.admission_number === student?.admission_number
    );
    const course = (store.courses || []).find(
      (c) => c.id === student?.course_id || c.id === feeAccount?.course_id || c.id === admission?.course_id
    );

    const dueStatus = classifyPaymentDueStatus(cleanDueDate, dateToday, dateTomorrow, dateIn2Days);

    const dedupKey = inst.id ? `inst-${inst.id}` : `inst-${inst.student_id}-${cleanDueDate}-${inst.installment_number || 1}`;
    if (processedKeys.has(dedupKey)) continue;
    processedKeys.add(dedupKey);
    processedKeys.add(`std-date-${inst.student_id}-${cleanDueDate}`);

    allDues.push({
      id: inst.id,
      student_id: inst.student_id,
      student_name: student?.full_name || admission?.student_name || 'Enrolled Student',
      admission_number: student?.admission_number || admission?.admission_number || '—',
      course_id: course?.id || student?.course_id || feeAccount?.course_id || '',
      course_name: course?.course_name || student?.course_name || feeAccount?.course_name || admission?.course_name || 'Course Program',
      installment_number: inst.installment_number,
      due_date: cleanDueDate,
      installment_amount: scheduledAmount,
      paid_amount: verifiedPaidAmount,
      outstanding_amount: remainingBalance,
      due_status: dueStatus,
      fee_account_id: feeAccount?.id,
      is_partial: verifiedPaidAmount > 0 && remainingBalance > 0,
    });
  }

  // 2. Process fee accounts that have an explicit invoice due date but no separate store.installments
  const feeAccounts = store.feeAccounts || [];
  for (const fa of feeAccounts) {
    if (tenantId(fa) !== tenantId(actor)) continue;
    const faAny = fa as any;
    const invoiceDueDate = typeof faAny.due_date === 'string' ? faAny.due_date.trim() : undefined;
    if (!invoiceDueDate || !/^\d{4}-\d{2}-\d{2}$/.test(invoiceDueDate)) continue;

    const faStatus = (fa.status as unknown as string) || '';
    const faStatusNorm = faStatus.toLowerCase().replace(/[-_]/g, ' ').trim();
    if (
      faStatusNorm.includes('discontinued') ||
      faStatusNorm === 'waived' ||
      faStatusNorm === 'void' ||
      faStatusNorm === 'voided' ||
      faStatusNorm === 'paid' ||
      faStatusNorm === 'settled' ||
      faStatusNorm === 'written off' ||
      fa.discontinuation_record
    ) {
      continue;
    }

    const remaining = Number(fa.outstanding_amount) || 0;
    if (remaining <= 0) continue;

    // Check if installments or processed keys already covered this student's due date
    if (processedKeys.has(`std-date-${fa.student_id}-${invoiceDueDate}`)) continue;
    const faDedupKey = `fa-${fa.id}-${invoiceDueDate}`;
    if (processedKeys.has(faDedupKey)) continue;
    processedKeys.add(faDedupKey);
    processedKeys.add(`std-date-${fa.student_id}-${invoiceDueDate}`);

    if (actor.role === 'counsellor' && !isCounsellorAuthorizedForStudent(actor, fa.student_id)) {
      continue;
    }

    const student = (store.students || []).find((s) => s.id === fa.student_id);
    const admission = (store.admissions || []).find(
      (a) => a.id === student?.admission_id || a.admission_number === student?.admission_number
    );
    const course = (store.courses || []).find(
      (c) => c.id === fa.course_id || c.id === student?.course_id || c.id === admission?.course_id
    );

    const dueStatus = classifyPaymentDueStatus(invoiceDueDate, dateToday, dateTomorrow, dateIn2Days);

    allDues.push({
      id: `inv-${fa.id}`,
      student_id: fa.student_id,
      student_name: student?.full_name || admission?.student_name || 'Enrolled Student',
      admission_number: student?.admission_number || admission?.admission_number || '—',
      course_id: course?.id || fa.course_id,
      course_name: course?.course_name || student?.course_name || fa.course_name || 'Course Program',
      installment_number: 1,
      due_date: invoiceDueDate,
      installment_amount: (fa.paid_amount || 0) + remaining,
      paid_amount: fa.paid_amount || 0,
      outstanding_amount: remaining,
      due_status: dueStatus,
      fee_account_id: fa.id,
      is_partial: (fa.paid_amount || 0) > 0,
    });
  }

  // 3. Process completed admissions that have an explicit fee_due_date recorded but no separate installment entry
  const admissions = store.admissions || [];
  for (const adm of admissions) {
    if (tenantId(adm) !== tenantId(actor)) continue;
    const admStatus = (adm.status as unknown as string) || '';
    const admStatusNorm = admStatus.toLowerCase().replace(/[-_]/g, ' ').trim();
    if (
      admStatusNorm === 'cancelled' ||
      admStatusNorm === 'void' ||
      admStatusNorm === 'voided' ||
      admStatusNorm === 'discontinued'
    ) {
      continue;
    }

    const feeDueDate = typeof adm.fee_due_date === 'string' ? adm.fee_due_date.trim() : undefined;
    if (!feeDueDate || !/^\d{4}-\d{2}-\d{2}$/.test(feeDueDate)) continue;

    const student = (store.students || []).find(
      (s) => (adm.student_id ? s.id === adm.student_id : false) || s.admission_id === adm.id || s.admission_number === adm.admission_number
    );
    const studentId = student?.id || adm.student_id || adm.id;

    const feeAccount = (store.feeAccounts || []).find(
      (fa) => fa.student_id === studentId || fa.admission_id === adm.id
    );

    // Calculate actual remaining balance
    const netPayable = Number(feeAccount?.net_payable ?? adm.net_payable ?? adm.course_fee) || 0;
    const paidAmount = Number(feeAccount?.paid_amount ?? student?.paid_amount ?? 0);
    const outstanding = feeAccount?.outstanding_amount !== undefined
      ? Number(feeAccount.outstanding_amount)
      : Math.max(0, netPayable - paidAmount);

    if (outstanding <= 0) continue;

    // Check if already covered by installments or invoice due dates
    if (processedKeys.has(`std-date-${studentId}-${feeDueDate}`)) continue;
    const admDedupKey = `adm-${adm.id}-${feeDueDate}`;
    if (processedKeys.has(admDedupKey)) continue;
    processedKeys.add(admDedupKey);
    processedKeys.add(`std-date-${studentId}-${feeDueDate}`);

    if (actor.role === 'counsellor' && !isCounsellorAuthorizedForStudent(actor, studentId)) {
      continue;
    }

    const course = (store.courses || []).find(
      (c) => c.id === adm.course_id || c.id === student?.course_id || c.id === feeAccount?.course_id
    );

    const dueStatus = classifyPaymentDueStatus(feeDueDate, dateToday, dateTomorrow, dateIn2Days);

    const dedupKey = `${studentId}-${feeDueDate}-admission`;
    if (processedKeys.has(dedupKey)) continue;
    processedKeys.add(dedupKey);

    allDues.push({
      id: `adm-due-${adm.id}`,
      student_id: studentId,
      student_name: student?.full_name || adm.student_name,
      admission_number: student?.admission_number || adm.admission_number,
      course_id: course?.id || adm.course_id,
      course_name: course?.course_name || student?.course_name || adm.course_name || 'Course Program',
      installment_number: 1,
      due_date: feeDueDate,
      installment_amount: netPayable,
      paid_amount: paidAmount,
      outstanding_amount: outstanding,
      due_status: dueStatus,
      fee_account_id: feeAccount?.id,
      is_partial: paidAmount > 0,
    });
  }

  // 4. Sort by earliest due date, followed by student name alphabetically
  allDues.sort((a, b) => {
    const dateCmp = a.due_date.localeCompare(b.due_date);
    if (dateCmp !== 0) return dateCmp;
    return a.student_name.localeCompare(b.student_name);
  });

  // 5. Compute summary metrics across all authorized outstanding dues
  const overdueItems = allDues.filter((d) => d.due_status === 'Overdue');
  const todayItems = allDues.filter((d) => d.due_status === 'Due Today');
  const next3DaysItems = allDues.filter(
    (d) => d.due_status === 'Due Today' || d.due_status === 'Due Tomorrow' || d.due_status === 'Due in 2 Days'
  );
  const upcomingItems = allDues.filter((d) => d.due_status === 'Upcoming');

  const summary: AllPaymentDuesSummary = {
    totalOutstanding: Number(allDues.reduce((sum, item) => sum + item.outstanding_amount, 0).toFixed(2)),
    totalCount: allDues.length,
    overdueAmount: Number(overdueItems.reduce((sum, item) => sum + item.outstanding_amount, 0).toFixed(2)),
    overdueCount: overdueItems.length,
    todayAmount: Number(todayItems.reduce((sum, item) => sum + item.outstanding_amount, 0).toFixed(2)),
    todayCount: todayItems.length,
    next3DaysAmount: Number(next3DaysItems.reduce((sum, item) => sum + item.outstanding_amount, 0).toFixed(2)),
    next3DaysCount: next3DaysItems.length,
    upcomingAmount: Number(upcomingItems.reduce((sum, item) => sum + item.outstanding_amount, 0).toFixed(2)),
    upcomingCount: upcomingItems.length,
  };

  // 6. Apply Scope and Filters
  let filteredDues = [...allDues];

  if (scope === 'next3days') {
    // Restrict strictly to the 3 calendar dates
    filteredDues = filteredDues.filter((d) => targetDates.has(d.due_date));
  } else {
    // Status filter
    const statusFilter = options?.statusFilter || 'all';
    if (statusFilter === 'overdue') {
      filteredDues = filteredDues.filter((d) => d.due_status === 'Overdue');
    } else if (statusFilter === 'today') {
      filteredDues = filteredDues.filter((d) => d.due_status === 'Due Today');
    } else if (statusFilter === 'next3days') {
      filteredDues = filteredDues.filter(
        (d) => d.due_status === 'Due Today' || d.due_status === 'Due Tomorrow' || d.due_status === 'Due in 2 Days'
      );
    } else if (statusFilter === 'upcoming') {
      filteredDues = filteredDues.filter((d) => d.due_status === 'Upcoming');
    }

    // Search query filter
    const search = options?.search?.trim().toLowerCase();
    if (search) {
      filteredDues = filteredDues.filter(
        (d) =>
          d.student_name.toLowerCase().includes(search) ||
          d.admission_number.toLowerCase().includes(search) ||
          d.student_id.toLowerCase().includes(search) ||
          d.course_name.toLowerCase().includes(search)
      );
    }

    // Course filter
    const courseId = options?.courseId;
    if (courseId && courseId !== 'All') {
      filteredDues = filteredDues.filter((d) => d.course_id === courseId);
    }

    // Date range filter
    const startDate = options?.startDate?.trim();
    if (startDate) {
      filteredDues = filteredDues.filter((d) => d.due_date >= startDate);
    }
    const endDate = options?.endDate?.trim();
    if (endDate) {
      filteredDues = filteredDues.filter((d) => d.due_date <= endDate);
    }
  }

  // Calculate filtered total amount
  const totalDueAmount = Number(
    filteredDues.reduce((sum, item) => sum + item.outstanding_amount, 0).toFixed(2)
  );

  // Pagination (only when scope is 'all', or if explicitly requested)
  let paginatedDues = filteredDues;
  let page = 1;
  let pageSize = filteredDues.length;
  let totalItems = filteredDues.length;
  let totalPages = 1;

  if (scope === 'all') {
    page = Math.max(1, Number(options?.page) || 1);
    pageSize = Math.max(1, Number(options?.pageSize) || 10);
    totalItems = filteredDues.length;
    totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    if (page > totalPages) page = totalPages;
    const startIndex = (page - 1) * pageSize;
    paginatedDues = filteredDues.slice(startIndex, startIndex + pageSize);
  }

  const pagination: AllPaymentDuesPagination = {
    page,
    pageSize,
    totalItems,
    totalPages,
  };

  return {
    success: true,
    dues: paginatedDues,
    totalDueAmount,
    summary,
    pagination,
    asOfDate: dateToday,
    dates: [dateToday, dateTomorrow, dateIn2Days],
  };
}

/**
 * Retrieves upcoming payment dues for the next 3 calendar dates (today, tomorrow, in 2 days)
 * in the institute's business timezone (Asia/Kolkata).
 *
 * Preserves the exact signature and behavior for existing dashboard consumers.
 */
export function getUpcomingPaymentDues(
  actor: UserProfile,
  options?: {
    baseDate?: Date;
    timeZone?: string;
  }
): UpcomingPaymentDuesResponse {
  const result = getAllPaymentDues(actor, {
    scope: 'next3days',
    baseDate: options?.baseDate,
    timeZone: options?.timeZone,
  });

  return {
    success: result.success,
    dues: result.dues,
    totalDueAmount: result.totalDueAmount,
    asOfDate: result.asOfDate,
    dates: result.dates,
    summary: result.summary,
    pagination: result.pagination,
  };
}
