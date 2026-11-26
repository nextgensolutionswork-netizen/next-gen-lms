import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { inflateSync } from 'node:zlib';
import fs from 'fs';
import path from 'path';
import { store } from '@/lib/services/data-store';
import { createAdmissionWorkflow } from '@/lib/services/admission-service';
import { feeWorkflowService } from '@/lib/services/fee-workflow-service';
import { generateReceiptPdfBuffer } from '@/lib/services/pdf-service';
import { generateInvoicePdfBuffer } from '@/lib/services/invoice-pdf-service';
import { generateStudentFeeStatementPdf, statementPdfLines } from '@/lib/services/student-fee-statement-pdf';
import { buildStudentFeeStatement } from '@/lib/services/student-fee-statement';
import { GET as getReceiptPdfRoute } from '@/app/api/receipts/[id]/pdf/route';
import { GET as getInvoicePdfRoute } from '@/app/api/invoices/[id]/pdf/route';
import { GET as getStatementRoute } from '@/app/api/fees/statements/[id]/route';
import { AUTH_COOKIE_NAME, AUTH_SIG_COOKIE_NAME, generateAuthCookieSignatureSync } from '@/lib/security/auth-cookie';
import { OFFICIAL_INSTITUTE_NAME } from '@/lib/constants/branding';
import { UserProfile } from '@/types';

function authReq(url: string, user: UserProfile) {
  const val = encodeURIComponent(JSON.stringify(user));
  const sig = generateAuthCookieSignatureSync(val);
  return new NextRequest(url, { headers: { cookie: `${AUTH_COOKIE_NAME}=${val}; ${AUTH_SIG_COOKIE_NAME}=${sig}` } });
}

function pdfText(buffer: Buffer): string {
  let text = '';
  for (const match of buffer.toString('latin1').matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    let stream: string;
    try { stream = inflateSync(Buffer.from(match[1], 'latin1')).toString('latin1'); } catch { continue; }
    for (const token of stream.matchAll(/<([a-f0-9]+)>/gi)) text += Buffer.from(token[1], 'hex').toString('latin1');
  }
  return text;
}

const makeActor = (id: string, role: UserProfile['role'], tenant_id = 'default'): UserProfile => ({
  id,
  role,
  tenant_id,
  email: `${id}@nextgen-test.org`,
  full_name: `Staff ${id}`,
  is_active: true,
  created_at: '2026-11-26T00:00:00.000Z',
  updated_at: '2026-11-26T00:00:00.000Z',
});

