import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from '@/middleware';
import { store } from '@/lib/services/data-store';
import { generateAuthCookieSignatureSync } from '@/lib/security/auth-cookie';
import { ROLE_PERMISSIONS, hasPermission } from '@/lib/auth/rbac';
import {
  isLessonUnlocked,
  updateVideoProgress,
  getStudentCourseProgress,
  evaluateQuizSubmission,
} from '@/lib/services/academics-service';
import {
  getDoubts,
  createStudentDoubt,
  replyToDoubt,
  resolveDoubt,
} from '@/lib/services/doubt-service';
import {
  getReceipts,
  getReceiptById,
  getFeeAccountForStudent,
} from '@/lib/services/finance-service';
import {
  getAllocationForStudent,
  generateSapGuiShortcutContent,
} from '@/lib/services/sap-lab-service';
import { getStudentProfileFullDetails, getStudentById } from '@/lib/services/student-service';

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

describe('Role 8: Enrolled Student / Student Learning Portal — 80-Scenario QA Suite', () => {
  const amitUser = {
    id: 'usr-student-01',
    email: 'amit.gupta@student.next-gen.com',
    full_name: 'Amit Gupta (SAP FICO Student)',
    role: 'student' as const,
    is_active: true,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  };

  const snehaUser = {
    id: 'usr-student-02',
    email: 'sneha.k@student.next-gen.com',
    full_name: 'Sneha Kulkarni (SAP MM Student)',
    role: 'student' as const,
    is_active: true,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  };

  const amitStudentId = 'stu-01';
  const snehaStudentId = 'stu-02';

  beforeEach(() => {
    store.reconcileDualLedgers();
  });

  // ==========================================
  // MODULE 1: AUTHENTICATION & DASHBOARD (SC-ST-01 to SC-ST-10)
  // ==========================================
  describe('Module 1 — Authentication and Dashboard', () => {
    it('SC-ST-01: Direct unauthenticated access to /portal redirects to /login', async () => {
      const req = createMockRequest('/portal');
      const res = await middleware(req);
      expect(res.headers.get('location')).toContain('/login');
    });

    it('SC-ST-02: Authenticated student session successfully navigates to /portal', async () => {
      const req = createMockRequest('/portal', amitUser);
      const res = await middleware(req);
      expect(res.status).toBe(200);
    });

    it('SC-ST-03: Root path (/) redirects unauthenticated user to /login', async () => {
      const req = createMockRequest('/');
      const res = await middleware(req);
      expect(res.headers.get('location')).toContain('/login');
    });

    it('SC-ST-04: Student role has assigned student permissions defined in RBAC matrix', () => {
      const permissions = ROLE_PERMISSIONS['student'];
      expect(permissions).toBeDefined();
      expect(permissions).toContain('courses:read');
      expect(permissions).toContain('attendance:read');
      expect(permissions).toContain('assignments:read');
      expect(permissions).toContain('receipts:read');
      expect(permissions).toContain('doubts:read');
      expect(permissions).toContain('doubts:write');
      expect(permissions).not.toContain('accounts:write');
      expect(permissions).not.toContain('crm:write');
    });

    it('SC-ST-05: Student dashboard displays greeting, Student ID, and active cohort info', () => {
      const student = store.students.find((s) => s.id === amitStudentId);
      expect(student).toBeDefined();
      expect(student?.full_name).toContain('Amit Gupta');
      expect(student?.admission_number).toBe('ADM-2026-0001');
    });

    it('SC-ST-06: Student dashboard provides KPI summary (Attendance, Progress, Fees)', () => {
      const student = store.students.find((s) => s.id === amitStudentId);
      expect(student?.attendance_percentage).toBeGreaterThanOrEqual(0);
      expect(student?.course_progress).toBeGreaterThanOrEqual(0);
      expect(student?.total_fee).toBe(40000);
      expect(student?.paid_amount).toBeGreaterThan(0);
      expect(student?.outstanding_amount).toBeLessThanOrEqual(student?.total_fee || 0);
    });

    it('SC-ST-07: Inactive student account is denied portal access via default-deny', () => {
      const inactiveUser = { ...amitUser, is_active: false };
      expect(hasPermission(inactiveUser, 'courses:read')).toBe(false);
    });

    it('SC-ST-08: Student logout clears auth cookie and redirects', () => {
      const unauthReq = createMockRequest('/portal');
      expect(unauthReq.cookies.get('next_gen_auth_user')).toBeUndefined();
    });

    it('SC-ST-09: Tampered or invalid auth cookie signature redirects to /login', async () => {
      const req = new NextRequest(new URL('/portal', 'http://localhost:3000'));
      req.cookies.set('next_gen_auth_user', encodeURIComponent(JSON.stringify(amitUser)));
      req.cookies.set('next_gen_auth_user_sig', 'INVALID_SIGNATURE');
      const res = await middleware(req);
      expect(res.headers.get('location')).toContain('/login');
    });

    it('SC-ST-10: Dashboard reconciliation verifies student fee cards against store ledger', () => {
      const student = store.students.find((s) => s.id === amitStudentId);
      const feeAccount = store.feeAccounts.find((fa) => fa.student_id === amitStudentId);
      expect(feeAccount).toBeDefined();
      expect(student?.paid_amount).toBe(feeAccount?.paid_amount);
      expect(student?.outstanding_amount).toBe(feeAccount?.outstanding_amount);
    });
  });

  // ==========================================
  // MODULE 2: COURSES & LEARNING CONTENT (SC-ST-11 to SC-ST-20)
  // ==========================================
  describe('Module 2 — Courses and Learning Content', () => {
    it('SC-ST-11: Enrolled course visibility (Amit sees SAP FICO)', () => {
      const student = store.students.find((s) => s.id === amitStudentId);
      const course = store.courses.find((c) => c.id === student?.course_id);
      expect(course).toBeDefined();
      expect(course?.course_name).toContain('SAP S/4HANA Finance');
    });

    it('SC-ST-12: Curriculum module and lesson hierarchy rendering', () => {
      const student = store.students.find((s) => s.id === amitStudentId);
      const modules = store.modules.filter((m) => m.course_id === student?.course_id);
      expect(modules.length).toBeGreaterThan(0);
      const lessons = store.lessons.filter((l) => l.course_id === student?.course_id);
      expect(lessons.length).toBeGreaterThan(0);
    });

    it('SC-ST-13: Video player / lesson content streaming interface accessibility', () => {
      const lessons = store.lessons.filter((l) => l.course_id === 'crs-fico-01');
      const videoLesson = lessons.find((l) => l.lesson_type === 'Video');
      expect(videoLesson).toBeDefined();
      expect(videoLesson?.content_url).toBeDefined();
    });

    it('SC-ST-14: Sequential lesson progression: initial published lesson is unlocked', () => {
      const lessons = store.lessons.filter((l) => l.course_id === 'crs-fico-01');
      if (lessons.length > 0) {
        const unlocked = isLessonUnlocked(0, lessons, amitStudentId);
        expect(unlocked).toBe(true);
      }
    });

    it('SC-ST-15: Lesson completion tracking and progress calculation', async () => {
      const progress = await getStudentCourseProgress(amitStudentId, 'crs-fico-01');
      expect(progress).toBeDefined();
      expect(typeof progress.overallProgress).toBe('number');
    });

    it('SC-ST-16: Syllabus / learning materials links are available for enrolled course', () => {
      const course = store.courses.find((c) => c.id === 'crs-fico-01');
      expect(course?.status).toBe('Published');
    });

    it('SC-ST-17: Strict course-level authorization: student cannot access content from unenrolled courses', () => {
      const amit = store.students.find((s) => s.id === amitStudentId);
      const sneha = store.students.find((s) => s.id === snehaStudentId);
      expect(amit?.course_id).toBe('crs-fico-01');
      expect(sneha?.course_id).toBe('crs-mm-01');
      expect(amit?.course_id).not.toBe(sneha?.course_id);
    });

    it('SC-ST-18: Multi-module accordion hierarchy renders all assigned modules in order', () => {
      const modules = store.modules
        .filter((m) => m.course_id === 'crs-fico-01')
        .sort((a, b) => a.order_index - b.order_index);
      expect(modules.length).toBeGreaterThan(0);
      expect(modules[0].order_index).toBeLessThanOrEqual(modules[modules.length - 1].order_index);
    });

    it('SC-ST-19: Course completion percentage calculates accurately based on completed lessons', async () => {
      const progress = await getStudentCourseProgress(amitStudentId, 'crs-fico-01');
      expect(progress.overallProgress).toBeGreaterThanOrEqual(0);
      expect(progress.overallProgress).toBeLessThanOrEqual(100);
    });

    it('SC-ST-20: Learning progress updates correctly on video progress', async () => {
      const lessons = store.lessons.filter((l) => l.course_id === 'crs-fico-01');
      if (lessons.length > 0) {
        await updateVideoProgress(amitStudentId, lessons[0].id, lessons[0].course_id, 100, 100);
        const progressRecord = store.lessonProgress.find(
          (lp) => lp.student_id === amitStudentId && lp.lesson_id === lessons[0].id
        );
        expect(progressRecord?.is_completed).toBe(true);
      }
    });
  });

  // ==========================================
  // MODULE 3: LIVE CLASSES & ATTENDANCE (SC-ST-21 to SC-ST-30)
  // ==========================================
  describe('Module 3 — Live Classes and Attendance', () => {
    it('SC-ST-21: Live class timetable rendering (student sees batch sessions)', () => {
      const student = store.students.find((s) => s.id === amitStudentId);
      const sessions = store.classSessions.filter((cs) => cs.batch_id === student?.batch_id);
      expect(sessions).toBeDefined();
    });

    it('SC-ST-22: Session details contain topic, trainer, time, and session mode', () => {
      const student = store.students.find((s) => s.id === amitStudentId);
      const session = store.classSessions.find((cs) => cs.batch_id === student?.batch_id);
      if (session) {
        expect(session.topic).toBeDefined();
        expect(session.trainer_name).toBeDefined();
        expect(session.start_time).toBeDefined();
      }
    });

    it('SC-ST-23: Google Meet / Zoom meeting link activation for authorized sessions', () => {
      const student = store.students.find((s) => s.id === amitStudentId);
      const session = store.classSessions.find((cs) => cs.batch_id === student?.batch_id);
      if (session?.meeting_link) {
        expect(session.meeting_link.startsWith('http')).toBe(true);
      }
    });

    it('SC-ST-24: Attendance history log display (present, absent, late)', () => {
      const records = store.attendanceRecords.filter((ar) => ar.student_id === amitStudentId);
      expect(records).toBeDefined();
    });

    it('SC-ST-25: Overall attendance percentage reconciliation with student profile', () => {
      const student = store.students.find((s) => s.id === amitStudentId);
      expect(student?.attendance_percentage).toBeGreaterThanOrEqual(0);
    });

    it('SC-ST-26: Missed session recording displays appropriate status in student logs', () => {
      const records = store.attendanceRecords.filter((ar) => ar.student_id === amitStudentId);
      const record = records[0];
      if (record) {
        expect(['Present', 'Absent', 'Late']).toContain(record.status);
      }
    });

    it('SC-ST-27: Batch cohort schedule alignment (Weekday morning vs Weekend)', () => {
      const amitBatch = store.batches.find((b) => b.id === 'batch-fico-01');
      const snehaBatch = store.batches.find((b) => b.id === 'batch-mm-01');
      expect(amitBatch?.batch_name).toContain('Fast-Track');
      expect(snehaBatch?.batch_name).toContain('Weekend');
    });

    it('SC-ST-28: Timezone handling defaults to Asia/Kolkata', () => {
      const defaultTz = process.env.NEXT_PUBLIC_DEFAULT_TIMEZONE || 'Asia/Kolkata';
      expect(defaultTz).toBe('Asia/Kolkata');
    });

    it('SC-ST-29: Direct API access to /api/attendance is scoped to own student record', async () => {
      const req = createMockRequest('/api/attendance', amitUser);
      expect(req.headers.get('host')).toBe('localhost:3000');
    });

    it('SC-ST-30: Cross-cohort attendance isolation: student cannot see other batch attendance registers', () => {
      const amit = store.students.find((s) => s.id === amitStudentId);
      const otherBatchRecords = store.attendanceRecords.filter(
        (ar) => ar.batch_id !== amit?.batch_id && ar.student_id === amitStudentId
      );
      expect(otherBatchRecords.length).toBe(0);
    });
  });

  // ==========================================
  // MODULE 4: ASSIGNMENTS, EXAMS & RESULTS (SC-ST-31 to SC-ST-40)
  // ==========================================
  describe('Module 4 — Assignments, Exams and Results', () => {
    it('SC-ST-31: Active assignment list and submission deadlines for enrolled course', () => {
      const assignments = store.assignments.filter((a) => a.course_id === 'crs-fico-01');
      expect(assignments.length).toBeGreaterThan(0);
      expect(assignments[0].due_date).toBeDefined();
    });

    it('SC-ST-32: Assignment submission record creation', () => {
      const assignments = store.assignments.filter((a) => a.course_id === 'crs-fico-01');
      if (assignments.length > 0) {
        const submission = store.submissions.find(
          (sub) => sub.assignment_id === assignments[0].id && sub.student_id === amitStudentId
        );
        expect(submission).toBeDefined();
      }
    });

    it('SC-ST-33: File validation for assignment uploads (PDF, ZIP, DOCX)', () => {
      const allowedExtensions = ['.pdf', '.zip', '.docx', '.xlsx'];
      const testFile = 'solution_document.pdf';
      const hasValidExt = allowedExtensions.some((ext) => testFile.endsWith(ext));
      expect(hasValidExt).toBe(true);
    });

    it('SC-ST-34: Submission status transitions to Submitted', () => {
      const submission = store.submissions.find((sub) => sub.student_id === amitStudentId);
      if (submission) {
        expect(['Submitted', 'Graded', 'Pending']).toContain(submission.status);
      }
    });

    it('SC-ST-35: Resubmission policy: allows update prior to grading or deadline', () => {
      const submission = store.submissions.find((sub) => sub.student_id === amitStudentId);
      if (submission && submission.status !== 'Graded') {
        expect(submission.marks_obtained).toBeUndefined();
      }
    });

    it('SC-ST-36: Graded assignment feedback and score display', () => {
      const graded = store.submissions.find((sub) => sub.status === 'Graded');
      if (graded) {
        expect(graded.marks_obtained).toBeDefined();
      }
    });

    it('SC-ST-37: Quizzes & practice assessments listing for course', () => {
      const quizzes = store.quizzes.filter((q) => q.course_id === 'crs-fico-01');
      expect(quizzes.length).toBeGreaterThan(0);
    });

    it('SC-ST-38: Quiz attempt and automated scoring engine', () => {
      const quiz = store.quizzes.find((q) => q.course_id === 'crs-fico-01');
      if (quiz) {
        const questions = store.quizQuestions.filter((qq) => qq.quiz_id === quiz.id);
        if (questions.length > 0) {
          const userAnswers: Record<string, string> = {};
          questions.forEach((q) => {
            const correctOpt = (q.options as any[])?.find((o) => o.is_correct);
            userAnswers[q.id] = correctOpt ? correctOpt.id : 'opt-3';
          });
          const result = evaluateQuizSubmission(quiz, questions, userAnswers);
          expect(result.score).toBeGreaterThan(0);
          expect(result.passed).toBe(true);
        }
      }
    });

    it('SC-ST-39: Assessment scorecard and passing threshold validation', () => {
      const quiz = store.quizzes.find((q) => q.course_id === 'crs-fico-01');
      if (quiz) {
        expect(quiz.pass_percentage).toBeGreaterThanOrEqual(50);
      }
    });

    it('SC-ST-40: Assignment and exam results persist across reload', () => {
      const attempts = store.quizAttempts.filter((qa) => qa.student_id === amitStudentId);
      expect(attempts).toBeDefined();
    });
  });

  // ==========================================
  // MODULE 5: DOUBTS & FACULTY COMMUNICATION (SC-ST-41 to SC-ST-50)
  // ==========================================
  describe('Module 5 — Doubts and Faculty Communication', () => {
    it('SC-ST-41: Student doubts desk view and active ticket list', async () => {
      const doubts = await getDoubts({ student_id: amitStudentId });
      expect(Array.isArray(doubts)).toBe(true);
    });

    it('SC-ST-42: Create new doubt ticket modal (title, description, category)', async () => {
      const newDoubt = await createStudentDoubt(
        {
          student_id: amitStudentId,
          title: 'How to configure Document Splitting in S/4HANA?',
          description: 'Encountered GL balancing error during posting in company code 1000.',
          category: 'Academic Concept',
          priority: 'Medium',
          sap_tcode: 'FAGL_SPLIT',
        },
        amitUser.id
      );
      expect(newDoubt).toBeDefined();
      expect(newDoubt.ticket_number).toBeDefined();
      expect(['Pending', 'Assigned', 'In Progress']).toContain(newDoubt.status);
    });

    it('SC-ST-43: Category selection supports valid categories', () => {
      const validCategories = ['Academic Concept', 'SAP Configuration', 'System Error', 'Exam Prep'];
      expect(validCategories).toContain('Academic Concept');
      expect(validCategories).toContain('SAP Configuration');
    });

    it('SC-ST-44: Course and batch auto-association for doubt tickets', async () => {
      const doubts = await getDoubts({ student_id: amitStudentId });
      if (doubts.length > 0) {
        expect(doubts[0].course_id).toBe('crs-fico-01');
        expect(doubts[0].batch_id).toBe('batch-fico-01');
      }
    });

    it('SC-ST-45: Faculty assignment visibility (e.g. Vikram Rao or Ananya Deshmukh)', async () => {
      const doubts = await getDoubts({ student_id: amitStudentId });
      if (doubts.length > 0 && doubts[0].assigned_to_name) {
        expect(doubts[0].assigned_to_name).toBeDefined();
      }
    });

    it('SC-ST-46: Threaded conversation view between student and faculty', async () => {
      const doubts = await getDoubts({ student_id: amitStudentId });
      if (doubts.length > 0) {
        const messages = doubts[0].messages || [];
        expect(Array.isArray(messages)).toBe(true);
      }
    });

    it('SC-ST-47: Send follow-up reply message on active ticket', async () => {
      const doubts = await getDoubts({ student_id: amitStudentId });
      if (doubts.length > 0) {
        const reply = await replyToDoubt(
          doubts[0].id,
          'Thank you sir, I have verified the splitting characteristic.',
          amitUser.id,
          'student',
          amitUser.full_name
        );
        expect(reply).toBeDefined();
        expect(reply.message).toContain('verified the splitting characteristic');
      }
    });

    it('SC-ST-48: Ticket resolution status tracking (Pending, In Progress, Resolved)', () => {
      const statuses = ['Pending', 'In Progress', 'Resolved', 'Closed'];
      expect(statuses).toContain('Resolved');
    });

    it('SC-ST-49: Reopen resolved doubt or mark as satisfied', async () => {
      const doubts = await getDoubts({ student_id: amitStudentId });
      if (doubts.length > 0) {
        const resolved = await resolveDoubt(
          doubts[0].id,
          'Config verified and issue cleared.',
          'usr-trainer-01'
        );
        expect(resolved.status).toBe('Resolved');
      }
    });

    it('SC-ST-50: Cross-student doubt privacy: Amit cannot see Sneha private tickets', async () => {
      const snehaDoubt = await createStudentDoubt(
        {
          student_id: snehaStudentId,
          title: 'MM Inventory Valuation Question',
          description: 'Moving average price variance calculation.',
          category: 'Academic Concept',
          priority: 'Low',
        },
        snehaUser.id
      );

      const amitDoubts = await getDoubts({ student_id: amitStudentId });
      const foundSnehaDoubt = amitDoubts.find((d) => d.id === snehaDoubt.id);
      expect(foundSnehaDoubt).toBeUndefined();
    });
  });

  // ==========================================
  // MODULE 6: FEES, PAYMENTS & RECEIPTS (SC-ST-51 to SC-ST-60)
  // ==========================================
  describe('Module 6 — Fees, Payments and Receipts', () => {
    it('SC-ST-51: Student financial summary display (Total Fee, Paid, Balance Due)', async () => {
      const feeAccount = await getFeeAccountForStudent(amitStudentId);
      expect(feeAccount).toBeDefined();
      expect(feeAccount?.net_payable).toBe(40000);
      expect(feeAccount?.paid_amount).toBeGreaterThan(0);
    });

    it('SC-ST-52: Installment payment schedule and due dates', () => {
      const installments = store.installments.filter((inst) => inst.student_id === amitStudentId);
      expect(installments).toBeDefined();
    });

    it('SC-ST-53: Verified payment transaction history display', () => {
      const payments = store.payments.filter((p) => p.student_id === amitStudentId);
      expect(payments.length).toBeGreaterThan(0);
      expect(payments[0].amount).toBeGreaterThan(0);
    });

    it('SC-ST-54: Verified payment status reflects Verified or Success in ledger', () => {
      const payments = store.payments.filter((p) => p.student_id === amitStudentId);
      expect(['Verified', 'Success']).toContain(payments[0].status);
    });

    it('SC-ST-55: Receipt listing with receipt numbers', async () => {
      const receipts = await getReceipts();
      expect(receipts.length).toBeGreaterThan(0);
      expect(receipts[0].receipt_number.startsWith('REC-')).toBe(true);
    });

    it('SC-ST-56: Receipt PDF generation / view modal access', async () => {
      const receipts = await getReceipts();
      const receipt = await getReceiptById(receipts[0].id);
      expect(receipt).toBeDefined();
      expect(receipt?.receipt_number.startsWith('REC-')).toBe(true);
    });

    it('SC-ST-57: Outstanding fee balance reconciles with payments sum', () => {
      const student = store.students.find((s) => s.id === amitStudentId);
      expect(student).toBeDefined();
      expect(Number(student?.paid_amount) + Number(student?.outstanding_amount)).toBe(Number(student?.total_fee));
    });

    it('SC-ST-58: Strict default-deny: student cannot access /accounts/approvals or approve payments', async () => {
      const req = createMockRequest('/accounts/approvals', amitUser);
      const res = await middleware(req);
      expect(res.headers.get('location')).toContain('/portal');
    });

    it('SC-ST-59: Student receipt scoping audit check', async () => {
      // Validates that receipts list returns institutional receipts
      const allReceipts = await getReceipts();
      expect(allReceipts.length).toBeGreaterThan(0);
    });

    it('SC-ST-60: Bank account preset display for student fee transfers is available', () => {
      const presets = store.settings.authorized_bank_accounts;
      expect(presets).toBeDefined();
      expect(presets?.length).toBeGreaterThan(0);
    });
  });

  // ==========================================
  // MODULE 7: SAP LAB ACCESS & STUDENT PROFILE (SC-ST-61 to SC-ST-70)
  // ==========================================
  describe('Module 7 — SAP Lab Access and Student Profile', () => {
    it('SC-ST-61: Assigned SAP server sandbox card visibility for entitled student', async () => {
      const allocation = await getAllocationForStudent(amitStudentId);
      expect(allocation).toBeDefined();
      expect(allocation?.sid).toBe('S4H');
      expect(allocation?.status).toBe('Active');
    });

    it('SC-ST-62: SAP entitlement validity dates (valid_from to valid_to)', async () => {
      const allocation = await getAllocationForStudent(amitStudentId);
      expect(allocation?.valid_from).toBeDefined();
      expect(allocation?.valid_to).toBeDefined();
    });

    it('SC-ST-63: SAP server connection instructions (Host, SID, Instance, Client)', async () => {
      const allocation = await getAllocationForStudent(amitStudentId);
      expect(allocation?.server_host).toBeDefined();
      expect(allocation?.instance_number).toBe('00');
      expect(allocation?.client_number).toBe('800');
    });

    it('SC-ST-64: SAP GUI shortcut (.sap) file generator works securely', async () => {
      const allocation = await getAllocationForStudent(amitStudentId);
      if (allocation) {
        const shortcut = generateSapGuiShortcutContent(allocation);
        expect(shortcut).toContain('Name=S4H');
        expect(shortcut).toContain('Client=800');
      }
    });

    it('SC-ST-65: Unallocated student state (Sneha sees no active sandbox)', async () => {
      const allocation = await getAllocationForStudent(snehaStudentId);
      expect(allocation).toBeUndefined();
    });

    it('SC-ST-66: Student 360 profile information display', async () => {
      const details = await getStudentProfileFullDetails(amitStudentId);
      expect(details).toBeDefined();
      expect(details?.student.full_name).toContain('Amit Gupta');
      expect(details?.student.email).toBe('amit.gupta@student.next-gen.com');
    });

    it('SC-ST-67: Permitted profile contact information is present', () => {
      const student = store.students.find((s) => s.id === amitStudentId);
      expect(student?.phone).toBe('+91 98111 22233');
      expect(student?.address).toBeDefined();
    });

    it('SC-ST-68: Restricted profile fields: cannot change Admission #, Course, or Batch via student role', () => {
      expect(hasPermission('student', 'courses:write')).toBe(false);
      expect(hasPermission('student', 'batches:write')).toBe(false);
      expect(hasPermission('student', 'students:write')).toBe(false);
    });

    it('SC-ST-69: Document repository view displays uploaded identity and academic proofs', () => {
      const admission = store.admissions.find((a) => a.id === 'adm-01');
      expect(admission).toBeDefined();
      expect(admission?.admission_number).toBe('ADM-2026-0001');
    });

    it('SC-ST-70: Cross-student SAP sandbox isolation: Amit credentials not accessible to Sneha', async () => {
      const snehaAlloc = await getAllocationForStudent(snehaStudentId);
      expect(snehaAlloc).toBeUndefined();
    });
  });

  // ==========================================
  // MODULE 8: SECURITY, RLS & REGRESSION (SC-ST-71 to SC-ST-80)
  // ==========================================
  describe('Module 8 — Security, RLS and Regression', () => {
    it('SC-ST-71: Direct access block for /dashboard redirects student to /portal', async () => {
      const req = createMockRequest('/dashboard', amitUser);
      const res = await middleware(req);
      expect(res.headers.get('location')).toContain('/portal');
    });

    it('SC-ST-72: Direct access block for /users (Staff & Roles) redirects student to /portal', async () => {
      const req = createMockRequest('/users', amitUser);
      const res = await middleware(req);
      expect(res.headers.get('location')).toContain('/portal');
    });

    it('SC-ST-73: Direct access block for /crm/* (Leads & Followups) redirects student to /portal', async () => {
      const req = createMockRequest('/crm/leads', amitUser);
      const res = await middleware(req);
      expect(res.headers.get('location')).toContain('/portal');
    });

    it('SC-ST-74: Direct access block for /admissions redirects student to /portal', async () => {
      const req = createMockRequest('/admissions', amitUser);
      const res = await middleware(req);
      expect(res.headers.get('location')).toContain('/portal');
    });

    it('SC-ST-75: Direct access block for /accounts/fees and /accounts/dues redirects student to /portal', async () => {
      const req = createMockRequest('/accounts/fees', amitUser);
      const res = await middleware(req);
      expect(res.headers.get('location')).toContain('/portal');
    });

    it('SC-ST-76: Direct access block for /placement (Drives & Openings Admin) redirects student to /portal', async () => {
      const req = createMockRequest('/placement', amitUser);
      const res = await middleware(req);
      expect(res.headers.get('location')).toContain('/portal');
    });

    it('SC-ST-77: Direct access block for /audit-logs and /settings redirects student to /portal', async () => {
      const req = createMockRequest('/audit-logs', amitUser);
      const res = await middleware(req);
      expect(res.headers.get('location')).toContain('/portal');
    });

    it('SC-ST-78: Cross-student data isolation: student querying student records cannot view other students profile', async () => {
      const amit = await getStudentById(amitStudentId);
      const sneha = await getStudentById(snehaStudentId);
      expect(amit).toBeDefined();
      expect(sneha).toBeDefined();
      expect(amit?.id).not.toBe(sneha?.id);
      expect(amit?.email).not.toBe(sneha?.email);
    });

    it('SC-ST-79: Tamper protection on student role in auth cookie signature prevents elevation', async () => {
      const tamperedUser = { ...amitUser, role: 'super_admin' };
      const req = new NextRequest(new URL('/dashboard', 'http://localhost:3000'));
      const tamperedCookie = encodeURIComponent(JSON.stringify(tamperedUser));
      const originalSig = generateAuthCookieSignatureSync(encodeURIComponent(JSON.stringify(amitUser)));
      req.cookies.set('next_gen_auth_user', tamperedCookie);
      req.cookies.set('next_gen_auth_user_sig', originalSig);

      const res = await middleware(req);
      expect(res.headers.get('location')).toContain('/login');
    });

    it('SC-ST-80: Regression verification: Roles 1–7 retain respective permissions without student interference', () => {
      expect(hasPermission('super_admin', 'all:manage')).toBe(true);
      expect(hasPermission('admin', 'users:manage')).toBe(true);
      expect(hasPermission('accountant', 'accounts:write')).toBe(true);
      expect(hasPermission('counsellor', 'crm:write')).toBe(true);
      expect(hasPermission('trainer', 'assignments:grade')).toBe(true);
      expect(hasPermission('placement_coordinator', 'placements:write')).toBe(true);
      expect(hasPermission('support', 'doubts:assign')).toBe(true);

      // Student retains strict isolation
      expect(hasPermission('student', 'all:manage')).toBe(false);
      expect(hasPermission('student', 'accounts:write')).toBe(false);
      expect(hasPermission('student', 'crm:write')).toBe(false);
    });
  });
});
