import { store } from './data-store';
import { Student } from '@/types';
import { createClient, isLiveSupabaseEnabled } from '@/lib/supabase/db';
import { createClient as createSessionClient } from '@/lib/supabase/client';
import { mergeWorkflowSnapshot } from './payment-workflow-state';
import { calculateAuthoritativeStudentFinancials } from '@/lib/utils/student-financials';

export async function getStudents(filters?: {
  course_id?: string;
  batch_id?: string;
  status?: string;
  search?: string;
}, signal?: AbortSignal): Promise<Student[]> {
  if (isLiveSupabaseEnabled()) {
    // Use the authenticated browser client directly. Never replace an RLS-empty
    // result or failed remote lookup with seeded/cached student records.
    const supabase = typeof window !== 'undefined' ? createSessionClient() : createClient();
    const { data, error } = await supabase.from('students').select('*').order('created_at', { ascending: false });
    if (signal?.aborted) throw new Error('Student lookup cancelled.');
    if (error) {
      console.error('[student-service] Supabase query failed:', error.message || error);
      throw new Error('Unable to load students. Please retry or contact your administrator.');
    }
    store.students = (data || []) as Student[];
  } else if (typeof window !== 'undefined' && typeof window.location !== 'undefined' && window.location?.origin) {
    try {
      const res = await fetch('/api/students', {
        method: 'GET',
        cache: 'no-store',
        credentials: 'same-origin',
        signal,
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.students)) {
          if (json.snapshot) {
            mergeWorkflowSnapshot(json.snapshot);
          }
          store.students = json.students;
        }
      }
    } catch (err: any) {
      if (signal?.aborted) throw new Error('Student lookup cancelled.');
      console.warn('[student-service] GET /api/students fetch error, using local state:', err);
    }
  } else {
    // Server-side / test environment
    store.reconcileAdmissionsAndStudents();
  }

  let list = [...store.students];

  if (filters?.course_id && filters.course_id !== 'All') {
    list = list.filter((s) => s.course_id === filters.course_id);
  }
  if (filters?.batch_id && filters.batch_id !== 'All') {
    list = list.filter((s) => s.batch_id === filters.batch_id);
  }
  if (filters?.status && filters.status !== 'All') {
    list = list.filter((s) => s.status === filters.status);
  }
  if (filters?.search) {
    const s = filters.search.toLowerCase();
    list = list.filter(
      (item) =>
        item.full_name?.toLowerCase().includes(s) ||
        item.student_code?.toLowerCase().includes(s) ||
        item.student_unique_id?.toLowerCase().includes(s) ||
        item.admission_number?.toLowerCase().includes(s) ||
        item.email?.toLowerCase().includes(s) ||
        (item.phone != null && String(item.phone).toLowerCase().includes(s))
    );
  }

  return list;
}

export async function getStudentById(id: string): Promise<Student | undefined> {
  if (isLiveSupabaseEnabled()) {
    const supabase = typeof window !== 'undefined' ? createSessionClient() : createClient();
    const reference = String(id).trim();
    const column = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(reference) ? 'id' : 'student_code';
    const { data, error } = await supabase.from('students').select('*').eq(column, reference).maybeSingle();
    if (error) {
      console.error('[student-service] Supabase student lookup failed:', error.message || error);
      throw new Error('Unable to verify the student profile. Please retry or contact your administrator.');
    }
    return data ? data as Student : undefined;
  }

  const target = decodeURIComponent(String(id)).trim().toLowerCase();
  const isAmit = target === 'stu-01' || target === '51000000-0000-0000-0000-000000000001';
  const isSneha = target === 'stu-02' || target === '51000000-0000-0000-0000-000000000002';
  let student = store.students.find(
    (s) =>
      s.id?.toLowerCase() === target ||
      s.student_code?.toLowerCase() === target ||
      s.student_unique_id?.toLowerCase() === target ||
      s.admission_id?.toLowerCase() === target ||
      s.admission_number?.toLowerCase() === target ||
      (s.email && s.email.toLowerCase() === target) ||
      (s.phone && s.phone.toLowerCase() === target) ||
      (isAmit && (s.id === 'stu-01' || s.id === '51000000-0000-0000-0000-000000000001')) ||
      (isSneha && (s.id === 'stu-02' || s.id === '51000000-0000-0000-0000-000000000002'))
  );

  if (!student && typeof window !== 'undefined' && typeof window.location !== 'undefined' && window.location?.origin) {
    try {
      const res = await fetch(`/api/students/${encodeURIComponent(id)}`, {
        cache: 'no-store',
        credentials: 'same-origin',
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.student) {
          if (json.snapshot) mergeWorkflowSnapshot(json.snapshot);
          const existingIdx = store.students.findIndex((s) => s.id === json.student.id);
          if (existingIdx >= 0) {
            store.students[existingIdx] = json.student;
          } else {
            store.students.push(json.student);
          }
          student = json.student;
        }
      }
    } catch (err) {
      console.warn('[student-service] GET /api/students/[id] fetch error:', err);
    }
  }

  return student;
}

