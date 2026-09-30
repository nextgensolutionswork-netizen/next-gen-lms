import { getDb, isLiveSupabaseEnabled } from './db';
import {
  Admission,
  Student,
  StudentFeeAccount,
  Payment,
  Receipt,
  StudentDoubt,
  DoubtMessage,
  Lead,
  Course,
  Batch,
  SapServerSystem,
  SapServerAllocation,
  AuditLog,
} from '@/types';

// ==========================================
// 1. ADMISSIONS & STUDENTS
// ==========================================

export async function dbGetAdmissions(): Promise<Admission[]> {
  const db = getDb();
  const { data, error } = await db.from('admissions').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function dbCreateAdmission(admission: Admission, student: Student, feeAccount: StudentFeeAccount): Promise<void> {
  const db = getDb();
  
  // 1. Insert admission
  const { error: errAdm } = await db.from('admissions').insert({
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
    training_mode: admission.training_mode,
    course_fee: admission.course_fee,
    discount: admission.discount,
    discount_reason: admission.discount_reason,
    net_payable: admission.net_payable,
    payment_plan: admission.payment_plan,
    status: admission.status,
    admission_date: admission.admission_date,
  });
  if (errAdm) throw errAdm;

  // 2. Insert student profile
  const { error: errStu } = await db.from('students').insert({
    admission_number: student.admission_number,
    student_code: student.student_code,
    full_name: student.full_name,
    email: student.email,
    phone: student.phone,
    address: student.address,
    status: student.status,
    total_fee: student.total_fee,
    paid_amount: student.paid_amount,
    outstanding_amount: student.outstanding_amount,
    attendance_percentage: student.attendance_percentage,
    course_progress: student.course_progress,
    placement_status: student.placement_status,
  });
  if (errStu) throw errStu;

  // 3. Insert student fee account
  const { error: errFee } = await db.from('student_fee_accounts').insert({
    original_fee: feeAccount.original_fee,
    discount: feeAccount.discount,
    net_payable: feeAccount.net_payable,
    paid_amount: feeAccount.paid_amount,
    outstanding_amount: feeAccount.outstanding_amount,
    status: feeAccount.status,
  });
  if (errFee) throw errFee;
}

export async function dbGetStudents(): Promise<Student[]> {
  const db = getDb();
  const { data, error } = await db.from('students').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

// ==========================================
// 2. FINANCIAL PAYMENTS & RECEIPTS
// ==========================================

export async function dbGetPayments(): Promise<Payment[]> {
  const db = getDb();
  const { data, error } = await db.from('payments').select('*').order('payment_date', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function dbGetReceipts(): Promise<Receipt[]> {
  const db = getDb();
  const { data, error } = await db.from('receipts').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function dbRecordPayment(payment: Payment, receipt: Receipt, feeAccountId: string, newPaid: number, newOut: number, status: string): Promise<void> {
  const db = getDb();

  // Check duplicate transaction reference if present
  if (payment.transaction_reference) {
    const { data: existing } = await db
      .from('payments')
      .select('id, receipt_number')
      .eq('transaction_reference', payment.transaction_reference)
      .maybeSingle();

    if (existing) {
      throw new Error(`Duplicate transaction reference detected: ${payment.transaction_reference}`);
    }
  }

  // 1. Insert payment record
  const { error: errPay } = await db.from('payments').insert({
    receipt_number: payment.receipt_number,
    amount: payment.amount,
    payment_date: payment.payment_date,
    payment_mode: payment.payment_mode,
    transaction_reference: payment.transaction_reference,
    notes: payment.notes,
  });
  if (errPay) throw errPay;

  // 2. Insert receipt
  const { error: errRec } = await db.from('receipts').insert({
    receipt_number: receipt.receipt_number,
    student_name: receipt.student_name,
    admission_number: receipt.admission_number,
    course_name: receipt.course_name,
    payment_amount: receipt.payment_amount,
    payment_mode: receipt.payment_mode,
    transaction_reference: receipt.transaction_reference,
    payment_date: receipt.payment_date,
    remaining_balance: receipt.remaining_balance,
    authorized_by: receipt.authorized_by,
    institute_name: receipt.institute_name,
    institute_address: receipt.institute_address,
    institute_phone: receipt.institute_phone,
    institute_gst: receipt.institute_gst,
  });
  if (errRec) throw errRec;
}

// ==========================================
// 3. STUDENT DOUBTS & HELPDESK
// ==========================================

export async function dbGetDoubts(filters?: {
  student_id?: string;
  assigned_to_id?: string;
  status?: string;
  category?: string;
  search?: string;
}): Promise<StudentDoubt[]> {
  const db = getDb();
  let query = db.from('student_doubts').select('*, messages:doubt_messages(*)').order('updated_at', { ascending: false });

  if (filters?.student_id) {
    query = query.eq('student_id', filters.student_id);
  }
  if (filters?.assigned_to_id) {
    query = query.eq('assigned_to_id', filters.assigned_to_id);
  }
  if (filters?.status && filters.status !== 'All') {
    query = query.eq('status', filters.status);
  }
  if (filters?.category && filters.category !== 'All') {
    query = query.eq('category', filters.category);
  }
  if (filters?.search && filters.search.trim()) {
    query = query.ilike('title', `%${filters.search.trim()}%`);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function dbCreateDoubt(doubt: StudentDoubt, initialMessage: string, senderId: string, senderName: string): Promise<StudentDoubt> {
  const db = getDb();

  const { data: createdDoubt, error: errDbt } = await db
    .from('student_doubts')
    .insert({
      ticket_number: doubt.ticket_number,
      student_name: doubt.student_name,
      admission_number: doubt.admission_number,
      course_name: doubt.course_name,
      batch_name: doubt.batch_name,
      assigned_to_name: doubt.assigned_to_name,
      assigned_to_role: doubt.assigned_to_role,
      title: doubt.title,
      description: doubt.description,
      category: doubt.category,
      priority: doubt.priority,
      status: doubt.status,
      sap_tcode: doubt.sap_tcode,
    })
    .select()
    .single();

  if (errDbt) throw errDbt;

  if (createdDoubt) {
    await db.from('doubt_messages').insert({
      doubt_id: createdDoubt.id,
      sender_id: senderId,
      sender_name: senderName,
      sender_role: 'student',
      message: initialMessage,
    });
  }

  return createdDoubt || doubt;
}

export async function dbReplyToDoubt(doubtId: string, message: DoubtMessage): Promise<void> {
  const db = getDb();

  const { error: errReply } = await db.from('doubt_messages').insert({
    doubt_id: doubtId,
    sender_id: message.sender_id,
    sender_name: message.sender_name,
    sender_role: message.sender_role,
    message: message.message,
    attachment_url: message.attachment_url,
  });
  if (errReply) throw errReply;

  await db
    .from('student_doubts')
    .update({ status: 'In Progress', updated_at: new Date().toISOString() })
    .eq('id', doubtId);
}

export async function dbResolveDoubt(doubtId: string, resolvedBy: string, resolutionNote?: string): Promise<void> {
  const db = getDb();
  const now = new Date().toISOString();

  await db
    .from('student_doubts')
    .update({ status: 'Resolved', resolved_at: now, updated_at: now })
    .eq('id', doubtId);

  if (resolutionNote) {
    await db.from('doubt_messages').insert({
      doubt_id: doubtId,
      sender_id: resolvedBy,
      sender_name: 'Support Mentor',
      sender_role: 'support',
      message: `[Resolution Note]: ${resolutionNote}`,
    });
  }
}

// ==========================================
// 4. CRM LEADS
// ==========================================

export async function dbGetLeads(): Promise<Lead[]> {
  const db = getDb();
  const { data, error } = await db.from('leads').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function dbCreateLead(lead: Lead): Promise<void> {
  const db = getDb();
  const { error } = await db.from('leads').insert({
    lead_code: lead.lead_code,
    full_name: lead.full_name,
    phone: lead.phone,
    email: lead.email,
    current_status: lead.current_status,
    experience_years: lead.experience_years,
    training_preference: lead.training_preference,
    lead_source: lead.lead_source,
    stage: lead.stage,
    notes: lead.notes,
  });
  if (error) throw error;
}

// ==========================================
// 5. AUDIT LOGS
// ==========================================

export async function dbRecordAuditLog(log: AuditLog): Promise<void> {
  const db = getDb();
  await db.from('audit_logs').insert({
    user_id: log.user_id,
    user_name: log.user_name,
    user_role: log.user_role,
    action: log.action,
    module: log.module,
    record_id: log.record_id,
    old_value: log.old_value,
    new_value: log.new_value,
  });
}
