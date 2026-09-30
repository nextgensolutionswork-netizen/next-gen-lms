import { store } from './data-store';
import { Admission, Student, StudentFeeAccount, Installment } from '@/types';
import { recordAuditLog } from './audit-service';
import { generateAdmissionNumber } from '@/lib/utils/formatters';
import { createClient, isLiveSupabaseEnabled } from '@/lib/supabase/db';

export async function getAdmissions(): Promise<Admission[]> {
  if (isLiveSupabaseEnabled()) {
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('admissions')
        .select('*')
        .order('created_at', { ascending: false });

      if (!error && data && data.length > 0) {
        // Synchronize in-memory cache with database
        store.admissions = data as Admission[];
        return data as Admission[];
      }
    } catch (err) {
      console.warn('Supabase admissions direct query error, falling back to local persistent store:', err);
    }
  }

  return [...store.admissions].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

export async function getAdmissionById(id: string): Promise<Admission | undefined> {
  if (isLiveSupabaseEnabled()) {
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('admissions')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (!error && data) {
        return data as Admission;
      }
    } catch (err) {
      console.warn('Supabase getAdmissionById error, checking local persistent store:', err);
    }
  }

  return store.admissions.find((a) => a.id === id);
}

export interface CreateAdmissionInput {
  student_name: string;
  phone: string;
  email: string;
  dob: string;
  gender: 'Male' | 'Female' | 'Other';
  address: string;
  city: string;
  education: string;
  experience_years: number;
  current_employment_status: 'Employed' | 'Unemployed' | 'Student' | 'Career Gap';
  course_id: string;
  training_mode: 'Online' | 'Classroom' | 'Hybrid';
  batch_id?: string;
  trainer_id?: string;
  admission_date: string;
  course_fee: number;
  discount: number;
  discount_reason?: string;
  payment_plan: 'Full Payment' | '2 Installments' | '3 Installments' | 'Custom';
  counsellor_id?: string;
  lead_id?: string; // Optional: if converted from CRM
}

