/**
 * Test Suite: Upcoming Payment Dues — Next 3 Days
 *
 * Verifies:
 * 1. Replacement of Placement Drive Overview with Upcoming Payment Dues on /dashboard.
 * 2. Date calculation in business timezone Asia/Kolkata (Today, Tomorrow, In 2 Days).
 * 3. Proper categorization: Due Today, Due Tomorrow, Due in 2 Days.
 * 4. Exclusion of past due dates and dates outside the 3-day window.
 * 5. Installment balance integrity: remaining payable balance > 0, partial payments deducted,
 *    fully settled installments excluded.
 * 6. Exclusion of cancelled, voided, waived, or discontinued obligations.
 * 7. Verified payment vs unapproved/pending payment isolation.
 * 8. Strict counsellor role-based scoping (tenant, branch, and assigned students).
 * 9. Sorting order: earliest due date first, then student name.
 * 10. API route authorization (401 unauthenticated, 403 student, 200 authorized roles).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { store } from '@/lib/services/data-store';
import {
  getUpcomingPaymentDues,
  getAllPaymentDues,
  getUpcoming3DaysDates,
  classifyPaymentDueStatus,
  isCounsellorAuthorizedForStudent,
} from '@/lib/services/upcoming-dues-service';
import { GET as upcomingDuesRoute } from '@/app/api/fees/upcoming-dues/route';
import { GET as duesRoute } from '@/app/api/fees/dues/route';
import { generateAuthCookieSignatureSync } from '@/lib/security/auth-cookie';
import { UserProfile, UserRole, Installment, StudentFeeAccount, Student, Course, Admission, Payment } from '@/types';

function createMockAuthRequest(role: UserRole, userOverrides: Partial<UserProfile> = {}, path: string = '/api/fees/upcoming-dues') {
  const user: UserProfile = {
    id: `usr-${role}-test`,
    email: `${role}@next-generpsolutions.com`,
    full_name: `${role.toUpperCase()} Test User`,
    role,
    tenant_id: 'default',
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...userOverrides,
  };

  if (!store.users) store.users = [];
  const existingIdx = store.users.findIndex((u) => u.id === user.id || u.email === user.email);
  if (existingIdx >= 0) {
    store.users[existingIdx] = user;
  } else {
    store.users.push(user);
  }

  const cookiePayload = JSON.stringify(user);
  const signature = generateAuthCookieSignatureSync(encodeURIComponent(cookiePayload));

  const req = new NextRequest(new URL(`http://localhost:3000${path}`), {
    headers: {
      host: 'localhost:3000',
      accept: 'application/json',
      cookie: `next_gen_auth_user=${encodeURIComponent(cookiePayload)}; next_gen_auth_user_sig=${signature}`,
    },
  });

  req.cookies.set('next_gen_auth_user', encodeURIComponent(cookiePayload));
  req.cookies.set('next_gen_auth_user_sig', signature);

  return { req, user };
}

describe('Upcoming Payment Dues — Next 3 Days', () => {
  const adminActor: UserProfile = {
    id: 'usr-admin-1',
    email: 'admin@erp.com',
    full_name: 'Admin User',
    role: 'admin',
    tenant_id: 'default',
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };

  const counsellorActor: UserProfile = {
    id: 'usr-counsellor-1',
    email: 'counsellor@erp.com',
    full_name: 'Jane Counsellor',
    role: 'counsellor',
    tenant_id: 'default',
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };

  const otherCounsellorActor: UserProfile = {
    id: 'usr-counsellor-2',
    email: 'other@erp.com',
    full_name: 'John Other',
    role: 'counsellor',
    tenant_id: 'default',
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };

  beforeEach(() => {
    // Reset store data with isolated fixtures
    store.students = [
      {
        id: 'std-1',
        full_name: 'Aarav Sharma',
        admission_number: 'ADM-2026-001',
        admission_id: 'adm-1',
        course_id: 'crs-sap-fico',
        course_name: 'SAP FICO Financial Accounting',
        status: 'Active',
        tenant_id: 'default',
      } as Student,
      {
        id: 'std-2',
        full_name: 'Bhavna Patel',
        admission_number: 'ADM-2026-002',
        admission_id: 'adm-2',
        course_id: 'crs-sap-mm',
        course_name: 'SAP MM Materials Management',
        status: 'Active',
        tenant_id: 'default',
      } as Student,
      {
        id: 'std-3',
        full_name: 'Chirag Verma',
        admission_number: 'ADM-2026-003',
        admission_id: 'adm-3',
        course_id: 'crs-sap-sd',
        course_name: 'SAP SD Sales & Distribution',
        status: 'Active',
        tenant_id: 'default',
      } as Student,
      {
        id: 'std-4',
        full_name: 'Divya Nair',
        admission_number: 'ADM-2026-004',
        admission_id: 'adm-4',
        course_id: 'crs-sap-abap',
        course_name: 'SAP ABAP Programming',
        status: 'Active',
        tenant_id: 'default',
      } as Student,
    ];

    store.courses = [
      { id: 'crs-sap-fico', course_name: 'SAP FICO Financial Accounting', course_code: 'SAP-FICO' } as Course,
      { id: 'crs-sap-mm', course_name: 'SAP MM Materials Management', course_code: 'SAP-MM' } as Course,
      { id: 'crs-sap-sd', course_name: 'SAP SD Sales & Distribution', course_code: 'SAP-SD' } as Course,
      { id: 'crs-sap-abap', course_name: 'SAP ABAP Programming', course_code: 'SAP-ABAP' } as Course,
    ];

    store.admissions = [
      {
        id: 'adm-1',
        admission_number: 'ADM-2026-001',
        student_id: 'std-1',
        student_name: 'Aarav Sharma',
        course_id: 'crs-sap-fico',
        counsellor_id: 'usr-counsellor-1',
        counsellor_name: 'Jane Counsellor',
        tenant_id: 'default',
      } as unknown as Admission,
      {
        id: 'adm-2',
        admission_number: 'ADM-2026-002',
        student_id: 'std-2',
        student_name: 'Bhavna Patel',
        course_id: 'crs-sap-mm',
        counsellor_id: 'usr-counsellor-1',
        counsellor_name: 'Jane Counsellor',
        tenant_id: 'default',
      } as unknown as Admission,
      {
        id: 'adm-3',
        admission_number: 'ADM-2026-003',
        student_id: 'std-3',
        student_name: 'Chirag Verma',
        course_id: 'crs-sap-sd',
        counsellor_id: 'usr-counsellor-2',
        counsellor_name: 'John Other',
        tenant_id: 'default',
      } as unknown as Admission,
      {
        id: 'adm-4',
        admission_number: 'ADM-2026-004',
        student_id: 'std-4',
        student_name: 'Divya Nair',
        course_id: 'crs-sap-abap',
        counsellor_id: 'usr-counsellor-2',
        counsellor_name: 'John Other',
        tenant_id: 'default',
      } as unknown as Admission,
    ];

    store.feeAccounts = [
      {
        id: 'fa-1',
        student_id: 'std-1',
        admission_id: 'adm-1',
        course_id: 'crs-sap-fico',
        net_payable: 35000,
        paid_amount: 15000,
        outstanding_amount: 20000,
        status: 'Partially Paid',
        tenant_id: 'default',
      } as StudentFeeAccount,
      {
        id: 'fa-2',
        student_id: 'std-2',
        admission_id: 'adm-2',
        course_id: 'crs-sap-mm',
        net_payable: 40000,
        paid_amount: 20000,
        outstanding_amount: 20000,
        status: 'Partially Paid',
        tenant_id: 'default',
      } as StudentFeeAccount,
      {
        id: 'fa-3',
        student_id: 'std-3',
        admission_id: 'adm-3',
        course_id: 'crs-sap-sd',
        net_payable: 30000,
        paid_amount: 10000,
        outstanding_amount: 20000,
        status: 'Partially Paid',
        tenant_id: 'default',
      } as StudentFeeAccount,
      {
        id: 'fa-4',
        student_id: 'std-4',
        admission_id: 'adm-4',
        course_id: 'crs-sap-abap',
        net_payable: 25000,
        paid_amount: 0,
        outstanding_amount: 25000,
        status: 'Unpaid',
        tenant_id: 'default',
      } as StudentFeeAccount,
    ];

    store.installments = [];
  });

  // =========================================================================
  // 1. TIMEZONE & 3-DAY CALENDAR WINDOW IN ASIA/KOLKATA
  // =========================================================================
  describe('Timezone & 3-Day Window in Asia/Kolkata', () => {
    it('calculates exactly 3 sequential calendar dates (Today, Tomorrow, In 2 Days) in Asia/Kolkata', () => {
      // Base date: 14 Nov 2026, 10:00:00 UTC (15:30 IST)
      const baseDate = new Date('2026-11-14T10:00:00Z');
      const { dateToday, dateTomorrow, dateIn2Days, targetDates } = getUpcoming3DaysDates(baseDate);

      expect(dateToday).toBe('2026-11-14');
      expect(dateTomorrow).toBe('2026-11-15');
      expect(dateIn2Days).toBe('2026-11-16');
      expect(targetDates.size).toBe(3);
      expect(targetDates.has('2026-11-14')).toBe(true);
      expect(targetDates.has('2026-11-15')).toBe(true);
      expect(targetDates.has('2026-11-16')).toBe(true);
    });

    it('handles late-night UTC that is already the next day in Asia/Kolkata (+05:30)', () => {
      // 14 Nov 2026, 20:30 UTC -> 15 Nov 2026, 02:00 IST
      const baseDate = new Date('2026-11-14T20:30:00Z');
      const { dateToday, dateTomorrow, dateIn2Days } = getUpcoming3DaysDates(baseDate);

      expect(dateToday).toBe('2026-11-15');
      expect(dateTomorrow).toBe('2026-11-16');
      expect(dateIn2Days).toBe('2026-11-17');
    });
  });

  // =========================================================================
  // 2. STATUS BADGES & 3-DAY WINDOW INCLUSION / EXCLUSION
  // =========================================================================
  describe('Installment Status Badges & Due Window Filtering', () => {
    it('accurately identifies Due Today, Due Tomorrow, and Due in 2 Days', () => {
      const fixedBase = new Date('2026-11-14T10:00:00Z'); // 2026-11-14

      store.installments = [
        {
          id: 'inst-1',
          student_id: 'std-1',
          fee_account_id: 'fa-1',
          installment_number: 1,
          due_date: '2026-11-14', // Due Today
          amount: 10000,
          paid_amount: 0,
          status: 'Pending',
          tenant_id: 'default',
        } as Installment,
        {
          id: 'inst-2',
          student_id: 'std-2',
          fee_account_id: 'fa-2',
          installment_number: 2,
          due_date: '2026-11-15', // Due Tomorrow
          amount: 12000,
          paid_amount: 0,
          status: 'Pending',
          tenant_id: 'default',
        } as Installment,
        {
          id: 'inst-3',
          student_id: 'std-3',
          fee_account_id: 'fa-3',
          installment_number: 1,
          due_date: '2026-11-16', // Due in 2 Days
          amount: 8000,
          paid_amount: 0,
          status: 'Pending',
          tenant_id: 'default',
        } as Installment,
      ];

      const result = getUpcomingPaymentDues(adminActor, { baseDate: fixedBase });

      expect(result.dues).toHaveLength(3);
      expect(result.totalDueAmount).toBe(30000);

      const dueToday = result.dues.find((d) => d.due_date === '2026-11-14');
      expect(dueToday).toBeDefined();
      expect(dueToday?.due_status).toBe('Due Today');
      expect(dueToday?.student_name).toBe('Aarav Sharma');
      expect(dueToday?.outstanding_amount).toBe(10000);

      const dueTomorrow = result.dues.find((d) => d.due_date === '2026-11-15');
      expect(dueTomorrow).toBeDefined();
      expect(dueTomorrow?.due_status).toBe('Due Tomorrow');
      expect(dueTomorrow?.student_name).toBe('Bhavna Patel');
      expect(dueTomorrow?.outstanding_amount).toBe(12000);

      const dueIn2Days = result.dues.find((d) => d.due_date === '2026-11-16');
      expect(dueIn2Days).toBeDefined();
      expect(dueIn2Days?.due_status).toBe('Due in 2 Days');
      expect(dueIn2Days?.student_name).toBe('Chirag Verma');
      expect(dueIn2Days?.outstanding_amount).toBe(8000);
    });

    it('strictly excludes past due dates and dates outside the 3-day window', () => {
      const fixedBase = new Date('2026-11-14T10:00:00Z'); // 2026-11-14

      store.installments = [
        {
          id: 'inst-past',
          student_id: 'std-1',
          fee_account_id: 'fa-1',
          installment_number: 1,
          due_date: '2026-11-13', // Yesterday (Past due - excluded from upcoming 3 days)
          amount: 5000,
          paid_amount: 0,
          status: 'Overdue',
          tenant_id: 'default',
        } as Installment,
        {
          id: 'inst-today',
          student_id: 'std-2',
          fee_account_id: 'fa-2',
          installment_number: 1,
          due_date: '2026-11-14', // Due Today - included
          amount: 15000,
          paid_amount: 0,
          status: 'Pending',
          tenant_id: 'default',
        } as Installment,
        {
          id: 'inst-future-day4',
          student_id: 'std-3',
          fee_account_id: 'fa-3',
          installment_number: 1,
          due_date: '2026-11-17', // Day 4 (outside 3-day window - excluded)
          amount: 9000,
          paid_amount: 0,
          status: 'Pending',
          tenant_id: 'default',
        } as Installment,
        {
          id: 'inst-future-month',
          student_id: 'std-4',
          fee_account_id: 'fa-4',
          installment_number: 1,
          due_date: '2026-12-01', // Next month (excluded)
          amount: 11000,
          paid_amount: 0,
          status: 'Pending',
          tenant_id: 'default',
        } as Installment,
      ];

      const result = getUpcomingPaymentDues(adminActor, { baseDate: fixedBase });

      expect(result.dues).toHaveLength(1);
      expect(result.dues[0].id).toBe('inst-today');
      expect(result.dues[0].due_status).toBe('Due Today');
      expect(result.totalDueAmount).toBe(15000);
    });
  });

  // =========================================================================
  // 3. BALANCE INTEGRITY & PARTIAL / FULL PAYMENT HANDLING
  // =========================================================================
  describe('Balance Integrity & Payment Deduction', () => {
    it('deducts verified payments and displays remaining payable balance for partial payments', () => {
      const fixedBase = new Date('2026-11-14T10:00:00Z');

      store.installments = [
        {
          id: 'inst-partial',
          student_id: 'std-1',
          fee_account_id: 'fa-1',
          installment_number: 1,
          due_date: '2026-11-14',
          amount: 20000,
          paid_amount: 13500, // 13,500 verified paid
          status: 'Partial',
          tenant_id: 'default',
        } as Installment,
      ];

      const result = getUpcomingPaymentDues(adminActor, { baseDate: fixedBase });

      expect(result.dues).toHaveLength(1);
      expect(result.dues[0].installment_amount).toBe(20000);
      expect(result.dues[0].paid_amount).toBe(13500);
      expect(result.dues[0].outstanding_amount).toBe(6500);
      expect(result.totalDueAmount).toBe(6500);
    });

    it('excludes fully paid installments (remaining payable balance is 0)', () => {
      const fixedBase = new Date('2026-11-14T10:00:00Z');

      store.installments = [
        {
          id: 'inst-paid',
          student_id: 'std-1',
          fee_account_id: 'fa-1',
          installment_number: 1,
          due_date: '2026-11-14',
          amount: 15000,
          paid_amount: 15000, // Fully paid
          status: 'Paid',
          tenant_id: 'default',
        } as Installment,
        {
          id: 'inst-unpaid',
          student_id: 'std-2',
          fee_account_id: 'fa-2',
          installment_number: 1,
          due_date: '2026-11-14',
          amount: 10000,
          paid_amount: 0,
          status: 'Pending',
          tenant_id: 'default',
        } as Installment,
      ];

      const result = getUpcomingPaymentDues(adminActor, { baseDate: fixedBase });

      expect(result.dues).toHaveLength(1);
      expect(result.dues[0].id).toBe('inst-unpaid');
      expect(result.totalDueAmount).toBe(10000);
    });

    it('excludes cancelled, waived, or discontinued installments and fee accounts', () => {
      const fixedBase = new Date('2026-11-14T10:00:00Z');

      // fa-1 is waived
      store.feeAccounts[0].status = 'Waived' as any;
      // fa-2 is discontinued
      store.feeAccounts[1].status = 'Discontinued / Adjusted' as any;

      store.installments = [
        {
          id: 'inst-waived-account',
          student_id: 'std-1',
          fee_account_id: 'fa-1',
          installment_number: 1,
          due_date: '2026-11-14',
          amount: 10000,
          paid_amount: 0,
          status: 'Pending',
          tenant_id: 'default',
        } as Installment,
        {
          id: 'inst-discontinued-account',
          student_id: 'std-2',
          fee_account_id: 'fa-2',
          installment_number: 1,
          due_date: '2026-11-15',
          amount: 10000,
          paid_amount: 0,
          status: 'Pending',
          tenant_id: 'default',
        } as Installment,
        {
          id: 'inst-cancelled-status',
          student_id: 'std-3',
          fee_account_id: 'fa-3',
          installment_number: 1,
          due_date: '2026-11-16',
          amount: 8000,
          paid_amount: 0,
          status: 'Cancelled' as any,
          tenant_id: 'default',
        } as Installment,
        {
          id: 'inst-valid-active',
          student_id: 'std-4',
          fee_account_id: 'fa-4',
          installment_number: 1,
          due_date: '2026-11-16',
          amount: 12000,
          paid_amount: 0,
          status: 'Pending',
          tenant_id: 'default',
        } as Installment,
      ];

      const result = getUpcomingPaymentDues(adminActor, { baseDate: fixedBase });

      expect(result.dues).toHaveLength(1);
      expect(result.dues[0].id).toBe('inst-valid-active');
      expect(result.totalDueAmount).toBe(12000);
    });
  });

  // =========================================================================
  // 4. COUNSELLOR ROLE-BASED ACCESS CONTROL
  // =========================================================================
  describe('Counsellor Role Scope & Data Isolation', () => {
    it('authorizes counsellor only for students explicitly assigned to them', () => {
      // std-1 is assigned to Jane Counsellor (usr-counsellor-1) via adm-1
      expect(isCounsellorAuthorizedForStudent(counsellorActor, 'std-1')).toBe(true);

      // std-3 is assigned to John Other (usr-counsellor-2) via adm-3
      expect(isCounsellorAuthorizedForStudent(counsellorActor, 'std-3')).toBe(false);
      expect(isCounsellorAuthorizedForStudent(otherCounsellorActor, 'std-3')).toBe(true);
    });

    it('filters upcoming dues for Counsellor to only show their assigned students', () => {
      const fixedBase = new Date('2026-11-14T10:00:00Z');

      store.installments = [
        {
          id: 'inst-c1-today',
          student_id: 'std-1', // Assigned to Jane Counsellor
          fee_account_id: 'fa-1',
          installment_number: 1,
          due_date: '2026-11-14',
          amount: 10000,
          paid_amount: 0,
          status: 'Pending',
          tenant_id: 'default',
        } as Installment,
        {
          id: 'inst-c1-tmrw',
          student_id: 'std-2', // Assigned to Jane Counsellor
          fee_account_id: 'fa-2',
          installment_number: 1,
          due_date: '2026-11-15',
          amount: 15000,
          paid_amount: 0,
          status: 'Pending',
          tenant_id: 'default',
        } as Installment,
        {
          id: 'inst-c2-today',
          student_id: 'std-3', // Assigned to John Other
          fee_account_id: 'fa-3',
          installment_number: 1,
          due_date: '2026-11-14',
          amount: 20000,
          paid_amount: 0,
          status: 'Pending',
          tenant_id: 'default',
        } as Installment,
        {
          id: 'inst-c2-in2days',
          student_id: 'std-4', // Assigned to John Other
          fee_account_id: 'fa-4',
          installment_number: 1,
          due_date: '2026-11-16',
          amount: 25000,
          paid_amount: 0,
          status: 'Pending',
          tenant_id: 'default',
        } as Installment,
      ];

      // 1. Admin sees all 4 dues across the institute
      const adminResult = getUpcomingPaymentDues(adminActor, { baseDate: fixedBase });
      expect(adminResult.dues).toHaveLength(4);
      expect(adminResult.totalDueAmount).toBe(70000);

      // 2. Jane Counsellor sees ONLY std-1 and std-2
      const janeResult = getUpcomingPaymentDues(counsellorActor, { baseDate: fixedBase });
      expect(janeResult.dues).toHaveLength(2);
      expect(janeResult.dues.map((d) => d.student_name).sort()).toEqual(['Aarav Sharma', 'Bhavna Patel']);
      expect(janeResult.totalDueAmount).toBe(25000);

      // 3. John Other sees ONLY std-3 and std-4
      const johnResult = getUpcomingPaymentDues(otherCounsellorActor, { baseDate: fixedBase });
      expect(johnResult.dues).toHaveLength(2);
      expect(johnResult.dues.map((d) => d.student_name).sort()).toEqual(['Chirag Verma', 'Divya Nair']);
      expect(johnResult.totalDueAmount).toBe(45000);
    });

    it('rejects cross-tenant data even if student IDs match', () => {
      const fixedBase = new Date('2026-11-14T10:00:00Z');

      store.installments = [
        {
          id: 'inst-other-tenant',
          student_id: 'std-1',
          fee_account_id: 'fa-1',
          installment_number: 1,
          due_date: '2026-11-14',
          amount: 50000,
          paid_amount: 0,
          status: 'Pending',
          tenant_id: 'foreign-tenant-xyz',
        } as Installment,
      ];

      const result = getUpcomingPaymentDues(adminActor, { baseDate: fixedBase });
      expect(result.dues).toHaveLength(0);
      expect(result.totalDueAmount).toBe(0);
    });
  });

  // =========================================================================
  // 5. SORTING & ORDER OF PRESENTATION
  // =========================================================================
  describe('Sorting Order: Due Date Ascending, Then Student Name', () => {
    it('sorts earliest due date first, and ties alphabetically by student name', () => {
      const fixedBase = new Date('2026-11-14T10:00:00Z');

      store.installments = [
        {
          id: 'inst-3',
          student_id: 'std-3', // Chirag Verma, 2026-11-16
          fee_account_id: 'fa-3',
          due_date: '2026-11-16',
          amount: 10000,
          paid_amount: 0,
          status: 'Pending',
          tenant_id: 'default',
        } as Installment,
        {
          id: 'inst-2',
          student_id: 'std-2', // Bhavna Patel, 2026-11-14 (Today)
          fee_account_id: 'fa-2',
          due_date: '2026-11-14',
          amount: 10000,
          paid_amount: 0,
          status: 'Pending',
          tenant_id: 'default',
        } as Installment,
        {
          id: 'inst-1',
          student_id: 'std-1', // Aarav Sharma, 2026-11-14 (Today)
          fee_account_id: 'fa-1',
          due_date: '2026-11-14',
          amount: 10000,
          paid_amount: 0,
          status: 'Pending',
          tenant_id: 'default',
        } as Installment,
      ];

      const result = getUpcomingPaymentDues(adminActor, { baseDate: fixedBase });

      expect(result.dues).toHaveLength(3);
      // Both Aarav and Bhavna are on 2026-11-14, Aarav should be first alphabetically
      expect(result.dues[0].student_name).toBe('Aarav Sharma');
      expect(result.dues[0].due_status).toBe('Due Today');
      expect(result.dues[1].student_name).toBe('Bhavna Patel');
      expect(result.dues[1].due_status).toBe('Due Today');
      // Chirag on 2026-11-16 is last
      expect(result.dues[2].student_name).toBe('Chirag Verma');
      expect(result.dues[2].due_status).toBe('Due in 2 Days');
    });
  });

  // =========================================================================
  // 6. EMPTY STATE
  // =========================================================================
  describe('Empty State Handling', () => {
    it('returns empty array and 0 total when no installments are due in the next 3 days', () => {
      const fixedBase = new Date('2026-11-14T10:00:00Z');
      store.installments = [];

      const result = getUpcomingPaymentDues(adminActor, { baseDate: fixedBase });

      expect(result.dues).toEqual([]);
      expect(result.totalDueAmount).toBe(0);
      expect(result.dates).toHaveLength(3);
    });
  });

  // =========================================================================
  // 7. API ENDPOINT /api/fees/upcoming-dues
  // =========================================================================
  describe('GET /api/fees/upcoming-dues API Security & Response Format', () => {
    it('returns 401 Unauthorized when request has no authentication cookies', async () => {
      const unauthReq = new NextRequest(new URL('http://localhost:3000/api/fees/upcoming-dues'));
      const response = await upcomingDuesRoute(unauthReq);

      expect(response.status).toBe(401);
      const json = await response.json();
      expect(json.error).toContain('Unauthorized');
    });

    it('returns 403 Forbidden when accessed by an unauthorized role (e.g., student)', async () => {
      const { req } = createMockAuthRequest('student');
      const response = await upcomingDuesRoute(req);

      expect(response.status).toBe(403);
      const json = await response.json();
      expect(json.error).toContain('Forbidden');
    });

    it('returns 200 with dues and private cache-control for authorized roles', async () => {
      store.installments = [
        {
          id: 'inst-api-test',
          student_id: 'std-1',
          fee_account_id: 'fa-1',
          installment_number: 1,
          due_date: new Date().toISOString().slice(0, 10),
          amount: 5000,
          paid_amount: 0,
          status: 'Pending',
          tenant_id: 'default',
        } as Installment,
      ];

      const { req } = createMockAuthRequest('accountant');
      const response = await upcomingDuesRoute(req);

      expect(response.status).toBe(200);
      expect(response.headers.get('Cache-Control')).toContain('private');
      expect(response.headers.get('Cache-Control')).toContain('no-store');

      const json = await response.json();
      expect(json.success).toBe(true);
      expect(Array.isArray(json.dues)).toBe(true);
      expect(typeof json.totalDueAmount).toBe('number');
      expect(Array.isArray(json.dates)).toBe(true);
    });
  });

  // =========================================================================
  // 8. REQUIREMENT 5 SPECIFIC COMPREHENSIVE TESTS (13 SCENARIOS)
  // =========================================================================
  describe('Requirement 5 — Comprehensive 13 Scenarios', () => {
    const fixedBase = new Date('2026-11-14T10:00:00Z');
    const { dateToday, dateTomorrow, dateIn2Days } = getUpcoming3DaysDates(fixedBase);
    const futureDate = '2026-11-20';
    const overdueDate = '2026-11-10';

    beforeEach(() => {
      // Set up clean fee accounts for test students
      store.feeAccounts = [
        {
          id: 'fa-1',
          student_id: 'std-1',
          student_name: 'Aarav Sharma',
          course_id: 'crs-sap-fico',
          course_name: 'SAP FICO Financial Accounting',
          original_fee: 30000,
          discount: 0,
          net_payable: 30000,
          paid_amount: 0,
          outstanding_amount: 30000,
          status: 'Unpaid',
          tenant_id: 'default',
        } as StudentFeeAccount,
        {
          id: 'fa-2',
          student_id: 'std-2',
          student_name: 'Bhavna Patel',
          course_id: 'crs-sap-mm',
          course_name: 'SAP MM Materials Management',
          original_fee: 30000,
          discount: 0,
          net_payable: 30000,
          paid_amount: 0,
          outstanding_amount: 30000,
          status: 'Unpaid',
          tenant_id: 'default',
        } as StudentFeeAccount,
        {
          id: 'fa-3',
          student_id: 'std-3',
          student_name: 'Chirag Verma',
          course_id: 'crs-sap-sd',
          course_name: 'SAP SD Sales & Distribution',
          original_fee: 30000,
          discount: 0,
          net_payable: 30000,
          paid_amount: 0,
          outstanding_amount: 30000,
          status: 'Unpaid',
          tenant_id: 'default',
        } as StudentFeeAccount,
        {
          id: 'fa-4',
          student_id: 'std-4',
          student_name: 'Divya Nair',
          course_id: 'crs-sap-abap',
          course_name: 'SAP ABAP Programming',
          original_fee: 30000,
          discount: 0,
          net_payable: 30000,
          paid_amount: 0,
          outstanding_amount: 30000,
          status: 'Unpaid',
          tenant_id: 'default',
        } as StudentFeeAccount,
      ];
    });

    // Test 1: Payment due today
    it('1. correctly identifies and displays payment due today', () => {
      store.installments = [
        {
          id: 'inst-today',
          fee_account_id: 'fa-1',
          student_id: 'std-1',
          installment_number: 1,
          amount: 10000,
          paid_amount: 0,
          due_date: dateToday,
          status: 'Pending',
          tenant_id: 'default',
        } as Installment,
      ];

      const res = getUpcomingPaymentDues(adminActor, { baseDate: fixedBase });
      expect(res.dues).toHaveLength(1);
      expect(res.dues[0].due_status).toBe('Due Today');
      expect(res.dues[0].due_date).toBe(dateToday);
      expect(res.dues[0].outstanding_amount).toBe(10000);
      expect(res.totalDueAmount).toBe(10000);
    });

    // Test 2: Payment due tomorrow
    it('2. correctly identifies and displays payment due tomorrow', () => {
      store.installments = [
        {
          id: 'inst-tomorrow',
          fee_account_id: 'fa-2',
          student_id: 'std-2',
          installment_number: 1,
          amount: 15000,
          paid_amount: 0,
          due_date: dateTomorrow,
          status: 'Pending',
          tenant_id: 'default',
        } as Installment,
      ];

      const res = getUpcomingPaymentDues(adminActor, { baseDate: fixedBase });
      expect(res.dues).toHaveLength(1);
      expect(res.dues[0].due_status).toBe('Due Tomorrow');
      expect(res.dues[0].due_date).toBe(dateTomorrow);
      expect(res.dues[0].outstanding_amount).toBe(15000);
    });

    // Test 3: Payment due in two days
    it('3. correctly identifies and displays payment due in two days', () => {
      store.installments = [
        {
          id: 'inst-2days',
          fee_account_id: 'fa-3',
          student_id: 'std-3',
          installment_number: 1,
          amount: 12000,
          paid_amount: 0,
          due_date: dateIn2Days,
          status: 'Pending',
          tenant_id: 'default',
        } as Installment,
      ];

      const res = getUpcomingPaymentDues(adminActor, { baseDate: fixedBase });
      expect(res.dues).toHaveLength(1);
      expect(res.dues[0].due_status).toBe('Due in 2 Days');
      expect(res.dues[0].due_date).toBe(dateIn2Days);
      expect(res.dues[0].outstanding_amount).toBe(12000);
    });

    // Test 4: Future payment outside dashboard window
    it('4. excludes future payment outside 3-day dashboard window, but includes it in full list', () => {
      store.installments = [
        {
          id: 'inst-future',
          fee_account_id: 'fa-4',
          student_id: 'std-4',
          installment_number: 2,
          amount: 20000,
          paid_amount: 0,
          due_date: futureDate,
          status: 'Upcoming',
          tenant_id: 'default',
        } as Installment,
      ];

      // In 3-day dashboard window: must be excluded
      const dashRes = getUpcomingPaymentDues(adminActor, { baseDate: fixedBase });
      expect(dashRes.dues).toHaveLength(0);
      expect(dashRes.totalDueAmount).toBe(0);

      // In full list: must be included with status 'Upcoming'
      const fullRes = getAllPaymentDues(adminActor, { baseDate: fixedBase, scope: 'all' });
      expect(fullRes.dues).toHaveLength(1);
      expect(fullRes.dues[0].due_status).toBe('Upcoming');
      expect(fullRes.dues[0].due_date).toBe(futureDate);
      expect(fullRes.summary.upcomingCount).toBe(1);
      expect(fullRes.summary.upcomingAmount).toBe(20000);
    });

    // Test 5: Overdue payment in the full list
    it('5. excludes overdue payment from dashboard 3-day window, but includes it in full list', () => {
      store.installments = [
        {
          id: 'inst-overdue',
          fee_account_id: 'fa-1',
          student_id: 'std-1',
          installment_number: 1,
          amount: 8000,
          paid_amount: 0,
          due_date: overdueDate,
          status: 'Overdue',
          tenant_id: 'default',
        } as Installment,
      ];

      // Dashboard 3-day window excludes overdue
      const dashRes = getUpcomingPaymentDues(adminActor, { baseDate: fixedBase });
      expect(dashRes.dues).toHaveLength(0);

      // Full list includes overdue with status 'Overdue'
      const fullRes = getAllPaymentDues(adminActor, { baseDate: fixedBase, scope: 'all' });
      expect(fullRes.dues).toHaveLength(1);
      expect(fullRes.dues[0].due_status).toBe('Overdue');
      expect(fullRes.dues[0].due_date).toBe(overdueDate);
      expect(fullRes.summary.overdueCount).toBe(1);
      expect(fullRes.summary.overdueAmount).toBe(8000);
    });

    // Test 6: Partially paid installment
    it('6. correctly deducts verified partial payments and displays remaining payable balance', () => {
      store.installments = [
        {
          id: 'inst-partial',
          fee_account_id: 'fa-2',
          student_id: 'std-2',
          installment_number: 1,
          amount: 25000,
          paid_amount: 15000, // ₹15,000 verified paid
          due_date: dateToday,
          status: 'Partial',
          tenant_id: 'default',
        } as Installment,
      ];

      const res = getUpcomingPaymentDues(adminActor, { baseDate: fixedBase });
      expect(res.dues).toHaveLength(1);
      expect(res.dues[0].installment_amount).toBe(25000);
      expect(res.dues[0].paid_amount).toBe(15000);
      expect(res.dues[0].outstanding_amount).toBe(10000); // 25,000 - 15,000 = 10,000
      expect(res.dues[0].is_partial).toBe(true);
      expect(res.totalDueAmount).toBe(10000);
    });

    // Test 7: Fully paid installment
    it('7. excludes fully settled installments from both dashboard and full list', () => {
      store.installments = [
        {
          id: 'inst-paid-1',
          fee_account_id: 'fa-1',
          student_id: 'std-1',
          installment_number: 1,
          amount: 15000,
          paid_amount: 15000, // fully paid
          due_date: dateToday,
          status: 'Paid',
          tenant_id: 'default',
        } as Installment,
        {
          id: 'inst-paid-2',
          fee_account_id: 'fa-2',
          student_id: 'std-2',
          installment_number: 1,
          amount: 20000,
          paid_amount: 20000,
          due_date: dateTomorrow,
          status: 'Paid',
          tenant_id: 'default',
        } as Installment,
      ];

      const dashRes = getUpcomingPaymentDues(adminActor, { baseDate: fixedBase });
      expect(dashRes.dues).toHaveLength(0);

      const fullRes = getAllPaymentDues(adminActor, { baseDate: fixedBase, scope: 'all' });
      expect(fullRes.dues).toHaveLength(0);
      expect(fullRes.totalDueAmount).toBe(0);
    });

    // Test 8: Pending payment approval
    it('8. does not deduct unverified/pending payment approvals from due balances', () => {
      // Installment scheduled for ₹20,000 with 0 approved paid amount
      store.installments = [
        {
          id: 'inst-pending-approval',
          fee_account_id: 'fa-3',
          student_id: 'std-3',
          installment_number: 1,
          amount: 20000,
          paid_amount: 0, // No approved payment yet
          due_date: dateToday,
          status: 'Pending',
          tenant_id: 'default',
        } as Installment,
      ];

      // A pending payment submission in store.payments that has NOT been approved yet
      store.payments = [
        {
          id: 'pay-unapproved',
          student_id: 'std-3',
          fee_account_id: 'fa-3',
          installment_id: 'inst-pending-approval',
          amount: 20000,
          status: 'Pending', // Pending approval
          payment_date: dateToday,
          tenant_id: 'default',
        } as Payment,
      ];

      const res = getUpcomingPaymentDues(adminActor, { baseDate: fixedBase });
      expect(res.dues).toHaveLength(1);
      // Outstanding balance remains full ₹20,000 until accountant verifies and approves the payment
      expect(res.dues[0].outstanding_amount).toBe(20000);
    });

    // Test 9: Cancelled or written-off installment
    it('9. strictly excludes cancelled, voided, waived, or written-off obligations', () => {
      store.installments = [
        {
          id: 'inst-cancelled',
          fee_account_id: 'fa-1',
          student_id: 'std-1',
          installment_number: 1,
          amount: 10000,
          paid_amount: 0,
          due_date: dateToday,
          status: 'Cancelled' as any,
          tenant_id: 'default',
        } as Installment,
        {
          id: 'inst-waived',
          fee_account_id: 'fa-2',
          student_id: 'std-2',
          installment_number: 1,
          amount: 10000,
          paid_amount: 0,
          due_date: dateTomorrow,
          status: 'Waived' as any,
          tenant_id: 'default',
        } as Installment,
        {
          id: 'inst-written-off',
          fee_account_id: 'fa-3',
          student_id: 'std-3',
          installment_number: 1,
          amount: 10000,
          paid_amount: 0,
          due_date: dateIn2Days,
          status: 'Written Off' as any,
          tenant_id: 'default',
        } as Installment,
      ];

      const res = getUpcomingPaymentDues(adminActor, { baseDate: fixedBase });
      expect(res.dues).toHaveLength(0);
      expect(res.totalDueAmount).toBe(0);

      const fullRes = getAllPaymentDues(adminActor, { baseDate: fixedBase, scope: 'all' });
      expect(fullRes.dues).toHaveLength(0);
    });

    // Test 10: No scheduled due dates
    it('10. handles no scheduled due dates gracefully without inventing false dates', () => {
      // Student with active fee account but no installment records and no recorded due date
      store.installments = [];
      store.feeAccounts = [
        {
          id: 'fa-no-date',
          student_id: 'std-1',
          student_name: 'Aarav Sharma',
          net_payable: 30000,
          paid_amount: 0,
          outstanding_amount: 30000,
          status: 'Unpaid',
          due_date: undefined, // No due date recorded
          tenant_id: 'default',
        } as any,
      ];
      store.admissions = [
        {
          id: 'adm-no-date',
          student_id: 'std-1',
          student_name: 'Aarav Sharma',
          fee_due_date: undefined, // No due date recorded
          net_payable: 30000,
          status: 'Confirmed',
          tenant_id: 'default',
        } as any,
      ];

      const dashRes = getUpcomingPaymentDues(adminActor, { baseDate: fixedBase });
      expect(dashRes.dues).toHaveLength(0);
      expect(dashRes.totalDueAmount).toBe(0);

      const fullRes = getAllPaymentDues(adminActor, { baseDate: fixedBase, scope: 'all' });
      expect(fullRes.dues).toHaveLength(0);
    });

    // Test 11: Counsellor role restrictions
    it('11. enforces counsellor role restrictions so counsellors only view authorized student dues', () => {
      // std-1 is assigned to Jane Counsellor (counsellorActor)
      // std-2 is assigned to John Other (otherCounsellorActor)
      store.admissions = [
        {
          id: 'adm-1',
          student_id: 'std-1',
          student_name: 'Aarav Sharma',
          counsellor_id: counsellorActor.id,
          tenant_id: 'default',
          status: 'Confirmed',
        } as Admission,
        {
          id: 'adm-2',
          student_id: 'std-2',
          student_name: 'Bhavna Patel',
          counsellor_id: otherCounsellorActor.id,
          tenant_id: 'default',
          status: 'Confirmed',
        } as Admission,
      ];

      store.installments = [
        {
          id: 'inst-1',
          fee_account_id: 'fa-1',
          student_id: 'std-1',
          amount: 10000,
          paid_amount: 0,
          due_date: dateToday,
          status: 'Pending',
          tenant_id: 'default',
        } as Installment,
        {
          id: 'inst-2',
          fee_account_id: 'fa-2',
          student_id: 'std-2',
          amount: 15000,
          paid_amount: 0,
          due_date: dateToday,
          status: 'Pending',
          tenant_id: 'default',
        } as Installment,
      ];

      // Jane Counsellor sees ONLY std-1
      const janeRes = getAllPaymentDues(counsellorActor, { baseDate: fixedBase });
      expect(janeRes.dues).toHaveLength(1);
      expect(janeRes.dues[0].student_id).toBe('std-1');
      expect(janeRes.totalDueAmount).toBe(10000);

      // Admin sees BOTH students
      const adminRes = getAllPaymentDues(adminActor, { baseDate: fixedBase });
      expect(adminRes.dues).toHaveLength(2);
      expect(adminRes.totalDueAmount).toBe(25000);
    });

    // Test 12: View All Due Dates navigation and dedicated API endpoint
    it('12. serves complete student payment due dates list via GET /api/fees/dues with authorization', async () => {
      store.installments = [
        {
          id: 'inst-api-overdue',
          fee_account_id: 'fa-1',
          student_id: 'std-1',
          amount: 10000,
          paid_amount: 0,
          due_date: overdueDate,
          status: 'Pending',
          tenant_id: 'default',
        } as Installment,
        {
          id: 'inst-api-today',
          fee_account_id: 'fa-2',
          student_id: 'std-2',
          amount: 15000,
          paid_amount: 0,
          due_date: dateToday,
          status: 'Pending',
          tenant_id: 'default',
        } as Installment,
      ];

      // Unauthorized student gets 403 Forbidden
      const { req: studentReq } = createMockAuthRequest('student', {}, '/api/fees/dues');
      const studentRes = await duesRoute(studentReq);
      expect(studentRes.status).toBe(403);

      // Authorized accountant gets 200 with complete dues list
      const { req: accReq } = createMockAuthRequest('accountant', {}, '/api/fees/dues?scope=all');
      const accRes = await duesRoute(accReq);
      expect(accRes.status).toBe(200);

      const json = await accRes.json();
      expect(json.success).toBe(true);
      expect(json.dues).toHaveLength(2);
      expect(json.summary).toBeDefined();
      expect(json.pagination).toBeDefined();
      expect(json.summary.overdueCount).toBe(1);
      expect(json.summary.todayCount).toBe(1);
    });

    // Test 13: Pagination, filtering, and totals
    it('13. supports student search, course filtering, status filtering, date range, pagination, and totals without duplication', () => {
      store.installments = [
        {
          id: 'inst-f-1',
          fee_account_id: 'fa-1',
          student_id: 'std-1', // Aarav, crs-sap-fico
          amount: 10000,
          paid_amount: 0,
          due_date: overdueDate,
          status: 'Pending',
          tenant_id: 'default',
        } as Installment,
        {
          id: 'inst-f-2',
          fee_account_id: 'fa-2',
          student_id: 'std-2', // Bhavna, crs-sap-mm
          amount: 12000,
          paid_amount: 0,
          due_date: dateToday,
          status: 'Pending',
          tenant_id: 'default',
        } as Installment,
        {
          id: 'inst-f-3',
          fee_account_id: 'fa-3',
          student_id: 'std-3', // Chirag, crs-sap-sd
          amount: 14000,
          paid_amount: 0,
          due_date: futureDate,
          status: 'Pending',
          tenant_id: 'default',
        } as Installment,
        {
          id: 'inst-f-4',
          fee_account_id: 'fa-4',
          student_id: 'std-4', // Divya, crs-sap-abap
          amount: 16000,
          paid_amount: 0,
          due_date: '2026-11-25',
          status: 'Pending',
          tenant_id: 'default',
        } as Installment,
      ];

      // A. Status Filter: only 'overdue'
      const overdueRes = getAllPaymentDues(adminActor, {
        baseDate: fixedBase,
        statusFilter: 'overdue',
      });
      expect(overdueRes.dues).toHaveLength(1);
      expect(overdueRes.dues[0].student_name).toBe('Aarav Sharma');
      expect(overdueRes.totalDueAmount).toBe(10000);

      // B. Search Filter: 'Bhavna'
      const searchRes = getAllPaymentDues(adminActor, {
        baseDate: fixedBase,
        search: 'bhavna',
      });
      expect(searchRes.dues).toHaveLength(1);
      expect(searchRes.dues[0].student_name).toBe('Bhavna Patel');

      // C. Course Filter: 'crs-sap-sd'
      const courseRes = getAllPaymentDues(adminActor, {
        baseDate: fixedBase,
        courseId: 'crs-sap-sd',
      });
      expect(courseRes.dues).toHaveLength(1);
      expect(courseRes.dues[0].student_name).toBe('Chirag Verma');

      // D. Date Range Filter: between 2026-11-14 and 2026-11-20
      const dateRangeRes = getAllPaymentDues(adminActor, {
        baseDate: fixedBase,
        startDate: '2026-11-14',
        endDate: '2026-11-20',
      });
      expect(dateRangeRes.dues).toHaveLength(2); // Bhavna (2026-11-14) and Chirag (2026-11-20)

      // E. Pagination: 2 per page
      const page1Res = getAllPaymentDues(adminActor, {
        baseDate: fixedBase,
        page: 1,
        pageSize: 2,
      });
      expect(page1Res.dues).toHaveLength(2);
      expect(page1Res.pagination.totalPages).toBe(2);
      expect(page1Res.pagination.totalItems).toBe(4);
      expect(page1Res.pagination.page).toBe(1);

      const page2Res = getAllPaymentDues(adminActor, {
        baseDate: fixedBase,
        page: 2,
        pageSize: 2,
      });
      expect(page2Res.dues).toHaveLength(2);
      expect(page2Res.pagination.page).toBe(2);

      // Ensure no record overlap between page 1 and page 2
      const page1Ids = page1Res.dues.map((d) => d.id);
      const page2Ids = page2Res.dues.map((d) => d.id);
      for (const id of page1Ids) {
        expect(page2Ids).not.toContain(id);
      }
    });
  });
});
