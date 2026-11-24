import { store } from './data-store';
import { StudentFee, Student, Payment, StudentFeeAccount, StudentPaymentRecord } from '@/types';
import { InvoiceData, InvoiceItem, InvoicePaymentRecord, InvoiceHsnSummaryItem } from './invoice-pdf-service';
import { amountToWordsINR } from './finance-formatters';
import {
  OFFICIAL_INSTITUTE_NAME,
  OFFICIAL_INSTITUTE_ADDRESS,
  OFFICIAL_INSTITUTE_PHONE,
  OFFICIAL_INSTITUTE_WEBSITE,
  resolveInstituteAddress,
  resolveInstitutePhone,
} from '@/lib/constants/branding';

/**
 * Maps a StudentFee record to the standardized master InvoiceData structure
 */
export function buildInvoiceDataFromFee(
  fee: StudentFee,
  options?: {
    customReference?: string;
    overrideDueDate?: string;
    notes?: string[];
  }
): InvoiceData {
  const student = store.students.find(
    (s) => s.id === fee.student_id || s.user_id === fee.student_id || s.admission_id === fee.student_id
  );

  const admission = store.admissions.find(
    (a) => a.id === fee.student_id || a.admission_number === fee.admission_number
  );

  const course = store.courses.find((c) => c.id === fee.course_id);
  const batch = store.batches.find((b) => b.id === fee.batch_id);

  const totalAmount = Number(
    fee.invoice_approved_amount ?? fee.approved_total ?? fee.final_payable ?? fee.standard_fee ?? 0
  );

  // Authoritative verified payments ONLY (Never count Pending or Rejected)
  const paymentsList: InvoicePaymentRecord[] = [];
  const seenReceipts = new Set<string>();

  // 1. From studentPayments
  const relevantStudentPayments = (store.studentPayments || []).filter(
    (sp) =>
      sp.fee_id === fee.id &&
      (sp.verification_status === 'Verified' || sp.status === 'Approved')
  );

  for (const sp of relevantStudentPayments) {
    const key = sp.receipt_number || sp.transaction_reference || sp.id;
    seenReceipts.add(key);
    paymentsList.push({
      date: sp.payment_date || sp.created_at?.slice(0, 10) || new Date().toISOString().slice(0, 10),
      amount: Number(sp.amount_paid || 0),
      receipt_number: sp.receipt_number || undefined,
      payment_mode: sp.payment_mode,
      reference: sp.transaction_reference || undefined,
    });
  }

  // 2. From payments
  const relevantPayments = (store.payments || []).filter(
    (p) =>
      (p.fee_account_id === fee.id ||
        p.fee_account_id === fee.fee_account_id ||
        (student && p.student_id === student.id)) &&
      (p.status === 'Success' || (p.status as string) === 'Approved' || (p.status as string) === 'Verified')
  );

  for (const p of relevantPayments) {
    const key = p.receipt_number || p.transaction_reference || p.id;
    if (!seenReceipts.has(key)) {
      seenReceipts.add(key);
      paymentsList.push({
        date: p.payment_date || p.created_at?.slice(0, 10) || new Date().toISOString().slice(0, 10),
        amount: Number(p.amount || 0),
        receipt_number: p.receipt_number || undefined,
        payment_mode: p.payment_mode,
        reference: p.transaction_reference || undefined,
      });
    }
  }

  // Sort payments chronologically
  paymentsList.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const verifiedPaidTotal = paymentsList.reduce((acc, p) => acc + p.amount, 0);
  const amountDue = Math.max(0, Number((totalAmount - verifiedPaidTotal).toFixed(2)));

  const courseName = fee.course_name || course?.course_name || 'SAP Enterprise Training';
  const batchRef =
    options?.customReference ||
    fee.batch_name ||
    batch?.batch_name ||
    course?.course_code ||
    'Standard Batch';

  const items: InvoiceItem[] = [
    {
      description: `Training Fee — ${courseName}`,
      hsn_sac: (fee as any).sac_code || (fee as any).hsn_sac || '999293',
      quantity: 1.0,
      unit_price: totalAmount,
      amount: totalAmount,
    },
  ];

  // HSN Summary calculation (18% GST baseline breakdown for educational service SAC 999293)
  const sacCode = (fee as any).sac_code || (fee as any).hsn_sac || '999293';
  const gstRate = 18;
  const taxableValue = Number((totalAmount / (1 + gstRate / 100)).toFixed(2));
  const hsnSummary: InvoiceHsnSummaryItem[] = [
    {
      hsn_sac: sacCode,
      quantity: 1.0,
      rate_percentage: gstRate,
      taxable_value: taxableValue,
    },
  ];

  // Customer-facing notes
  const customerNotes: string[] = [];
  if (batchRef) {
    customerNotes.push(`Batch enrollment reference: ${batchRef}`);
  }
  if (fee.payment_plan) {
    customerNotes.push(`Payment Plan: ${fee.payment_plan}`);
  }
  if (fee.approval_notes && !fee.approval_notes.toLowerCase().includes('internal')) {
    customerNotes.push(`Approved Remarks: ${fee.approval_notes}`);
  }
  if (options?.notes && options.notes.length > 0) {
    customerNotes.push(...options.notes);
  }
  if (customerNotes.length === 0) {
    customerNotes.push('Tuition & LMS access fee per approved course enrollment.');
    customerNotes.push('Receipts issued subject to bank realization of cheques, UPI, and online transfers.');
  }

  const invoiceNumber = fee.invoice_number || `INV-${fee.id.slice(0, 8).toUpperCase()}`;
  const invoiceDate =
    fee.invoice_date || (fee as any).created_at?.slice(0, 10) || new Date().toISOString().slice(0, 10);
  const dueDate = options?.overrideDueDate || (fee as any).due_date || fee.first_due_date || invoiceDate;

  const studentPhone =
    student?.phone || admission?.phone || (student as any)?.contact_number || '';
  const studentAddress =
    student?.address || admission?.address || (student?.city ? `${student.city}, ${student.state || 'Telangana'}` : '');
  const placeOfSupply =
    (fee as any).place_of_supply || student?.state || admission?.state || 'Telangana';

  const bankName = store.settings?.bank_name || 'HDFC Bank';
  const bankAccountInfo = `Journal - ${bankName}`;

  return {
    id: fee.id,
    invoice_number: invoiceNumber,
    invoice_date: invoiceDate,
    due_date: dueDate,
    reference: batchRef,
    student_id: fee.student_id,
    student_name: fee.student_name || student?.full_name || admission?.student_name || 'Enrolled Student',
    student_phone: studentPhone,
    student_email: student?.email || admission?.email || '',
    student_code: fee.student_code || student?.student_code || '',
    admission_number: fee.admission_number || student?.admission_number || admission?.admission_number || '',
    student_address: studentAddress,
    place_of_supply: placeOfSupply,
    items,
    payment_communication: invoiceNumber,
    bank_account_info: bankAccountInfo,
    customer_notes: customerNotes,
    total_amount: totalAmount,
    amount_in_words: amountToWordsINR(totalAmount),
    payments: paymentsList,
    amount_due: amountDue,
    hsn_summary: hsnSummary,
    authorized_signatory_name: store.settings?.authorized_signatory_name || 'Chief Accountant',
    authorized_signatory_title: 'Authorized signatory',
    institute_name: store.settings?.institute_name || OFFICIAL_INSTITUTE_NAME,
    institute_address: resolveInstituteAddress(store.settings?.address),
    institute_phone: resolveInstitutePhone(store.settings?.phone),
    institute_website: OFFICIAL_INSTITUTE_WEBSITE,
    institute_gst: store.settings?.gst_number || '36AAACN1234F1Z8',
    tenant_id: fee.tenant_id || 'default',
    status: amountDue === 0 ? 'Paid' : paymentsList.length > 0 ? 'Partially Paid' : 'Due',
  };
}

