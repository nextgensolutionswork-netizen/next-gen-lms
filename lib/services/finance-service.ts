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
import { isLiveSupabaseEnabled } from '@/lib/supabase/db';
import { dbGetPayments, dbGetReceipts, dbRecordPayment } from '@/lib/supabase/db-service';

// --- Student Fee Accounts & Installments ---
export async function getStudentFeeAccounts(): Promise<StudentFeeAccount[]> {
  return [...store.feeAccounts];
}

export async function getFeeAccountForStudent(studentId: string): Promise<StudentFeeAccount | undefined> {
  return store.feeAccounts.find((f) => f.student_id === studentId);
}

export async function getInstallmentsForAccount(feeAccountId: string): Promise<Installment[]> {
  return store.installments
    .filter((i) => i.fee_account_id === feeAccountId)
    .sort((a, b) => a.installment_number - b.installment_number);
}

export async function getPayments(): Promise<Payment[]> {
  if (isLiveSupabaseEnabled()) {
    try {
      const dbList = await dbGetPayments();
      if (dbList && dbList.length > 0) return dbList;
    } catch (err) {
      console.warn('Supabase payments query error, falling back to local store:', err);
    }
  }

  return [...store.payments].sort(
    (a, b) => new Date(b.payment_date).getTime() - new Date(a.payment_date).getTime()
  );
}

export async function getReceipts(): Promise<Receipt[]> {
  if (isLiveSupabaseEnabled()) {
    try {
      const dbList = await dbGetReceipts();
      if (dbList && dbList.length > 0) return dbList;
    } catch (err) {
      console.warn('Supabase receipts query error, falling back to local store:', err);
    }
  }

  return [...store.receipts].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

export async function getReceiptById(receiptId: string): Promise<Receipt | undefined> {
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

  // 4. Generate Official Receipt
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
  };

  // 5. Commit to Store
  store.payments.unshift(newPayment);
  store.receipts.unshift(newReceipt);

  if (isLiveSupabaseEnabled()) {
    try {
      await dbRecordPayment(
        newPayment,
        newReceipt,
        feeAccount.id,
        newPaidAmount,
        newOutstandingAmount,
        feeAccount.status
      );
    } catch (err) {
      console.warn('Supabase payment insert error, saved locally:', err);
    }
  }

  // 6. Record Tamper-Evident Audit Log
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
    },
  });

  return { payment: newPayment, receipt: newReceipt, updatedFeeAccount: feeAccount };
}

// --- Expenses & Vendors ---
export async function getExpenses(): Promise<Expense[]> {
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
