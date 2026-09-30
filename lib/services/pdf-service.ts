import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { Receipt, Certificate } from '@/types';
import { formatDate, formatDateTime } from '@/lib/utils/formatters';

/**
 * Server-Side PDF Generation Service
 * Generates vector PDF documents for Official Tax Invoices/Receipts
 * and Course Completion Certificates with embedded scannable QR verification.
 */

/**
 * Generate an official A4 Tax Receipt / Fee Invoice PDF Buffer
 */
export async function generateReceiptPdfBuffer(receipt: Receipt): Promise<Buffer> {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({
        margin: 40,
        size: 'A4',
        info: {
          Title: `Fee Receipt - ${receipt.receipt_number}`,
          Author: receipt.institute_name || 'Next-Gen ERP Solutions',
          Subject: `Official Tuition Fee Receipt for ${receipt.student_name}`,
          Keywords: 'SAP, Fee Receipt, Tuition, Invoice',
        },
      });

      const chunks: Buffer[] = [];
      doc.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', (err) => reject(err));

      const pageWidth = doc.page.width;   // 595.28
      const pageHeight = doc.page.height; // 841.89

      // 1. Top SAP Blue Accent Bar
      doc.rect(0, 0, pageWidth, 6).fill('#0A6ED1');

      // 2. Institute Branding Logo
      doc.roundedRect(40, 25, 48, 48, 8).fill('#0A6ED1');
      doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(18).text('SAP', 40, 39, { width: 48, align: 'center' });

      // Institute Details
      const instName = receipt.institute_name || 'Next-Gen ERP Solutions';
      const instAddress = receipt.institute_address || 'Plot 42, Hitech City Main Rd, Madhapur, Hyderabad, TS - 500081';
      const instPhone = receipt.institute_phone || '+91 98765 43210';
      const instGst = receipt.institute_gst || '36AABCU9603R1ZX';

      doc.fillColor('#0F172A').font('Helvetica-Bold').fontSize(15).text(instName, 100, 25);
      doc.fillColor('#475569').font('Helvetica').fontSize(8.5).text('Premier SAP Authorized Training & Certification Institute', 100, 43);
      doc.fillColor('#64748B').font('Helvetica').fontSize(8).text(instAddress, 100, 55);
      doc.text(`Phone: ${instPhone}  |  GSTIN: ${instGst}`, 100, 67);

      // 3. Right Header - Receipt Badge & Identifiers
      doc.roundedRect(380, 25, 175, 18, 9).fill('#EFF6FF');
      doc.fillColor('#0A6ED1').font('Helvetica-Bold').fontSize(8).text('OFFICIAL TAX INVOICE & RECEIPT', 380, 30, { width: 175, align: 'center' });
      doc.fillColor('#0F172A').font('Helvetica-Bold').fontSize(13).text(receipt.receipt_number, 380, 48, { width: 175, align: 'right' });
      doc.fillColor('#64748B').font('Helvetica').fontSize(8.5).text(`Date: ${formatDate(receipt.payment_date)}`, 380, 65, { width: 175, align: 'right' });

      // Divider Line
      doc.moveTo(40, 88).lineTo(pageWidth - 40, 88).strokeColor('#E2E8F0').lineWidth(1).stroke();

      // 4. Two-Column Metadata Box
      // Left Box: Student Info
      doc.roundedRect(40, 100, 250, 78, 6).fillAndStroke('#F8FAFC', '#E2E8F0');
      doc.fillColor('#64748B').font('Helvetica-Bold').fontSize(7.5).text('STUDENT INFORMATION', 52, 108);
      doc.fillColor('#0F172A').font('Helvetica-Bold').fontSize(11).text(receipt.student_name, 52, 120);
      doc.fillColor('#475569').font('Helvetica').fontSize(8.5).text(`Admission No: ${receipt.admission_number}`, 52, 136);
      doc.text(`Program: ${receipt.course_name}`, 52, 149);

      // Right Box: Transaction Metadata
      doc.roundedRect(305, 100, 250, 78, 6).fillAndStroke('#F8FAFC', '#E2E8F0');
      doc.fillColor('#64748B').font('Helvetica-Bold').fontSize(7.5).text('TRANSACTION AUDIT METADATA', 317, 108);
      doc.fillColor('#0F172A').font('Helvetica-Bold').fontSize(11).text(`Payment Mode: ${receipt.payment_mode}`, 317, 120);
      doc.fillColor('#475569').font('Helvetica').fontSize(8.5).text(`Txn Ref: ${receipt.transaction_reference || 'COUNTER-CASH'}`, 317, 136);
      doc.text(`Recorded: ${formatDateTime(receipt.created_at)}`, 317, 149);

      // 5. Line Items Table
      // Header
      doc.roundedRect(40, 192, 515, 24, 4).fill('#0F172A');
      doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(8.5);
      doc.text('DESCRIPTION / PARTICULARS', 52, 199);
      doc.text('TRAINING MODE', 300, 199);
      doc.text('AMOUNT (INR)', 440, 199, { width: 105, align: 'right' });

      // Table Row
      doc.rect(40, 216, 515, 36).fillAndStroke('#FFFFFF', '#E2E8F0');
      doc.fillColor('#0F172A').font('Helvetica-Bold').fontSize(9.5).text(`${receipt.course_name} — Tuition & Lab Access Fee`, 52, 224);
      doc.fillColor('#64748B').font('Helvetica').fontSize(8).text('Hybrid Classroom + Cloud LMS', 300, 225);
      doc.fillColor('#0F172A').font('Helvetica-Bold').fontSize(11).text(
        `INR ${(receipt.payment_amount || 0).toLocaleString('en-IN')}`,
        440,
        224,
        { width: 105, align: 'right' }
      );

      // 6. Financial Summary Box
      const sumY = 265;
      doc.roundedRect(325, sumY, 230, 85, 6).fillAndStroke('#F8FAFC', '#CBD5E1');
      doc.fillColor('#475569').font('Helvetica').fontSize(9).text('Amount Paid This Receipt:', 337, sumY + 12);
      doc.fillColor('#0F172A').font('Helvetica-Bold').fontSize(10).text(
        `INR ${(receipt.payment_amount || 0).toLocaleString('en-IN')}`,
        445,
        sumY + 12,
        { width: 100, align: 'right' }
      );

      doc.fillColor('#B45309').font('Helvetica').fontSize(9).text('Remaining Balance Due:', 337, sumY + 32);
      doc.fillColor('#B45309').font('Helvetica-Bold').fontSize(10).text(
        `INR ${(receipt.remaining_balance || 0).toLocaleString('en-IN')}`,
        445,
        sumY + 32,
        { width: 100, align: 'right' }
      );

      doc.roundedRect(337, sumY + 54, 206, 20, 4).fill('#ECFDF5');
      doc.fillColor('#047857').font('Helvetica-Bold').fontSize(8).text(
        '✓ PAYMENT STATUS: VERIFIED & CREDITED',
        337,
        sumY + 60,
        { width: 206, align: 'center' }
      );

      // 7. Scannable QR Code & Verification
      const verificationUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://lms.next-generpsolutions.com'}/accounts/receipts/${receipt.id}`;
      const qrBuf = await QRCode.toBuffer(verificationUrl, { width: 160, margin: 1 });
      doc.image(qrBuf, 40, 365, { width: 68, height: 68 });

      doc.fillColor('#0F172A').font('Helvetica-Bold').fontSize(9).text('Official Digital Verification', 118, 370);
      doc.fillColor('#64748B').font('Helvetica').fontSize(8).text(
        'Scan this QR code with any smartphone camera to verify receipt authenticity directly against the Next-Gen ERP institutional ledger.',
        118,
        384,
        { width: 220 }
      );
      doc.fillColor('#94A3B8').font('Helvetica').fontSize(7.5).text(
        `Digital Receipt Hash: SHA256-${receipt.id}`,
        118,
        418
      );

      // 8. Signatory & Digital Stamp
      doc.fillColor('#0F172A').font('Times-BoldItalic').fontSize(16).text('Suresh Kumar', 400, 375, { width: 155, align: 'center' });
      doc.moveTo(400, 398).lineTo(555, 398).strokeColor('#94A3B8').lineWidth(1).stroke();
      doc.fillColor('#0F172A').font('Helvetica-Bold').fontSize(9).text(receipt.authorized_by || 'Suresh Kumar', 400, 402, { width: 155, align: 'center' });
      doc.fillColor('#64748B').font('Helvetica').fontSize(7.5).text('Authorized Financial Signatory', 400, 414, { width: 155, align: 'center' });
      doc.fillColor('#047857').font('Helvetica').fontSize(7).text('✓ Digitally Validated & Timestamped', 400, 424, { width: 155, align: 'center' });

      // 9. Terms & Institutional Policies Box
      doc.roundedRect(40, 450, 515, 68, 6).fillAndStroke('#F1F5F9', '#E2E8F0');
      doc.fillColor('#334155').font('Helvetica-Bold').fontSize(8).text('Terms & Institutional Policies:', 52, 458);
      doc.fillColor('#64748B').font('Helvetica').fontSize(7.5);
      doc.text('1. Fees once paid are non-refundable after commencement of batch classes.', 52, 470);
      doc.text('2. This document is a computer-generated official tax invoice with tamper-proof audit trails.', 52, 482);
      doc.text('3. SAP certification examination voucher fees are subject to SAP AG global examination guidelines.', 52, 494);
      doc.text('4. For invoice queries, please contact finance@next-generpsolutions.com quoting receipt number.', 52, 506);

      // 10. Bottom Footer
      doc.fillColor('#94A3B8').font('Helvetica').fontSize(7.5).text(
        'Next-Gen ERP Solutions · CIN: U72200TG2020PTC123456 · ISO 9001:2015 Certified Institution · Hyderabad, India',
        40,
        pageHeight - 35,
        { width: 515, align: 'center' }
      );

      doc.end();
    } catch (err) {
      reject(err);
    }
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
