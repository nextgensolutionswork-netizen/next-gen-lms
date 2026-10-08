import { store } from './data-store';
import { Student } from '@/types';
import { createClient, isLiveSupabaseEnabled } from '@/lib/supabase/db';

export async function getStudents(filters?: {
  course_id?: string;
  batch_id?: string;
  status?: string;
  search?: string;
}): Promise<Student[]> {
  if (isLiveSupabaseEnabled()) {
    try {
      const supabase = createClient();
      let query = supabase.from('students').select('*').order('created_at', { ascending: false });

      if (filters?.course_id) {
        query = query.eq('course_id', filters.course_id);
      }
      if (filters?.batch_id) {
        query = query.eq('batch_id', filters.batch_id);
      }
      if (filters?.status && filters.status !== 'All') {
        query = query.eq('status', filters.status);
      }

      const { data, error } = await query;
      if (!error && data && data.length > 0) {
        store.students = data as Student[];
        return data as Student[];
      }
    } catch (err) {
      console.warn('Supabase students query error, falling back to local persistent store:', err);
    }
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
        item.full_name.toLowerCase().includes(s) ||
        item.student_code.toLowerCase().includes(s) ||
        item.email.toLowerCase().includes(s) ||
        item.phone.includes(s)
    );
  }

  return list;
}

export async function getStudentById(id: string): Promise<Student | undefined> {
  if (isLiveSupabaseEnabled()) {
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('students')
        .select('*')
        .or(`id.eq.${id},student_code.eq.${id}`)
        .maybeSingle();

      if (!error && data) {
        return data as Student;
      }
    } catch (err) {
      console.warn('Supabase getStudentById error, checking local store:', err);
    }
  }

  return store.students.find((s) => s.id === id || s.student_code === id);
}

export async function getStudentProfileFullDetails(studentId: string) {
  const student = store.students.find((s) => s.id === studentId);
  if (!student) return null;

  const admission = store.admissions.find((a) => a.id === student.admission_id);
  const course = store.courses.find((c) => c.id === student.course_id);
  const batch = store.batches.find((b) => b.id === student.batch_id);
  const feeAccount = store.feeAccounts.find((f) => f.student_id === student.id);
  const installments = store.installments.filter((i) => i.student_id === student.id);
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

  return {
    student,
    admission,
    course,
    batch,
    feeAccount,
    installments,
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
  };
}