export async function createAdmissionWorkflow(
  input: CreateAdmissionInput,
  performedByUserId: string
): Promise<{ admission: Admission; student: Student; feeAccount: StudentFeeAccount }> {
  const sequence = store.admissions.length + 1;
  const admission_number = generateAdmissionNumber(sequence);

  const course = store.courses.find((c) => c.id === input.course_id);
  const batch = store.batches.find((b) => b.id === input.batch_id);
  const trainer = store.users.find((u) => u.id === (input.trainer_id || batch?.trainer_id));
  const counsellor = store.users.find((u) => u.id === input.counsellor_id);
  const actor = store.users.find((u) => u.id === performedByUserId);

  const net_payable = Math.max(0, input.course_fee - (input.discount || 0));

  // 1. Create Admission Record
  const newAdmission: Admission = {
    id: `adm-${Date.now()}`,
    admission_number,
    student_name: input.student_name,
    phone: input.phone,
    email: input.email,
    dob: input.dob,
    gender: input.gender,
    address: input.address,
    city: input.city,
    education: input.education,
    experience_years: input.experience_years,
    current_employment_status: input.current_employment_status,
    course_id: input.course_id,
    course_name: course?.course_name,
    training_mode: input.training_mode,
    batch_id: input.batch_id,
    batch_name: batch?.batch_name,
    trainer_id: trainer?.id,
    trainer_name: trainer?.full_name,
    admission_date: input.admission_date,
    course_fee: input.course_fee,
    discount: input.discount || 0,
    discount_reason: input.discount_reason,
    net_payable,
    payment_plan: input.payment_plan,
    counsellor_id: counsellor?.id,
    counsellor_name: counsellor?.full_name,
    status: 'Confirmed',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  store.admissions.unshift(newAdmission);

  // 2. Automatically Create Student User Profile & Portal Account
  const studentUserId = `usr-stu-${Date.now()}`;
  store.users.push({
    id: studentUserId,
    email: input.email,
    full_name: input.student_name,
    role: 'student',
    phone: input.phone,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  // 3. Automatically Create Student Record
  const studentCode = `STU-${course?.course_code?.slice(4, 8) || 'GEN'}-${String(store.students.length + 1).padStart(3, '0')}`;
  const newStudent: Student = {
    id: `stu-${Date.now()}`,
    user_id: studentUserId,
    admission_id: newAdmission.id,
    student_code: studentCode,
    admission_number,
    full_name: input.student_name,
    email: input.email,
    phone: input.phone,
    address: `${input.address}, ${input.city}`,
    course_id: input.course_id,
    course_name: course?.course_name,
    batch_id: input.batch_id,
    batch_name: batch?.batch_name,
    trainer_id: trainer?.id,
    trainer_name: trainer?.full_name,
    joining_date: input.admission_date,
    status: 'Active',
    total_fee: net_payable,
    paid_amount: 0,
    outstanding_amount: net_payable,
    attendance_percentage: 0,
    course_progress: 0,
    placement_status: 'Not Started',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  store.students.unshift(newStudent);

  // 4. Automatically Create Student Fee Ledger
  const newFeeAccount: StudentFeeAccount = {
    id: `fa-${Date.now()}`,
    student_id: newStudent.id,
    student_name: newStudent.full_name,
    admission_id: newAdmission.id,
    course_id: input.course_id,
    course_name: course?.course_name,
    original_fee: input.course_fee,
    discount: input.discount || 0,
    discount_reason: input.discount_reason,
    net_payable,
    paid_amount: 0,
    outstanding_amount: net_payable,
    payment_plan: input.payment_plan,
    status: 'Unpaid',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  store.feeAccounts.unshift(newFeeAccount);

  // 5. Automatically Generate Payment Installment Schedule
  let numInstallments = 1;
  if (input.payment_plan === '2 Installments') numInstallments = 2;
  else if (input.payment_plan === '3 Installments') numInstallments = 3;
  else if (input.payment_plan === 'Custom') numInstallments = 4;

  const installmentAmount = Math.round(net_payable / numInstallments);
  const baseDate = new Date(input.admission_date);

  const newInstallments: Installment[] = [];
  for (let i = 1; i <= numInstallments; i++) {
    const dueDate = new Date(baseDate);
    dueDate.setMonth(dueDate.getMonth() + (i - 1));

    const isLast = i === numInstallments;
    const finalAmount = isLast ? net_payable - installmentAmount * (numInstallments - 1) : installmentAmount;

    const inst: Installment = {
      id: `inst-${newFeeAccount.id}-${i}`,
      fee_account_id: newFeeAccount.id,
      student_id: newStudent.id,
      installment_number: i,
      amount: finalAmount,
      due_date: dueDate.toISOString().slice(0, 10),
      paid_amount: 0,
      status: i === 1 ? 'Due' : 'Upcoming',
    };
    newInstallments.push(inst);
    store.installments.push(inst);
  }

  // 6. If converted from CRM lead, mark lead as converted
  if (input.lead_id) {
    const lead = store.leads.find((l) => l.id === input.lead_id);
    if (lead) {
      lead.stage = 'Converted';
      lead.notes = `${lead.notes || ''}\nConverted to Admission: ${admission_number}`;
      lead.updated_at = new Date().toISOString();
    }
  }

  // Persist state to disk (ensures no data loss on restarts/cold starts)
  store.persist();

  // Direct Supabase queries utilizing PostgreSQL schema migrations
  if (isLiveSupabaseEnabled()) {
    try {
      const supabase = createClient();

    // 1. Direct insert to admissions table
    await supabase.from('admissions').insert({
      id: newAdmission.id,
      admission_number: newAdmission.admission_number,
      student_name: newAdmission.student_name,
      phone: newAdmission.phone,
      email: newAdmission.email,
      dob: newAdmission.dob,
      gender: newAdmission.gender,
      address: newAdmission.address,
      city: newAdmission.city,
      education: newAdmission.education,
      experience_years: newAdmission.experience_years,
      current_employment_status: newAdmission.current_employment_status,
      course_id: newAdmission.course_id,
      training_mode: newAdmission.training_mode,
      batch_id: newAdmission.batch_id,
      trainer_id: newAdmission.trainer_id,
      admission_date: newAdmission.admission_date,
      course_fee: newAdmission.course_fee,
      discount: newAdmission.discount,
      discount_reason: newAdmission.discount_reason,
      net_payable: newAdmission.net_payable,
      payment_plan: newAdmission.payment_plan,
      counsellor_id: newAdmission.counsellor_id,
      status: newAdmission.status,
    });

    // 2. Direct insert to students table
    await supabase.from('students').insert({
      id: newStudent.id,
      user_id: newStudent.user_id,
      admission_id: newAdmission.id,
      student_code: newStudent.student_code,
      admission_number: newStudent.admission_number,
      full_name: newStudent.full_name,
      email: newStudent.email,
      phone: newStudent.phone,
      address: newStudent.address,
      course_id: newStudent.course_id,
      batch_id: newStudent.batch_id,
      trainer_id: newStudent.trainer_id,
      joining_date: newStudent.joining_date,
      status: newStudent.status,
      total_fee: newStudent.total_fee,
      paid_amount: newStudent.paid_amount,
      outstanding_amount: newStudent.outstanding_amount,
      attendance_percentage: newStudent.attendance_percentage,
      course_progress: newStudent.course_progress,
      placement_status: newStudent.placement_status,
    });

    // 3. Direct insert to student_fee_accounts table
    await supabase.from('student_fee_accounts').insert({
      id: newFeeAccount.id,
      student_id: newStudent.id,
      admission_id: newAdmission.id,
      course_id: newFeeAccount.course_id,
      original_fee: newFeeAccount.original_fee,
      discount: newFeeAccount.discount,
      discount_reason: newFeeAccount.discount_reason,
      net_payable: newFeeAccount.net_payable,
      paid_amount: newFeeAccount.paid_amount,
      outstanding_amount: newFeeAccount.outstanding_amount,
      payment_plan: newFeeAccount.payment_plan,
      status: newFeeAccount.status,
    });

    // 4. Direct insert to installments table
    if (newInstallments.length > 0) {
      await supabase.from('installments').insert(
        newInstallments.map((inst) => ({
          id: inst.id,
          fee_account_id: inst.fee_account_id,
          student_id: inst.student_id,
          installment_number: inst.installment_number,
          amount: inst.amount,
          due_date: inst.due_date,
          paid_amount: inst.paid_amount,
          status: inst.status,
        }))
      );
    }

    // 5. Direct update to leads table if converted
    if (input.lead_id) {
      await supabase
        .from('leads')
        .update({
          stage: 'Converted',
          notes: `Converted to Admission: ${admission_number}`,
          updated_at: new Date().toISOString(),
        })
        .eq('id', input.lead_id);
    }
    } catch (err) {
      console.warn('Supabase direct admission insert warning, preserved in local persistent storage:', err);
    }
  }

  // 7. Audit Log
  await recordAuditLog({
    user_id: performedByUserId,
    user_name: actor?.full_name || 'Admin',
    user_role: actor?.role || 'admin',
    action: 'ADMISSION_CONFIRMED',
    module: 'ADMISSIONS',
    record_id: newAdmission.id,
    new_value: {
      admission_number,
      student: newStudent.full_name,
      course: course?.course_name,
      net_payable,
      installments: numInstallments,
    },
  });

  return { admission: newAdmission, student: newStudent, feeAccount: newFeeAccount };
}