/**
 * Maps a StudentFeeAccount to InvoiceData
 */
export function buildInvoiceDataFromFeeAccount(
  feeAccount: StudentFeeAccount,
  options?: {
    customReference?: string;
    overrideDueDate?: string;
    notes?: string[];
  }
): InvoiceData {
  const student = store.students.find(
    (s) => s.id === feeAccount.student_id || s.user_id === feeAccount.student_id
  );
  const admission = store.admissions.find(
    (a) => a.id === feeAccount.admission_id || (student && a.admission_number === student.admission_number)
  );
  const course = store.courses.find((c) => c.id === feeAccount.course_id);

  const totalAmount = Number(feeAccount.net_payable ?? feeAccount.original_fee ?? 0);

  // Payments from store.payments
  const verifiedPayments: InvoicePaymentRecord[] = (store.payments || [])
    .filter(
      (p) =>
        (p.fee_account_id === feeAccount.id || (student && p.student_id === student.id)) &&
        (p.status === 'Success' || (p.status as string) === 'Approved' || (p.status as string) === 'Verified')
    )
    .sort((a, b) => new Date(a.payment_date || a.created_at).getTime() - new Date(b.payment_date || b.created_at).getTime())
    .map((p) => ({
      date: p.payment_date || p.created_at?.slice(0, 10) || new Date().toISOString().slice(0, 10),
      amount: Number(p.amount || 0),
      receipt_number: p.receipt_number || undefined,
      payment_mode: p.payment_mode,
      reference: p.transaction_reference || undefined,
    }));

  const verifiedPaidTotal = verifiedPayments.reduce((acc, p) => acc + p.amount, 0);
  const amountDue = Math.max(0, Number((totalAmount - verifiedPaidTotal).toFixed(2)));

  const courseName = feeAccount.course_name || course?.course_name || 'SAP Enterprise Training';
  const batchRef = options?.customReference || course?.course_code || 'Standard Batch';

  const items: InvoiceItem[] = [
    {
      description: `Training Fee — ${courseName}`,
      hsn_sac: '999293',
      quantity: 1.0,
      unit_price: totalAmount,
      amount: totalAmount,
    },
  ];

  const sacCode = '999293';
  const gstRate = 18;
  const taxableValue = Number((totalAmount / (1 + gstRate / 100)).toFixed(2));
  const hsnSummary: InvoiceHsnSummaryItem[] = [
    {
      hsn_sac: sacCode,
      quantity: 1.0,
      rate_percentage: gstRate,
      taxable_value: taxableValue,
    },
  ];

  const customerNotes: string[] = [];
  if (batchRef) customerNotes.push(`Batch enrollment reference: ${batchRef}`);
  if (feeAccount.payment_plan) customerNotes.push(`Payment Plan: ${feeAccount.payment_plan}`);
  if (options?.notes && options.notes.length > 0) customerNotes.push(...options.notes);
  if (customerNotes.length === 0) {
    customerNotes.push('Tuition & LMS access fee per approved course enrollment.');
    customerNotes.push('Receipts issued subject to bank realization of cheques, UPI, and online transfers.');
  }

  const invoiceNumber = `INV-${feeAccount.id.slice(0, 8).toUpperCase()}`;
  const invoiceDate = feeAccount.created_at?.slice(0, 10) || new Date().toISOString().slice(0, 10);
  const dueDate = options?.overrideDueDate || (feeAccount as any).due_date || invoiceDate;

  const studentPhone = student?.phone || admission?.phone || '';
  const studentAddress =
    student?.address || admission?.address || (student?.city ? `${student.city}, ${student.state || 'Telangana'}` : '');
  const placeOfSupply = student?.state || admission?.state || 'Telangana';

  const bankName = store.settings?.bank_name || 'HDFC Bank';
  const bankAccountInfo = `Journal - ${bankName}`;

  return {
    id: feeAccount.id,
    invoice_number: invoiceNumber,
    invoice_date: invoiceDate,
    due_date: dueDate,
    reference: batchRef,
    student_id: feeAccount.student_id,
    student_name: feeAccount.student_name || student?.full_name || admission?.student_name || 'Enrolled Student',
    student_phone: studentPhone,
    student_email: student?.email || admission?.email || '',
    student_code: student?.student_code || '',
    admission_number: student?.admission_number || admission?.admission_number || '',
    student_address: studentAddress,
    place_of_supply: placeOfSupply,
    items,
    payment_communication: invoiceNumber,
    bank_account_info: bankAccountInfo,
    customer_notes: customerNotes,
    total_amount: totalAmount,
    amount_in_words: amountToWordsINR(totalAmount),
    payments: verifiedPayments,
    amount_due: amountDue,
    hsn_summary: hsnSummary,
    authorized_signatory_name: store.settings?.authorized_signatory_name || 'Chief Accountant',
    authorized_signatory_title: 'Authorized signatory',
    institute_name: store.settings?.institute_name || OFFICIAL_INSTITUTE_NAME,
    institute_address: resolveInstituteAddress(store.settings?.address),
    institute_phone: resolveInstitutePhone(store.settings?.phone),
    institute_website: OFFICIAL_INSTITUTE_WEBSITE,
    institute_gst: store.settings?.gst_number || '36AAACN1234F1Z8',
    tenant_id: feeAccount.tenant_id || 'default',
    status: amountDue === 0 ? 'Paid' : verifiedPayments.length > 0 ? 'Partially Paid' : 'Due',
  };
}

