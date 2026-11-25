import { getDb, isLiveSupabaseEnabled, isProductionEnvironment } from './db';
import { store } from '@/lib/services/data-store';
import {
  Admission,
  Student,
  Course,
  Batch,
  ClassSession,
  AttendanceRecord,
  StudentFeeAccount,
  Payment,
  Receipt,
  Lead,
  StudentDoubt,
  DoubtMessage,
  AuditLog,
  SystemSettings,
  OnboardingCase,
} from '@/types';

/**
 * Universal Enterprise Database Repository Layer
 * Bridges Supabase Postgres tables and local persistent cache with fallback tolerance.
 */

// ==========================================
// 1. ADMISSIONS REPOSITORY
// ==========================================
export class AdmissionsRepository {
  async getAll(): Promise<Admission[]> {
    if (isLiveSupabaseEnabled()) {
      try {
        const db = getDb();
        const { data, error } = await db.from('admissions').select('*').order('created_at', { ascending: false });
        if (error) {
          throw new Error(`AdmissionsRepository Postgres error: ${error.message}`);
        }
        if (Array.isArray(data)) return data;
      } catch (err: any) {
        if (isProductionEnvironment() || isLiveSupabaseEnabled()) {
          throw err;
        }
        console.warn('AdmissionsRepository.getAll Postgres error, using local cache:', err);
      }
    }
    if (isProductionEnvironment()) {
      return [];
    }
    return [...store.admissions];
  }

  async getById(id: string): Promise<Admission | undefined> {
    if (isLiveSupabaseEnabled()) {
      try {
        const db = getDb();
        const { data, error } = await db.from('admissions').select('*').eq('id', id).single();
        if (error) {
          if (error.code === 'PGRST116') return undefined;
          throw new Error(`AdmissionsRepository.getById error: ${error.message}`);
        }
        if (data) return data;
      } catch (err: any) {
        if (isProductionEnvironment() || isLiveSupabaseEnabled()) {
          throw err;
        }
        console.warn('AdmissionsRepository.getById Postgres error:', err);
      }
    }
    if (isProductionEnvironment() || isLiveSupabaseEnabled()) {
      return undefined;
    }
    return store.admissions.find((a) => a.id === id);
  }

  async create(admission: Admission): Promise<Admission> {
    store.admissions.unshift(admission);
    store.persist();

    if (isLiveSupabaseEnabled()) {
      try {
        const db = getDb();
        await db.from('admissions').insert({
          id: admission.id,
          admission_number: admission.admission_number,
          student_name: admission.student_name,
          phone: admission.phone,
          email: admission.email,
          dob: admission.dob,
          gender: admission.gender,
          address: admission.address,
          city: admission.city,
          education: admission.education,
          experience_years: admission.experience_years,
          current_employment_status: admission.current_employment_status,
          course_id: admission.course_id,
          training_mode: admission.training_mode,
          batch_id: admission.batch_id,
          trainer_id: admission.trainer_id,
          admission_date: admission.admission_date,
          course_fee: admission.course_fee,
          discount: admission.discount,
          discount_reason: admission.discount_reason,
          net_payable: admission.net_payable,
          payment_plan: admission.payment_plan,
          counsellor_id: admission.counsellor_id,
          status: admission.status,
          created_at: admission.created_at,
          updated_at: admission.updated_at,
        });
      } catch (err) {
        console.warn('AdmissionsRepository.create Postgres error, preserved locally:', err);
      }
    }
    return admission;
  }
}

// ==========================================
// 2. STUDENTS REPOSITORY
// ==========================================
export class StudentsRepository {
  async getAll(): Promise<Student[]> {
    if (isLiveSupabaseEnabled()) {
      try {
        const db = getDb();
        const { data, error } = await db.from('students').select('*').order('created_at', { ascending: false });
        if (error) {
          throw new Error(`StudentsRepository Postgres error: ${error.message}`);
        }
        if (Array.isArray(data)) return data;
      } catch (err: any) {
        if (isProductionEnvironment() || isLiveSupabaseEnabled()) {
          throw err;
        }
        console.warn('StudentsRepository.getAll Postgres error, using local cache:', err);
      }
    }
    if (isProductionEnvironment()) {
      return [];
    }
    return [...store.students];
  }

  async getById(id: string): Promise<Student | undefined> {
    if (isLiveSupabaseEnabled()) {
      try {
        const db = getDb();
        const { data, error } = await db.from('students').select('*').eq('id', id).single();
        if (error) {
          if (error.code === 'PGRST116') return undefined;
          throw new Error(`StudentsRepository.getById error: ${error.message}`);
        }
        if (data) return data;
      } catch (err: any) {
        if (isProductionEnvironment() || isLiveSupabaseEnabled()) {
          throw err;
        }
        console.warn('StudentsRepository.getById Postgres error:', err);
      }
    }
    if (isProductionEnvironment() || isLiveSupabaseEnabled()) {
      return undefined;
    }
    return store.students.find((s) => s.id === id);
  }

