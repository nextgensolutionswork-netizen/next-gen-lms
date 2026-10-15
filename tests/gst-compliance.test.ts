import { describe, it, expect, beforeEach } from 'vitest';
import {
  resolveState,
  amountToWordsINR,
  INDIAN_STATE_CODES,
} from '@/lib/services/finance-formatters';
import { recordPaymentAtomic } from '@/lib/services/finance-service';
import { generateReceiptPdfBuffer } from '@/lib/services/pdf-service';
import { store } from '@/lib/services/data-store';

describe('Plain Fee Receipts and Formatting', () => {
  describe('State and Place of Supply Resolution', () => {
    it('resolves direct 2-digit GST state codes', () => {
      expect(resolveState('36')).toEqual({ code: '36', name: 'Telangana' });
      expect(resolveState('27')).toEqual({ code: '27', name: 'Maharashtra' });
      expect(resolveState('29')).toEqual({ code: '29', name: 'Karnataka' });
      expect(resolveState('07')).toEqual({ code: '07', name: 'Delhi' });
    });

    it('resolves state code from 15-digit GSTIN prefix', () => {
      expect(resolveState('36AAACN1234F1Z8')).toEqual({ code: '36', name: 'Telangana' });
      expect(resolveState('27AAAAA0000A1Z5')).toEqual({ code: '27', name: 'Maharashtra' });
      expect(resolveState('29ABCDE1234F2Z5')).toEqual({ code: '29', name: 'Karnataka' });
    });

    it('resolves state code from major city names', () => {
      expect(resolveState('Hyderabad')).toEqual({ code: '36', name: 'Telangana' });
      expect(resolveState('Cyberabad')).toEqual({ code: '36', name: 'Telangana' });
      expect(resolveState('Pune')).toEqual({ code: '27', name: 'Maharashtra' });
      expect(resolveState('Mumbai')).toEqual({ code: '27', name: 'Maharashtra' });
      expect(resolveState('Bengaluru')).toEqual({ code: '29', name: 'Karnataka' });
      expect(resolveState('Bangalore')).toEqual({ code: '29', name: 'Karnataka' });
      expect(resolveState('Noida')).toEqual({ code: '09', name: 'Uttar Pradesh' });
    });

    it('resolves state from composite address string', () => {
      expect(resolveState('Plot 42, Hitec City, Madhapur, Hyderabad - 500081')).toEqual({
        code: '36',
        name: 'Telangana',
      });
      expect(resolveState('Flat 302, Baner Road, Pune, Maharashtra')).toEqual({
        code: '27',
        name: 'Maharashtra',
      });
    });

    it('defaults gracefully to Telangana (36) for empty or undefined input', () => {
      expect(resolveState('')).toEqual({ code: '36', name: 'Telangana' });
      expect(resolveState(null)).toEqual({ code: '36', name: 'Telangana' });
      expect(resolveState(undefined)).toEqual({ code: '36', name: 'Telangana' });
    });
  });

  describe('INR Amount in Words Conversion', () => {
    it('converts common fee amounts into formal English currency words', () => {
      expect(amountToWordsINR(0)).toBe('Zero Rupees Only');
      expect(amountToWordsINR(5000)).toBe('Five Thousand Rupees Only');
      expect(amountToWordsINR(10000)).toBe('Ten Thousand Rupees Only');
      expect(amountToWordsINR(15000)).toBe('Fifteen Thousand Rupees Only');
      expect(amountToWordsINR(40000)).toBe('Forty Thousand Rupees Only');
      expect(amountToWordsINR(125000)).toBe('One Lakh Twenty Five Thousand Rupees Only');
      expect(amountToWordsINR(1000000)).toBe('Ten Lakh Rupees Only');
    });
  });

  describe('Finance Service Payments Without Tax', () => {
    it('records the full payment amount without tax for a Telangana student', async () => {
      const student = store.students.find((s) => s.id === 'stu-01')!;
      const feeAccount = store.feeAccounts.find((f) => f.student_id === student.id)!;
      feeAccount.outstanding_amount = 25000;

      const result = await recordPaymentAtomic(
        {
          student_id: student.id,
          course_id: student.course_id,
          fee_account_id: feeAccount.id,
          amount: 5000,
          payment_date: '2026-03-01',
          payment_mode: 'UPI',
          transaction_reference: `UPI-TEST-GST-${Date.now()}`,
          status: 'Success',
        },
        'usr-accounts'
      );

      const receipt = result.receipt;
      expect(receipt.payment_amount).toBe(5000);
      expect(receipt.taxable_amount).toBe(5000);
      expect(receipt.total_tax).toBe(0);
      expect(receipt.irn).toBe('');
      expect(receipt.institute_gst).toBe('');
    });

    it('records the full payment amount without tax for an out-of-state student', async () => {
      const student = store.students.find((s) => s.id === 'stu-02')!; // Sneha Kulkarni in Pune, Maharashtra
      const feeAccount = store.feeAccounts.find((f) => f.student_id === student.id)!;
      feeAccount.outstanding_amount = 25000;

      const result = await recordPaymentAtomic(
        {
          student_id: student.id,
          course_id: student.course_id,
          fee_account_id: feeAccount.id,
          amount: 5000,
          payment_date: '2026-03-01',
          payment_mode: 'Bank Transfer',
          transaction_reference: `NEFT-TEST-GST-${Date.now()}`,
          status: 'Success',
        },
        'usr-accounts'
      );

      const receipt = result.receipt;
      expect(receipt.payment_amount).toBe(5000);
      expect(receipt.taxable_amount).toBe(5000);
      expect(receipt.total_tax).toBe(0);
      expect(receipt.irn).toBe('');
      expect(receipt.institute_gst).toBe('');
    });
  });

  describe('Official Fee Receipt PDF Generation', () => {
    it('generates a valid fee receipt PDF buffer for intra-state receipt', async () => {
      const receipt = store.receipts.find((r) => r.id === 'rcpt-01')!;
      expect(receipt).toBeDefined();

      const pdfBuffer = await generateReceiptPdfBuffer(receipt);
      expect(Buffer.isBuffer(pdfBuffer)).toBe(true);
      expect(pdfBuffer.length).toBeGreaterThan(4000);
      expect(pdfBuffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    });

    it('generates a valid fee receipt PDF buffer for inter-state receipt', async () => {
      const receipt = store.receipts.find((r) => r.id === 'rcpt-03')!;
      expect(receipt).toBeDefined();

      const pdfBuffer = await generateReceiptPdfBuffer(receipt);
      expect(Buffer.isBuffer(pdfBuffer)).toBe(true);
      expect(pdfBuffer.length).toBeGreaterThan(4000);
      expect(pdfBuffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    });
  });
});
