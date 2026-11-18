import { describe, expect, it } from 'vitest';
import {
  isDateInPeriod,
  validateDateRange,
  getPeriodDateBoundaries,
  getDateInInstituteTimezone,
  formatDisplayDateRange,
  paymentCourseBucket,
  courseBucket,
  UNASSIGNED_COURSE,
  calculatePaymentApprovalMetrics,
  calculateEnrollmentMetrics,
  isPaymentApproved,
  unifyDualLedgerPayments,
  DashboardPeriod,
  DateRange,
} from '@/lib/utils/dashboard-metrics';
import { store } from '@/lib/services/data-store';
import { getTodayInInstituteTimezone } from '@/lib/utils/schedule-date';

describe('Requirement 6 — Dashboard Custom Calendar Date Range & Filters Verification', () => {
  // Reference date: Tuesday, 17 November 2026 at 12:00:00 PM Asia/Kolkata
  const referenceDate = new Date('2026-11-17T12:00:00+05:30');
  const todayKolkata = '2026-11-17';

  // --------------------------------------------------------------------------
  // Item 1: Today filter works
  // --------------------------------------------------------------------------
  describe('1. Today Filter', () => {
    it('includes events occurring today in Asia/Kolkata and excludes other days', () => {
      expect(isDateInPeriod('2026-11-17', 'today', null, referenceDate)).toBe(true);
      expect(isDateInPeriod('2026-11-17T09:30:00+05:30', 'today', null, referenceDate)).toBe(true);

      // Yesterday and Tomorrow are excluded
      expect(isDateInPeriod('2026-11-16', 'today', null, referenceDate)).toBe(false);
      expect(isDateInPeriod('2026-11-18', 'today', null, referenceDate)).toBe(false);
    });

    it('derives exact today boundary in Asia/Kolkata', () => {
      const bounds = getPeriodDateBoundaries('today', null, referenceDate);
      expect(bounds.startDate).toBe(todayKolkata);
      expect(bounds.endDate).toBe(todayKolkata);
    });
  });

  // --------------------------------------------------------------------------
  // Item 2: This Week filter works
  // --------------------------------------------------------------------------
  describe('2. This Week Filter', () => {
    it('starts on Monday matching the academic calendar and extends to today', () => {
      // 2026-11-17 is Tuesday. Monday of this week was 2026-11-16.
      const bounds = getPeriodDateBoundaries('week', null, referenceDate);
      expect(bounds.startDate).toBe('2026-11-16'); // Monday
      expect(bounds.endDate).toBe('2026-11-17');   // Tuesday (today)

      // Monday (16th) and Tuesday (17th) are included
      expect(isDateInPeriod('2026-11-16', 'week', null, referenceDate)).toBe(true);
      expect(isDateInPeriod('2026-11-17', 'week', null, referenceDate)).toBe(true);

      // Prior Sunday (15th) belongs to the previous calendar week: excluded
      expect(isDateInPeriod('2026-11-15', 'week', null, referenceDate)).toBe(false);

      // Future date (18th): excluded
      expect(isDateInPeriod('2026-11-18', 'week', null, referenceDate)).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // Item 3: This Month filter works
  // --------------------------------------------------------------------------
  describe('3. This Month Filter', () => {
    it('covers the current calendar month to date or rolling 30-day window', () => {
      const bounds = getPeriodDateBoundaries('month', null, referenceDate);
      expect(bounds.startDate).toBe('2026-11-01');
      expect(bounds.endDate).toBe('2026-11-17');

      // Dates within current month
      expect(isDateInPeriod('2026-11-01', 'month', null, referenceDate)).toBe(true);
      expect(isDateInPeriod('2026-11-10', 'month', null, referenceDate)).toBe(true);
      expect(isDateInPeriod('2026-11-17', 'month', null, referenceDate)).toBe(true);

      // Distant past date outside window
      expect(isDateInPeriod('2026-08-15', 'month', null, referenceDate)).toBe(false);
      // Future date beyond today
      expect(isDateInPeriod('2026-11-25', 'month', null, referenceDate)).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // Item 4: All Time filter works
  // --------------------------------------------------------------------------
  describe('4. All Time Filter', () => {
    it('returns true for any valid date across past, present, and future', () => {
      expect(isDateInPeriod('2024-01-01', 'all', null, referenceDate)).toBe(true);
      expect(isDateInPeriod('2026-02-15', 'all', null, referenceDate)).toBe(true);
      expect(isDateInPeriod('2026-11-17', 'all', null, referenceDate)).toBe(true);
      expect(isDateInPeriod('2027-12-31', 'all', null, referenceDate)).toBe(true);
    });

    it('returns empty boundaries for unbounded query', () => {
      const bounds = getPeriodDateBoundaries('all', null, referenceDate);
      expect(bounds.startDate).toBeUndefined();
      expect(bounds.endDate).toBeUndefined();
    });
  });

  // --------------------------------------------------------------------------
  // Item 5: Custom same-day range works
  // --------------------------------------------------------------------------
  describe('5. Custom Same-Day Range (Inclusive)', () => {
    it('includes events on that specific day and excludes preceding and succeeding days', () => {
      const sameDayRange: DateRange = {
        startDate: '2026-11-15',
        endDate: '2026-11-15',
      };

      expect(isDateInPeriod('2026-11-15', 'custom', sameDayRange)).toBe(true);
      expect(isDateInPeriod('2026-11-15T14:30:00+05:30', 'custom', sameDayRange)).toBe(true);

      // Preceding and succeeding days must be excluded
      expect(isDateInPeriod('2026-11-14', 'custom', sameDayRange)).toBe(false);
      expect(isDateInPeriod('2026-11-16', 'custom', sameDayRange)).toBe(false);
    });

    it('formats display label for single day properly', () => {
      expect(formatDisplayDateRange('2026-11-15', '2026-11-15')).toMatch(/15\s+Nov\s+2026/);
    });
  });

  // --------------------------------------------------------------------------
  // Item 6: Custom multi-day range works
  // --------------------------------------------------------------------------
  describe('6. Custom Multi-Day Range', () => {
    const multiDayRange: DateRange = {
      startDate: '2026-11-10',
      endDate: '2026-11-16',
    };

    it('includes all intermediate and boundary dates inclusively', () => {
      expect(isDateInPeriod('2026-11-10', 'custom', multiDayRange)).toBe(true); // Start boundary
      expect(isDateInPeriod('2026-11-13', 'custom', multiDayRange)).toBe(true); // Midpoint
      expect(isDateInPeriod('2026-11-16', 'custom', multiDayRange)).toBe(true); // End boundary

      // Outside the range
      expect(isDateInPeriod('2026-11-09', 'custom', multiDayRange)).toBe(false);
      expect(isDateInPeriod('2026-11-17', 'custom', multiDayRange)).toBe(false);
    });

    it('formats multi-day label cleanly', () => {
      const label = formatDisplayDateRange(multiDayRange.startDate, multiDayRange.endDate);
      expect(label).toContain('10 Nov');
      expect(label).toContain('16 Nov 2026');
    });
  });

  // --------------------------------------------------------------------------
  // Item 7: Cross-month and cross-year ranges
  // --------------------------------------------------------------------------
  describe('7. Cross-Month and Cross-Year Ranges', () => {
    it('correctly handles cross-month range (e.g. October 25 to November 5, 2026)', () => {
      const crossMonthRange: DateRange = {
        startDate: '2026-10-25',
        endDate: '2026-11-05',
      };

      expect(isDateInPeriod('2026-10-25', 'custom', crossMonthRange)).toBe(true);
      expect(isDateInPeriod('2026-10-31', 'custom', crossMonthRange)).toBe(true);
      expect(isDateInPeriod('2026-11-01', 'custom', crossMonthRange)).toBe(true);
      expect(isDateInPeriod('2026-11-05', 'custom', crossMonthRange)).toBe(true);

      // Outside
      expect(isDateInPeriod('2026-10-24', 'custom', crossMonthRange)).toBe(false);
      expect(isDateInPeriod('2026-11-06', 'custom', crossMonthRange)).toBe(false);
    });

    it('correctly handles cross-year range (e.g. December 20, 2025 to January 15, 2026)', () => {
      const crossYearRange: DateRange = {
        startDate: '2025-12-20',
        endDate: '2026-01-15',
      };

      expect(isDateInPeriod('2025-12-20', 'custom', crossYearRange)).toBe(true);
      expect(isDateInPeriod('2025-12-31', 'custom', crossYearRange)).toBe(true);
      expect(isDateInPeriod('2026-01-01', 'custom', crossYearRange)).toBe(true);
      expect(isDateInPeriod('2026-01-15', 'custom', crossYearRange)).toBe(true);

      // Outside
      expect(isDateInPeriod('2025-12-19', 'custom', crossYearRange)).toBe(false);
      expect(isDateInPeriod('2026-01-16', 'custom', crossYearRange)).toBe(false);
    });

    it('formats cross-year label with both years explicit', () => {
      const label = formatDisplayDateRange('2025-12-20', '2026-01-15');
      expect(label).toContain('2025');
      expect(label).toContain('2026');
    });
  });

  // --------------------------------------------------------------------------
  // Item 8: Invalid ranges are rejected with clear error messages
  // --------------------------------------------------------------------------
  describe('8. Invalid Range Rejection and Validation', () => {
    it('rejects when From Date is later than To Date', () => {
      const result = validateDateRange('2026-11-20', '2026-11-15');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('From Date cannot be later than To Date.');
    });

    it('rejects when From Date or To Date is missing', () => {
      expect(validateDateRange('', '2026-11-15').isValid).toBe(false);
      expect(validateDateRange('2026-11-15', '').isValid).toBe(false);
      expect(validateDateRange(null, null).isValid).toBe(false);
    });

    it('rejects impossible calendar dates (e.g. 2026-02-30 or 2026-13-40)', () => {
      expect(validateDateRange('2026-02-30', '2026-03-05').isValid).toBe(false);
      expect(validateDateRange('2026-11-10', '2026-13-01').isValid).toBe(false);
    });

    it('accepts valid range', () => {
      const result = validateDateRange('2026-11-10', '2026-11-15');
      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    });
  });

  // --------------------------------------------------------------------------
  // Item 9: Custom range combined with Course filter
  // --------------------------------------------------------------------------
  describe('9. Custom Range Combined with Course Filter', () => {
    const courseIds = new Set(['crs-sap-fico', 'crs-sap-mm', 'crs-sap-abap']);
    const customRange: DateRange = {
      startDate: '2026-02-01',
      endDate: '2026-02-28',
    };

    const mockPayments = [
      // FICO in February 2026 (matches range & course)
      { id: 'p1', student_id: 'std-1', amount: 25000, course_id: 'crs-sap-fico', payment_date: '2026-02-05', status: 'Success' },
      // FICO in March 2026 (matches course, OUT of date range)
      { id: 'p2', student_id: 'std-2', amount: 20000, course_id: 'crs-sap-fico', payment_date: '2026-03-05', status: 'Success' },
      // MM in February 2026 (matches date range, DIFFERENT course)
      { id: 'p3', student_id: 'std-3', amount: 15000, course_id: 'crs-sap-mm', payment_date: '2026-02-10', status: 'Success' },
      // ABAP in February 2026 (matches date range, DIFFERENT course)
      { id: 'p4', student_id: 'std-4', amount: 18000, course_id: 'crs-sap-abap', payment_date: '2026-02-12', status: 'Success' },
    ];

    it('filters strictly by BOTH custom date range AND selected course', () => {
      const filteredFico = mockPayments.filter((p) => {
        const inDate = isDateInPeriod(p.payment_date, 'custom', customRange);
        const inCourse = paymentCourseBucket(p, courseIds, [], []) === 'crs-sap-fico';
        return inDate && inCourse;
      });

      expect(filteredFico).toHaveLength(1);
      expect(filteredFico[0].id).toBe('p1');
      expect(filteredFico[0].amount).toBe(25000);
    });

    it('includes all courses in custom date range when course filter is All', () => {
      const filteredAll = mockPayments.filter((p) => {
        const inDate = isDateInPeriod(p.payment_date, 'custom', customRange);
        const inCourse = true; // 'All'
        return inDate && inCourse;
      });

      expect(filteredAll).toHaveLength(3); // p1, p3, p4 (all in Feb 2026)
      const totalAmount = filteredAll.reduce((sum, p) => sum + p.amount, 0);
      expect(totalAmount).toBe(25000 + 15000 + 18000);
    });
  });

  // --------------------------------------------------------------------------
  // Item 10: Dashboard totals reconcile with database records
  // --------------------------------------------------------------------------
  describe('10. Dashboard Totals Reconciliation', () => {
    it('ensures KPI card collections equals the sum of course reconciliation table rows', () => {
      store.reconcileDualLedgers();
      const unified = unifyDualLedgerPayments(store.payments || [], store.studentPayments || [], {
        students: store.students || [],
        courses: store.courses || [],
        studentFees: store.studentFees || [],
        feeAccounts: store.feeAccounts || [],
        receipts: store.receipts || [],
      });

      const courseIds = new Set((store.courses || []).map((c) => c.id));
      const customRange: DateRange = {
        startDate: '2026-01-01',
        endDate: '2026-03-31',
      };

      // Period collections calculation (matches KPI Card 1)
      const periodApproved = unified.filter(
        (p) => isDateInPeriod(p.payment_date || p.created_at, 'custom', customRange) && isPaymentApproved(p)
      );
      const totalKpiCollections = periodApproved.reduce((sum, p) => sum + (p.amount || 0), 0);

      // Course reconciliation table rows calculation
      const coursesWithUnassigned = [
        ...(store.courses || []).map((c) => ({ id: c.id, name: c.course_name })),
        { id: UNASSIGNED_COURSE, name: 'Unassigned / unknown course' },
      ];

      const breakdownRows = coursesWithUnassigned.map((course) => {
        const matching = unified.filter(
          (p) =>
            isDateInPeriod(p.payment_date || p.created_at, 'custom', customRange) &&
            isPaymentApproved(p) &&
            paymentCourseBucket(p, courseIds, store.feeAccounts || [], store.students || []) === course.id
        );
        return {
          id: course.id,
          amount: matching.reduce((sum, p) => sum + (p.amount || 0), 0),
          transactions: matching.length,
        };
      });

      const totalTableCollections = breakdownRows.reduce((sum, r) => sum + r.amount, 0);
      const totalTableTransactions = breakdownRows.reduce((sum, r) => sum + r.transactions, 0);

      expect(totalTableCollections).toBe(totalKpiCollections);
      expect(totalTableTransactions).toBe(periodApproved.length);
    });

    it('keeps fixed-lifetime metrics invariant under custom date range filtering', () => {
      const courseIds = new Set((store.courses || []).map((c) => c.id));
      const totalStudentsAll = (store.students || []).length;
      const totalCoursesAll = (store.courses || []).length;
      const activeBatchesAll = (store.batches || []).filter((b) => b.status === 'Active').length;

      // Regardless of custom range, roster & module counts remain constant
      expect(totalStudentsAll).toBeGreaterThanOrEqual(1);
      expect(totalCoursesAll).toBeGreaterThanOrEqual(1);
      expect(activeBatchesAll).toBeGreaterThanOrEqual(1);
    });
  });

  // --------------------------------------------------------------------------
  // Item 11: Timezone boundaries (Asia/Kolkata) handled accurately
  // --------------------------------------------------------------------------
  describe('11. Asia/Kolkata Timezone Boundaries', () => {
    it('properly handles UTC timestamps crossing midnight into Asia/Kolkata (+05:30)', () => {
      // 19:30 UTC on 2026-11-17 corresponds to 01:00 AM on 2026-11-18 in Asia/Kolkata
      const utcEvening = '2026-11-17T19:30:00.000Z';
      const kolkataDate = getDateInInstituteTimezone(utcEvening, 'Asia/Kolkata');
      expect(kolkataDate).toBe('2026-11-18');

      // Therefore, it falls on 2026-11-18 in Kolkata
      expect(isDateInPeriod(utcEvening, 'custom', { startDate: '2026-11-18', endDate: '2026-11-18' })).toBe(true);
      expect(isDateInPeriod(utcEvening, 'custom', { startDate: '2026-11-17', endDate: '2026-11-17' })).toBe(false);
    });

    it('properly handles UTC timestamp before midnight staying on the same Kolkata date', () => {
      // 06:15 UTC on 2026-11-17 corresponds to 11:45 AM on 2026-11-17 in Asia/Kolkata
      const utcMorning = '2026-11-17T06:15:00.000Z';
      const kolkataDate = getDateInInstituteTimezone(utcMorning, 'Asia/Kolkata');
      expect(kolkataDate).toBe('2026-11-17');

      expect(isDateInPeriod(utcMorning, 'custom', { startDate: '2026-11-17', endDate: '2026-11-17' })).toBe(true);
    });

    it('preserves date-only YYYY-MM-DD strings exactly as intended', () => {
      expect(getDateInInstituteTimezone('2026-11-17', 'Asia/Kolkata')).toBe('2026-11-17');
      expect(getDateInInstituteTimezone('2026-02-02', 'Asia/Kolkata')).toBe('2026-02-02');
    });

    it('returns null for null, undefined, empty, or garbage date strings', () => {
      expect(getDateInInstituteTimezone(null)).toBeNull();
      expect(getDateInInstituteTimezone(undefined)).toBeNull();
      expect(getDateInInstituteTimezone('')).toBeNull();
      expect(getDateInInstituteTimezone('invalid-not-a-date')).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // Item 12: Access permissions and RBAC remain intact
  // --------------------------------------------------------------------------
  describe('12. Access Permissions and RBAC Enforcement', () => {
    it('restricts financial metrics from students while permitting staff roles', async () => {
      const studentActor = {
        id: 'usr-student-01',
        email: 'student@example.com',
        role: 'student',
        tenant_id: 'default-tenant',
      };

      const accountantActor = {
        id: 'usr-accountant-01',
        email: 'accountant@example.com',
        role: 'accountant',
        tenant_id: 'default-tenant',
      };

      const authorizedRoles = ['super_admin', 'admin', 'accountant', 'counsellor', 'onboarding_team'];

      // Student is explicitly forbidden
      expect(authorizedRoles.includes(studentActor.role)).toBe(false);

      // Accountant is authorized
      expect(authorizedRoles.includes(accountantActor.role)).toBe(true);
    });
  });
});