  async updateAttendance(studentId: string, percentage: number): Promise<void> {
    const student = store.students.find((s) => s.id === studentId);
    if (student) {
      student.attendance_percentage = percentage;
      student.updated_at = new Date().toISOString();
      store.persist();
    }

    if (isLiveSupabaseEnabled()) {
      try {
        const db = getDb();
        await db.from('students').update({ attendance_percentage: percentage }).eq('id', studentId);
      } catch (err) {
        console.warn('StudentsRepository.updateAttendance Postgres error:', err);
      }
    }
  }
}

// ==========================================
// 3. COURSES & BATCHES REPOSITORY
// ==========================================
export class CoursesRepository {
  async getAll(): Promise<Course[]> {
    store.reconcileAuthoritativeCourses();
    if (isLiveSupabaseEnabled()) {
      try {
        const db = getDb();
        const { data, error } = await db.from('courses').select('*').order('created_at', { ascending: false });
        if (error) {
          throw new Error(`CoursesRepository Postgres error: ${error.message}`);
        }
        if (data) return data;
      } catch (err: any) {
        throw new Error(`CoursesRepository database failure: ${err.message}`);
      }
    }
    return [...store.courses];
  }

  async getById(id: string): Promise<Course | undefined> {
    store.reconcileAuthoritativeCourses();
    if (isLiveSupabaseEnabled()) {
      try {
        const db = getDb();
        const { data, error } = await db.from('courses').select('*').eq('id', id).maybeSingle();
        if (error) {
          throw new Error(`CoursesRepository Postgres error: ${error.message}`);
        }
        if (data) return data;
      } catch (err: any) {
        throw new Error(`CoursesRepository getById failure: ${err.message}`);
      }
    }
    return store.courses.find((c) => c.id === id);
  }
}

export class BatchesRepository {
  async getAll(): Promise<Batch[]> {
    if (isLiveSupabaseEnabled()) {
      try {
        const db = getDb();
        const { data, error } = await db.from('batches').select('*').order('start_date', { ascending: false });
        if (error) {
          throw new Error(`BatchesRepository Postgres error: ${error.message}`);
        }
        if (Array.isArray(data)) return data;
      } catch (err: any) {
        if (isProductionEnvironment() || isLiveSupabaseEnabled()) {
          throw err;
        }
        console.warn('BatchesRepository.getAll Postgres error:', err);
      }
    }
    if (isProductionEnvironment()) {
      return [];
    }
    return [...store.batches];
  }

  async getById(id: string): Promise<Batch | undefined> {
    return store.batches.find((b) => b.id === id);
  }
}

// ==========================================
// 4. CLASS SESSIONS & ATTENDANCE REPOSITORY
// ==========================================
export class ClassSessionsRepository {
  async getAll(batchId?: string): Promise<ClassSession[]> {
    let list = [...store.classSessions];
    if (batchId) {
      list = list.filter((s) => s.batch_id === batchId);
    }
    return list;
  }

  async getById(id: string): Promise<ClassSession | undefined> {
    return store.classSessions.find((s) => s.id === id);
  }
}

export class AttendanceRepository {
  async getRecords(batchId?: string, date?: string): Promise<AttendanceRecord[]> {
    let list = [...store.attendanceRecords];
    if (batchId) list = list.filter((r) => r.batch_id === batchId);
    if (date) list = list.filter((r) => r.attendance_date === date);
    return list;
  }

  async upsert(record: AttendanceRecord): Promise<AttendanceRecord> {
    const existingIdx = store.attendanceRecords.findIndex(
      (a) => a.session_id === record.session_id && a.student_id === record.student_id
    );

    if (existingIdx >= 0) {
      store.attendanceRecords[existingIdx] = record;
    } else {
      store.attendanceRecords.push(record);
    }
    store.persist();

    if (isLiveSupabaseEnabled()) {
      try {
        const db = getDb();
        await db.from('attendance_records').upsert({
          id: record.id,
          student_id: record.student_id,
          session_id: record.session_id,
          batch_id: record.batch_id,
          attendance_date: record.attendance_date,
          status: record.status,
          notes: record.notes,
          marked_by: record.marked_by,
          marked_at: record.marked_at,
        });
      } catch (err) {
        console.warn('AttendanceRepository.upsert Postgres error:', err);
      }
    }

    return record;
  }
}

// ==========================================
// 5. FINANCE REPOSITORY (FEES & PAYMENTS)
// ==========================================
export class FinanceRepository {
  async getFeeAccounts(): Promise<StudentFeeAccount[]> {
    if (isLiveSupabaseEnabled()) {
      try {
        const db = getDb();
        const { data, error } = await db.from('student_fee_accounts').select('*');
        if (error) {
          throw new Error(`FinanceRepository.getFeeAccounts error: ${error.message}`);
        }
        if (Array.isArray(data)) return data;
      } catch (err: any) {
        if (isProductionEnvironment() || isLiveSupabaseEnabled()) {
          throw err;
        }
        console.warn('FinanceRepository.getFeeAccounts Postgres error:', err);
      }
    }
    if (isProductionEnvironment()) {
      return [];
    }
    return [...store.feeAccounts];
  }

