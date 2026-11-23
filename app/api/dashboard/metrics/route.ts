import { NextRequest, NextResponse } from 'next/server';
import { getLeads } from '@/lib/services/crm-service';
import { CRM_ROLES } from '@/lib/auth/lead-access';
import { authenticatePaymentRequest } from '@/lib/auth/payment-session';
import { store } from '@/lib/services/data-store';
import {
  DashboardPeriod,
  DateRange,
  validateDateRange,
  isDateInPeriod,
  getPeriodDateBoundaries,
  formatDisplayDateRange,
  courseBucket,
  paymentCourseBucket,
  UNASSIGNED_COURSE,
  calculatePaymentApprovalMetrics,
  calculateEnrollmentMetrics,
  isPaymentApproved,
  unifyDualLedgerPayments,
} from '@/lib/utils/dashboard-metrics';
import { getInstituteTimezone } from '@/lib/utils/schedule-date';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function safeAmount(val: unknown): number {
  if (typeof val === 'number') return Number.isFinite(val) ? val : 0;
  if (!val) return 0;
  const num = Number(val);
  return Number.isFinite(num) ? num : 0;
}

export async function GET(request: NextRequest) {
  try {
    const actor = await authenticatePaymentRequest(request);

    // Role-based access control (RBAC):
    // Students must never view executive financial & operations metrics
    if (actor.role === 'student') {
      return NextResponse.json(
        {
          success: false,
          error: 'Forbidden: Students are not authorized to view financial and executive dashboard metrics.',
        },
        { status: 403 }
      );
    }

    const authorizedRoles = ['super_admin', 'admin', 'accountant', 'counsellor', 'counsellor_lead', 'onboarding_team'];
    if (!authorizedRoles.includes(actor.role)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Forbidden: Insufficient privileges to view executive dashboard metrics.',
        },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const rawPeriod = (searchParams.get('period') || 'month').toLowerCase();
    const period: DashboardPeriod = ['today', 'week', 'month', 'all', 'custom'].includes(rawPeriod)
      ? (rawPeriod as DashboardPeriod)
      : 'month';

    const startDate = searchParams.get('start_date') || undefined;
    const endDate = searchParams.get('end_date') || undefined;
    const courseId = searchParams.get('course_id') || 'All';
    const timeZone = getInstituteTimezone();

    let customRange: DateRange | null = null;

    if (period === 'custom' || (startDate && endDate)) {
      const validation = validateDateRange(startDate, endDate);
      if (!validation.isValid) {
        return NextResponse.json(
          {
            success: false,
            error: validation.error || 'Invalid date range provided.',
          },
          { status: 400 }
        );
      }
      customRange = {
        startDate: startDate!,
        endDate: endDate!,
      };
    }

    // Reconcile data stores
    store.reconcileDualLedgers();

    // Tenant Scoping
    const tenantId = actor.tenant_id;
    const filterTenant = <T extends Record<string, any>>(records: readonly T[]): T[] => {
      if (!tenantId) return records as T[];
      return records.filter((r) => !r.tenant_id || r.tenant_id === tenantId) as T[];
    };

    const students = filterTenant(store.students || []);
    const courses = store.courses || [];
    const feeAccounts = filterTenant(store.feeAccounts || []);
    const expenses = filterTenant(store.expenses || []);
    const admissions = filterTenant(store.admissions || []);
    const leads = CRM_ROLES.includes(actor.role) ? await getLeads({}, actor) : [];

    const courseIds = new Set(courses.map((c) => c.id));
    const matchesCourse = (cId?: string) => courseId === 'All' || courseBucket(cId, courseIds) === courseId;

    const allUnifiedPayments = unifyDualLedgerPayments(
      filterTenant(store.payments || []),
      filterTenant(store.studentPayments || []),
      {
        students,
        courses,
        studentFees: filterTenant(store.studentFees || []),
        feeAccounts,
        receipts: filterTenant(store.receipts || []),
      }
    );

    // Filter payments by period & course
    const periodPayments = allUnifiedPayments.filter((p) => {
      const inPeriod = isDateInPeriod(p.payment_date || p.created_at, period, customRange, new Date(), timeZone);
      if (!inPeriod) return false;
      if (courseId === 'All') return true;
      return paymentCourseBucket(p, courseIds, feeAccounts, students) === courseId;
    });

    const periodApprovedPayments = periodPayments.filter((p) => isPaymentApproved(p));
    const periodCollections = periodApprovedPayments.reduce((sum, p) => sum + safeAmount(p.amount), 0);

    // Filter expenses by period
    const periodExpensesList = expenses.filter((e) =>
      isDateInPeriod(e.expense_date || e.created_at, period, customRange, new Date(), timeZone)
    );
    const periodExpenses = periodExpensesList
      .filter((e) => e.status === 'Paid')
      .reduce((sum, e) => sum + safeAmount(e.amount), 0);

    const netOperatingBalance = periodCollections - periodExpenses;

    // Filter admissions by period & course
    const periodAdmissions = admissions.filter((a) => {
      const inPeriod = isDateInPeriod(a.admission_date || a.created_at, period, customRange, new Date(), timeZone);
      if (!inPeriod) return false;
      return matchesCourse(a.course_id);
    });

    // Approval & Enrollment Metrics
    const paymentApprovalMetrics = calculatePaymentApprovalMetrics(periodPayments);
    const enrollmentMetrics = calculateEnrollmentMetrics(
      admissions.filter((a) => isDateInPeriod(a.admission_date || a.created_at, period, customRange, new Date(), timeZone)),
      students,
      matchesCourse
    );

    // Course reconciliation breakdown
    const courseBreakdown = [
      ...courses.map((c) => ({ id: c.id, name: c.course_name })),
      { id: UNASSIGNED_COURSE, name: 'Unassigned / unknown course' },
    ].map((course) => {
      const payments = allUnifiedPayments.filter(
        (p) =>
          isDateInPeriod(p.payment_date || p.created_at, period, customRange, new Date(), timeZone) &&
          isPaymentApproved(p) &&
          paymentCourseBucket(p, courseIds, feeAccounts, students) === course.id
      );
      return {
        ...course,
        transactions: payments.length,
        amount: payments.reduce((sum, p) => sum + safeAmount(p.amount), 0),
        students: students.filter((s) => courseBucket(s.course_id, courseIds) === course.id).length,
      };
    });

    // Outstanding fees
    const totalOutstanding = feeAccounts
      .filter((f) => matchesCourse(f.course_id))
      .reduce((sum, f) => sum + safeAmount(f.outstanding_amount), 0);

    const pendingAccounts = feeAccounts.filter((f) => f.outstanding_amount > 0 && matchesCourse(f.course_id));
    const pendingAmountInPeriod = pendingAccounts.reduce((sum, f) => sum + safeAmount(f.outstanding_amount), 0);

    // Leads & Conversions in Period
    const periodLeads = leads.filter(
      (l) => isDateInPeriod(l.created_at, period, customRange, new Date(), timeZone) && matchesCourse(l.interested_course_id)
    );
    const totalLeads = periodLeads.length;
    const convertedLeads = periodLeads.filter((l) => l.stage === 'Converted').length;

    // Fixed-Lifetime Metrics (Unaffected by period)
    const totalStudents = students.filter((s) => matchesCourse(s.course_id)).length;
    const activeStudents = students.filter((s) => s.status === 'Active' && matchesCourse(s.course_id)).length;
    const totalCourses = courseId === 'All' ? courses.length : courseId === UNASSIGNED_COURSE ? 0 : 1;
    const activeBatches = (store.batches || []).filter((b) => b.status === 'Active' && matchesCourse(b.course_id)).length;
    const upcomingDemos = leads.filter((l) => l.stage === 'Demo Scheduled').length;
    const activeJobOpenings = (store.jobOpenings || []).filter((j) => j.status === 'Open').length;

    const boundaries = getPeriodDateBoundaries(period, customRange, new Date(), timeZone);

    return NextResponse.json(
      {
        success: true,
        period,
        dateRange: {
          startDate: boundaries.startDate || customRange?.startDate,
          endDate: boundaries.endDate || customRange?.endDate,
          formattedLabel:
            period === 'custom' && customRange
              ? formatDisplayDateRange(customRange.startDate, customRange.endDate)
              : undefined,
        },
        timeZone,
        metrics: {
          collections: {
            periodCollections,
            transactionCount: periodApprovedPayments.length,
          },
          expenses: {
            periodExpenses,
            count: periodExpensesList.length,
          },
          netOperatingBalance,
          outstandingFees: {
            totalOutstanding,
            pendingAmountInPeriod,
            pendingAccountsCount: pendingAccounts.length,
          },
          paymentApproval: paymentApprovalMetrics,
          enrollment: enrollmentMetrics,
          leads: {
            totalLeads,
            convertedLeads,
          },
          courseBreakdown,
          lifetime: {
            totalStudents,
            activeStudents,
            totalCourses,
            activeBatches,
            upcomingDemos,
            activeJobOpenings,
          },
        },
      },
      {
        headers: {
          'Cache-Control': 'private, no-cache, no-store, must-revalidate',
        },
      }
    );
  } catch (error: any) {
    const message = error?.message || 'Failed to calculate dashboard metrics.';
    const status = message.startsWith('Unauthorized')
      ? 401
      : message.startsWith('Forbidden')
      ? 403
      : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
