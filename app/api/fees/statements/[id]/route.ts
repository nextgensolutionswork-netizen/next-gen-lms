import { NextRequest, NextResponse } from 'next/server';
import { authenticatePaymentRequest } from '@/lib/auth/payment-session';
import { tenantId } from '@/lib/auth/tenant';
import { paymentTransaction } from '@/lib/services/payment-workflow-transaction';
import { store } from '@/lib/services/data-store';
import { buildStudentFeeStatement } from '@/lib/services/student-fee-statement';
import { generateStudentFeeStatementPdf } from '@/lib/services/student-fee-statement-pdf';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let actor;
  try { actor = await authenticatePaymentRequest(request); }
  catch { return NextResponse.json({ error: 'Authentication required.' }, { status: 401 }); }
  if (!['student', 'counsellor', 'accountant', 'admin', 'super_admin'].includes(actor.role)) {
    return NextResponse.json({ error: 'Statement access denied.' }, { status: 403 });
  }
  const { id } = await params;
  try {
    const statement = await paymentTransaction(actor, () => {
      const student = store.students.find(s => s.id === id && tenantId(s) === tenantId(actor));
      if (!student || (actor.role === 'student' && student.user_id !== actor.id)) return null;
      const belongs = (row: { tenant_id?: string; student_id?: string }) => row.student_id === id && tenantId(row) === tenantId(actor);
      const accounts = store.feeAccounts.filter(belongs);
      return buildStudentFeeStatement({ student, accounts,
        fees: store.studentFees.filter(belongs), payments: store.payments.filter(belongs),
        studentPayments: store.studentPayments.filter(belongs), receipts: store.receipts.filter(belongs),
        ledger: store.studentFinancialLedgers.filter(belongs),
        refunds: store.studentRefunds.filter(r => r.student_id === id),
        installments: store.installments.filter(i => tenantId(i) === tenantId(actor) && (i.student_id === id || accounts.some(a => a.id === i.fee_account_id))),
      });
    }, true, true);
    if (!statement) return NextResponse.json({ error: 'Student not found or access denied.' }, { status: 404 });
    if (request.nextUrl.searchParams.get('format') === 'pdf') {
      const pdf = await generateStudentFeeStatementPdf(statement);
      return new NextResponse(new Uint8Array(pdf), { headers: { 'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="student-fee-statement.pdf"', 'Cache-Control': 'private, no-store' } });
    }
    return NextResponse.json({ statement }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch {
    return NextResponse.json({ error: 'The committed financial records could not be loaded. Please retry.' }, { status: 503 });
  }
}