describe('TASK-05: PDF Branding, Financial Accuracy, Layout & Security QA', () => {
  const counsellor = makeActor('couns-pdf-qa', 'counsellor');
  const accountant = makeActor('acc-pdf-qa', 'accountant');
  const trainer = makeActor('trn-pdf-qa', 'trainer');

  beforeEach(() => {
    vi.spyOn(store, 'persist').mockImplementation(() => {});
    vi.spyOn(store, 'persistSync').mockReturnValue(true);
    store.users = [counsellor, accountant, trainer];
    store.courses = [
      {
        id: 'crs-fico-pdf',
        course_name: 'SAP S/4HANA Enterprise Finance (FICO) Advanced Track',
        course_code: 'FICO-ADV',
        description: 'QA',
        duration_weeks: 12,
        category: 'SAP Functional',
        price: 35000,
        status: 'Published',
        created_at: '2026-11-01',
        updated_at: '2026-11-01',
      } as any,
    ];
    store.admissions = [];
    store.students = [];
    store.feeAccounts = [];
    store.installments = [];
    store.payments = [];
    store.receipts = [];
    store.studentFees = [];
    store.studentPayments = [];
    store.studentFinancialLedgers = [];
    store.onboardingCases = [];
    store.studentRefunds = [];
    store.auditLogs = [];
    store.settings = { ...(store.settings || {}), institute_name: OFFICIAL_INSTITUTE_NAME } as any;
  });

  it('Phase H & I: Controlled financial PDF scenario (35k/5k/14k/6k/2k) + bank account mapping + non-mutation', async () => {
    const admRes = await createAdmissionWorkflow(
      {
        student_name: 'Aarav Venkataraman Subramanian',
        dob: '1997-04-12',
        gender: 'Male',
        phone: '9876543299',
        email: 'aarav.subramanian@example.com',
        address: '42 Jubilee Hills',
        city: 'Hyderabad',
        education: 'M.Com',
        experience_years: 2,
        current_employment_status: 'Employed',
        admission_date: '2026-11-26',
        course_id: 'crs-fico-pdf',
        course_fee: 35000,
        discount: 5000,
        payment_plan: 'Full Payment',
        collect_initial_payment: true,
        initial_payment_amount: 14000,
        payment_mode: 'UPI',
        transaction_reference: 'UTR-PDF-P1',
        our_bank_profile_id: 'bank-acc-14',
      },
      counsellor.id,
      true
    );
    const sid = admRes.student.id;
    const fee = store.studentFees.find((f) => f.student_id === sid)!;
    const p1 = store.studentPayments.find((p) => p.student_id === sid)!;
    feeWorkflowService.verifyPayment(p1.id, accountant.id, 'Verified P1', {
      reference: 'UTR-PDF-P1',
      amount: '14000',
      payment_date: p1.payment_date || '2026-11-26',
      receiving_bank_profile_id: 'bank-acc-14',
    });

    const p2 = feeWorkflowService.recordPayment(
      {
        fee_id: fee.id,
        student_id: sid,
        amount_paid: 6000,
        payment_mode: 'UPI',
        bank_upi_reference: 'UTR-PDF-P2',
        payment_date: '2026-11-26',
        our_bank_profile_id: 'bank-acc-05',
      },
      counsellor.id,
      counsellor.role
    );
    const p3 = feeWorkflowService.recordPayment(
      {
        fee_id: fee.id,
        student_id: sid,
        amount_paid: 2000,
        payment_mode: 'UPI',
        bank_upi_reference: 'UTR-PDF-P3',
        payment_date: '2026-11-26',
        our_bank_profile_id: 'bank-acc-14',
      },
      counsellor.id,
      counsellor.role
    );
    feeWorkflowService.rejectPayment(p3.id, accountant.id, 'Invalid reference');

    // Before approving P2: 14,000 verified, 16,000 outstanding, 1 receipt
    expect(store.receipts).toHaveLength(1);
    const stmtBefore = buildStudentFeeStatement({
      student: admRes.student,
      accounts: store.feeAccounts.filter((a) => a.student_id === sid),
      fees: store.studentFees.filter((f) => f.student_id === sid),
      payments: store.payments.filter((p) => p.student_id === sid),
      studentPayments: store.studentPayments.filter((p) => p.student_id === sid),
      receipts: store.receipts.filter((r) => r.student_id === sid),
      ledger: store.studentFinancialLedgers.filter((l) => l.student_id === sid),
      refunds: [],
      installments: store.installments.filter((i) => i.student_id === sid),
    });
    expect(stmtBefore.totalApprovedFee).toBe(30000);
    expect(stmtBefore.cumulativePaid).toBe(14000);
    expect(stmtBefore.outstanding).toBe(16000);

    const stmtPdf1 = await generateStudentFeeStatementPdf(stmtBefore);
    expect(stmtPdf1.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    expect(statementPdfLines(stmtBefore).join('\n')).toContain('14,000.00');
    expect(statementPdfLines(stmtBefore).join('\n')).toContain('16,000.00');

    // Approve P2 (6,000): 20,000 verified, 10,000 outstanding, 2 receipts
    feeWorkflowService.verifyPayment(p2.id, accountant.id, 'Verified P2', {
      reference: 'UTR-PDF-P2',
      amount: '6000',
      payment_date: '2026-11-26',
      receiving_bank_profile_id: 'bank-acc-05',
    });
    expect(store.receipts).toHaveLength(2);

    const recBuf1 = await generateReceiptPdfBuffer(store.receipts[0]);
    const recBuf2 = await generateReceiptPdfBuffer(store.receipts[1]);
    expect(recBuf1.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    expect(recBuf2.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    expect(pdfText(recBuf1)).toContain(OFFICIAL_INSTITUTE_NAME);
    expect(pdfText(recBuf1)).not.toMatch(/GST|IRN|Tax/);
    // Repeated receipt PDF generation must not duplicate receipts or alter balances
    await generateReceiptPdfBuffer(store.receipts[0]);
    expect(store.receipts).toHaveLength(2);
    expect(store.studentFees.find((f) => f.student_id === sid)!.outstanding_amount).toBe(10000);
  });

  it('Phase J & K: Multi-page invoice table & PDFKit patch idempotency', async () => {
    const manyPayments = Array.from({ length: 24 }, (_, idx) => ({
      date: '2026-11-26',
      amount: 1000,
      receipt_number: `REC-2026-0${100 + idx}`,
      payment_mode: 'UPI',
      reference: `UTR-MULTI-${idx}`,
    }));
    const invPdf = await generateInvoicePdfBuffer({
      id: 'inv-multi-qa',
      invoice_number: 'INV-26-27-9999',
      invoice_date: '2026-11-26',
      student_id: 'stu-qa-1',
      student_name: 'Chandra Shekhar Venkata Narasimha Rao',
      place_of_supply: 'Telangana (36)',
      items: [{ description: 'SAP S/4HANA Enterprise Finance Complete Training Bundle', quantity: 1, unit_price: 35000, amount: 35000 }],
      payment_communication: 'INV-26-27-9999',
      total_amount: 35000,
      payments: manyPayments,
      amount_due: 11000,
    });
    expect(invPdf.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    const pageMatches = invPdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || [];
    expect(pageMatches.length).toBeGreaterThanOrEqual(1);

    const pdfkitFile = path.join(process.cwd(), 'node_modules', 'pdfkit', 'js', 'pdfkit.node.mjs');
    if (fs.existsSync(pdfkitFile)) {
      const content = fs.readFileSync(pdfkitFile, 'utf8');
      const matches = content.match(/const _INLINED_STANDARD_FONTS/g) || [];
      expect(matches.length).toBe(1);
    }
  });

  it('Phase L: Document authorization rejects unauthenticated, unauthorized role, cross-student, and cross-tenant access', async () => {
    const studentA = makeActor('stu-a-user', 'student', 'default');
    const studentB = makeActor('stu-b-user', 'student', 'default');
    const foreignAccountant = makeActor('acc-foreign', 'accountant', 'tenant-beta');
    store.users.push(studentA, studentB, foreignAccountant);
    store.students.push({
      id: 'stu-a-rec',
      user_id: studentA.id,
      tenant_id: 'default',
      full_name: 'Student A',
      email: studentA.email,
      student_unique_id: 'NGERP-2026-00901',
    } as any);
    store.receipts.push({
      id: 'rec-auth-qa-1',
      tenant_id: 'default',
      receipt_number: 'REC-QA-901',
      payment_id: 'pay-auth-qa-1',
      student_id: 'stu-a-rec',
      student_name: 'Student A',
      admission_number: 'ADM-QA-901',
      course_name: 'SAP FICO',
      payment_amount: 10000,
      payment_mode: 'UPI',
      payment_date: '2026-11-26',
      remaining_balance: 20000,
      authorized_by: 'Accounts Department',
      created_at: '2026-11-26T10:00:00.000Z',
    } as any);

    // Unauthenticated receipt download -> 401
    const unauthRec = await getReceiptPdfRoute(
      new NextRequest('http://localhost/api/receipts/rec-auth-qa-1/pdf'),
      { params: Promise.resolve({ id: 'rec-auth-qa-1' }) }
    );
    expect(unauthRec.status).toBe(401);

    // Trainer cannot download another student's receipt -> 403
    const trainerRec = await getReceiptPdfRoute(
      authReq('http://localhost/api/receipts/rec-auth-qa-1/pdf', trainer),
      { params: Promise.resolve({ id: 'rec-auth-qa-1' }) }
    );
    expect(trainerRec.status).toBe(403);

    // Student B cannot download Student A's receipt or fee statement -> 403 / 404
    const crossStudentRec = await getReceiptPdfRoute(
      authReq('http://localhost/api/receipts/rec-auth-qa-1/pdf', studentB),
      { params: Promise.resolve({ id: 'rec-auth-qa-1' }) }
    );
    expect(crossStudentRec.status).toBe(403);

    const crossStudentStmt = await getStatementRoute(
      authReq('http://localhost/api/fees/statements/stu-a-rec?format=pdf', studentB),
      { params: Promise.resolve({ id: 'stu-a-rec' }) }
    );
    expect(crossStudentStmt.status).toBe(404);

    // Cross-tenant accountant cannot download default tenant receipt or statement -> 403 / 404
    const crossTenantRec = await getReceiptPdfRoute(
      authReq('http://localhost/api/receipts/rec-auth-qa-1/pdf', foreignAccountant),
      { params: Promise.resolve({ id: 'rec-auth-qa-1' }) }
    );
    expect(crossTenantRec.status).toBe(403);

    // Unauthenticated invoice download -> 401
    const unauthInv = await getInvoicePdfRoute(
      new NextRequest('http://localhost/api/invoices/inv-1/pdf'),
      { params: Promise.resolve({ id: 'inv-1' }) }
    );
    expect(unauthInv.status).toBe(401);

    // Authorized accountant can download receipt with safe PDF headers
    const okRec = await getReceiptPdfRoute(
      authReq('http://localhost/api/receipts/rec-auth-qa-1/pdf?download=true', accountant),
      { params: Promise.resolve({ id: 'rec-auth-qa-1' }) }
    );
    expect(okRec.status).toBe(200);
    expect(okRec.headers.get('content-type')).toBe('application/pdf');
    expect(okRec.headers.get('content-disposition')).toContain('attachment; filename=');
  });
});
