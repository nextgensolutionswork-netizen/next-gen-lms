import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';
import { formatDate } from '@/lib/utils/formatters';
import { amountToWordsINR } from './finance-formatters';
import {
  OFFICIAL_INSTITUTE_NAME,
  OFFICIAL_INSTITUTE_ADDRESS,
  OFFICIAL_INSTITUTE_PHONE,
  OFFICIAL_INSTITUTE_WEBSITE,
  resolveInstituteAddress,
  resolveInstitutePhone,
} from '@/lib/constants/branding';

// Static standard-font declarations so Webpack & @vercel/nft trace font files into serverless lambdas
import 'pdfkit/standard-fonts/Helvetica';
import 'pdfkit/standard-fonts/HelveticaBold';
import 'pdfkit/standard-fonts/HelveticaOblique';
import 'pdfkit/standard-fonts/TimesBoldItalic';
import 'pdfkit/standard-fonts/TimesItalic';
import 'pdfkit/standard-fonts/TimesRoman';

export class InvoicePdfDataError extends Error {}

export interface InvoiceItem {
  description: string;
  hsn_sac?: string;
  quantity: number;
  unit_price: number;
  amount: number;
}

export interface InvoicePaymentRecord {
  date: string;
  amount: number;
  receipt_number?: string;
  payment_mode?: string;
  reference?: string;
}

export interface InvoiceHsnSummaryItem {
  hsn_sac: string;
  quantity: number;
  rate_percentage: number;
  taxable_value: number;
}

export interface InvoiceData {
  id: string;
  invoice_number: string;
  invoice_date: string;
  due_date?: string;
  reference?: string;
  student_id: string;
  student_name: string;
  student_phone?: string;
  student_email?: string;
  student_code?: string;
  admission_number?: string;
  student_address?: string;
  place_of_supply: string;

  items: InvoiceItem[];

  payment_communication: string;
  bank_account_info?: string;
  customer_notes?: string[];

  total_amount: number;
  amount_in_words?: string;
  payments: InvoicePaymentRecord[];
  amount_due: number;

  hsn_summary?: InvoiceHsnSummaryItem[];

  authorized_signatory_name?: string;
  authorized_signatory_title?: string;
  institute_name?: string;
  institute_address?: string;
  institute_phone?: string;
  institute_website?: string;
  institute_gst?: string;
  tenant_id?: string;
  status?: string;
}

let cachedLogoBuffer: Buffer | null = null;
function getLogoBuffer(): Buffer | null {
  if (cachedLogoBuffer) return cachedLogoBuffer;
  try {
    const logoPath = path.join(process.cwd(), 'public', 'branding', 'nextgen-logo.png');
    if (fs.existsSync(logoPath)) {
      cachedLogoBuffer = fs.readFileSync(logoPath);
      return cachedLogoBuffer;
    }
  } catch (err) {
    console.warn('[invoice-pdf-service] Could not read local logo buffer:', err);
  }
  return null;
}

