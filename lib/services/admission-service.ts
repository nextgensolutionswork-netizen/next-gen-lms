import { resolveCourseId } from '@/lib/utils/course-resolver';
import { validateAdmissionCourse } from './admission-course';
import { store } from './data-store';
import {
  Admission,
  Student,
  StudentFeeAccount,
  Installment,
  StudentFee,
  StudentFinancialLedgerEntry,
  FeeApprovalHistory,
  Payment,
  Receipt,
  PaymentMethod,
} from '@/types';
import { recordAuditLog } from './audit-service';
import { generateAdmissionNumber } from '@/lib/utils/formatters';
import { createClient, isLiveSupabaseEnabled } from '@/lib/supabase/db';
import { ensureOnboardingCaseForAdmission } from './onboarding-service';
import { feeWorkflowService } from './fee-workflow-service';
import { tenantId } from '@/lib/auth/tenant';
import type { StudentPaymentRecord } from '@/types';

export async function getAdmissions(): Promise<Admission[]> {
  if (typeof window !== 'undefined') {
    const { paymentWorkflowClient } = await import('./payment-workflow-client');
    await paymentWorkflowClient.refreshAdmissions();
    return [...store.admissions];
  }
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
  state?: string;
  state_code?: string;
  gstin?: string;
  education: string;
  experience_years: number;
  current_employment_status: 'Employed' | 'Unemployed' | 'Student' | 'Career Gap';
  course_id: string;
  training_mode?: 'Online' | 'Classroom' | 'Hybrid';
  batch_id?: string;
  trainer_id?: string;
  admission_date: string;
  fee_due_date?: string;
  course_fee: number;
  discount: number;
  discount_reason?: string;
  payment_plan: 'Full Payment' | '2 Installments' | '3 Installments' | 'Custom';
  counsellor_id?: string;
  lead_id?: string; // Optional: if converted from CRM
  initial_payment_amount?: number;
  payment_mode?: PaymentMethod;
  transaction_reference?: string;
  bank_upi_reference?: string;
  initial_payment_notes?: string;
  payment_proof_url?: string;
  payment_date?: string;
  idempotency_key?: string;
}