/**
 * Look up an invoice by invoice number, fee ID, payment ID, or student admission number
 */
export function getInvoiceByIdOrNumber(identifier: string): InvoiceData | null {
  if (!identifier || !identifier.trim()) return null;
  const cleanId = identifier.trim().toLowerCase();

  // 1. Direct match on studentFees
  const fee = (store.studentFees || []).find(
    (f) =>
      f.id.toLowerCase() === cleanId ||
      f.invoice_number?.toLowerCase() === cleanId ||
      `inv-${f.id.slice(0, 8).toLowerCase()}` === cleanId ||
      (cleanId.startsWith('inv-') && f.id.toLowerCase().startsWith(cleanId.slice(4))) ||
      f.student_id.toLowerCase() === cleanId ||
      f.admission_number?.toLowerCase() === cleanId ||
      f.student_code?.toLowerCase() === cleanId
  );

  if (fee) {
    return buildInvoiceDataFromFee(fee);
  }

  // 2. Fallback: match via feeAccounts
  const feeAccount = (store.feeAccounts || []).find(
    (fa) =>
      fa.id.toLowerCase() === cleanId ||
      fa.student_id.toLowerCase() === cleanId ||
      `inv-${fa.id.slice(0, 8).toLowerCase()}` === cleanId ||
      (cleanId.startsWith('inv-') && fa.id.toLowerCase().startsWith(cleanId.slice(4))) ||
      (fa as any).invoice_number?.toLowerCase() === cleanId ||
      (fa.student_name && fa.student_name.toLowerCase().includes(cleanId))
  );

  if (feeAccount) {
    return buildInvoiceDataFromFeeAccount(feeAccount);
  }

  // 3. Fallback: match via student
  const student = (store.students || []).find(
    (s) =>
      s.id.toLowerCase() === cleanId ||
      s.admission_number.toLowerCase() === cleanId ||
      s.student_code.toLowerCase() === cleanId
  );

  if (student) {
    const matchingFee = (store.studentFees || []).find((f) => f.student_id === student.id || f.student_id === student.user_id);
    if (matchingFee) return buildInvoiceDataFromFee(matchingFee);
    const matchingFa = (store.feeAccounts || []).find((fa) => fa.student_id === student.id || fa.student_id === student.user_id);
    if (matchingFa) return buildInvoiceDataFromFeeAccount(matchingFa);
  }

  return null;
}

/**
 * Retrieve all invoices across active student fee accounts
 */
export function getAllInvoices(): InvoiceData[] {
  const result: InvoiceData[] = [];
  const seenNumbers = new Set<string>();

  for (const fee of store.studentFees || []) {
    if (fee.approval_status === 'Approved' || (fee.approval_status as string) === 'Active' || !!fee.invoice_number) {
      const inv = buildInvoiceDataFromFee(fee);
      if (!seenNumbers.has(inv.invoice_number)) {
        seenNumbers.add(inv.invoice_number);
        result.push(inv);
      }
    }
  }

  // Also include feeAccounts that have no explicit studentFees record
  for (const fa of store.feeAccounts || []) {
    const inv = buildInvoiceDataFromFeeAccount(fa);
    if (inv && !seenNumbers.has(inv.invoice_number)) {
      seenNumbers.add(inv.invoice_number);
      result.push(inv);
    }
  }

  return result;
}
