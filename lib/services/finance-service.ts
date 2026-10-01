import { store } from './data-store';
import {
  StudentFeeAccount,
  Installment,
  Payment,
  Receipt,
  Expense,
  Vendor,
  PaymentMethod,
  ExpenseCategory,
  ExpenseStatus,
} from '@/types';
import { generateReceiptNumber } from '@/lib/utils/formatters';
import { recordAuditLog } from './audit-service';
import { createClient, isLiveSupabaseEnabled } from '@/lib/supabase/db';
import { calculateGstBreakdown } from './gst-service';
import { generateAndSaveReceiptPdf } from './pdf-service';
import { dispatchMultiChannelNotification, buildReceiptEmailHtml } from './notification-service';

// --- Student Fee Accounts & Installments ---
export async function getStudentFeeAccounts(): Promise<StudentFeeAccount[]> {
  if (isLiveSupabaseEnabled()) {
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('student_fee_accounts')
        .select('*')
        .order('created_at', { ascending: false });

      if (!error && data && data.length > 0) {
        store.feeAccounts = data as StudentFeeAccount[];
        return data as StudentFeeAccount[];
      }
    } catch (err) {
      console.warn('Supabase fee accounts query error, falling back to local persistent store:', err);
    }
  }
  return [...store.feeAccounts];
}

export async function getFeeAccountForStudent(studentId: string): Promise<StudentFeeAccount | undefined> {
  if (isLiveSupabaseEnabled()) {
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('student_fee_accounts')
        .select('*')
        .eq('student_id', studentId)
        .maybeSingle();

      if (!error && data) {
        return data as StudentFeeAccount;
      }
    } catch (err) {
      console.warn('Supabase fee account for student query error, checking local store:', err);
    }
  }
  return store.feeAccounts.find((f) => f.student_id === studentId);
}

export async function getInstallmentsForAccount(feeAccountId: string): Promise<Installment[]> {
  if (isLiveSupabaseEnabled()) {
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('installments')
        .select('*')
        .eq('fee_account_id', feeAccountId)
        .order('installment_number', { ascending: true });

      if (!error && data && data.length > 0) {
        return data as Installment[];
      }
    } catch (err) {
      console.warn('Supabase installments query error, checking local store:', err);
    }
  }
  return store.installments
    .filter((i) => i.fee_account_id === feeAccountId)
    .sort((a, b) => a.installment_number - b.installment_number);
}

export async function getPayments(): Promise<Payment[]> {
  if (isLiveSupabaseEnabled()) {
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('payments')
        .select('*')
        .order('payment_date', { ascending: false });

      if (!error && data && data.length > 0) {
        store.payments = data as Payment[];
        return data as Payment[];
      }
    } catch (err) {
      console.warn('Supabase payments query error, falling back to local persistent store:', err);
    }
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

      if (!error && data && data.length > 0) {
        store.receipts = data as Receipt[];
        return data as Receipt[];
      }
    } catch (err) {
      console.warn('Supabase receipts query error, falling back to local persistent store:', err);
    }
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
    installment_id: input.installment_id,
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

  // 3. Update Installments
  if (input.installment_id) {
    const installment = store.installments.find((i) => i.id === input.installment_id);
    if (installment) {
      installment.paid_amount += input.amount;
      installment.paid_date = input.payment_date;
      installment.status = installment.paid_amount >= installment.amount ? 'Paid' : 'Partial';
    }
  } else {
    // Automatically apply to oldest unpaid/due installment
    let unapplied = input.amount;
    const installments = store.installments
      .filter((i) => i.fee_account_id === feeAccount.id && i.status !== 'Paid')
      .sort((a, b) => a.installment_number - b.installment_number);

    for (const inst of installments) {
      const remainingForInst = inst.amount - inst.paid_amount;
      if (unapplied >= remainingForInst) {
        inst.paid_amount = inst.amount;
        inst.paid_date = input.payment_date;
        inst.status = 'Paid';
        unapplied -= remainingForInst;
      } else {
        inst.paid_amount += unapplied;
        inst.status = 'Partial';
        unapplied = 0;
        break;
      }
      if (unapplied <= 0) break;
    }
  }

  // 4. Calculate GST Tax Breakdown & Generate Official Receipt
  const admission = store.admissions.find(
    (a) => a.id === student.admission_id || a.admission_number === student.admission_number
  );
  const studentLoc =
    student.state_code ||
    student.state ||
    admission?.state_code ||
    admission?.state ||
    admission?.city ||
    admission?.address ||
    student.address ||
    'Telangana';
  const gstDetails = calculateGstBreakdown(input.amount, studentLoc, {
    customDocNumber: receiptNumber,
    customDocDate: input.payment_date,
  });

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
    institute_gst: store.settings.gst_number,
    created_at: new Date().toISOString(),

    // GST & e-Invoice Compliance
    supply_type: gstDetails.supply_type,
    place_of_supply: gstDetails.place_of_supply,
    place_of_supply_code: gstDetails.place_of_supply_code,
    sac_code: gstDetails.sac_code,
    taxable_amount: gstDetails.taxable_amount,
    cgst_rate: gstDetails.cgst_rate,
    cgst_amount: gstDetails.cgst_amount,
    sgst_rate: gstDetails.sgst_rate,
    sgst_amount: gstDetails.sgst_amount,
    igst_rate: gstDetails.igst_rate,
    igst_amount: gstDetails.igst_amount,
    total_tax: gstDetails.total_tax,
    is_reverse_charge: gstDetails.is_reverse_charge,
    irn: gstDetails.irn,
    ack_no: gstDetails.ack_no,
    ack_date: gstDetails.ack_date,
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

      if (!error && data && data.length > 0) {
        store.expenses = data as Expense[];
        return data as Expense[];
      }
    } catch (err) {
      console.warn('Supabase expenses query error, falling back to local persistent store:', err);
    }
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

  return newExpense;
}

