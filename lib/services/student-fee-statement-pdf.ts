import PDFDocument from 'pdfkit';
import 'pdfkit/standard-fonts/Helvetica';
import { getReceiptFontBuffer } from '@/lib/fonts/receipt-font';
import type { StudentFeeStatement } from './student-fee-statement';

export function statementPdfLines(statement: StudentFeeStatement): string[] {
  const inr = (amount: number) => `INR ${amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
  return [
    'Student Fee Statement', `${statement.studentName} | Admission: ${statement.admissionNumber}`,
    `Course: ${statement.courses.join(', ')}`, `Generated: ${statement.generatedOn}`,
    `Approved fee: ${inr(statement.totalApprovedFee)} | Net paid: ${inr(statement.cumulativePaid)}`,
    `Outstanding: ${inr(statement.outstanding)} | ${statement.status}`,
    'Original invoices',
    ...statement.invoices.map(i => `${i.number || 'Not recorded'} | ${i.date || 'Date not recorded'} | ${i.course} | Original approved fee: ${inr(i.originalAmount)}`),
    'Chronological payment history',
    ...statement.rows.flatMap(r => [
      `${r.date.slice(0, 10)} | ${r.description} | ${r.status}`,
      `Received: ${inr(r.amountReceived)} | Cumulative net paid: ${inr(r.cumulativePaid)} | Balance: ${inr(r.balance)}`,
      `Receipt: ${r.receiptNumber || 'Not issued'}${r.feeDelta ? ` | Fee adjustment: ${inr(r.feeDelta)}` : ''}`,
    ]),
    'Installment schedule',
    ...statement.installments.flatMap(i => [
      `Due: ${i.dueDate} | Scheduled: ${inr(i.amount)} | Verified received: ${inr(i.received)} | Unpaid: ${inr(i.unpaid)} | ${i.status}`,
      `Actual payment dates: ${i.paymentDates.join(', ') || 'None'} | Verification: ${i.verificationStatus.join(', ') || 'No payment'}`,
    ]),
    'Pending and rejected payments do not reduce the outstanding balance. This statement does not replace original invoices, receipts or credit notes.',
  ];
}

export async function generateStudentFeeStatementPdf(statement: StudentFeeStatement): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 42, info: { Title: `Student Fee Statement - ${statement.admissionNumber}` } });
    const chunks: Buffer[] = [];
    doc.on('data', chunk => chunks.push(Buffer.from(chunk)));
    doc.on('error', reject);
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.registerFont('Statement', getReceiptFontBuffer()).font('Statement').fontSize(10);
    for (const line of statementPdfLines(statement)) {
      doc.text(line, { paragraphGap: 8 });
    }
    doc.end();
  });
}