export async function getStudentProfileFullDetails(studentId: string) {
  if (!studentId) return null;

  if (typeof window !== 'undefined' && typeof window.location !== 'undefined' && window.location?.origin) {
    try {
      const res = await fetch(`/api/students/${encodeURIComponent(studentId)}`, {
        cache: 'no-store',
        credentials: 'same-origin',
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.student) {
          if (json.snapshot) mergeWorkflowSnapshot(json.snapshot);
          return {
            student: json.student,
            admission: json.admission,
            course: json.course,
            batch: json.batch,
            feeAccount: json.feeAccount,
            payments: json.payments || [],
            receipts: json.receipts || [],
            attendance: json.attendance || [],
            submissions: json.submissions || [],
            quizAttempts: json.quizAttempts || [],
            placement: json.placement,
            certificate: json.certificate,
            transfers: json.transfers || [],
            studentFees: json.studentFees || [],
            studentPayments: json.studentPayments || [],
            studentLedger: json.studentLedger || [],
            jobApplications: json.jobApplications || [],
            doubts: json.doubts || [],
            onboardingCase: json.onboardingCase,
          };
        } else if (res.status === 404) {
          return null;
        }
      }
    } catch (err) {
      console.warn('[student-service] getStudentProfileFullDetails remote fetch failed, falling back to local store:', err);
    }
  }

  const student = await getStudentById(studentId);
  if (!student) return null;

  const admission = store.admissions.find((a) => a.id === student.admission_id || a.admission_number === student.admission_number);
  const course = store.courses.find((c) => c.id === student.course_id);
  const batch = store.batches.find((b) => b.id === student.batch_id);
  const feeAccount = store.feeAccounts.find((f) => f.student_id === student.id || f.admission_id === student.admission_id);
  const payments = store.payments.filter((p) => p.student_id === student.id);
  const receipts = store.receipts.filter((r) => r.student_id === student.id);
  const attendance = store.attendanceRecords.filter((a) => a.student_id === student.id);
  const submissions = store.submissions.filter((sub) => sub.student_id === student.id);
  const quizAttempts = store.quizAttempts.filter((qa) => qa.student_id === student.id);
  const placement = store.placementProfiles.find((pp) => pp.student_id === student.id);
  const certificate = store.certificates.find((cert) => cert.student_id === student.id);
  const transfers = store.batchTransferAudits.filter((bta) => bta.student_id === student.id);
  const studentFees = (store.studentFees || []).filter((f) => f.student_id === student.id);
  const studentPayments = (store.studentPayments || []).filter((p) => p.student_id === student.id);
  const studentLedger = (store.studentFinancialLedgers || [])
    .filter((l) => l.student_id === student.id)
    .sort((a, b) => new Date(a.entry_date).getTime() - new Date(b.entry_date).getTime());
  const jobApplications = (store.jobApplications || []).filter((j) => j.student_id === student.id);
  const doubts = (store.doubts || []).filter((d) => d.student_id === student.id);
  const onboardingCase = (store.onboardingCases || []).find((c) => c.student_id === student.id || c.admission_id === student.admission_id);

  const authFin = calculateAuthoritativeStudentFinancials({
    student,
    admission,
    feeAccount,
    studentFees,
    payments,
    studentPayments,
    receipts,
    studentLedger,
  });

  student.total_fee = authFin.totalPayable;
  student.paid_amount = authFin.paidAmount;
  student.outstanding_amount = authFin.outstandingDue;
  if (feeAccount) {
    feeAccount.net_payable = authFin.totalPayable;
    feeAccount.paid_amount = authFin.paidAmount;
    feeAccount.outstanding_amount = authFin.outstandingDue;
  }

  return {
    student,
    admission,
    course,
    batch,
    feeAccount,
    payments,
    receipts,
    attendance,
    submissions,
    quizAttempts,
    placement,
    certificate,
    transfers,
    studentFees,
    studentPayments,
    studentLedger,
    jobApplications,
    doubts,
    onboardingCase,
  };
}
