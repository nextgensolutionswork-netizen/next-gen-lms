import { store } from './data-store';
import {
  StudentFeeAccount,
  Payment,
  Receipt,
  Expense,
  Vendor,
  PaymentMethod,
  ExpenseCategory,
  ExpenseStatus,
  StudentFee,
  StudentPaymentRecord,
  StudentFinancialLedgerEntry,
} from '@/types';
import { generateReceiptNumber } from '@/lib/utils/formatters';
import { recordAuditLog } from './audit-service';
import { createClient, isLiveSupabaseEnabled, isProductionEnvironment } from '@/lib/supabase/db';
import { createAdminClient } from '@/lib/supabase/admin';
import { receiptAmounts } from './receipt-amounts';
import { generateAndSaveReceiptPdf } from './pdf-service';
import { dispatchMultiChannelNotification, buildReceiptEmailHtml } from './notification-service';
import { emitSyncEvent } from './sync-events';
import { isPaymentApproved, isPaymentPending } from '@/lib/utils/dashboard-metrics';
import { getAuthorizedBankAccounts } from '@/lib/utils/bank-autofill';
import { idempotencyService } from './idempotency-service';

// --- Student Fee Accounts & Installments ---
export async function getStudentFeeAccounts(): Promise<StudentFeeAccount[]> {
  if (typeof window !== 'undefined') {
    const { paymentWorkflowClient } = await import('./payment-workflow-client');
    await paymentWorkflowClient.refresh();
    return [...store.feeAccounts];
  }
  if (isLiveSupabaseEnabled()) {
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('student_fee_accounts')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[finance-service] Supabase fee accounts query failed:', error.message || error);
        throw new Error(`Failed to retrieve authoritative fee accounts: ${error.message || error}`);
      }

      if (Array.isArray(data)) {
        store.feeAccounts = data as StudentFeeAccount[];
        return data as StudentFeeAccount[];
      }
    } catch (err: any) {
      if (isProductionEnvironment() || isLiveSupabaseEnabled()) {
        throw err;
      }
      console.warn('Supabase fee accounts query error, falling back to local persistent store:', err);
    }
  }
  if (isProductionEnvironment()) {
    return [];
  }
  return [...store.feeAccounts];
}

export async function getFeeAccountForStudent(studentId: string): Promise<StudentFeeAccount | undefined> {
  if (typeof window !== 'undefined') {
    const { paymentWorkflowClient } = await import('./payment-workflow-client');
    await paymentWorkflowClient.refresh();
    return store.feeAccounts.find((f) => f.student_id === studentId);
  }
  if (isLiveSupabaseEnabled()) {
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('student_fee_accounts')
        .select('*')
        .eq('student_id', studentId)
        .maybeSingle();

      if (error) {
        console.error('[finance-service] Supabase fee account for student query failed:', error.message || error);
        throw new Error(`Failed to retrieve authoritative fee account: ${error.message || error}`);
      }

      return data ? (data as StudentFeeAccount) : undefined;
    } catch (err: any) {
      if (isProductionEnvironment() || isLiveSupabaseEnabled()) {
        throw err;
      }
      console.warn('Supabase fee account for student query error, checking local store:', err);
    }
  }
  if (isProductionEnvironment()) {
    return undefined;
  }
  return store.feeAccounts.find((f) => f.student_id === studentId);
}

export async function getPayments(): Promise<Payment[]> {
  if (isLiveSupabaseEnabled()) {
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('payments')
        .select('*')
        .order('payment_date', { ascending: false });

      if (error) {
        console.error('[finance-service] Supabase payments query failed:', error.message || error);
        throw new Error(`Failed to retrieve authoritative payments: ${error.message || error}`);
      }

      if (Array.isArray(data)) {
        store.payments = data as Payment[];
        return data as Payment[];
      }
    } catch (err: any) {
      if (isProductionEnvironment() || isLiveSupabaseEnabled()) {
        throw err;
      }
      console.warn('Supabase payments query error, falling back to local persistent store:', err);
    }
  }

  if (isProductionEnvironment()) {
    return [];
  }

  return [...store.payments].sort(
    (a, b) => new Date(b.payment_date).getTime() - new Date(a.payment_date).getTime()
  );
}

export async function getReceipts(): Promise<Receipt[]> {
  if (isLiveSupabaseEnabled()) {
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('receipts')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[finance-service] Supabase receipts query failed:', error.message || error);
        throw new Error(`Failed to retrieve authoritative receipts: ${error.message || error}`);
      }

      if (Array.isArray(data)) {
        store.receipts = data as Receipt[];
        return data as Receipt[];
      }
    } catch (err: any) {
      if (isProductionEnvironment() || isLiveSupabaseEnabled()) {
        throw err;
      }
      console.warn('Supabase receipts query error, falling back to local persistent store:', err);
    }
  }

  if (isProductionEnvironment()) {
    return [];
  }

  return [...store.receipts].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

export async function getReceiptById(receiptId: string): Promise<Receipt | undefined> {
  if (isLiveSupabaseEnabled()) {
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('receipts')
        .select('*')
        .or(`id.eq.${receiptId},receipt_number.eq.${receiptId}`)
        .maybeSingle();

      if (!error && data) {
        return data as Receipt;
      }
    } catch (err) {
      console.warn('Supabase getReceiptById error, checking local persistent store:', err);
    }
  }

  return store.receipts.find((r) => r.id === receiptId || r.receipt_number === receiptId);
}

// --- Atomic Payment Transaction ---
export interface RecordPaymentInput {
  payment_proof_url?: string;
  student_id: string;
  course_id: string;
  fee_account_id: string;
  installment_id?: string;
  amount: number;
  payment_date: string;
  payment_mode: PaymentMethod;
  transaction_reference?: string;
  gateway_order_id?: string;
  gateway_payment_id?: string;
  gateway_signature?: string;
  gateway_name?: 'Razorpay' | 'Cashfree';
  status?: 'Success' | 'Pending' | 'Failed' | 'Refunded';
  notes?: string;
}

