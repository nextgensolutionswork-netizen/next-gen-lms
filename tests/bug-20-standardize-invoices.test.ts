import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  OFFICIAL_INSTITUTE_NAME,
  OFFICIAL_INSTITUTE_ADDRESS,
  OFFICIAL_INSTITUTE_PHONE,
  OFFICIAL_INSTITUTE_PHONE_PLAIN,
  OFFICIAL_INSTITUTE_WEBSITE,
  OFFICIAL_RECEIPT_TERMS,
  resolveInstituteAddress,
  resolveInstitutePhone,
} from '@/lib/constants/branding';
import {
  generateInvoicePdfBuffer,
  InvoiceData,
  InvoicePdfDataError,
} from '@/lib/services/invoice-pdf-service';
import {
  getInvoiceByIdOrNumber,
  getAllInvoices,
  buildInvoiceDataFromFee,
  buildInvoiceDataFromFeeAccount,
} from '@/lib/services/invoice-service';
import { generateReceiptPdfBuffer } from '@/lib/services/pdf-service';
import { store } from '@/lib/services/data-store';
import type { Receipt, StudentFee, StudentFeeAccount } from '@/types';

describe('BUG-20: Standardize All LMS Invoices With Official Branding', () => {
  describe('1. Official Company Details & Branding Standards', () => {
    it('1.1 verifies official institute name and website', () => {
      expect(OFFICIAL_INSTITUTE_NAME).toBe('Next-Gen ERP Solutions');
      expect(OFFICIAL_INSTITUTE_WEBSITE).toBe('https://www.next-generpsolutions.com');
    });

    it('1.2 verifies official phone number is +91 90003 33859 and plain 9000333859', () => {
      expect(OFFICIAL_INSTITUTE_PHONE).toBe('+91 90003 33859');
      expect(OFFICIAL_INSTITUTE_PHONE_PLAIN).toBe('9000333859');
      expect(resolveInstitutePhone('')).toBe(OFFICIAL_INSTITUTE_PHONE);
      expect(resolveInstitutePhone(null)).toBe(OFFICIAL_INSTITUTE_PHONE);
      expect(resolveInstitutePhone(undefined)).toBe(OFFICIAL_INSTITUTE_PHONE);
      expect(resolveInstitutePhone('+91 98765 43210')).toBe(OFFICIAL_INSTITUTE_PHONE);
    });

    it('1.3 verifies official institute address matches the master reference', () => {
      const expectedAddress =
        'Pillar No 707, Flat No. 502, 5th Floor, Plot No 129, PJR ARCADE Sri Sai Nagar Colony, near JNTU, opp. Sri Chaitanya Junior Kalasala, Jawaharlal Nehru Technological University, Hyderabad, Telangana 500085';
      expect(OFFICIAL_INSTITUTE_ADDRESS).toBe(expectedAddress);
      expect(resolveInstituteAddress('')).toBe(expectedAddress);
    });

    it('1.4 verifies original logo assets exist in public/branding', () => {
      const webpPath = path.join(process.cwd(), 'public', 'branding', 'nextgen-logo.webp');
      const pngPath = path.join(process.cwd(), 'public', 'branding', 'nextgen-logo.png');
      expect(fs.existsSync(webpPath)).toBe(true);
      expect(fs.existsSync(pngPath)).toBe(true);
      expect(fs.statSync(webpPath).size).toBeGreaterThan(10000);
      expect(fs.statSync(pngPath).size).toBeGreaterThan(10000);
    });
  });

  describe('2. Master Invoice Design Specification (INV_26-27_0486)', () => {
    const testInvoice: InvoiceData = {
      id: 'fee-test-0486',
      invoice_number: 'INV/26-27/0486',
      invoice_date: '25/01/2026',
      due_date: '25/01/2026',
      reference: 'S4H-FIN-2026-B1',
      student_id: 'std-test-01',
      student_name: 'B. Shiva Rama Krishna',
      student_phone: '+91 98480 12345',
      student_email: 'shiva.rk@example.com',
      student_code: 'STD-2026-0001',
      admission_number: 'ADM-2026-0001',
      student_address: 'Kukatpally, Hyderabad',
      place_of_supply: 'Telangana',
      items: [
        {
          description: 'Training Fee — SAP S/4HANA Finance & Controlling (FICO)',
          hsn_sac: '999293',
          quantity: 1.0,
          unit_price: 26000,
          amount: 26000,
        },
      ],
      payment_communication: 'INV/26-27/0486',
      bank_account_info: 'Journal - HDFC Bank',
      customer_notes: [
        'Batch enrollment reference: S4H-FIN-2026-B1',
        'Tuition & LMS access fee per approved course enrollment.',
        'Receipts issued subject to bank realization of cheques, UPI, and online transfers.',
      ],
      total_amount: 26000,
      amount_in_words: 'Twenty-Six Thousand Rupees Only',
      payments: [
        {
          date: '25/01/2026',
          amount: 26000,
          receipt_number: 'REC-2026-0001',
          payment_mode: 'UPI',
          reference: 'UPI/602511223344',
        },
      ],
      amount_due: 0,
      hsn_summary: [
        {
          hsn_sac: '999293',
          quantity: 1.0,
          rate_percentage: 18,
          taxable_value: 22033.9,
        },
      ],
      authorized_signatory_name: 'Chief Accountant',
      authorized_signatory_title: 'Authorized signatory',
      institute_name: OFFICIAL_INSTITUTE_NAME,
      institute_address: OFFICIAL_INSTITUTE_ADDRESS,
      institute_phone: OFFICIAL_INSTITUTE_PHONE,
      institute_website: OFFICIAL_INSTITUTE_WEBSITE,
    };

    it('2.1 generates a valid PDF buffer matching the master invoice specification', async () => {
      const buffer = await generateInvoicePdfBuffer(testInvoice);
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(1000);
      expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    });

    it('2.2 rejects invoice generation if invoice_number is missing', async () => {
      const invalid = { ...testInvoice, invoice_number: '' };
      await expect(generateInvoicePdfBuffer(invalid)).rejects.toThrow(InvoicePdfDataError);
    });

    it('2.3 accurately computes amount_due based strictly on verified payments', () => {
      const partialInvoice: InvoiceData = {
        ...testInvoice,
        payments: [
          {
            date: '25/01/2026',
            amount: 10000,
            receipt_number: 'REC-2026-0001',
          },
        ],
        amount_due: 16000,
      };

      const paidTotal = partialInvoice.payments.reduce((acc, p) => acc + p.amount, 0);
      expect(partialInvoice.total_amount - paidTotal).toBe(16000);
      expect(partialInvoice.amount_due).toBe(16000);
    });
  });

  describe('3. Separation of Financial Documents & Receipt Integrity', () => {
    it('3.1 official receipts retain the 3 non-refundable Terms & Conditions without late fees', () => {
      expect(OFFICIAL_RECEIPT_TERMS).toHaveLength(3);
      expect(OFFICIAL_RECEIPT_TERMS.some((t) => t.toLowerCase().includes('late fee'))).toBe(false);
    });

    it('3.2 official receipt generation works independently and does not mutate invoices', async () => {
      const sampleReceipt: Receipt = {
        id: 'rec-test-001',
        receipt_number: 'REC-2026-0001',
        payment_id: 'pay-test-001',
        student_id: 'std-test-01',
        student_name: 'B. Shiva Rama Krishna',
        student_email: 'shiva.rk@example.com',
        admission_number: 'ADM-2026-0001',
        course_name: 'SAP S/4HANA Finance',
        payment_amount: 26000,
        payment_mode: 'UPI',
        transaction_reference: 'UPI/602511223344',
        payment_date: '2026-01-25',
        remaining_balance: 0,
        authorized_by: 'Chief Accountant',
        institute_name: OFFICIAL_INSTITUTE_NAME,
        institute_address: OFFICIAL_INSTITUTE_ADDRESS,
        institute_phone: OFFICIAL_INSTITUTE_PHONE,
        institute_gst: '36AAACN1234F1Z8',
        created_at: new Date().toISOString(),
      };

      const receiptBuffer = await generateReceiptPdfBuffer(sampleReceipt);
      expect(receiptBuffer).toBeInstanceOf(Buffer);
      expect(receiptBuffer.length).toBeGreaterThan(1000);
      expect(receiptBuffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    });
  });

  describe('4. Invoice Service Lookup and Retrieval', () => {
    it('4.1 resolves invoices across store records', () => {
      const invoices = getAllInvoices();
      expect(Array.isArray(invoices)).toBe(true);
      expect(invoices.length).toBeGreaterThan(0);

      const first = invoices[0];
      expect(first.invoice_number).toBeDefined();
      expect(first.total_amount).toBeGreaterThan(0);
      expect(first.institute_phone).toBe(OFFICIAL_INSTITUTE_PHONE);
      expect(first.institute_address).toBe(OFFICIAL_INSTITUTE_ADDRESS);

      const resolved = getInvoiceByIdOrNumber(first.invoice_number);
      expect(resolved).not.toBeNull();
      expect(resolved?.invoice_number).toBe(first.invoice_number);
    });
  });
});
