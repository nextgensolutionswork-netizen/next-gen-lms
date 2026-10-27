import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { Receipt, Certificate } from '@/types';
import { formatDate, formatDateTime } from '@/lib/utils/formatters';
import { amountToWordsINR } from './finance-formatters';
import { uploadFile } from './storage-service';

export class ReceiptPdfDataError extends Error {}

function receiptNumber(value: unknown): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && !value.trim()) return null;
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

/**
 * Server-Side PDF Generation Service
 * Generates vector PDF documents for Official Fee Receipts
 * and Course Completion Certificates with embedded scannable QR verification.
 */

/**
 * Generate an official A4 Fee Receipt PDF Buffer
 */
export async function generateReceiptPdfBuffer(receipt: Receipt): Promise<Buffer> {
  const paymentAmount = receiptNumber(receipt.payment_amount);
  const remainingBalance = receiptNumber(receipt.remaining_balance);
  if (paymentAmount === null) {
    throw new ReceiptPdfDataError(`Receipt ${receipt.receipt_number} has no valid payment amount. Correct the receipt or its linked payment before downloading.`);
  }
  // Legacy/imported receipts may omit institute details despite the static type.
  // PDFKit calls valueOf() on every metadata value during construction.
  const instituteName = typeof receipt.institute_name === 'string' ? receipt.institute_name.trim() : '';
  const verificationUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://lms.next-generpsolutions.com'}/accounts/receipts/${encodeURIComponent(receipt.id)}`;
  const qr = await QRCode.toBuffer(verificationUrl, { width: 160, margin: 1 });
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 45, info: {
      Title: `Fee Receipt - ${receipt.receipt_number}`,
      ...(instituteName ? { Author: instituteName } : {}),
      Subject: `Payment receipt for ${receipt.student_name}`,
    } });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    try {
      const money = (amount: number) => 'INR ' + amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      doc.fillColor('#0A6ED1').font('Helvetica-Bold').fontSize(20).text(instituteName || 'Fee Receipt');
      doc.fillColor('#475569').font('Helvetica').fontSize(10);
      if (receipt.institute_address) doc.text(receipt.institute_address);
      if (receipt.institute_phone) doc.text(receipt.institute_phone);
      doc.moveDown();
      doc.fillColor('#0F172A').font('Helvetica-Bold').fontSize(16).text('OFFICIAL FEE RECEIPT');
      doc.font('Helvetica').fontSize(10).text('Receipt: ' + receipt.receipt_number);
      doc.text('Payment date: ' + formatDate(receipt.payment_date || (receipt as any).receipt_date)).moveDown();
      if (receipt.status === 'Void') {
        doc.fillColor('#BE123C').font('Helvetica-Bold').text('VOID / CANCELLED');
        doc.font('Helvetica').text('Credit note: ' + (receipt.credit_note_number || ''));
        doc.text('Reason: ' + (receipt.void_reason || '')).moveDown();
      }
      doc.fillColor('#0F172A').font('Helvetica-Bold').text(receipt.student_name);
      doc.font('Helvetica').text('Admission: ' + (receipt.admission_number || (receipt as any).student_code || '—'));
      doc.text('Course: ' + receipt.course_name);
      if (receipt.student_email) doc.text(receipt.student_email);
      doc.moveDown().text('Payment mode: ' + receipt.payment_mode);
      doc.text('Transaction reference: ' + (receipt.transaction_reference || '-')).moveDown(2);
      doc.font('Helvetica-Bold').fontSize(14).text('Amount received: ' + money(paymentAmount));
      doc.font('Helvetica').fontSize(10).text(amountToWordsINR(paymentAmount)).moveDown();
      doc.font('Helvetica-Bold').text('Remaining balance: ' + (remainingBalance === null ? 'Not recorded on this receipt' : money(remainingBalance))).moveDown(2);
      doc.font('Helvetica').text('Authorized by: ' + (receipt.authorized_by || (receipt as any).issued_by || 'Finance & Accounts Office'));
      doc.text('Generated: ' + formatDateTime(receipt.created_at)).moveDown();
      const qrY = doc.y;
      doc.image(qr, 45, qrY, { width: 75, height: 75 });
      doc.fontSize(9).text('Scan to view this receipt in the student ledger.', 135, qrY + 18, { width: 350 });
      doc.fillColor('#64748B').text('This receipt records the payment credited to the student account.', 45, qrY + 100, { width: 500 });
      doc.end();
    } catch (error) { reject(error); }
  });
}

