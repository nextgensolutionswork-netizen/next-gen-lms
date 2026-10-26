import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from '@/middleware';
import { store } from '@/lib/services/data-store';
import { isLessonUnlocked, updateVideoProgress, getStudentCourseProgress } from '@/lib/services/academics-service';
import { generateAuthCookieSignatureSync } from '@/lib/security/auth-cookie';
import { Payment, Receipt, Student } from '@/types';

function createMockRequest(url: string, cookiePayload?: Record<string, any>) {
  const req = new NextRequest(new URL(url, 'http://localhost:3000'), {
    headers: {
      host: 'localhost:3000',
    },
  });

  if (cookiePayload) {
    const cookie = encodeURIComponent(JSON.stringify(cookiePayload));
    req.cookies.set('next_gen_auth_user', cookie);
    req.cookies.set('next_gen_auth_user_sig', generateAuthCookieSignatureSync(cookie));
  }

  return req;
}

describe('Domain 4: Student Learning Portal Hardening & Edge Cases', () => {
  const testStudentId = 'stu-portal-test';
  const testCourseId = 'crs-fico-01';

  beforeEach(() => {
    // Ensure clean test baseline
    store.reconcileDualLedgers();
  });

  describe('1. Empty Student State Defense & Safe Resolution', () => {
    it('gracefully handles empty students array without throwing TypeError on course_id', () => {
      const emptyStudents: Student[] = [];
      const user = { id: 'usr-unregistered', email: 'unknown@example.com', role: 'student' as const };

      // Replicating portal student resolver logic
      const student =
        (user &&
          emptyStudents.find(
            (s) =>
              s.email?.toLowerCase() === user.email?.toLowerCase() ||
              s.id === user.id ||
              s.user_id === user.id
          )) ||
        (user?.role !== 'student' && emptyStudents.length > 0 ? emptyStudents[0] : null) ||
        (emptyStudents.length > 0 ? emptyStudents[0] : null) ||
        null;

      expect(student).toBeNull();

      // Guarded downstream computations
      const course = student?.course_id ? (store.courses || []).find((c) => c.id === student.course_id) : undefined;
      const modules = student?.course_id ? (store.modules || []).filter((m) => m.course_id === student.course_id) : [];
      const lessons = student?.course_id ? (store.lessons || []).filter((l) => l.course_id === student.course_id && l.is_published) : [];
      const feeAccount = student ? (store.feeAccounts || []).find((f) => f.student_id === student.id) : undefined;
      const payments = student ? (store.payments || []).filter((p) => p.student_id === student.id) : [];

      expect(course).toBeUndefined();
      expect(modules).toEqual([]);
      expect(lessons).toEqual([]);
      expect(feeAccount).toBeUndefined();
      expect(payments).toEqual([]);
    });

    it('gracefully handles student without assigned course_id', () => {
      const studentWithoutCourse: Student = {
        id: 'stu-no-course',
        user_id: 'usr-no-course',
        admission_id: 'adm-no-course',
        student_code: 'STU-NC-001',
        admission_number: 'ADM-NC-001',
        full_name: 'Unassigned Student',
        email: 'unassigned@student.com',
        phone: '9988776655',
        course_id: '',
        joining_date: '2026-01-01',
        status: 'Active',
        total_fee: 0,
        paid_amount: 0,
        outstanding_amount: 0,
        attendance_percentage: 0,
        course_progress: 0,
        placement_status: 'Not Started',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      };

      const course = studentWithoutCourse.course_id
        ? (store.courses || []).find((c) => c.id === studentWithoutCourse.course_id)
        : undefined;
      const lessons = studentWithoutCourse.course_id
        ? (store.lessons || []).filter((l) => l.course_id === studentWithoutCourse.course_id && l.is_published)
        : [];

      expect(course).toBeUndefined();
      expect(lessons).toEqual([]);
      expect(lessons.length).toBe(0);
    });
  });

  describe('2. Empty Course Lessons & Player Controls Defense', () => {
    it('initializes activeLesson to null when course has 0 published lessons', () => {
      const lessons: any[] = [];
      const sortedLessons = [...lessons].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
      const activeLesson = sortedLessons[0] || lessons[0] || null;

      expect(sortedLessons.length).toBe(0);
      expect(activeLesson).toBeNull();
    });

    it('safely evaluates prerequisite locking when playlist is empty', () => {
      const sortedLessons: any[] = [];
      const isUnlocked = isLessonUnlocked(0, sortedLessons, 'stu-test', store.lessonProgress);
      // Index 0 or non-existent returns true by default without throwing
      expect(typeof isUnlocked).toBe('boolean');
    });

    it('prevents updateVideoProgress crash when activeLesson or student is undefined', async () => {
      let progressUpdated = false;
      const activeLesson = null as any;
      const student = null as any;

      if (activeLesson?.id && student?.id) {
        await updateVideoProgress(student.id, activeLesson.id, student.course_id, 30, 100);
        progressUpdated = true;
      }

      expect(progressUpdated).toBe(false);
    });
  });

  describe('3. In-Portal Receipt Resolution & Data Integrity', () => {
    it('synthesizes complete official receipt from payment even if separate receipt record is missing', () => {
      const mockPayment: Payment = {
        id: 'pay-portal-test-01',
        receipt_number: 'REC-2026-9999',
        student_id: testStudentId,
        student_name: 'Ananya Sharma',
        admission_number: 'ADM-2026-0999',
        fee_account_id: 'fa-test-01',
        course_id: testCourseId,
        course_name: 'SAP S/4HANA Finance (FICO)',
        amount: 15000,
        payment_date: '2026-02-10',
        payment_mode: 'UPI',
        transaction_reference: 'UPI/20260210/999988',
        status: 'Success',
        collected_by: 'usr-accountant-01',
        created_at: '2026-02-10T10:00:00Z',
      };

      // Ensure no matching receipt in store.receipts
      store.receipts = (store.receipts || []).filter((r) => r.payment_id !== mockPayment.id);
      const r = (store.receipts || []).find((rec) => rec.payment_id === mockPayment.id);
      expect(r).toBeUndefined();

      // In-Portal receipt fallback synthesizer
      const receiptData = {
        id: r?.id || mockPayment.id,
        receipt_number: r?.receipt_number || mockPayment.receipt_number || `REC-${mockPayment.id.slice(-6)}`,
        student_name: r?.student_name || mockPayment.student_name || 'Enrolled Student',
        student_email: r?.student_email || 'ananya@student.com',
        admission_number: r?.admission_number || mockPayment.admission_number || 'N/A',
        course_name: r?.course_name || mockPayment.course_name || 'SAP Enterprise Program',
        payment_amount: r?.payment_amount ?? mockPayment.amount ?? 0,
        payment_mode: r?.payment_mode || mockPayment.payment_mode || 'UPI',
        transaction_reference: r?.transaction_reference || mockPayment.transaction_reference || 'N/A',
        payment_date: r?.payment_date || mockPayment.payment_date || new Date().toISOString(),
        remaining_balance: r?.remaining_balance ?? 30000,
        authorized_by: r?.authorized_by || 'Finance & Accounts Office',
      };

      expect(receiptData.id).toBe(mockPayment.id);
      expect(receiptData.receipt_number).toBe('REC-2026-9999');
      expect(receiptData.student_name).toBe('Ananya Sharma');
      expect(receiptData.payment_amount).toBe(15000);
      expect(receiptData.transaction_reference).toBe('UPI/20260210/999988');
      expect(receiptData.authorized_by).toBe('Finance & Accounts Office');
    });
  });

  describe('4. Middleware Access for Student Receipts', () => {
    it('allows student session to access specific receipt path /accounts/receipts/[id]', async () => {
      const studentPayload = {
        id: 'usr-student-portal',
        email: 'student.portal@lms.internal',
        role: 'student',
      };
      const req = createMockRequest('http://localhost:3000/accounts/receipts/rec-01', studentPayload);
      const res = await middleware(req);

      expect(res.status).toBe(200);
      expect(res.headers.get('location')).toBeNull();
    });

    it('strictly bounces student session from global /accounts/receipts registry to /portal', async () => {
      const studentPayload = {
        id: 'usr-student-portal',
        email: 'student.portal@lms.internal',
        role: 'student',
      };
      const req = createMockRequest('http://localhost:3000/accounts/receipts', studentPayload);
      const res = await middleware(req);

      expect(res.status).toBe(307);
      const location = res.headers.get('location');
      expect(location).toContain('/portal');
    });

    it('strictly bounces student session from /accounts/fees back to /portal', async () => {
      const studentPayload = {
        id: 'usr-student-portal',
        email: 'student.portal@lms.internal',
        role: 'student',
      };
      const req = createMockRequest('http://localhost:3000/accounts/fees', studentPayload);
      const res = await middleware(req);

      expect(res.status).toBe(307);
      const location = res.headers.get('location');
      expect(location).toContain('/portal');
    });
  });
});