  async getPayments(): Promise<Payment[]> {
    if (isLiveSupabaseEnabled()) {
      try {
        const db = getDb();
        const { data, error } = await db.from('payments').select('*').order('payment_date', { ascending: false });
        if (error) {
          throw new Error(`FinanceRepository.getPayments error: ${error.message}`);
        }
        if (Array.isArray(data)) return data;
      } catch (err: any) {
        if (isProductionEnvironment() || isLiveSupabaseEnabled()) {
          throw err;
        }
        console.warn('FinanceRepository.getPayments Postgres error:', err);
      }
    }
    if (isProductionEnvironment()) {
      return [];
    }
    return [...store.payments];
  }

  async recordPayment(payment: Payment, receipt: Receipt): Promise<{ payment: Payment; receipt: Receipt }> {
    store.payments.unshift(payment);
    store.receipts.unshift(receipt);
    store.persist();

    if (isLiveSupabaseEnabled()) {
      try {
        const db = getDb();
        await db.from('payments').insert({
          id: payment.id,
          student_id: payment.student_id,
          amount: payment.amount,
          payment_date: payment.payment_date,
          payment_mode: payment.payment_mode,
          reference_number: payment.transaction_reference,
          receipt_number: receipt.receipt_number,
          notes: payment.notes,
          status: payment.status,
        });

        await db.from('receipts').insert({
          id: receipt.id,
          receipt_number: receipt.receipt_number,
          payment_id: receipt.payment_id,
          student_id: receipt.student_id,
          amount: receipt.payment_amount,
          payment_date: receipt.payment_date,
        });
      } catch (err) {
        console.warn('FinanceRepository.recordPayment Postgres error:', err);
      }
    }

    return { payment, receipt };
  }
}

// ==========================================
// 6. CRM & LEADS REPOSITORY
// ==========================================
export class CRMRepository {
  async getLeads(actor?: import('@/types').UserProfile): Promise<Lead[]> { return (await import('@/lib/services/crm-service')).getLeads({}, actor); }
  async createLead(lead: Lead, actor?: import('@/types').UserProfile): Promise<Lead> { return (await import('@/lib/services/crm-service')).createLead(lead, actor); }
}

// ==========================================
// 9. ONBOARDING REPOSITORY
// ==========================================
export class OnboardingRepository {
  async getAll(): Promise<OnboardingCase[]> {
    if (isLiveSupabaseEnabled()) {
      try {
        const db = getDb();
        const { data, error } = await db.from('onboarding_cases').select('*').order('created_at', { ascending: false });
        if (error) {
          throw new Error(`OnboardingRepository.getAll error: ${error.message}`);
        }
        if (Array.isArray(data)) return data;
      } catch (err: any) {
        if (isProductionEnvironment() || isLiveSupabaseEnabled()) {
          throw err;
        }
        console.warn('OnboardingRepository.getAll Postgres error:', err);
      }
    }
    if (isProductionEnvironment()) {
      return [];
    }
    return [...store.onboardingCases];
  }

  async getById(id: string): Promise<OnboardingCase | undefined> {
    if (isLiveSupabaseEnabled()) {
      try {
        const db = getDb();
        const { data, error } = await db.from('onboarding_cases').select('*').eq('id', id).maybeSingle();
        if (error) {
          throw new Error(`OnboardingRepository.getById error: ${error.message}`);
        }
        if (data) return data;
      } catch (err: any) {
        if (isProductionEnvironment() || isLiveSupabaseEnabled()) {
          throw err;
        }
        console.warn('OnboardingRepository.getById Postgres error:', err);
      }
    }
    if (isProductionEnvironment() || isLiveSupabaseEnabled()) {
      return undefined;
    }
    return store.onboardingCases.find((c) => c.id === id);
  }

  async save(onbCase: OnboardingCase): Promise<OnboardingCase> {
    const idx = store.onboardingCases.findIndex((c) => c.id === onbCase.id);
    if (idx >= 0) {
      store.onboardingCases[idx] = onbCase;
    } else {
      store.onboardingCases.unshift(onbCase);
    }
    store.persist();

    if (isLiveSupabaseEnabled()) {
      try {
        const db = getDb();
        await db.from('onboarding_cases').upsert(onbCase);
      } catch (err) {
        console.warn('OnboardingRepository.save Postgres error:', err);
      }
    }
    return onbCase;
  }
}

// ==========================================
// REPOSITORY SINGLETON INSTANCES
// ==========================================
export const admissionsRepo = new AdmissionsRepository();
export const studentsRepo = new StudentsRepository();
export const coursesRepo = new CoursesRepository();
export const batchesRepo = new BatchesRepository();
export const classSessionsRepo = new ClassSessionsRepository();
export const attendanceRepo = new AttendanceRepository();
export const financeRepo = new FinanceRepository();
export const crmRepo = new CRMRepository();
export const onboardingRepo = new OnboardingRepository();

