import { store } from './data-store';
import { Student } from '@/types';
import { createClient, isLiveSupabaseEnabled } from '@/lib/supabase/db';
import { createClient as createSessionClient } from '@/lib/supabase/client';

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
    if (error) throw new Error('Unable to load students. Please retry or contact your administrator.');
    store.students = (data || []) as Student[];
  }

  let list = [...store.students];

  if (filters?.course_id) {
    list = list.filter((s) => s.course_id === filters.course_id);
  }
  if (filters?.batch_id) {
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
    if (error) throw new Error('Unable to verify the student profile. Please retry or contact your administrator.');
    return data ? data as Student : undefined;
  }

  const target = decodeURIComponent(String(id)).trim().toLowerCase();
  return store.students.find(
    (s) =>
      s.id?.toLowerCase() === target ||
      s.student_code?.toLowerCase() === target ||
      s.admission_id?.toLowerCase() === target ||
      s.admission_number?.toLowerCase() === target ||
      (s.email && s.email.toLowerCase() === target) ||
      (s.phone && s.phone.toLowerCase() === target)
  );
}

export async function getStudentProfileFullDetails(studentId: string) {
  if (!studentId) return null;
  const student = await getStudentById(studentId);
  if (!student) return null;

  const admission = store.admissions.find((a) => a.id === student.admission_id);
  const course = store.courses.find((c) => c.id === student.course_id);
  const batch = store.batches.find((b) => b.id === student.batch_id);
  const feeAccount = store.feeAccounts.find((f) => f.student_id === student.id);
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
  };
}
