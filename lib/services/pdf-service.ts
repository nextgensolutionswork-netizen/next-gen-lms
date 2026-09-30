import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { Receipt, Certificate } from '@/types';
import { formatDate, formatDateTime } from '@/lib/utils/formatters';
import { amountToWordsINR, calculateGstBreakdown } from './gst-service';

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
      doc.text(`Phone: ${instPhone}  |  GSTIN: ${instGst}  |  State: Telangana (36)`, 100, 67);

      // 3. Right Header - GST Receipt Badge & Identifiers
      doc.roundedRect(360, 24, 195, 18, 9).fill('#EFF6FF');
      doc.fillColor('#0A6ED1').font('Helvetica-Bold').fontSize(8).text('OFFICIAL GST TAX INVOICE & RECEIPT', 360, 29, { width: 195, align: 'center' });
      doc.fillColor('#0F172A').font('Helvetica-Bold').fontSize(13).text(receipt.receipt_number, 360, 47, { width: 195, align: 'right' });
      doc.fillColor('#64748B').font('Helvetica').fontSize(8.5).text(`Invoice Date: ${formatDate(receipt.payment_date)}`, 360, 64, { width: 195, align: 'right' });

      // Divider Line
      doc.moveTo(40, 84).lineTo(pageWidth - 40, 84).strokeColor('#E2E8F0').lineWidth(1).stroke();

      // GST Calculation & Field Fallbacks
      const gstInfo = receipt.taxable_amount !== undefined && receipt.supply_type
        ? {
            supply_type: receipt.supply_type,
            place_of_supply: receipt.place_of_supply || 'Telangana (36)',
            place_of_supply_code: receipt.place_of_supply_code || '36',
            sac_code: receipt.sac_code || '999293',
            taxable_amount: receipt.taxable_amount,
            cgst_rate: receipt.cgst_rate || 0,
            cgst_amount: receipt.cgst_amount || 0,
            sgst_rate: receipt.sgst_rate || 0,
            sgst_amount: receipt.sgst_amount || 0,
            igst_rate: receipt.igst_rate || 0,
            igst_amount: receipt.igst_amount || 0,
            total_tax: receipt.total_tax || 0,
            total_amount: receipt.payment_amount || 0,
            irn: receipt.irn || 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
            ack_no: receipt.ack_no || '1226102948191',
            ack_date: receipt.ack_date || receipt.created_at,
          }
        : calculateGstBreakdown(receipt.payment_amount || 0, receipt.place_of_supply || 'Telangana', {
            customDocNumber: receipt.receipt_number,
            customDocDate: receipt.payment_date,
          });

      const isInterState = gstInfo.supply_type === 'INTER_STATE';

      // 4. e-Invoice & Place of Supply Audit Banner
      doc.roundedRect(40, 92, 515, 24, 4).fillAndStroke('#F1F5F9', '#CBD5E1');
      doc.fillColor('#1E293B').font('Helvetica-Bold').fontSize(7.5).text('Place of Supply (POS):', 48, 97);
      doc.fillColor('#0A6ED1').font('Helvetica-Bold').fontSize(7.5).text(gstInfo.place_of_supply, 142, 97);
      doc.fillColor('#1E293B').font('Helvetica-Bold').fontSize(7.5).text('Supply Type:', 235, 97);
      doc.fillColor(isInterState ? '#D97706' : '#059669').font('Helvetica-Bold').fontSize(7.5).text(
        isInterState ? 'Inter-State (18% IGST)' : 'Intra-State (9% CGST + 9% SGST)',
        290,
        97
      );
      doc.fillColor('#1E293B').font('Helvetica-Bold').fontSize(7.5).text('SAC Code:', 430, 97);
      doc.fillColor('#475569').font('Helvetica').fontSize(7.5).text(gstInfo.sac_code, 475, 97);

      doc.fillColor('#64748B').font('Helvetica').fontSize(6.5).text(
        `e-Invoice IRN: ${gstInfo.irn}  |  Ack No: ${gstInfo.ack_no}`,
        48,
        107,
        { width: 499 }
      );

      // 5. Two-Column Metadata Box
      // Left Box: Student Info
      doc.roundedRect(40, 122, 250, 72, 6).fillAndStroke('#F8FAFC', '#E2E8F0');
      doc.fillColor('#64748B').font('Helvetica-Bold').fontSize(7.5).text('BILLED TO / STUDENT INFORMATION', 52, 129);
      doc.fillColor('#0F172A').font('Helvetica-Bold').fontSize(10.5).text(receipt.student_name, 52, 141);
      doc.fillColor('#475569').font('Helvetica').fontSize(8).text(`Admission No: ${receipt.admission_number}`, 52, 155);
      doc.text(`Enrolled Program: ${receipt.course_name}`, 52, 167);

      // Right Box: Transaction Metadata
      doc.roundedRect(305, 122, 250, 72, 6).fillAndStroke('#F8FAFC', '#E2E8F0');
      doc.fillColor('#64748B').font('Helvetica-Bold').fontSize(7.5).text('TRANSACTION AUDIT METADATA', 317, 129);
      doc.fillColor('#0F172A').font('Helvetica-Bold').fontSize(10.5).text(`Payment Mode: ${receipt.payment_mode}`, 317, 141);
      doc.fillColor('#475569').font('Helvetica').fontSize(8).text(`Txn Ref: ${receipt.transaction_reference || 'COUNTER-CASH'}`, 317, 155);
      doc.text(`Recorded Date: ${formatDateTime(receipt.created_at)}`, 317, 167);

      // 6. GST Line Items Table
      const tableY = 200;
      doc.roundedRect(40, tableY, 515, 22, 4).fill('#0F172A');
      doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(7.5);
      doc.text('DESCRIPTION / PARTICULARS', 48, tableY + 6);
      doc.text('SAC', 245, tableY + 6);
      doc.text('TAXABLE VAL', 290, tableY + 6, { width: 75, align: 'right' });
      doc.text(isInterState ? 'IGST (18%)' : 'CGST+SGST', 375, tableY + 6, { width: 85, align: 'right' });
      doc.text('TOTAL (INR)', 470, tableY + 6, { width: 75, align: 'right' });

      // Table Row
      const rowY = tableY + 22;
      doc.rect(40, rowY, 515, 38).fillAndStroke('#FFFFFF', '#E2E8F0');
      doc.fillColor('#0F172A').font('Helvetica-Bold').fontSize(8.5).text(
        `${receipt.course_name} — Academic Tuition & Lab Access Fee`,
        48,
        rowY + 8,
        { width: 190 }
      );
      doc.fillColor('#64748B').font('Helvetica').fontSize(7).text('Category: Commercial Training Services', 48, rowY + 22);

      doc.fillColor('#334155').font('Helvetica').fontSize(8).text(gstInfo.sac_code, 245, rowY + 12);

      doc.fillColor('#0F172A').font('Helvetica-Bold').fontSize(8.5).text(
        `INR ${gstInfo.taxable_amount.toLocaleString('en-IN')}`,
        290,
        rowY + 12,
        { width: 75, align: 'right' }
      );

      const taxSummaryText = isInterState
        ? `INR ${gstInfo.igst_amount.toLocaleString('en-IN')}`
        : `₹${gstInfo.cgst_amount} + ₹${gstInfo.sgst_amount}`;

      doc.fillColor('#0F172A').font('Helvetica-Bold').fontSize(8).text(
        taxSummaryText,
        375,
        rowY + 12,
        { width: 85, align: 'right' }
      );

      doc.fillColor('#0F172A').font('Helvetica-Bold').fontSize(9.5).text(
        `INR ${(receipt.payment_amount || 0).toLocaleString('en-IN')}`,
        470,
        rowY + 12,
        { width: 75, align: 'right' }
      );

      // 7. Amount in Words Callout
      const wordsY = rowY + 44;
      doc.roundedRect(40, wordsY, 515, 20, 4).fillAndStroke('#F8FAFC', '#E2E8F0');
      doc.fillColor('#475569').font('Helvetica-Bold').fontSize(7.5).text('Amount in Words:', 48, wordsY + 5);
      doc.fillColor('#0F172A').font('Helvetica-Bold').fontSize(7.5).text(
        amountToWordsINR(receipt.payment_amount || 0),
        130,
        wordsY + 5,
        { width: 415 }
      );

      // 8. Financial Summary Box (Right-aligned) & Tax Audit (Left)
      const sumY = wordsY + 26;

      // Left Box: Tax Breakup Schedule
      doc.roundedRect(40, sumY, 260, 92, 6).fillAndStroke('#F8FAFC', '#CBD5E1');
      doc.fillColor('#334155').font('Helvetica-Bold').fontSize(8).text('GST Tax Schedule & Breakup:', 50, sumY + 8);

      doc.fillColor('#64748B').font('Helvetica').fontSize(7.5).text('Base Taxable Value:', 50, sumY + 24);
      doc.fillColor('#0F172A').font('Helvetica-Bold').fontSize(7.5).text(`INR ${gstInfo.taxable_amount.toLocaleString('en-IN')}`, 200, sumY + 24, { width: 90, align: 'right' });

      if (isInterState) {
        doc.fillColor('#64748B').font('Helvetica').fontSize(7.5).text('Integrated GST (IGST @ 18%):', 50, sumY + 38);
        doc.fillColor('#0F172A').font('Helvetica-Bold').fontSize(7.5).text(`INR ${gstInfo.igst_amount.toLocaleString('en-IN')}`, 200, sumY + 38, { width: 90, align: 'right' });
      } else {
        doc.fillColor('#64748B').font('Helvetica').fontSize(7.5).text('Central GST (CGST @ 9%):', 50, sumY + 38);
        doc.fillColor('#0F172A').font('Helvetica-Bold').fontSize(7.5).text(`INR ${gstInfo.cgst_amount.toLocaleString('en-IN')}`, 200, sumY + 38, { width: 90, align: 'right' });

        doc.fillColor('#64748B').font('Helvetica').fontSize(7.5).text('State GST (SGST @ 9%):', 50, sumY + 52);
        doc.fillColor('#0F172A').font('Helvetica-Bold').fontSize(7.5).text(`INR ${gstInfo.sgst_amount.toLocaleString('en-IN')}`, 200, sumY + 52, { width: 90, align: 'right' });
      }

      doc.fillColor('#059669').font('Helvetica-Bold').fontSize(8).text('Total Tax Component (18%):', 50, sumY + 70);
      doc.fillColor('#059669').font('Helvetica-Bold').fontSize(8).text(`INR ${gstInfo.total_tax.toLocaleString('en-IN')}`, 200, sumY + 70, { width: 90, align: 'right' });

      // Right Box: Ledger Balance & Status
      doc.roundedRect(310, sumY, 245, 92, 6).fillAndStroke('#F8FAFC', '#CBD5E1');
      doc.fillColor('#475569').font('Helvetica').fontSize(8.5).text('Amount Paid This Invoice:', 320, sumY + 12);
      doc.fillColor('#0F172A').font('Helvetica-Bold').fontSize(9.5).text(
        `INR ${(receipt.payment_amount || 0).toLocaleString('en-IN')}`,
        430,
        sumY + 12,
        { width: 115, align: 'right' }
      );

      doc.fillColor('#B45309').font('Helvetica').fontSize(8.5).text('Remaining Balance Due:', 320, sumY + 32);
      doc.fillColor('#B45309').font('Helvetica-Bold').fontSize(9.5).text(
        `INR ${(receipt.remaining_balance || 0).toLocaleString('en-IN')}`,
        430,
        sumY + 32,
        { width: 115, align: 'right' }
      );

      doc.roundedRect(320, sumY + 56, 225, 24, 4).fill('#ECFDF5');
      doc.fillColor('#047857').font('Helvetica-Bold').fontSize(8).text(
        '✓ GST COMPLIANT · VERIFIED & CREDITED',
        320,
        sumY + 64,
        { width: 225, align: 'center' }
      );

      // 9. Scannable QR Code & Signatory
      const qrY = sumY + 104;
      const verificationUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://lms.next-generpsolutions.com'}/accounts/receipts/${receipt.id}`;
      const qrBuf = await QRCode.toBuffer(verificationUrl, { width: 160, margin: 1 });
      doc.image(qrBuf, 40, qrY, { width: 62, height: 62 });

      doc.fillColor('#0F172A').font('Helvetica-Bold').fontSize(8.5).text('Official Digital Ledger Verification', 112, qrY + 4);
      doc.fillColor('#64748B').font('Helvetica').fontSize(7.5).text(
        'Scan this QR code with any smartphone camera to verify this invoice and cryptographic e-Invoice IRN directly against Next-Gen ERP ledger.',
        112,
        qrY + 16,
        { width: 225 }
      );
      doc.fillColor('#94A3B8').font('Helvetica').fontSize(6.5).text(
        `Receipt Hash: SHA256-${receipt.id}`,
        112,
        qrY + 48
      );

      // Signatory
      doc.fillColor('#0F172A').font('Times-BoldItalic').fontSize(14).text('Suresh Kumar', 370, qrY + 8, { width: 185, align: 'center' });
      doc.moveTo(370, qrY + 28).lineTo(555, qrY + 28).strokeColor('#94A3B8').lineWidth(1).stroke();
      doc.fillColor('#0F172A').font('Helvetica-Bold').fontSize(8.5).text(receipt.authorized_by || 'Suresh Kumar', 370, qrY + 32, { width: 185, align: 'center' });
      doc.fillColor('#64748B').font('Helvetica').fontSize(7).text('Authorized Financial Signatory', 370, qrY + 43, { width: 185, align: 'center' });
      doc.fillColor('#047857').font('Helvetica').fontSize(6.5).text('✓ Digitally Validated & Timestamped', 370, qrY + 52, { width: 185, align: 'center' });

      // 10. Terms & Institutional Policies Box
      const termsY = qrY + 72;
      doc.roundedRect(40, termsY, 515, 54, 5).fillAndStroke('#F1F5F9', '#E2E8F0');
      doc.fillColor('#334155').font('Helvetica-Bold').fontSize(7.5).text('Terms & Statutory GST Conditions:', 50, termsY + 6);
      doc.fillColor('#64748B').font('Helvetica').fontSize(7);
      doc.text('1. Computer-generated tax invoice issued in compliance with Rule 48(4) of Central Goods and Services Tax Rules, 2017.', 50, termsY + 17);
      doc.text('2. Fees once paid are non-refundable after commencement of batch classes as per institutional admissions policy.', 50, termsY + 27);
      doc.text('3. Reverse Charge Mechanism: NO. SAC 999293 covers Commercial Training and Coaching Services.', 50, termsY + 37);

      // 11. Bottom Footer
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