export async function recordPaymentAtomic(
  input: RecordPaymentInput,
  collectorUserId: string
): Promise<{ payment: Payment; receipt: Receipt; updatedFeeAccount: StudentFeeAccount }> {
  // Prevent duplicate transaction reference if supplied
  if (input.transaction_reference && input.transaction_reference.trim() !== '') {
    const existingTx = store.payments.find(
      (p) =>
        p.transaction_reference &&
        p.transaction_reference.toLowerCase() === input.transaction_reference?.toLowerCase()
    );
    if (existingTx) {
      throw new Error(`Duplicate transaction reference detected: "${input.transaction_reference}". Payment already recorded on receipt ${existingTx.receipt_number}`);
    }
  }

  const feeAccount = store.feeAccounts.find((f) => f.id === input.fee_account_id);
  if (!feeAccount) throw new Error('Student fee account not found');

  const student = store.students.find((s) => s.id === input.student_id);
  if (!student) throw new Error('Student not found');

  const course = store.courses.find((c) => c.id === input.course_id);
  const collector = store.users.find((u) => u.id === collectorUserId);

  if (input.amount <= 0) {
    throw new Error('Payment amount must be greater than zero');
  }

  if (input.amount > feeAccount.outstanding_amount) {
    throw new Error(`Payment amount (₹${input.amount}) exceeds outstanding balance (₹${feeAccount.outstanding_amount})`);
  }

  // --- BEGIN TRANSACTION ---
  const receiptSequence = store.receipts.length + 1;
  const receiptNumber = generateReceiptNumber(receiptSequence);

  // 1. Create Payment
  const newPayment: Payment = {
    id: `pay-${Date.now()}`,
    receipt_number: receiptNumber,
    student_id: student.id,
    student_name: student.full_name,
    admission_number: student.admission_number,
    fee_account_id: feeAccount.id,
    installment_id: undefined,
    course_id: course?.id || feeAccount.course_id,
    course_name: course?.course_name || feeAccount.course_name,
    amount: input.amount,
    payment_date: input.payment_date,
    payment_mode: input.payment_mode,
    transaction_reference: input.transaction_reference,
    gateway_order_id: input.gateway_order_id,
    gateway_payment_id: input.gateway_payment_id,
    gateway_signature: input.gateway_signature,
    gateway_name: input.gateway_name,
    status: input.status || 'Success',
    collected_by: collectorUserId,
    collected_by_name: collector?.full_name || 'Staff',
    notes: input.notes,
    created_at: new Date().toISOString(),
  };

  // 2. Update Fee Balance
  const previousOutstanding = feeAccount.outstanding_amount;
  const newPaidAmount = feeAccount.paid_amount + input.amount;
  const newOutstandingAmount = Math.max(0, feeAccount.outstanding_amount - input.amount);

  feeAccount.paid_amount = newPaidAmount;
  feeAccount.outstanding_amount = newOutstandingAmount;
  feeAccount.status = newOutstandingAmount === 0 ? 'Paid' : 'Partially Paid';
  feeAccount.updated_at = new Date().toISOString();

  // Also update student profile snapshot
  student.paid_amount = newPaidAmount;
  student.outstanding_amount = newOutstandingAmount;
  student.updated_at = new Date().toISOString();

  // Generate a receipt for the amount paid.
  const admission = store.admissions.find(
    (a) => a.id === student.admission_id || a.admission_number === student.admission_number
  );
  const receiptDetails = receiptAmounts(input.amount);

  const newReceipt: Receipt = {
    id: `rcpt-${Date.now()}`,
    receipt_number: receiptNumber,
    payment_id: newPayment.id,
    student_id: student.id,
    student_name: student.full_name,
    admission_number: student.admission_number,
    course_name: course?.course_name || 'SAP Enterprise Program',
    payment_amount: input.amount,
    payment_mode: input.payment_mode,
    transaction_reference: input.transaction_reference,
    payment_date: input.payment_date,
    remaining_balance: newOutstandingAmount,
    authorized_by: collector?.full_name || 'Accounts Department',
    institute_name: store.settings.institute_name,
    institute_address: store.settings.address,
    institute_phone: store.settings.phone,
    institute_gst: '',
    created_at: new Date().toISOString(),

    // GST & e-Invoice Compliance
    supply_type: receiptDetails.supply_type,
    place_of_supply: receiptDetails.place_of_supply,
    place_of_supply_code: receiptDetails.place_of_supply_code,
    sac_code: receiptDetails.sac_code,
    taxable_amount: receiptDetails.taxable_amount,
    cgst_rate: receiptDetails.cgst_rate,
    cgst_amount: receiptDetails.cgst_amount,
    sgst_rate: receiptDetails.sgst_rate,
    sgst_amount: receiptDetails.sgst_amount,
    igst_rate: receiptDetails.igst_rate,
    igst_amount: receiptDetails.igst_amount,
    total_tax: receiptDetails.total_tax,
    is_reverse_charge: receiptDetails.is_reverse_charge,
    irn: receiptDetails.irn,
    ack_no: receiptDetails.ack_no,
    ack_date: receiptDetails.ack_date,
    pdf_url: `/api/receipts/${receiptNumber}/pdf`,
  };

  // 5. Generate and persist binary vector PDF
  try {
    const pdfRes = await generateAndSaveReceiptPdf(newReceipt);
    if (pdfRes.pdfUrl) {
      newReceipt.pdf_url = pdfRes.pdfUrl;
    }
  } catch (pdfErr) {
    console.warn('Receipt PDF generation warning, falling back to direct API route:', pdfErr);
  }

  // 6. Commit to Store & schedule persistence
  store.payments.unshift(newPayment);
  store.receipts.unshift(newReceipt);

  // 6b. Dual-Ledger Sync: Synchronize with Advanced StudentFees, StudentPayments, and StudentFinancialLedgers
  if (!store.studentFees) store.studentFees = [];
  let matchingStudentFee = store.studentFees.find(
    (sf) =>
      sf.student_id === student.id &&
      (sf.course_id === feeAccount.course_id || sf.id === `fee-${feeAccount.id}` || sf.id === feeAccount.id.replace('fa-', ''))
  );

  if (!matchingStudentFee) {
    matchingStudentFee = store.studentFees.find((sf) => sf.student_id === student.id);
  }

  if (matchingStudentFee) {
    matchingStudentFee.paid_amount = Number((matchingStudentFee.paid_amount + input.amount).toFixed(2));
    matchingStudentFee.outstanding_amount = Math.max(0, Number((matchingStudentFee.final_payable - matchingStudentFee.paid_amount).toFixed(2)));
    matchingStudentFee.updated_at = new Date().toISOString();
  } else {
    matchingStudentFee = {
      id: `fee-${feeAccount.id}`,
      student_id: student.id,
      student_name: student.full_name,
      student_code: student.student_code || student.id,
      admission_number: student.admission_number,
      fee_category: 'Course Fee',
      reference_type: 'Course',
      reference_id: feeAccount.course_id,
      course_id: feeAccount.course_id,
      course_name: feeAccount.course_name,
      standard_fee: feeAccount.original_fee,
      proposed_fee: feeAccount.original_fee,
      discount_amount: feeAccount.discount,
      discount_percentage: feeAccount.original_fee > 0 ? Number(((feeAccount.discount / feeAccount.original_fee) * 100).toFixed(2)) : 0,
      discount_reason: feeAccount.discount_reason,
      tax_gst_amount: 0,
      additional_charges: 0,
      final_payable: feeAccount.net_payable,
      paid_amount: newPaidAmount,
      outstanding_amount: newOutstandingAmount,
      payment_plan: (feeAccount.payment_plan as any) || 'Custom',
      number_of_installments: 0,
      first_due_date: new Date().toISOString().slice(0, 10),
      counsellor_id: 'usr-counsellor',
      counsellor_name: 'Counsellor Staff',
      approval_status: 'Approved',
      approved_by: collectorUserId,
      approved_by_name: collector?.full_name || 'Accounts Staff',
      approved_at: new Date().toISOString(),
      approved_fee: feeAccount.original_fee,
      approved_discount: feeAccount.discount,
      approved_tax: 0,
      approved_total: feeAccount.net_payable,
      version: 1,
      is_payable: true,
      created_at: feeAccount.created_at,
      updated_at: new Date().toISOString(),
    };
    store.studentFees.unshift(matchingStudentFee);
  }

  // Record in store.studentPayments as Verified
  if (!store.studentPayments) store.studentPayments = [];
  const existingSpr = store.studentPayments.find(
    (sp) => sp.id === newPayment.id || (sp.receipt_number && sp.receipt_number === receiptNumber)
  );
  if (!existingSpr) {
    const studentPaymentRec: StudentPaymentRecord = {
      id: `spr-${newPayment.id}`,
      fee_id: matchingStudentFee.id,
      installment_id: undefined,
      student_id: student.id,
      student_name: student.full_name,
      admission_number: student.admission_number,
      fee_category: matchingStudentFee.fee_category || 'Course Fee',
      amount_paid: input.amount,
      payment_date: input.payment_date,
      payment_mode: input.payment_mode,
      transaction_reference: input.transaction_reference,
      receipt_number: receiptNumber,
      notes: input.notes,
      payment_proof_url: input.payment_proof_url,
      recorded_by: collectorUserId,
      recorded_by_name: collector?.full_name || 'Accounts Department',
      recorded_by_role: collector?.role || 'accountant',
      verification_status: 'Verified',
      verified_by: collectorUserId,
      verified_by_name: collector?.full_name || 'Accounts Department',
      verified_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    };
    store.studentPayments.unshift(studentPaymentRec);
  }

  // Record in store.studentFinancialLedgers
  if (!store.studentFinancialLedgers) store.studentFinancialLedgers = [];
  store.studentFinancialLedgers.push({
    id: `sfl-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    student_id: student.id,
    entry_date: input.payment_date,
    entry_type: 'Payment Verified',
    fee_category: matchingStudentFee.fee_category || 'Course Fee',
    reference_type: 'Course',
    reference_id: newPayment.id,
    debit: 0,
    credit: input.amount,
    running_balance: newOutstandingAmount,
    description: `Verified ${input.payment_mode} payment (${receiptNumber}) for ${matchingStudentFee.fee_category || 'Course Fee'}`,
    recorded_by: collectorUserId,
    receipt_id: newReceipt.id,
    created_at: new Date().toISOString(),
  });

  store.persist();

  // Direct Supabase queries utilizing PostgreSQL schema migrations
  if (isLiveSupabaseEnabled()) {
    try {
      const supabase = createClient();

      // 1. Direct insert to payments table
      await supabase.from('payments').insert({
        id: newPayment.id,
        receipt_number: newPayment.receipt_number,
        student_id: newPayment.student_id,
        fee_account_id: newPayment.fee_account_id,
        installment_id: newPayment.installment_id,
        course_id: newPayment.course_id,
        amount: newPayment.amount,
        payment_date: newPayment.payment_date,
        payment_mode: newPayment.payment_mode,
        transaction_reference: newPayment.transaction_reference,
        collected_by: newPayment.collected_by,
        notes: newPayment.notes,
      });

      // 2. Direct insert to receipts table
      await supabase.from('receipts').insert({
        id: newReceipt.id,
        receipt_number: newReceipt.receipt_number,
        payment_id: newReceipt.payment_id,
        student_id: newReceipt.student_id,
        student_name: newReceipt.student_name,
        admission_number: newReceipt.admission_number,
        course_name: newReceipt.course_name,
        payment_amount: newReceipt.payment_amount,
        payment_mode: newReceipt.payment_mode,
        transaction_reference: newReceipt.transaction_reference,
        payment_date: newReceipt.payment_date,
        remaining_balance: newReceipt.remaining_balance,
        authorized_by: newReceipt.authorized_by,
        institute_name: newReceipt.institute_name,
        institute_address: newReceipt.institute_address,
        institute_phone: newReceipt.institute_phone,
        institute_gst: newReceipt.institute_gst,
        pdf_url: newReceipt.pdf_url,
      });

      // 3. Direct update to student_fee_accounts table
      await supabase.from('student_fee_accounts').update({
        paid_amount: newPaidAmount,
        outstanding_amount: newOutstandingAmount,
        status: feeAccount.status,
        updated_at: new Date().toISOString(),
      }).eq('id', feeAccount.id);

      // 4. Direct update to students table
      await supabase.from('students').update({
        paid_amount: newPaidAmount,
        outstanding_amount: newOutstandingAmount,
        updated_at: new Date().toISOString(),
      }).eq('id', student.id);
    } catch (err) {
      console.warn('Supabase direct payment execution warning, preserved in local persistent storage:', err);
    }
  }

  // 7. Record Tamper-Evident Audit Log
  await recordAuditLog({
    user_id: collectorUserId,
    user_name: collector?.full_name || 'Staff',
    user_role: collector?.role || 'accountant',
    action: 'PAYMENT_RECORDED_ATOMIC',
    module: 'FINANCE',
    record_id: newPayment.id,
    old_value: { outstanding: previousOutstanding },
    new_value: {
      amount: input.amount,
      receipt: receiptNumber,
      mode: input.payment_mode,
      remaining_balance: newOutstandingAmount,
      pdf_url: newReceipt.pdf_url,
    },
  });

  // 8. Multi-Channel Notification Dispatch (In-App, Email with PDF download, WhatsApp link)
  try {
    const recipientPhone = student.phone || admission?.phone;
    const recipientEmail = student.email || admission?.email;
    const downloadPdfUrl = newReceipt.pdf_url || `/api/receipts/${newReceipt.id}/pdf?download=true`;

    await dispatchMultiChannelNotification({
      userId: student.id,
      recipientName: student.full_name,
      recipientEmail,
      recipientPhone,
      title: `Fee Payment Received: ₹${input.amount.toLocaleString('en-IN')}`,
      message: `Tuition fee payment of ₹${input.amount.toLocaleString('en-IN')} for ${newReceipt.course_name} recorded successfully. Receipt No: ${newReceipt.receipt_number}. Remaining Balance: ₹${newOutstandingAmount.toLocaleString('en-IN')}. Download PDF: ${downloadPdfUrl}`,
      type: 'success',
      category: 'payment',
      actionUrl: downloadPdfUrl,
      channels: ['in_app', 'email', 'whatsapp'],
      metadata: {
        receiptId: newReceipt.id,
        receiptNumber: newReceipt.receipt_number,
        pdfUrl: downloadPdfUrl,
        htmlTemplate: buildReceiptEmailHtml({
          studentName: student.full_name,
          receiptNumber: newReceipt.receipt_number,
          amount: input.amount,
          remainingBalance: newOutstandingAmount,
          courseName: newReceipt.course_name,
          pdfUrl: downloadPdfUrl,
        }),
      },
    });
  } catch (notifErr) {
    console.warn('Payment notification dispatch warning:', notifErr);
  }

  return { payment: newPayment, receipt: newReceipt, updatedFeeAccount: feeAccount };
}

// --- Expenses & Vendors ---
export async function getExpenses(): Promise<Expense[]> {
  if (isLiveSupabaseEnabled()) {
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('expenses')
        .select('*')
        .order('expense_date', { ascending: false });

      if (error) {
        console.error('[finance-service] Supabase expenses query failed:', error.message || error);
        throw new Error(`Failed to retrieve authoritative expenses: ${error.message || error}`);
      }

      if (Array.isArray(data)) {
        store.expenses = data as Expense[];
        return data as Expense[];
      }
    } catch (err: any) {
      if (isProductionEnvironment() || isLiveSupabaseEnabled()) {
        throw err;
      }
      console.warn('Supabase expenses query error, falling back to local persistent store:', err);
    }
  }

  if (isProductionEnvironment()) {
    return [];
  }

  return [...store.expenses].sort(
    (a, b) => new Date(b.expense_date).getTime() - new Date(a.expense_date).getTime()
  );
}

export async function createExpense(
  data: Omit<Expense, 'id' | 'expense_code' | 'created_at' | 'updated_at'>,
  userId: string
): Promise<Expense> {
  const code = `EXP-2026-${String(store.expenses.length + 1).padStart(3, '0')}`;
  const vendor = store.vendors.find((v) => v.id === data.vendor_id);
  const user = store.users.find((u) => u.id === userId);

  const newExpense: Expense = {
    ...data,
    id: `exp-${Date.now()}`,
    expense_code: code,
    vendor_name: vendor?.vendor_name,
    paid_by: userId,
    paid_by_name: user?.full_name,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  store.expenses.unshift(newExpense);

  if (vendor && data.status === 'Paid') {
    vendor.total_paid = (vendor.total_paid || 0) + data.amount;
  }
  store.persist();

  if (isLiveSupabaseEnabled()) {
    try {
      const supabase = createClient();
      await supabase.from('expenses').insert({
        id: newExpense.id,
        expense_code: newExpense.expense_code,
        expense_date: newExpense.expense_date,
        category: newExpense.category,
        vendor_id: newExpense.vendor_id,
        description: newExpense.description,
        amount: newExpense.amount,
        payment_mode: newExpense.payment_mode,
        reference: newExpense.reference,
        attachment_url: newExpense.attachment_url,
        paid_by: newExpense.paid_by,
        status: newExpense.status,
      });
    } catch (err) {
      console.warn('Supabase expense direct query warning, preserved locally:', err);
    }
  }

  await recordAuditLog({
    user_id: userId,
    user_name: user?.full_name || 'Staff',
    user_role: user?.role || 'accountant',
    action: 'EXPENSE_RECORDED',
    module: 'FINANCE',
    record_id: newExpense.id,
    new_value: { code, amount: data.amount, category: data.category },
  });

  emitSyncEvent('expenses', 'created', {
    entity_id: newExpense.id,
    actor_id: userId,
  });

  return newExpense;
}

export async function approveExpense(
  expenseId: string,
  approverUserId: string
): Promise<Expense> {
  const exp = store.expenses.find((e) => e.id === expenseId);
  if (!exp) throw new Error('Expense not found');

  const approver = store.users.find((u) => u.id === approverUserId);
  if (!approver) {
    throw new Error('Approver user profile not found');
  }

  // Multi-Level Approval SOP:
  // Expenses <= 50,000: Accountant / Admin / Super Admin
  // Expenses > 50,000: Super Admin (Director) strictly required
  if (exp.amount > 50000 && approver.role !== 'super_admin') {
    throw new Error(
      `Approval Policy Violation: Expenses exceeding ₹50,000 (₹${exp.amount.toLocaleString(
        'en-IN'
      )}) require Super Admin (Director) authorization.`
    );
  }

  const allowedRoles = ['super_admin', 'admin', 'accountant'];
  if (!allowedRoles.includes(approver.role)) {
    throw new Error('Access Denied: Only accounts staff or administrators can approve expenditures.');
  }

  exp.status = 'Approved';
  exp.approved_by = approverUserId;
  exp.approved_by_name = approver?.full_name;
  exp.updated_at = new Date().toISOString();
  store.persist();

  if (isLiveSupabaseEnabled()) {
    try {
      const supabase = createClient();
      await supabase
        .from('expenses')
        .update({
          status: 'Approved',
          approved_by: approverUserId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', expenseId);
    } catch (err) {
      console.warn('Supabase approveExpense warning, preserved locally:', err);
    }
  }

  await recordAuditLog({
    user_id: approverUserId,
    user_name: approver?.full_name || 'Approver',
    user_role: approver?.role || 'super_admin',
    action: 'EXPENSE_APPROVED',
    module: 'FINANCE',
    record_id: expenseId,
    new_value: { status: 'Approved', amount: exp.amount },
  });

  emitSyncEvent('expenses', 'approved', {
    entity_id: expenseId,
    actor_id: approverUserId,
  });

  return exp;
}

export async function getExpenseCategories(): Promise<string[]> {
  return store.getExpenseCategories();
}

export async function createExpenseCategory(name: string, userId?: string): Promise<string> {
  const newCat = store.addExpenseCategory(name);

  if (isLiveSupabaseEnabled()) {
    try {
      const supabase = createClient();
      await supabase.from('expense_categories').insert({
        name: newCat,
        created_at: new Date().toISOString(),
      });
    } catch (err) {
      console.warn('Supabase expense_categories insert warning, preserved locally:', err);
    }
  }

  if (userId) {
    const user = store.users.find((u) => u.id === userId);
    await recordAuditLog({
      user_id: userId,
      user_name: user?.full_name || 'Staff',
      user_role: user?.role || 'accountant',
      action: 'EXPENSE_CATEGORY_CREATED',
      module: 'FINANCE',
      record_id: newCat,
      new_value: { name: newCat },
    });
  }

  return newCat;
}

export async function validateAndSettleExpense(
  expenseId: string,
  validatorUserId: string,
  details: {
    payment_mode: PaymentMethod;
    reference: string;
    expense_date?: string;
    bank_account?: string;
    bank_account_profile_id?: string;
    idempotency_key?: string;
  }
): Promise<Expense> {
  const exp = store.expenses.find((e) => e.id === expenseId);
  if (!exp) throw new Error('Expense not found');

  // Idempotent replay check for repeated settlement attempts with same idempotency_key
  if (
    details.idempotency_key &&
    exp.status === 'Settled' &&
    (exp as any).settlement_idempotency_key === details.idempotency_key
  ) {
    return exp;
  }

  if (exp.status !== 'Approved') {
    throw new Error(`Invalid workflow transition: Only 'Approved' expenses can be validated and settled. Current status: ${exp.status}`);
  }

  const validator = store.users.find((u) => u.id === validatorUserId);
  if (!validator) {
    throw new Error('Validator user profile not found');
  }

  const allowedRoles = ['super_admin', 'admin', 'accountant'];
  if (!allowedRoles.includes(validator.role)) {
    throw new Error('Access Denied: Only accounts staff or administrators can validate and settle expenditures.');
  }

  if (!details.reference || !details.reference.trim()) {
    throw new Error('Mandatory reference: Bank UTR or transaction reference is required for payment settlement.');
  }

  let resolvedBankAccount = details.bank_account?.trim();
  if (details.bank_account_profile_id) {
    const accounts = getAuthorizedBankAccounts(validator.role, { includePending: false });
    const matched = accounts.find((a) => a.id === details.bank_account_profile_id);
    if (!matched) {
      throw new Error('The selected paying bank account is invalid or unavailable. Please select a valid account.');
    }
    resolvedBankAccount = `${matched.bank_name} - ${matched.account_holder_name} (A/C: ${matched.account_number})`;
  } else if (!resolvedBankAccount) {
    if (details.payment_mode === 'Cash') {
      resolvedBankAccount = 'Institute Cash Counter';
    } else {
      throw new Error('Paying bank account is required for non-cash expense settlement.');
    }
  }

  const tenant = (exp as any).tenant_id || validator.tenant_id || 'default';
  if (details.idempotency_key) {
    const idemp = await idempotencyService.acquireAsync(
      details.idempotency_key,
      validatorUserId,
      tenant,
      { expenseId, ...details },
      'expense_settle'
    );
    if (idemp.isExisting && idemp.result) {
      return idemp.result as Expense;
    }
  }

  const prevStatus = exp.status;
  const settledAt = new Date().toISOString();
  const nextPaymentDate = details.expense_date || exp.expense_date;

  try {
    if (isLiveSupabaseEnabled()) {
      const supabase = createClient();
      const { data: updatedRow, error: updateErr } = await supabase
        .from('expenses')
        .update({
          status: 'Settled',
          payment_mode: details.payment_mode,
          reference: details.reference.trim(),
          paid_by: validatorUserId,
          updated_at: settledAt,
        })
        .eq('id', expenseId)
        .eq('status', 'Approved')
        .select('id')
        .maybeSingle();

      if (updateErr) {
        throw new Error(`Expense settlement database update failed: ${updateErr.message}`);
      }
      if (!updatedRow) {
        throw new Error('Conflict: Expense has already been settled or updated by another user. Please review the latest information.');
      }
    }

    exp.status = 'Settled';
    exp.payment_mode = details.payment_mode;
    exp.reference = details.reference.trim();
    exp.expense_date = nextPaymentDate;
    exp.bank_account = resolvedBankAccount;
    if (details.bank_account_profile_id) {
      (exp as any).bank_account_profile_id = details.bank_account_profile_id;
    }
    if (details.idempotency_key) {
      (exp as any).settlement_idempotency_key = details.idempotency_key;
    }
    exp.settled_by = validatorUserId;
    exp.settled_by_name = validator.full_name;
    exp.settled_at = settledAt;
    exp.paid_by = validatorUserId;
    exp.paid_by_name = validator.full_name;
    exp.validated_amount = exp.amount;
    exp.updated_at = settledAt;

    // If tagged to a vendor, update vendor total_paid
    if (exp.vendor_id) {
      const vendor = store.vendors.find((v) => v.id === exp.vendor_id);
      if (vendor) {
        vendor.total_paid = (vendor.total_paid || 0) + exp.amount;
      }
    }

    store.persist();

    await recordAuditLog({
      user_id: validatorUserId,
      user_name: validator.full_name || 'Accounts Staff',
      user_role: validator.role || 'accountant',
      action: 'EXPENSE_SETTLED',
      module: 'FINANCE',
      record_id: expenseId,
      old_value: { status: prevStatus },
      new_value: {
        status: 'Settled',
        amount: exp.amount,
        mode: exp.payment_mode,
        reference: exp.reference,
        bank_account: exp.bank_account,
        bank_account_profile_id: details.bank_account_profile_id,
        settled_by: validator.full_name,
      },
    });

    if (details.idempotency_key) {
      await idempotencyService.completeAsync(
        details.idempotency_key,
        validatorUserId,
        tenant,
        exp,
        'expense_settle'
      );
    }

    emitSyncEvent('expenses', 'settled', {
      entity_id: expenseId,
      actor_id: validatorUserId,
    });

    return exp;
  } catch (err) {
    if (details.idempotency_key) {
      await idempotencyService.failAsync(details.idempotency_key, validatorUserId, tenant, 'expense_settle');
    }
    throw err;
  }
}

export async function markExpenseAsPaid(
  expenseId: string,
  disburserUserId: string,
  details: {
    payment_mode: PaymentMethod;
    reference: string;
    expense_date?: string;
  }
): Promise<Expense> {
  const exp = store.expenses.find((e) => e.id === expenseId);
  if (!exp) throw new Error('Expense not found');

  const disburser = store.users.find((u) => u.id === disburserUserId);
  if (!disburser) {
    throw new Error('Disburser user profile not found');
  }

  const allowedRoles = ['super_admin', 'admin', 'accountant'];
  if (!allowedRoles.includes(disburser.role)) {
    throw new Error('Access Denied: Only accounts staff or administrators can disburse expenditures.');
  }

  if (!details.reference || !details.reference.trim()) {
    throw new Error('Mandatory reference: Bank UTR or transaction reference is required for payment disbursement.');
  }

  const prevStatus = exp.status;
  exp.status = 'Paid';
  exp.payment_mode = details.payment_mode;
  exp.reference = details.reference.trim();
  if (details.expense_date) {
    exp.expense_date = details.expense_date;
  }
  exp.paid_by = disburserUserId;
  exp.paid_by_name = disburser.full_name;
  exp.updated_at = new Date().toISOString();

  // If tagged to a vendor, update vendor total_paid
  if (exp.vendor_id) {
    const vendor = store.vendors.find((v) => v.id === exp.vendor_id);
    if (vendor) {
      vendor.total_paid = (vendor.total_paid || 0) + exp.amount;
    }
  }

  store.persist();

  if (isLiveSupabaseEnabled()) {
    try {
      const supabase = createClient();
      await supabase
        .from('expenses')
        .update({
          status: 'Paid',
          payment_mode: exp.payment_mode,
          reference: exp.reference,
          paid_by: exp.paid_by,
          updated_at: exp.updated_at,
        })
        .eq('id', expenseId);
    } catch (err) {
      console.warn('Supabase markExpenseAsPaid warning, preserved locally:', err);
    }
  }

  await recordAuditLog({
    user_id: disburserUserId,
    user_name: disburser.full_name || 'Accounts Staff',
    user_role: disburser.role || 'accountant',
    action: 'EXPENSE_PAID',
    module: 'FINANCE',
    record_id: expenseId,
    old_value: { status: prevStatus },
    new_value: {
      status: 'Paid',
      amount: exp.amount,
      mode: exp.payment_mode,
      reference: exp.reference,
    },
  });

  return exp;
}

export async function rejectExpense(
  expenseId: string,
  reviewerUserId: string,
  reason: string
): Promise<Expense> {
  const exp = store.expenses.find((e) => e.id === expenseId);
  if (!exp) throw new Error('Expense not found');

  const reviewer = store.users.find((u) => u.id === reviewerUserId);
  if (!reviewer) {
    throw new Error('Reviewer user profile not found');
  }

  const allowedRoles = ['super_admin', 'admin', 'accountant'];
  if (!allowedRoles.includes(reviewer.role)) {
    throw new Error('Access Denied: Only accounts staff or administrators can reject expenditures.');
  }

  const prevStatus = exp.status;
  exp.status = 'Rejected';
  exp.updated_at = new Date().toISOString();
  store.persist();

  if (isLiveSupabaseEnabled()) {
    try {
      const supabase = createClient();
      await supabase
        .from('expenses')
        .update({
          status: 'Rejected',
          updated_at: exp.updated_at,
        })
        .eq('id', expenseId);
    } catch (err) {
      console.warn('Supabase rejectExpense warning, preserved locally:', err);
    }
  }

  await recordAuditLog({
    user_id: reviewerUserId,
    user_name: reviewer.full_name || 'Reviewer',
    user_role: reviewer.role || 'super_admin',
    action: 'EXPENSE_REJECTED',
    module: 'FINANCE',
    record_id: expenseId,
    old_value: { status: prevStatus },
    new_value: { status: 'Rejected', reason },
  });

  return exp;
}

export async function submitExpenseForApproval(
  expenseId: string,
  userId: string
): Promise<Expense> {
  const exp = store.expenses.find((e) => e.id === expenseId);
  if (!exp) throw new Error('Expense not found');
  if (exp.status !== 'Draft') {
    throw new Error('Only draft expenses can be submitted for approval.');
  }

  const user = store.users.find((u) => u.id === userId);
  exp.status = 'Pending Approval';
  exp.updated_at = new Date().toISOString();
  store.persist();

  await recordAuditLog({
    user_id: userId,
    user_name: user?.full_name || 'Staff',
    user_role: user?.role || 'staff',
    action: 'EXPENSE_SUBMITTED',
    module: 'FINANCE',
    record_id: expenseId,
    new_value: { status: 'Pending Approval', amount: exp.amount },
  });

  return exp;
}

const ALLOWED_VENDOR_CATEGORIES = ['Hardware / Server', 'Marketing', 'Facility', 'Software / Cloud', 'Honorarium', 'Other'];

export async function getVendors(): Promise<Vendor[]> {
  if (isLiveSupabaseEnabled()) {
    try {
      const supabase = createAdminClient();
      const { data, error } = await supabase
        .from('vendors')
        .select('*')
        .order('vendor_name', { ascending: true });

      if (error) {
        console.error('[finance-service] Supabase vendors query failed:', error.message || error);
        throw new Error(`Failed to retrieve authoritative vendors: ${error.message || error}`);
      }

      if (Array.isArray(data)) {
        const mappedVendors: Vendor[] = data.map((v: any) => ({
          ...v,
          bank_account_number: v.bank_account || v.bank_account_number,
          bank_ifsc: v.ifsc_code || v.bank_ifsc,
          is_active: v.is_active ?? true,
          status: v.status || 'Active',
          total_paid: v.total_paid || 0,
        }));
        store.vendors = mappedVendors;
        return mappedVendors;
      }
    } catch (err: any) {
      if (isProductionEnvironment() || isLiveSupabaseEnabled()) {
        throw err;
      }
      console.warn('Supabase vendors query error, falling back to local persistent store:', err);
    }
  }

  if (isProductionEnvironment()) {
    return [];
  }

  return [...store.vendors];
}

export async function createVendor(
  data: Omit<Vendor, 'id' | 'total_paid' | 'created_at'>,
  userId?: string
): Promise<Vendor> {
  const vendorId = crypto.randomUUID();
  const vendor: Vendor = {
    ...data,
    id: vendorId,
    total_paid: 0,
    created_at: new Date().toISOString(),
  };
  store.vendors.push(vendor);
  store.persist();

  if (isLiveSupabaseEnabled()) {
    try {
      const supabase = createAdminClient();
      let category = (vendor as any).category;
      if (!category || !ALLOWED_VENDOR_CATEGORIES.includes(category)) {
        category = 'Other';
      }
      await supabase.from('vendors').insert({
        id: vendor.id,
        vendor_name: vendor.vendor_name,
        contact_person: vendor.contact_person,
        phone: vendor.phone || '+910000000000',
        email: vendor.email || `${vendor.id}@vendor.internal`,
        category,
        gst_number: vendor.gst_number || null,
        bank_account: vendor.bank_account_number || (vendor as any).bank_account || null,
        ifsc_code: vendor.bank_ifsc || (vendor as any).ifsc_code || null,
        created_at: vendor.created_at,
        updated_at: new Date().toISOString(),
      });
    } catch (err) {
      console.warn('Supabase vendor direct insert warning, preserved locally:', err);
    }
  }

  const user = userId ? store.users.find((u) => u.id === userId) : undefined;
  await recordAuditLog({
    user_id: userId || 'system',
    user_name: user?.full_name || 'Accounts Staff',
    user_role: user?.role || 'accountant',
    action: 'VENDOR_CREATED',
    module: 'FINANCE',
    record_id: vendor.id,
    new_value: {
      vendor_name: vendor.vendor_name,
      gst_number: vendor.gst_number,
      pan_number: vendor.pan_number,
      tds_section: vendor.tds_section,
      tds_rate: vendor.tds_rate,
    },
  });

  return vendor;
}

export async function updateVendor(
  id: string,
  data: Partial<Vendor>,
  userId?: string
): Promise<Vendor> {
  const vendor = store.vendors.find((v) => v.id === id);
  if (!vendor) throw new Error('Vendor not found');

  const oldValues = { ...vendor };
  Object.assign(vendor, data, { updated_at: new Date().toISOString() });
  store.persist();

  if (isLiveSupabaseEnabled()) {
    try {
      const supabase = createAdminClient();
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
      if (isUuid) {
        const updatePayload: any = {
          updated_at: vendor.updated_at,
        };
        if (vendor.vendor_name) updatePayload.vendor_name = vendor.vendor_name;
        if (vendor.contact_person) updatePayload.contact_person = vendor.contact_person;
        if (vendor.phone) updatePayload.phone = vendor.phone;
        if (vendor.email) updatePayload.email = vendor.email;
        if ((vendor as any).category && ALLOWED_VENDOR_CATEGORIES.includes((vendor as any).category)) {
          updatePayload.category = (vendor as any).category;
        }
        if (vendor.gst_number !== undefined) updatePayload.gst_number = vendor.gst_number || null;
        if (vendor.bank_account_number !== undefined || (vendor as any).bank_account !== undefined) {
          updatePayload.bank_account = vendor.bank_account_number || (vendor as any).bank_account || null;
        }
        if (vendor.bank_ifsc !== undefined || (vendor as any).ifsc_code !== undefined) {
          updatePayload.ifsc_code = vendor.bank_ifsc || (vendor as any).ifsc_code || null;
        }
        await supabase.from('vendors').update(updatePayload).eq('id', id);
      }
    } catch (err) {
      console.warn('Supabase vendor update warning, preserved locally:', err);
    }
  }

  const user = userId ? store.users.find((u) => u.id === userId) : undefined;
  await recordAuditLog({
    user_id: userId || 'system',
    user_name: user?.full_name || 'Accounts Staff',
    user_role: user?.role || 'accountant',
    action: 'VENDOR_UPDATED',
    module: 'FINANCE',
    record_id: vendor.id,
    old_value: oldValues,
    new_value: data,
  });

  return vendor;
}

export async function archiveVendor(
  id: string,
  archive: boolean = true,
  userId?: string
): Promise<Vendor> {
  const vendor = store.vendors.find((v) => v.id === id);
  if (!vendor) throw new Error('Vendor not found');

  vendor.status = archive ? 'Archived' : 'Active';
  vendor.is_active = !archive;
  vendor.updated_at = new Date().toISOString();
  store.persist();

  if (isLiveSupabaseEnabled()) {
    try {
      const supabase = createClient();
      await supabase.from('vendors').update({
        status: vendor.status,
        is_active: vendor.is_active,
        updated_at: vendor.updated_at,
      }).eq('id', id);
    } catch (err) {
      console.warn('Supabase vendor archive warning, preserved locally:', err);
    }
  }

  const user = userId ? store.users.find((u) => u.id === userId) : undefined;
  await recordAuditLog({
    user_id: userId || 'system',
    user_name: user?.full_name || 'Accounts Staff',
    user_role: user?.role || 'accountant',
    action: archive ? 'VENDOR_ARCHIVED' : 'VENDOR_RESTORED',
    module: 'FINANCE',
    record_id: vendor.id,
    new_value: { status: vendor.status },
  });

  return vendor;
}

export async function deleteVendor(id: string, userId?: string): Promise<boolean> {
  const index = store.vendors.findIndex((v) => v.id === id);
  if (index === -1) return false;

  const vendor = store.vendors[index];
  const hasExpenses = (store.expenses || []).some((e) => e.vendor_id === id);
  if (hasExpenses) {
    store.vendors[index].status = 'Archived';
    store.vendors[index].is_active = false;
    store.vendors[index].updated_at = new Date().toISOString();
  } else {
    store.vendors.splice(index, 1);
  }
  store.persist();

  if (isLiveSupabaseEnabled()) {
    try {
      const supabase = createAdminClient();
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
      if (isUuid) {
        if (hasExpenses) {
          await supabase.from('vendors').update({
            updated_at: new Date().toISOString(),
          }).eq('id', id);
        } else {
          await supabase.from('vendors').delete().eq('id', id);
        }
      }
    } catch (err) {
      console.warn('Supabase vendor delete warning, preserved locally:', err);
    }
  }

  const user = userId ? store.users.find((u) => u.id === userId) : undefined;
  await recordAuditLog({
    user_id: userId || 'system',
    user_name: user?.full_name || 'Accounts Staff',
    user_role: user?.role || 'accountant',
    action: hasExpenses ? 'VENDOR_SOFT_ARCHIVED' : 'VENDOR_DELETED',
    module: 'FINANCE',
    record_id: id,
    old_value: { vendor_name: vendor.vendor_name, had_expenses: hasExpenses },
  });

  return true;
}

// --- Finance Analytics & Dashboard Aggregations ---
export async function getFinanceDashboardMetrics() {
  const todayStr = new Date().toISOString().slice(0, 10);
  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();

  // Only verified/approved payments count toward verified collections
  const verifiedPayments = store.payments.filter((p) => isPaymentApproved(p));
  const pendingPayments = store.payments.filter((p) => isPaymentPending(p));
  const rejectedPaymentsList = store.payments.filter(
    (p) => !isPaymentApproved(p) && !isPaymentPending(p)
  );

  // Collections (verified only)
  const todayCollections = verifiedPayments
    .filter((p) => p.payment_date === todayStr)
    .reduce((sum, p) => sum + p.amount, 0);

  const monthlyPayments = verifiedPayments.filter((p) => {
    const d = new Date(p.payment_date);
    return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
  });
  const monthlyCollections = monthlyPayments.reduce((sum, p) => sum + p.amount, 0);

  const pendingCollections = pendingPayments.reduce((sum, p) => sum + p.amount, 0);
  const rejectedPayments = rejectedPaymentsList.reduce((sum, p) => sum + p.amount, 0);

  const totalOutstanding = store.feeAccounts.reduce((sum, f) => sum + f.outstanding_amount, 0);

  // Expenses (Paid or Settled)
  const monthlyExpensesList = store.expenses.filter((e) => {
    const d = new Date(e.expense_date);
    return (
      d.getMonth() === currentMonth &&
      d.getFullYear() === currentYear &&
      (e.status === 'Paid' || e.status === 'Settled')
    );
  });
  const monthlyExpenses = monthlyExpensesList.reduce((sum, e) => sum + e.amount, 0);

  const netCashFlow = monthlyCollections - monthlyExpenses;

  // Course-wise collections (verified only)
  const courseRevenueMap: Record<string, number> = {};
  for (const p of verifiedPayments) {
    const name = p.course_name || 'SAP Course';
    courseRevenueMap[name] = (courseRevenueMap[name] || 0) + p.amount;
  }

  // Payment mode distribution (verified only)
  const paymentModeMap: Record<string, number> = {};
  for (const p of verifiedPayments) {
    paymentModeMap[p.payment_mode] = (paymentModeMap[p.payment_mode] || 0) + p.amount;
  }

  return {
    todayCollections,
    monthlyCollections,
    pendingCollections,
    rejectedPayments,
    totalOutstanding,
    monthlyExpenses,
    totalRefunds: 0,
    netCashFlow,
    courseRevenueMap,
    paymentModeMap,
  };
}

export type TemporalPeriod =
  | 'ALL_TIME'
  | 'CURRENT_MONTH'
  | 'LAST_MONTH'
  | 'FY_2025_26'
  | 'FY_2026_27'
  | 'Q1'
  | 'Q2'
  | 'Q3'
  | 'Q4'
  | 'CUSTOM';

export function getDateRangeForPeriod(
  period: TemporalPeriod,
  customStart?: string,
  customEnd?: string
): { start?: string; end?: string; label: string } {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  switch (period) {
    case 'CURRENT_MONTH': {
      const start = new Date(year, month, 1).toISOString().slice(0, 10);
      const end = new Date(year, month + 1, 0).toISOString().slice(0, 10);
      return {
        start,
        end,
        label: now.toLocaleString('default', { month: 'long', year: 'numeric' }),
      };
    }
    case 'LAST_MONTH': {
      const start = new Date(year, month - 1, 1).toISOString().slice(0, 10);
      const end = new Date(year, month, 0).toISOString().slice(0, 10);
      const lastMonthDate = new Date(year, month - 1, 1);
      return {
        start,
        end,
        label: lastMonthDate.toLocaleString('default', { month: 'long', year: 'numeric' }),
      };
    }
    case 'FY_2025_26':
      return { start: '2025-04-01', end: '2026-03-31', label: 'FY 2025-26 (Apr 2025 - Mar 2026)' };
    case 'FY_2026_27':
      return { start: '2026-04-01', end: '2027-03-31', label: 'FY 2026-27 (Apr 2026 - Mar 2027)' };
    case 'Q1': {
      const fyYear = month < 3 ? year - 1 : year;
      return { start: `${fyYear}-04-01`, end: `${fyYear}-06-30`, label: `Q1 (${fyYear}) Apr - Jun` };
    }
    case 'Q2': {
      const fyYear = month < 3 ? year - 1 : year;
      return { start: `${fyYear}-07-01`, end: `${fyYear}-09-30`, label: `Q2 (${fyYear}) Jul - Sep` };
    }
    case 'Q3': {
      const fyYear = month < 3 ? year - 1 : year;
      return { start: `${fyYear}-10-01`, end: `${fyYear}-12-31`, label: `Q3 (${fyYear}) Oct - Dec` };
    }
    case 'Q4': {
      const fyYear = month < 3 ? year : year + 1;
      return { start: `${fyYear}-01-01`, end: `${fyYear}-03-31`, label: `Q4 (${fyYear}) Jan - Mar` };
    }
    case 'CUSTOM':
      return {
        start: customStart,
        end: customEnd,
        label: `Custom (${customStart || 'Earliest'} to ${customEnd || 'Latest'})`,
      };
    case 'ALL_TIME':
    default:
      return { label: 'All-Time Records' };
  }
}

export interface DiscontinuedStudentAdjustmentInput {
  fee_account_id: string;
  reason: string;
  adjusted_amount: number;
  approved_by_user_id: string;
}

/**
 * Controlled administrative workflow for clearing outstanding fee invoices
 * when a student discontinues their course.
 *
 * - Never deletes the original invoice or alters received payments.
 * - Never marks unpaid fee as collected revenue.
 * - Records an auditable adjustment / write-off in the student financial ledger.
 */
export function adjustDiscontinuedStudentFee(
  input: DiscontinuedStudentAdjustmentInput
): { feeAccount: StudentFeeAccount; ledgerEntry: StudentFinancialLedgerEntry } {
  const { fee_account_id, reason, adjusted_amount, approved_by_user_id } = input;

  if (!reason || reason.trim().length < 5) {
    throw new Error('Mandatory Reason: Please provide a clear administrative reason for discontinuing and adjusting the student fee.');
  }

  const approver = store.users.find((u) => u.id === approved_by_user_id);
  if (!approver || !['super_admin', 'admin', 'accountant'].includes(approver.role)) {
    throw new Error('Unauthorized: Only an Accountant or Administrator can approve a fee adjustment / write-off.');
  }

  const feeAccount = store.feeAccounts.find(
    (fa) => fa.id === fee_account_id || fa.student_id === fee_account_id
  );
  if (!feeAccount) {
    throw new Error(`Fee account with ID "${fee_account_id}" not found.`);
  }

  if (feeAccount.outstanding_amount <= 0) {
    throw new Error('This student fee account has no outstanding balance to clear.');
  }

  if (!Number.isFinite(adjusted_amount) || adjusted_amount <= 0) {
    throw new Error('Adjustment amount must be greater than zero.');
  }

  if (adjusted_amount > feeAccount.outstanding_amount) {
    throw new Error(
      `Adjustment amount (₹${adjusted_amount}) cannot exceed the current outstanding balance (₹${feeAccount.outstanding_amount}).`
    );
  }

  const now = new Date().toISOString();
  const approverName = approver.full_name || 'Accounts Administrator';
  const originalOutstanding = feeAccount.outstanding_amount;
  const newOutstanding = Number((feeAccount.outstanding_amount - adjusted_amount).toFixed(2));

  // 1. Update Fee Account
  feeAccount.outstanding_amount = newOutstanding;
  feeAccount.status = 'Discontinued / Adjusted';
  feeAccount.discontinuation_record = {
    discontinued_at: now,
    reason: reason.trim(),
    approved_by: approver.id,
    approved_by_name: approverName,
    adjusted_amount,
    original_outstanding: originalOutstanding,
  };
  feeAccount.updated_at = now;

  // 2. Synchronize matching StudentFee if present
  const matchingStudentFee = (store.studentFees || []).find(
    (sf) => sf.student_id === feeAccount.student_id
  );
  if (matchingStudentFee) {
    matchingStudentFee.outstanding_amount = Math.max(
      0,
      Number((matchingStudentFee.outstanding_amount - adjusted_amount).toFixed(2))
    );
    matchingStudentFee.updated_at = now;
  }

  // 3. Update student profile outstanding snapshot & status
  const student = store.students.find((s) => s.id === feeAccount.student_id);
  if (student) {
    student.outstanding_amount = newOutstanding;
    (student as any).status = 'Discontinued';
    student.updated_at = now;
  }

  // 4. Cancel remaining pending installments
  if (store.installments) {
    const pendingInstallments = store.installments.filter(
      (inst) =>
        (inst.fee_account_id === feeAccount.id || inst.student_id === feeAccount.student_id) &&
        inst.status === 'Pending'
    );
    for (const inst of pendingInstallments) {
      (inst as any).status = 'Cancelled';
      (inst as any).notes = `Cancelled due to student discontinuation: ${reason.trim()} (Approved by ${approverName})`;
    }
  }

  // 5. Append non-destructive auditable adjustment entry into student financial ledger
  const ledgerSeq = `ADJ-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}`;
  const ledgerEntry: StudentFinancialLedgerEntry = {
    id: `ledg-${Date.now()}`,
    student_id: feeAccount.student_id,
    entry_date: now.split('T')[0],
    entry_type: 'Fee Adjustment',
    fee_category: feeAccount.course_name || 'Course Fee',
    reference_type: 'Adjustment',
    reference_id: ledgerSeq,
    debit: 0,
    credit: adjusted_amount,
    running_balance: newOutstanding,
    description: `Discontinued Student Fee Adjustment / Write-Off: ₹${adjusted_amount} cleared against outstanding balance. Reason: ${reason.trim()} (Approved by ${approverName})`,
    recorded_by: approver.id,
    created_at: now,
  };

  if (!store.studentFinancialLedgers) store.studentFinancialLedgers = [];
  store.studentFinancialLedgers.push(ledgerEntry);

  store.persistSync();

  return { feeAccount, ledgerEntry };
}