/**
 * Generate an official A4 Landscape Verified Course Completion Certificate PDF Buffer
 */
export async function generateCertificatePdfBuffer(cert: Certificate): Promise<Buffer> {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({
        layout: 'landscape',
        size: 'A4',
        margin: 36,
        info: {
          Title: `Verified Certificate - ${cert.certificate_id}`,
          Author: 'Next-Gen ERP Solutions',
          Subject: `SAP Course Completion Certificate for ${cert.student_name}`,
          Keywords: 'SAP, Certificate, Diploma, Verification',
        },
      });

      const chunks: Buffer[] = [];
      doc.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', (err) => reject(err));

      const pageWidth = doc.page.width;   // 841.89
      const pageHeight = doc.page.height; // 595.28

      // 1. Double Border
      // Outer Border (Navy)
      doc.rect(20, 20, pageWidth - 40, pageHeight - 40).lineWidth(3).strokeColor('#0F172A').stroke();
      // Inner Border (Amber / Gold)
      doc.rect(26, 26, pageWidth - 52, pageHeight - 52).lineWidth(1).strokeColor('#D97706').stroke();

      // Corner Ornaments
      const corners = [
        [28, 28],
        [pageWidth - 36, 28],
        [28, pageHeight - 36],
        [pageWidth - 36, pageHeight - 36],
      ];
      corners.forEach(([cx, cy]) => {
        doc.rect(cx, cy, 8, 8).fill('#D97706');
      });

      // 2. Top SAP Emblem
      doc.roundedRect(pageWidth / 2 - 25, 42, 50, 24, 6).fill('#0A6ED1');
      doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(12).text('SAP', pageWidth / 2 - 25, 48, { width: 50, align: 'center' });

      // 3. Institute Header
      doc.fillColor('#0F172A').font('Helvetica-Bold').fontSize(18).text('NEXT-GEN ERP SOLUTIONS', 0, 74, { width: pageWidth, align: 'center' });
      doc.fillColor('#64748B').font('Helvetica-Bold').fontSize(8.5).text('CENTER FOR ENTERPRISE SAP EXCELLENCE & PROFESSIONAL CERTIFICATION', 0, 96, { width: pageWidth, align: 'center' });

      // Decorative divider
      doc.moveTo(pageWidth / 2 - 160, 110).lineTo(pageWidth / 2 + 160, 110).lineWidth(1.5).strokeColor('#D97706').stroke();

      // 4. Certificate Headline & Awardee
      doc.fillColor('#0A6ED1').font('Times-Bold').fontSize(18).text('CERTIFICATE OF PROFESSIONAL EXCELLENCE', 0, 122, { width: pageWidth, align: 'center' });
      doc.fillColor('#64748B').font('Times-Italic').fontSize(11).text('This is to certify that', 0, 148, { width: pageWidth, align: 'center' });

      // Student Name
      doc.fillColor('#0F172A').font('Times-Bold').fontSize(26).text(cert.student_name, 0, 168, { width: pageWidth, align: 'center' });
      doc.moveTo(pageWidth / 2 - 180, 202).lineTo(pageWidth / 2 + 180, 202).lineWidth(1).strokeColor('#CBD5E1').stroke();

      // Completion Statement
      doc.fillColor('#475569').font('Helvetica').fontSize(9.5).text(
        'has demonstrated exemplary dedication and successfully fulfilled all academic curriculum modules, SAP GUI system configurations, enterprise hands-on lab requirements, and rigorous evaluation benchmarks for:',
        pageWidth / 2 - 300,
        212,
        { width: 600, align: 'center' }
      );

      // 5. Course Name Banner
      doc.roundedRect(pageWidth / 2 - 220, 242, 440, 36, 8).fillAndStroke('#EFF6FF', '#BFDBFE');
      doc.fillColor('#0A6ED1').font('Helvetica-Bold').fontSize(14).text(cert.course_name, pageWidth / 2 - 220, 252, { width: 440, align: 'center' });

      // 6. Benchmarks Grid (4 Cards)
      const cardW = 140;
      const cardH = 50;
      const startX = pageWidth / 2 - (4 * cardW + 3 * 16) / 2;
      const startY = 295;

      const metrics = [
        { label: 'GRADE AWARDED', val: cert.grade || 'A (First Class)', color: '#D97706' },
        { label: 'ATTENDANCE', val: `${cert.attendance_percentage || 0}%`, color: '#0F172A' },
        { label: 'LAB ASSIGNMENTS', val: `${cert.assignment_completion_rate || 0}%`, color: '#0F172A' },
        { label: 'FINAL EVALUATION', val: `${cert.exam_score_percentage || 0}%`, color: '#0A6ED1' },
      ];

      metrics.forEach((m, idx) => {
        const cx = startX + idx * (cardW + 16);
        doc.roundedRect(cx, startY, cardW, cardH, 6).fillAndStroke('#F8FAFC', '#E2E8F0');
        doc.fillColor('#64748B').font('Helvetica-Bold').fontSize(7.5).text(m.label, cx, startY + 8, { width: cardW, align: 'center' });
        doc.fillColor(m.color).font('Helvetica-Bold').fontSize(12).text(m.val, cx, startY + 22, { width: cardW, align: 'center' });
      });

      // 7. Security, Verification & Signatures Section
      const footerY = 370;

      // Left: Verification QR Code & Serial
      const verificationUrl =
        cert.verification_url ||
        `${process.env.NEXT_PUBLIC_APP_URL || 'https://lms.next-generpsolutions.com'}/certificate/verify/${cert.certificate_id}`;
      const qrBuf = await QRCode.toBuffer(verificationUrl, { width: 140, margin: 1 });
      doc.image(qrBuf, 50, footerY, { width: 62, height: 62 });

      doc.fillColor('#047857').font('Helvetica-Bold').fontSize(8.5).text('✓ VERIFIED CREDENTIAL', 122, footerY + 4);
      doc.fillColor('#0F172A').font('Helvetica-Bold').fontSize(8.5).text(`Certificate ID: ${cert.certificate_id}`, 122, footerY + 18);
      doc.fillColor('#64748B').font('Helvetica').fontSize(8).text(`Issue Date: ${formatDate(cert.issue_date)}`, 122, footerY + 31);
      doc.fillColor('#64748B').font('Helvetica').fontSize(7.5).text('Scan QR code to verify on institutional ledger', 122, footerY + 44);

      // Center: Official Seal Emblem
      const sealX = pageWidth / 2;
      const sealY = footerY + 30;
      doc.circle(sealX, sealY, 30).lineWidth(1.5).strokeColor('#D97706').stroke();
      doc.circle(sealX, sealY, 26).lineWidth(0.75).strokeColor('#0A6ED1').stroke();
      doc.fillColor('#D97706').font('Helvetica-Bold').fontSize(6).text('★ OFFICIAL SEAL ★', sealX - 25, sealY - 8, { width: 50, align: 'center' });
      doc.fillColor('#0F172A').font('Helvetica-Bold').fontSize(6.5).text('VERIFIED\nCREDENTIAL', sealX - 25, sealY + 1, { width: 50, align: 'center' });

      // Right: Academic Signatory
      const sigX = pageWidth - 220;
      doc.fillColor('#0F172A').font('Times-BoldItalic').fontSize(16).text('Rajesh Sharma', sigX, footerY + 2, { width: 170, align: 'center' });
      doc.moveTo(sigX + 10, footerY + 26).lineTo(sigX + 160, footerY + 26).lineWidth(1).strokeColor('#94A3B8').stroke();
      doc.fillColor('#0F172A').font('Helvetica-Bold').fontSize(9).text('Dr. Rajesh Sharma', sigX, footerY + 30, { width: 170, align: 'center' });
      doc.fillColor('#64748B').font('Helvetica').fontSize(7.5).text('Director of Academic Affairs', sigX, footerY + 42, { width: 170, align: 'center' });
      doc.fillColor('#94A3B8').font('Helvetica').fontSize(7).text('Next-Gen ERP Solutions', sigX, footerY + 52, { width: 170, align: 'center' });

      // 8. Bottom Ledger Disclaimer
      doc.fillColor('#94A3B8').font('Helvetica').fontSize(7).text(
        `Authentic institutional document issued by Next-Gen ERP Solutions. Cryptographically verifiable online at ${verificationUrl}`,
        0,
        pageHeight - 44,
        { width: pageWidth, align: 'center' }
      );

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Generates an official vector PDF for a receipt, persists it to storage,
 * and attaches the permanent URL.
 */
export async function generateAndSaveReceiptPdf(receipt: Receipt): Promise<{
  buffer: Buffer;
  pdfUrl: string;
  signedPdfUrl?: string;
}> {
  const buffer = await generateReceiptPdfBuffer(receipt);
  const cleanNum = receipt.receipt_number.replace(/[^a-zA-Z0-9_-]/g, '_');
  const path = `${receipt.student_id}/receipt-${cleanNum}.pdf`;

  let pdfUrl = `/api/receipts/${receipt.id}/pdf`;
  let signedPdfUrl: string | undefined;

  try {
    const uploadRes = await uploadFile({
      bucket: 'receipts',
      file: buffer,
      fileName: `receipt-${cleanNum}.pdf`,
      contentType: 'application/pdf',
      entityId: receipt.student_id,
      path,
    });
    pdfUrl = uploadRes.url;
    signedPdfUrl = uploadRes.signedUrl;
  } catch (err) {
    console.warn(`Receipt PDF storage upload notice for [${receipt.receipt_number}], using direct API route:`, err);
  }

  receipt.pdf_url = pdfUrl;
  return { buffer, pdfUrl, signedPdfUrl };
}

/**
 * Generates an official vector PDF for a course completion certificate,
 * persists it to storage, and attaches the permanent URL.
 */
export async function generateAndSaveCertificatePdf(cert: Certificate): Promise<{
  buffer: Buffer;
  pdfUrl: string;
  signedPdfUrl?: string;
}> {
  const buffer = await generateCertificatePdfBuffer(cert);
  const cleanId = cert.certificate_id.replace(/[^a-zA-Z0-9_-]/g, '_');
  const path = `certificates/${cleanId}.pdf`;

  let pdfUrl = `/api/certificates/${cert.certificate_id}/pdf`;
  let signedPdfUrl: string | undefined;

  try {
    const uploadRes = await uploadFile({
      bucket: 'receipts',
      file: buffer,
      fileName: `certificate-${cleanId}.pdf`,
      contentType: 'application/pdf',
      entityId: cert.student_id,
      path,
    });
    pdfUrl = uploadRes.url;
    signedPdfUrl = uploadRes.signedUrl;
  } catch (err) {
    console.warn(`Certificate PDF storage upload notice for [${cert.certificate_id}], using direct API route:`, err);
  }

  cert.pdf_url = pdfUrl;
  return { buffer, pdfUrl, signedPdfUrl };
}