export async function approveExpense(
  expenseId: string,
  approverUserId: string
): Promise<Expense> {
  const exp = store.expenses.find((e) => e.id === expenseId);
  if (!exp) throw new Error('Expense not found');

  const approver = store.users.find((u) => u.id === approverUserId);
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
    new_value: { status: 'Approved' },
  });

  return exp;
}

export async function getVendors(): Promise<Vendor[]> {
  if (isLiveSupabaseEnabled()) {
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('vendors')
        .select('*')
        .order('vendor_name', { ascending: true });

      if (!error && data && data.length > 0) {
        store.vendors = data as Vendor[];
        return data as Vendor[];
      }
    } catch (err) {
      console.warn('Supabase vendors query error, falling back to local persistent store:', err);
    }
  }

  return [...store.vendors];
}

export async function createVendor(data: Omit<Vendor, 'id' | 'total_paid' | 'created_at'>): Promise<Vendor> {
  const vendor: Vendor = {
    ...data,
    id: `ven-${Date.now()}`,
    total_paid: 0,
    created_at: new Date().toISOString(),
  };
  store.vendors.push(vendor);
  store.persist();

  if (isLiveSupabaseEnabled()) {
    try {
      const supabase = createClient();
      await supabase.from('vendors').insert({
        id: vendor.id,
        vendor_name: vendor.vendor_name,
        contact_person: vendor.contact_person,
        phone: vendor.phone,
        email: vendor.email,
        address: vendor.address,
        gst_number: vendor.gst_number,
        bank_name: vendor.bank_name,
        bank_account_number: vendor.bank_account_number,
        bank_ifsc: vendor.bank_ifsc,
        notes: vendor.notes,
      });
    } catch (err) {
      console.warn('Supabase vendor direct insert warning, preserved locally:', err);
    }
  }

  return vendor;
}

// --- Finance Analytics & Dashboard Aggregations ---
export async function getFinanceDashboardMetrics() {
  const todayStr = new Date().toISOString().slice(0, 10);
  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();

  // Collections
  const todayCollections = store.payments
    .filter((p) => p.payment_date === todayStr)
    .reduce((sum, p) => sum + p.amount, 0);

  const monthlyPayments = store.payments.filter((p) => {
    const d = new Date(p.payment_date);
    return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
  });
  const monthlyCollections = monthlyPayments.reduce((sum, p) => sum + p.amount, 0);

  const totalOutstanding = store.feeAccounts.reduce((sum, f) => sum + f.outstanding_amount, 0);

  const overdueInstallments = store.installments
    .filter((i) => i.status === 'Overdue' || (i.status === 'Due' && i.due_date < todayStr))
    .reduce((sum, i) => sum + (i.amount - i.paid_amount), 0);

  // Expenses
  const monthlyExpensesList = store.expenses.filter((e) => {
    const d = new Date(e.expense_date);
    return d.getMonth() === currentMonth && d.getFullYear() === currentYear && e.status === 'Paid';
  });
  const monthlyExpenses = monthlyExpensesList.reduce((sum, e) => sum + e.amount, 0);

  const netCashFlow = monthlyCollections - monthlyExpenses;

  // Course-wise collections
  const courseRevenueMap: Record<string, number> = {};
  for (const p of store.payments) {
    const name = p.course_name || 'SAP Course';
    courseRevenueMap[name] = (courseRevenueMap[name] || 0) + p.amount;
  }

  // Payment mode distribution
  const paymentModeMap: Record<string, number> = {};
  for (const p of store.payments) {
    paymentModeMap[p.payment_mode] = (paymentModeMap[p.payment_mode] || 0) + p.amount;
  }

  return {
    todayCollections,
    monthlyCollections,
    totalOutstanding,
    overdueInstallments,
    monthlyExpenses,
    totalRefunds: 0,
    netCashFlow,
    courseRevenueMap,
    paymentModeMap,
  };
}