function formatMoney(amount: number): string {
  const num = Number(amount) || 0;
  return num.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Generate an official vector PDF matching the master invoice specification (INV_26-27_0486)
 */
export async function generateInvoicePdfBuffer(invoice: InvoiceData): Promise<Buffer> {
  if (!invoice.invoice_number) {
    throw new InvoicePdfDataError('Invoice is missing an invoice number.');
  }
  if (typeof invoice.total_amount !== 'number' || !Number.isFinite(invoice.total_amount)) {
    throw new InvoicePdfDataError(`Invoice ${invoice.invoice_number} has an invalid total amount.`);
  }

  const instituteName = invoice.institute_name || OFFICIAL_INSTITUTE_NAME;
  const instituteAddress = resolveInstituteAddress(invoice.institute_address);
  const institutePhone = resolveInstitutePhone(invoice.institute_phone);
  const instituteWebsite = invoice.institute_website || OFFICIAL_INSTITUTE_WEBSITE;

  const totalAmount = Number(invoice.total_amount) || 0;
  const verifiedPaymentsTotal = (invoice.payments || []).reduce((acc, p) => acc + (Number(p.amount) || 0), 0);
  const amountDue = typeof invoice.amount_due === 'number' && Number.isFinite(invoice.amount_due)
    ? Math.max(0, invoice.amount_due)
    : Math.max(0, totalAmount - verifiedPaymentsTotal);

  const amountInWords = invoice.amount_in_words || amountToWordsINR(totalAmount);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 0,
      bufferPages: true,
      info: {
        Title: `Invoice - ${invoice.invoice_number}`,
        Author: instituteName,
        Subject: `Tax Invoice for ${invoice.student_name}`,
      },
    });

    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    try {
      const pageWidth = 595.28;
      const leftMargin = 42;
      const rightMargin = 553;
      const contentWidth = rightMargin - leftMargin;

      // --- PAGE 1 CONTENT ---
      // Customer / Student Details (rendered below header wave at y = 138)
      const phoneDisplay = invoice.student_phone ? ` - ${invoice.student_phone}` : '';
      doc.fillColor('#1E293B').font('Helvetica-Bold').fontSize(10)
        .text(`${invoice.student_name}${phoneDisplay}`, leftMargin, 138, { width: 350 });

      doc.fillColor('#475569').font('Helvetica').fontSize(8.5)
        .text('India', leftMargin, 153);

      const placeOfSupply = invoice.place_of_supply || 'Telangana';
      doc.fillColor('#475569').font('Helvetica').fontSize(8.5)
        .text(`Place of supply: ${placeOfSupply}`, leftMargin, 166);

      // Invoice Title
      doc.fillColor('#0974b2').font('Helvetica-Bold').fontSize(21)
        .text(`Invoice ${invoice.invoice_number}`, leftMargin, 192);

      // Metadata Container Banner Box
      const metaBoxY = 222;
      const metaBoxH = 40;
      doc.save();
      doc.roundedRect(leftMargin, metaBoxY, contentWidth, metaBoxH, 4).fill('#f9f4eb');
      doc.restore();

      // Col 1: Invoice Date
      doc.fillColor('#85553d').font('Helvetica-Bold').fontSize(7.5)
        .text('Invoice Date', leftMargin + 12, metaBoxY + 6);
      doc.fillColor('#1E293B').font('Helvetica-Bold').fontSize(9)
        .text(formatDate(invoice.invoice_date), leftMargin + 12, metaBoxY + 19);

      // Col 2: Due Date
      const dueDateVal = invoice.due_date ? formatDate(invoice.due_date) : formatDate(invoice.invoice_date);
      doc.fillColor('#85553d').font('Helvetica-Bold').fontSize(7.5)
        .text('Due Date', 225, metaBoxY + 6);
      doc.fillColor('#1E293B').font('Helvetica-Bold').fontSize(9)
        .text(dueDateVal, 225, metaBoxY + 19);

      // Col 3: Reference
      const refVal = invoice.reference || invoice.admission_number || invoice.student_code || 'Standard';
      doc.fillColor('#85553d').font('Helvetica-Bold').fontSize(7.5)
        .text('Reference', 380, metaBoxY + 6);
      doc.fillColor('#1E293B').font('Helvetica-Bold').fontSize(9)
        .text(refVal, 380, metaBoxY + 19, { width: 160, ellipsis: true });

      // Itemized Table Header
      const tableHeadY = 276;
      doc.fillColor('#1E293B').font('Helvetica-Bold').fontSize(8.5)
        .text('Description', leftMargin, tableHeadY, { width: 190 });
      doc.text('HSN/SAC', 235, tableHeadY, { width: 75, align: 'center' });
      doc.text('Quantity', 315, tableHeadY, { width: 55, align: 'center' });
      doc.text('Unit Price', 375, tableHeadY, { width: 75, align: 'right' });
      doc.text('Amount', 455, tableHeadY, { width: 98, align: 'right' });

      doc.strokeColor('#CBD5E1').lineWidth(0.75)
        .moveTo(leftMargin, tableHeadY + 16).lineTo(rightMargin, tableHeadY + 16).stroke();

      // Itemized Table Rows
      let curY = tableHeadY + 20;
      const items = invoice.items && invoice.items.length > 0
        ? invoice.items
        : [
            {
              description: 'Course Tuition Fee',
              hsn_sac: '999293',
              quantity: 1.0,
              unit_price: totalAmount,
              amount: totalAmount,
            },
          ];

      items.forEach((item, index) => {
        const rowH = 26;
        if (index % 2 === 0) {
          doc.save();
          doc.rect(leftMargin, curY, contentWidth, rowH).fill('#F8FAFC');
          doc.restore();
        }

        doc.fillColor('#1E293B').font('Helvetica').fontSize(8.5)
          .text(item.description, leftMargin + 4, curY + 6, { width: 185 });
        doc.text(item.hsn_sac || '', 235, curY + 6, { width: 75, align: 'center' });
        doc.text(item.quantity ? item.quantity.toFixed(2) : '1.00', 315, curY + 6, { width: 55, align: 'center' });
        doc.text(formatMoney(item.unit_price), 375, curY + 6, { width: 75, align: 'right' });
        doc.text(`₹ ${formatMoney(item.amount)}`, 455, curY + 6, { width: 94, align: 'right' });

        curY += rowH;
        doc.strokeColor('#E2E8F0').lineWidth(0.5)
          .moveTo(leftMargin, curY).lineTo(rightMargin, curY).stroke();
      });

      // --- MIDDLE SECTION: TWO COLUMNS ---
      const midY = Math.max(curY + 14, 345);

      // LEFT COLUMN: Payment Communication, Customer Notes, HSN Summary
      doc.fillColor('#1E293B').font('Helvetica-Bold').fontSize(8.5)
        .text(`Payment Communication: ${invoice.payment_communication || invoice.invoice_number}`, leftMargin, midY);

      const acctInfo = invoice.bank_account_info || 'Journal - HDFC Bank';
      doc.fillColor('#475569').font('Helvetica').fontSize(8)
        .text(`on this account: ${acctInfo}`, leftMargin, midY + 13);

      let noteY = midY + 28;
      const customerNotes = invoice.customer_notes && invoice.customer_notes.length > 0
        ? invoice.customer_notes
        : [
            'Fee payment terms acknowledged and confirmed per institute guidelines.',
            'Official receipt generated automatically upon bank realization.',
            'Disputes subject to exclusive jurisdiction of the institute principal city.',
          ];

      doc.fillColor('#475569').font('Helvetica').fontSize(7.5);
      customerNotes.slice(0, 6).forEach((note) => {
        doc.text(note, leftMargin, noteY, { width: 260, lineGap: 1.5 });
        noteY = doc.y + 2;
      });

      // HSN Summary Section
      const hsnY = Math.max(noteY + 12, 465);
      doc.fillColor('#1E293B').font('Helvetica-Bold').fontSize(10)
        .text('HSN Summary', leftMargin, hsnY);

      doc.fillColor('#1E293B').font('Helvetica-Bold').fontSize(7.5)
        .text('HSN/SAC', leftMargin, hsnY + 16, { width: 65 });
      doc.text('Quantity', 110, hsnY + 16, { width: 50, align: 'center' });
      doc.text('Rate %', 165, hsnY + 16, { width: 45, align: 'center' });
      doc.text('Taxable Value', 215, hsnY + 16, { width: 85, align: 'right' });

      doc.strokeColor('#CBD5E1').lineWidth(0.5)
        .moveTo(leftMargin, hsnY + 28).lineTo(305, hsnY + 28).stroke();

      const hsnItems = invoice.hsn_summary && invoice.hsn_summary.length > 0
        ? invoice.hsn_summary
        : [
            {
              hsn_sac: items[0]?.hsn_sac || '999293',
              quantity: 1.0,
              rate_percentage: 18,
              taxable_value: Number((totalAmount / 1.18).toFixed(2)),
            },
          ];

      let hsnRowY = hsnY + 32;
      hsnItems.forEach((h) => {
        doc.fillColor('#475569').font('Helvetica').fontSize(7.5)
          .text(h.hsn_sac, leftMargin, hsnRowY, { width: 65 });
        doc.text(h.quantity.toFixed(2), 110, hsnRowY, { width: 50, align: 'center' });
        doc.text(`${h.rate_percentage}%`, 165, hsnRowY, { width: 45, align: 'center' });
        doc.text(`₹ ${formatMoney(h.taxable_value)}`, 215, hsnRowY, { width: 85, align: 'right' });
        hsnRowY += 14;
      });

      // RIGHT COLUMN: Financial Ledger Box (Total, Payments, Amount Due)
      const rightBoxX = 335;
      const rightBoxW = 218;
      let ledgerY = midY;

      // 1. Total Row
      doc.save();
      doc.rect(rightBoxX, ledgerY, rightBoxW, 20).fill('#e5f0f6');
      doc.restore();
      doc.fillColor('#0974b2').font('Helvetica-Bold').fontSize(9)
        .text('Total', rightBoxX + 8, ledgerY + 5);
      doc.text(`₹ ${formatMoney(totalAmount)}`, rightBoxX, ledgerY + 5, { width: rightBoxW - 8, align: 'right' });
      ledgerY += 20;

      // 2. Verified Payment Rows
      const rawPayments = invoice.payments || [];
      const payments = [...rawPayments].sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
      );
      if (payments.length > 0) {
        payments.forEach((p, idx) => {
          if (idx % 2 === 1) {
            doc.save();
            doc.rect(rightBoxX, ledgerY, rightBoxW, 18).fill('#F8FAFC');
            doc.restore();
          }
          doc.fillColor('#1E293B').font('Helvetica-Oblique').fontSize(8)
            .text(`Paid on ${formatDate(p.date)}`, rightBoxX + 8, ledgerY + 4);
          doc.font('Helvetica').fontSize(8)
            .text(`₹ ${formatMoney(p.amount)}`, rightBoxX, ledgerY + 4, { width: rightBoxW - 8, align: 'right' });
          ledgerY += 18;
        });

        // Explicit Total Paid Row
        doc.save();
        doc.rect(rightBoxX, ledgerY, rightBoxW, 18).fill('#ECFDF5');
        doc.restore();
        doc.fillColor('#065F46').font('Helvetica-Bold').fontSize(8.5)
          .text('Total Paid', rightBoxX + 8, ledgerY + 4);
        doc.text(`₹ ${formatMoney(verifiedPaymentsTotal)}`, rightBoxX, ledgerY + 4, { width: rightBoxW - 8, align: 'right' });
        ledgerY += 18;
      } else {
        doc.fillColor('#64748B').font('Helvetica-Oblique').fontSize(8)
          .text('No verified payments recorded', rightBoxX + 8, ledgerY + 4);
        ledgerY += 18;
      }

      // 3. Amount Due Row
      doc.save();
      doc.rect(rightBoxX, ledgerY, rightBoxW, 20).fill('#f3f4f6');
      doc.restore();
      doc.fillColor('#1E293B').font('Helvetica-Bold').fontSize(9)
        .text('Amount Due', rightBoxX + 8, ledgerY + 5);
      doc.text(`₹ ${formatMoney(amountDue)}`, rightBoxX, ledgerY + 5, { width: rightBoxW - 8, align: 'right' });
      ledgerY += 26;

      // 4. Total Amount in Words
      doc.fillColor('#1E293B').font('Helvetica-Bold').fontSize(8)
        .text('Total amount in words:', rightBoxX, ledgerY, { width: rightBoxW, align: 'right' });
      doc.fillColor('#64748B').font('Helvetica-Oblique').fontSize(7.5)
        .text(amountInWords, rightBoxX, ledgerY + 11, { width: rightBoxW, align: 'right' });

      // 5. Authorized Signatory Block
      const sigY = Math.max(ledgerY + 44, hsnY + 36);
      doc.fillColor('#002D62').font('Times-BoldItalic').fontSize(18)
        .text('Next-Gen ERP Solutions', rightBoxX, sigY, { width: rightBoxW, align: 'center' });

      doc.strokeColor('#1E293B').lineWidth(0.75)
        .moveTo(rightBoxX + 12, sigY + 25).lineTo(rightBoxX + rightBoxW - 12, sigY + 25).stroke();

      const signatoryTitle = invoice.authorized_signatory_title || 'Authorized signatory';
      doc.fillColor('#1E293B').font('Helvetica').fontSize(8)
        .text(signatoryTitle, rightBoxX, sigY + 29, { width: rightBoxW, align: 'center' });

      // --- APPLY HEADER AND FOOTER VECTOR CURVES ACROSS ALL BUFFERED PAGES ---
      const logoBuf = getLogoBuffer();
      const range = doc.bufferedPageRange();
      const totalPages = range.count;

      for (let i = range.start; i < range.start + totalPages; i++) {
        doc.switchToPage(i);

        // 1. Top Pale-Blue Wave (exact match to reference PDF)
        doc.save();
        doc.path('M 0 0 L 595.28 0 L 595.28 118 C 390 95 180 140 0 115 Z')
          .fill('#e5f0f6');
        doc.restore();

        // 2. Logo in Top-Left
        if (logoBuf) {
          doc.image(logoBuf, leftMargin, 28, { width: 115 });
        }

        // 3. Right-Aligned Company Name and Address
        doc.fillColor('#003366').font('Helvetica-Bold').fontSize(11)
          .text(instituteName, 240, 26, { width: 313, align: 'right' });

        doc.fillColor('#334155').font('Helvetica').fontSize(7.5)
          .text(
            `${instituteAddress}\nIndia`,
            240,
            42,
            { width: 313, align: 'right', lineGap: 1.5 }
          );

        // 4. Bottom Beige Wave (exact match to reference PDF)
        doc.save();
        doc.path('M 0 770 C 180 750 410 785 595.28 765 L 595.28 841.89 L 0 841.89 Z')
          .fill('#f6f1e5');
        doc.restore();

        // 5. Footer URL & Phone
        doc.fillColor('#0974b2').font('Helvetica-Bold').fontSize(8.5)
          .text(`${instituteWebsite} || ${institutePhone.replace(/^\+91\s*/, '')}`, 0, 792, {
            width: pageWidth,
            align: 'center',
          });

        // 6. Page Numbering
        doc.fillColor('#64748B').font('Helvetica').fontSize(8)
          .text(`Page ${i + 1} / ${totalPages}`, 0, 810, {
            width: pageWidth,
            align: 'center',
          });
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