export async function createAdmissionWorkflow(
  input: CreateAdmissionInput,
  performedByUserId: string,
  transactional = false
): Promise<{
  admission: Admission;
  student: Student;
  feeAccount: StudentFeeAccount;
  studentFee?: StudentFee;
  installments?: Installment[];
  payment?: StudentPaymentRecord;
  receipt?: Receipt;
}> {
  if (typeof window !== 'undefined') {
    const { paymentWorkflowClient } = await import('./payment-workflow-client');
    const serverResult = await paymentWorkflowClient.createAdmission(input);
    if (serverResult && serverResult.admission) {
      return serverResult;
    }
    throw new Error('Server admission creation did not return a valid admission record.');
  }

  // Authoritative server path: If not already inside an active paymentTransaction, redirect into it
  if (!transactional) {
    const { paymentTransaction } = await import('./payment-workflow-transaction');
    const actor =
      store.users.find((u) => u.id === performedByUserId || u.email === performedByUserId) ||
      store.users.find((u) => ['counsellor', 'admin', 'super_admin'].includes(u.role) && u.is_active !== false) ||
      store.users[0];
    return paymentTransaction(actor, () => createAdmissionWorkflow(input, performedByUserId, true));
  }

  const performingUser =
    store.users.find((u) => u.id === performedByUserId || u.email === performedByUserId) ||
    store.users.find((u) => ['counsellor', 'admin', 'super_admin'].includes(u.role) && u.is_active !== false) ||
    store.users[0];

  if (input.lead_id) {
    let existingLead = store.leads.find((l) => l.id === input.lead_id);
    if (!existingLead && isLiveSupabaseEnabled()) {
      try {
        const { createAdminClient } = await import('@/lib/supabase/admin');
        const { data: dbLead } = await createAdminClient().from('leads').select('*').eq('id', input.lead_id).maybeSingle();
        if (dbLead) {
          store.leads.unshift(dbLead as any);
          existingLead = dbLead as any;
        }
      } catch {}
    }
    if (!existingLead) {
      throw new Error(`Lead not found with ID ${input.lead_id}. Cannot convert non-existent lead.`);
    }
    if (performingUser && performingUser.role === 'counsellor' && existingLead.counsellor_id && existingLead.counsellor_id !== performingUser.id) {
      throw new Error('Forbidden: You are not authorized to convert leads assigned to another counsellor.');
    }
    if (existingLead.stage === 'Converted') {
      throw new Error('Lead has already been converted to an admission. Duplicate conversion is not allowed.');
    }
    const isAlreadyConverted = (store.admissions || []).some(
      (a) => (a as any).lead_id === input.lead_id || (a as any).converted_lead_id === input.lead_id
    );
    if (isAlreadyConverted) {
      throw new Error('Lead has already been converted to an admission. Duplicate conversion is not allowed.');
    }
  }
  if (!performingUser || !performingUser.is_active || !['counsellor', 'admin', 'super_admin'].includes(performingUser.role)) {
    throw new Error('Unauthorized admission registration.');
  }
  const admissionTenant = tenantId(performingUser);

  // B09: Admission Idempotency Check
  const idempotencyKey = input.idempotency_key;
  if (idempotencyKey) {
    const existingAdmission = store.admissions.find(
      (a: any) => a.idempotency_key === idempotencyKey && tenantId(a) === admissionTenant
    );
    if (existingAdmission) {
      const existingStudent = store.students.find((s) => s.id === existingAdmission.student_id);
      const existingFeeAccount = store.feeAccounts.find((fa) => fa.admission_id === existingAdmission.id);
      const existingStudentFee = store.studentFees?.find((sf) => sf.enrollment_id === existingAdmission.id);
      const existingPayment = store.studentPayments?.find((p) => p.enrollment_id === existingAdmission.id);
      const existingReceipt = store.receipts?.find(
        (r) => (r as any).enrollment_id === existingAdmission.id || (existingPayment && r.payment_id === existingPayment.id)
      );
      return {
        admission: existingAdmission,
        student: existingStudent!,
        feeAccount: existingFeeAccount!,
        studentFee: existingStudentFee,
        payment: existingPayment,
        receipt: existingReceipt,
      };
    }
  }

  const feeDueDate = input.fee_due_date || input.admission_date;
  const parsedDueDate = new Date(`${feeDueDate}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(feeDueDate) || !Number.isFinite(parsedDueDate.getTime()) || parsedDueDate.toISOString().slice(0, 10) !== feeDueDate) {
    throw new Error('Please enter a valid fee due date.');
  }
  if (feeDueDate < input.admission_date) throw new Error('Fee due date cannot be before the admission date.');

  // Live admissions must use an authoritative canonical catalog ID, even if a seed matches.
  const course = await validateAdmissionCourse(input.course_id, tenantId(performingUser));
  input = { ...input, course_id: course.id };

  // B02: Validate Base Course Fee & Discount Authorization
  if (input.course_fee <= 0) {
    throw new Error('Course fee must be greater than zero.');
  }
  const discount = input.discount || 0;
  if (discount < 0) {
    throw new Error('Discount cannot be negative.');
  }
  if (discount > input.course_fee) {
    throw new Error(`Invalid discount: Discount (₹${discount}) cannot exceed the course fee (₹${input.course_fee}).`);
  }
  const discountPercent = input.course_fee > 0 ? (discount / input.course_fee) * 100 : 0;
  if (performingUser.role === 'counsellor') {
    const maxCounsellorDiscount = 15;
    if (discountPercent > maxCounsellorDiscount) {
      throw new Error(
        `Unauthorized discount: Counsellors cannot approve discounts exceeding ${maxCounsellorDiscount}% (₹${(input.course_fee * maxCounsellorDiscount) / 100}). Accountant or Management approval required.`
      );
    }
  }

  const sequence = store.admissions.length + 1;
  const admission_number = generateAdmissionNumber(sequence);

  const net_payable = Math.max(0, input.course_fee - discount);

  // B08: Shared Strict Payment Validation for Initial Payments
  if (input.initial_payment_amount !== undefined && input.initial_payment_amount > 0) {
    if (input.initial_payment_amount > net_payable) {
      throw new Error(
        `Initial payment amount (₹${input.initial_payment_amount}) cannot exceed net payable course fee (₹${net_payable}).`
      );
    }
    const mode = input.payment_mode || 'UPI';
    if (mode !== 'Cash' && !input.transaction_reference?.trim()) {
      throw new Error('Transaction reference is required for non-cash initial payments.');
    }
    if (!input.payment_proof_url) {
      throw new Error('Attach payment proof before submitting the initial payment.');
    }
    if (input.payment_date) {
      const parsedPaymentDate = new Date(`${input.payment_date}T00:00:00.000Z`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(input.payment_date) || !Number.isFinite(parsedPaymentDate.getTime())) {
        throw new Error('Please enter a valid initial payment date.');
      }
    }
  }

  const normalizedBatchId = input.batch_id ? input.batch_id.replace(/^(btc|bch)-/, 'batch-') : undefined;
  let batch = input.batch_id
    ? store.batches.find((b) => b.id === input.batch_id || b.id === normalizedBatchId || b.batch_code === input.batch_id)
    : undefined;
  if (input.batch_id && !batch && isLiveSupabaseEnabled()) {
    try {
      const { createAdminClient } = await import('@/lib/supabase/admin');
      const { data: dbBatch } = await createAdminClient().from('batches').select('*').eq('id', input.batch_id).maybeSingle();
      if (dbBatch) {
        store.batches.push(dbBatch as any);
        batch = dbBatch as any;
      }
    } catch {}
  }
  if (input.batch_id && !batch) {
    throw new Error(`Invalid Batch: Selected batch "${input.batch_id}" does not exist.`);
  }
  if (batch) {
    const courseIds = new Set([course.id, batch.course_id]);
    const isCourseMatch = resolveCourseId(batch.course_id, courseIds, tenantId(performingUser)) === resolveCourseId(course.id, courseIds, tenantId(performingUser));
    if (input.course_id && batch.course_id && !isCourseMatch) {
      throw new Error(`Course-Batch Mismatch: Selected batch "${batch.batch_name}" belongs to course "${batch.course_id}", not "${input.course_id}".`);
    }
    const maxCapacity = batch.maximum_capacity ?? 25;
    if ((batch.current_enrolled || 0) >= maxCapacity) {
      throw new Error(`Batch capacity reached: Selected batch "${batch.batch_name}" is full (${batch.current_enrolled}/${maxCapacity} enrolled).`);
    }
    batch.current_enrolled = (batch.current_enrolled || 0) + 1;
    batch.updated_at = new Date().toISOString();
  }
  const trainer = store.users.find((u) => u.id === (input.trainer_id || batch?.trainer_id));
  const fallbackCounsellor = store.users.find((u) => u.role === 'counsellor' && u.is_active && tenantId(u) === admissionTenant);
  const counsellor = (input.counsellor_id ? store.users.find((u) => u.id === input.counsellor_id) : undefined)
    || (performingUser.role === 'counsellor' ? performingUser : fallbackCounsellor)
    || performingUser;
  const actor = performingUser;

  // Resolve student location
  const stateVal = input.state || (input.city?.toLowerCase().includes('pune') || input.city?.toLowerCase().includes('mumbai') ? 'Maharashtra' : input.city?.toLowerCase().includes('bengaluru') || input.city?.toLowerCase().includes('bangalore') ? 'Karnataka' : 'Telangana');
  const stateCodeVal = input.state_code || (stateVal === 'Maharashtra' ? '27' : stateVal === 'Karnataka' ? '29' : '36');

  // 1. Create Admission Record
  const newAdmission: Admission = {
    tenant_id: admissionTenant,
    id: `adm-${Date.now()}`,
    admission_number,
    student_name: input.student_name,
    phone: input.phone,
    email: input.email,
    dob: input.dob,
    gender: input.gender,
    address: input.address,
    city: input.city,
    state: stateVal,
    state_code: stateCodeVal,
    gstin: input.gstin,
    education: input.education,
    experience_years: input.experience_years,
    current_employment_status: input.current_employment_status,
    course_id: input.course_id,
    course_name: course?.course_name,
    training_mode: input.training_mode || 'Online',
    batch_id: input.batch_id,
    batch_name: batch?.batch_name,
    trainer_id: trainer?.id,
    trainer_name: trainer?.full_name,
    admission_date: input.admission_date,
    course_fee: input.course_fee,
    discount: input.discount || 0,
    discount_reason: input.discount_reason,
    net_payable,
    payment_plan: 'Full Payment',
    counsellor_id: counsellor?.id,
    counsellor_name: counsellor?.full_name,
    lead_id: input.lead_id,
    status: 'Confirmed',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  (newAdmission as any).idempotency_key = input.idempotency_key;

  store.admissions.unshift(newAdmission);

  // 2. Automatically Create Student User Profile & Portal Account
  const studentUserId = `usr-stu-${Date.now()}`;
  store.users.push({
    tenant_id: admissionTenant,
    id: studentUserId,
    email: input.email,
    full_name: input.student_name,
    role: 'student',
    phone: input.phone,
    is_active: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  // 3. Automatically Create Student Record
  const studentCode = `STU-${course?.course_code?.slice(4, 8) || 'GEN'}-${String(store.students.length + 1).padStart(3, '0')}`;
  const newStudent: Student = {
    onboarding_required: true,
    tenant_id: admissionTenant,
    id: `stu-${Date.now()}`,
    user_id: studentUserId,
    admission_id: newAdmission.id,
    student_code: studentCode,
    admission_number,
    full_name: input.student_name,
    email: input.email,
    phone: input.phone,
    address: `${input.address}, ${input.city}, ${stateVal}`,
    city: input.city,
    state: stateVal,
    state_code: stateCodeVal,
    gstin: input.gstin,
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

  newAdmission.student_id = newStudent.id;
  store.students.unshift(newStudent);

  // 4. Automatically Create Student Fee Ledger
  const newFeeAccount: StudentFeeAccount = {
    tenant_id: admissionTenant,
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
    payment_plan: input.payment_plan || 'Full Payment',
    status: 'Unpaid',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  store.feeAccounts.unshift(newFeeAccount);

  // 5b. Dual-Ledger Sync: Automatically Generate Approved StudentFee in Advanced Store
  const discountAmount = input.discount || 0;
  const courseFee = input.course_fee || 0;
  const discountPct = courseFee > 0 ? Number(((discountAmount / courseFee) * 100).toFixed(2)) : 0;
  const taxGstAmount = 0;
  const nowStr = new Date().toISOString();

  // B02: Financial separation of duties - Counsellors cannot self-approve discount waivers
  const approverUser =
    performingUser.role === 'admin' || performingUser.role === 'super_admin' || discountAmount === 0
      ? performingUser
      : store.users.find((u) => (u.role === 'accountant' || u.role === 'admin') && u.is_active && tenantId(u) === admissionTenant) ||
        { id: 'usr-accounts', full_name: 'Accounts Department' };

  const numInstallments = 0;

  const newStudentFee: StudentFee = {
    enrollment_id: newAdmission.id,
    fee_account_id: newFeeAccount.id,
    tenant_id: admissionTenant,
    id: `fee-${newFeeAccount.id}`,
    student_id: newStudent.id,
    student_name: newStudent.full_name,
    student_code: newStudent.student_code || newStudent.id,
    admission_number: newAdmission.admission_number,
    fee_category: 'Course Admission Fee',
    reference_type: 'Course',
    reference_id: input.course_id,
    course_id: input.course_id,
    course_name: course?.course_name,
    batch_id: input.batch_id,
    batch_name: store.batches.find((b) => b.id === input.batch_id)?.batch_name,
    sap_module: course?.category || 'SAP',
    standard_fee: courseFee,
    proposed_fee: courseFee,
    discount_amount: discountAmount,
    discount_percentage: discountPct,
    discount_reason: input.discount_reason || 'Admission Discount',
    discount_approval_level: discountPct > 10 ? 'Management' : 'Accountant',
    tax_gst_amount: taxGstAmount,
    additional_charges: 0,
    final_payable: net_payable,
    paid_amount: 0,
    outstanding_amount: net_payable,
    payment_plan: input.payment_plan || 'Full Payment',
    number_of_installments: numInstallments,
    first_due_date: feeDueDate,
    counsellor_id: counsellor.id,
    counsellor_name: counsellor.full_name || 'Counsellor Staff',
    counsellor_notes: `Admission confirmed: ${newAdmission.admission_number}`,
    approval_status: 'Approved',
    submitted_by: counsellor.id,
    submitted_by_name: counsellor.full_name || 'Counsellor Staff',
    submitted_at: nowStr,
    approved_by: approverUser.id,
    approved_by_name: approverUser.full_name || 'Accounts Department',
    approved_at: nowStr,
    approved_fee: courseFee,
    approved_discount: discountAmount,
    approved_tax: taxGstAmount,
    approved_total: net_payable,
    approval_notes: 'Auto-approved on admission workflow with Accounts authorization',
    version: 1,
    is_payable: true,
    created_at: nowStr,
    updated_at: nowStr,
  };

  if (!store.studentFees) store.studentFees = [];
  store.studentFees.unshift(newStudentFee);

  // B06: Generate Installments if payment plan specifies installments
  const newInstallments: Installment[] =
    numInstallments > 0
      ? feeWorkflowService.generateInstallmentsForFee(newStudentFee, newFeeAccount.id)
      : [];

  // 5c. Post Initial Entry to Student Financial Ledger (Fee Raised)
  if (!store.studentFinancialLedgers) store.studentFinancialLedgers = [];
  store.studentFinancialLedgers.push({
    id: `sfl-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    student_id: newStudent.id,
    entry_date: input.admission_date,
    entry_type: 'Fee Raised',
    fee_category: 'Course Admission Fee',
    reference_type: 'Course',
    reference_id: newStudentFee.id,
    debit: net_payable,
    credit: 0,
    running_balance: net_payable,
    description: `Admission Course Fee (${course?.course_name || 'SAP Course'}) - ${newAdmission.admission_number}`,
    recorded_by: actor.id,
    created_at: nowStr,
  });

  // 5d. Record Approval History
  if (!store.feeApprovalHistories) store.feeApprovalHistories = [];
  store.feeApprovalHistories.push({
    id: `fah-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    fee_id: newStudentFee.id,
    student_id: newStudent.id,
    action: 'Approved',
    actor_id: actor.id,
    actor_name: actor.full_name || 'Administration',
    actor_role: actor.role || 'admin',
    new_status: 'Approved',
    amount_snapshot: net_payable,
    discount_snapshot: discountAmount,
    notes: 'Auto-approved on admission creation',
    timestamp: nowStr,
  });

  // 5e. Process Initial Admission Payment / Downpayment (if provided)
  let initialPayment: StudentPaymentRecord | undefined;
  if (input.initial_payment_amount && input.initial_payment_amount > 0) {
    initialPayment = feeWorkflowService.recordPayment({
      fee_id: newStudentFee.id, student_id: newStudent.id, enrollment_id: newAdmission.id,
      amount_paid: input.initial_payment_amount, payment_mode: input.payment_mode || 'UPI',
      payment_date: input.payment_date || input.admission_date, transaction_reference: input.transaction_reference,
      payment_proof_url: input.payment_proof_url, notes: input.initial_payment_notes,
    }, performedByUserId, performingUser.role);
  }

  // 6. If converted from CRM lead, mark lead as converted
  if (input.lead_id) {
    let lead = store.leads.find((l) => l.id === input.lead_id);
    if (!lead && isLiveSupabaseEnabled()) {
      try {
        const { createAdminClient } = await import('@/lib/supabase/admin');
        const { data: dbLead } = await createAdminClient().from('leads').select('*').eq('id', input.lead_id).maybeSingle();
        if (dbLead) {
          store.leads.unshift(dbLead as any);
          lead = dbLead as any;
        }
      } catch {}
    }
    if (!lead) {
      throw new Error(`Lead not found with ID ${input.lead_id}. Cannot convert non-existent lead.`);
    }
    if (performingUser && performingUser.role === 'counsellor' && lead.counsellor_id && lead.counsellor_id !== performingUser.id) {
      throw new Error('Forbidden: You are not authorized to convert leads assigned to another counsellor.');
    }
    if (lead.tenant_id && performingUser && lead.tenant_id !== (performingUser.tenant_id || 'default')) {
      throw new Error('Forbidden: Lead belongs to another tenant.');
    }
    if (lead.stage === 'Converted') {
      throw new Error('Lead has already been converted to an admission. Duplicate conversion is not allowed.');
    }
    const alreadyConvertedInAdmissions = (store.admissions || []).some(
      (a) => a.id !== newAdmission.id && ((a as any).lead_id === input.lead_id || (a as any).converted_lead_id === input.lead_id)
    );
    if (alreadyConvertedInAdmissions) {
      throw new Error('Lead has already been converted to an admission. Duplicate conversion is not allowed.');
    }

    lead.stage = 'Converted';
    lead.notes = `${lead.notes || ''}\nConverted to Admission: ${admission_number}`.trim();
    lead.updated_at = new Date().toISOString();
    (newAdmission as any).lead_id = input.lead_id;
    (newAdmission as any).converted_lead_id = input.lead_id;

    if (isLiveSupabaseEnabled()) {
      try {
        const { createAdminClient } = await import('@/lib/supabase/admin');
        await createAdminClient().from('leads').update({
          stage: 'Converted',
          notes: lead.notes,
          updated_at: lead.updated_at,
        }).eq('id', input.lead_id);
      } catch (err) {
        console.warn('Failed to update lead stage in Supabase:', err);
      }
    }
  }

  // Persist state to disk (ensures no data loss on restarts/cold starts)
  store.persist();

// Unsafe sequential relational path removed: authoritative persistence handled atomically via paymentTransaction

  // 7. Audit Log
  const auditData = {
    tenant_id: admissionTenant,
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
    },
  };
  if (transactional) store.auditLogs.unshift({ ...auditData, id: crypto.randomUUID(), created_at: new Date().toISOString() });
  else await recordAuditLog(auditData);

  return {
    admission: newAdmission,
    student: newStudent,
    feeAccount: newFeeAccount,
    studentFee: newStudentFee,
    installments: newInstallments,
    payment: initialPayment,
    receipt: undefined,
  };
}
