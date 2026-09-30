import { describe, it, expect, beforeEach } from 'vitest';
import {
  resolveState,
  calculateGstBreakdown,
  generateIrn,
  amountToWordsINR,
  GST_STATE_CODES,
} from '@/lib/services/gst-service';
import { recordPaymentAtomic } from '@/lib/services/finance-service';
import { generateReceiptPdfBuffer } from '@/lib/services/pdf-service';
import { store } from '@/lib/services/data-store';

describe('Automated Invoicing & GST Compliance Engine', () => {
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

  describe('GST Tax Calculation Engine (CGST/SGST vs IGST)', () => {
    it('calculates 9% CGST + 9% SGST (0% IGST) for intra-state (Telangana) student tuition', () => {
      const amount = 11800; // Taxable = 10,000, Tax = 1,800
      const breakdown = calculateGstBreakdown(amount, 'Hyderabad', {
        customDocNumber: 'REC-TEST-001',
      });

      expect(breakdown.supply_type).toBe('INTRA_STATE');
      expect(breakdown.place_of_supply_code).toBe('36');
      expect(breakdown.sac_code).toBe('999293');
      expect(breakdown.taxable_amount).toBe(10000);
      expect(breakdown.cgst_rate).toBe(9);
      expect(breakdown.cgst_amount).toBe(900);
      expect(breakdown.sgst_rate).toBe(9);
      expect(breakdown.sgst_amount).toBe(900);
      expect(breakdown.igst_rate).toBe(0);
      expect(breakdown.igst_amount).toBe(0);
      expect(breakdown.total_tax).toBe(1800);
      expect(breakdown.total_amount).toBe(11800);
      expect(breakdown.cgst_amount + breakdown.sgst_amount).toBe(breakdown.total_tax);
    });

    it('calculates 18% IGST (0% CGST, 0% SGST) for inter-state (Maharashtra/Pune) student tuition', () => {
      const amount = 11800;
      const breakdown = calculateGstBreakdown(amount, 'Pune', {
        customDocNumber: 'REC-TEST-002',
      });

      expect(breakdown.supply_type).toBe('INTER_STATE');
      expect(breakdown.place_of_supply_code).toBe('27');
      expect(breakdown.taxable_amount).toBe(10000);
      expect(breakdown.cgst_rate).toBe(0);
      expect(breakdown.cgst_amount).toBe(0);
      expect(breakdown.sgst_rate).toBe(0);
      expect(breakdown.sgst_amount).toBe(0);
      expect(breakdown.igst_rate).toBe(18);
      expect(breakdown.igst_amount).toBe(1800);
      expect(breakdown.total_tax).toBe(1800);
      expect(breakdown.total_amount).toBe(11800);
    });

    it('calculates 18% IGST for inter-state Karnataka/Bengaluru student', () => {
      const amount = 20000;
      const breakdown = calculateGstBreakdown(amount, 'Bengaluru');

      expect(breakdown.supply_type).toBe('INTER_STATE');
      expect(breakdown.place_of_supply_code).toBe('29');
      expect(breakdown.taxable_amount).toBe(16949.15);
      expect(breakdown.igst_amount).toBe(3050.85);
      expect(breakdown.total_tax).toBe(3050.85);
      expect(breakdown.cgst_amount).toBe(0);
      expect(breakdown.sgst_amount).toBe(0);
    });

    it('handles tax-exclusive calculation option when specified', () => {
      const baseAmount = 10000;
      const breakdown = calculateGstBreakdown(baseAmount, 'Telangana', { isInclusive: false });

      expect(breakdown.taxable_amount).toBe(10000);
      expect(breakdown.total_tax).toBe(1800);
      expect(breakdown.total_amount).toBe(11800);
      expect(breakdown.cgst_amount).toBe(900);
      expect(breakdown.sgst_amount).toBe(900);
    });

    it('ensures rounding reconciliation guarantees exact total_tax match for odd amounts', () => {
      const amount = 15333.33;
      const breakdown = calculateGstBreakdown(amount, 'Telangana');

      expect(Number((breakdown.cgst_amount + breakdown.sgst_amount).toFixed(2))).toBe(breakdown.total_tax);
    });
  });

  describe('Cryptographic e-Invoice IRN & Acknowledgement', () => {
    it('generates a 64-character hexadecimal SHA-256 hash IRN', () => {
      const irn = generateIrn('36AAACN1234F1Z8', 'REC-2026-0001', '2026-01-25');
      expect(irn).toHaveLength(64);
      expect(/^[0-9a-f]{64}$/.test(irn)).toBe(true);
    });

    it('generates deterministic IRN for identical invoice metadata', () => {
      const irn1 = generateIrn('36AAACN1234F1Z8', 'REC-2026-0001', '2026-01-25');
      const irn2 = generateIrn('36AAACN1234F1Z8', 'REC-2026-0001', '2026-01-25');
      expect(irn1).toBe(irn2);
    });

    it('generates distinct IRN for different invoice numbers or dates', () => {
      const irn1 = generateIrn('36AAACN1234F1Z8', 'REC-2026-0001', '2026-01-25');
      const irn2 = generateIrn('36AAACN1234F1Z8', 'REC-2026-0002', '2026-01-25');
      expect(irn1).not.toBe(irn2);
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

  describe('Finance Service Atomic Payment with Automated GST', () => {
    it('automatically calculates intra-state GST when recording payment for Telangana student', async () => {
      const student = store.students.find((s) => s.id === 'stu-01')!;
      const feeAccount = store.feeAccounts.find((f) => f.student_id === student.id)!;

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
      expect(receipt.supply_type).toBe('INTRA_STATE');
      expect(receipt.place_of_supply_code).toBe('36');
      expect(receipt.sac_code).toBe('999293');
      expect(receipt.cgst_rate).toBe(9);
      expect(receipt.sgst_rate).toBe(9);
      expect(receipt.igst_rate).toBe(0);
      expect(receipt.cgst_amount! + receipt.sgst_amount!).toBe(receipt.total_tax);
      expect(receipt.irn).toBeDefined();
      expect(receipt.irn).toHaveLength(64);
    });

    it('automatically calculates inter-state 18% IGST when recording payment for out-of-state student', async () => {
      const student = store.students.find((s) => s.id === 'stu-02')!; // Sneha Kulkarni in Pune, Maharashtra
      const feeAccount = store.feeAccounts.find((f) => f.student_id === student.id)!;

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
      expect(receipt.supply_type).toBe('INTER_STATE');
      expect(receipt.place_of_supply_code).toBe('27');
      expect(receipt.cgst_amount).toBe(0);
      expect(receipt.sgst_amount).toBe(0);
      expect(receipt.igst_rate).toBe(18);
      expect(receipt.igst_amount).toBe(receipt.total_tax);
      expect(receipt.irn).toBeDefined();
    });
  });

  describe('Official GST Tax Invoice PDF Generation', () => {
    it('generates a valid GST compliant PDF buffer for intra-state receipt', async () => {
      const receipt = store.receipts.find((r) => r.id === 'rcpt-01')!;
      expect(receipt).toBeDefined();

      const pdfBuffer = await generateReceiptPdfBuffer(receipt);
      expect(Buffer.isBuffer(pdfBuffer)).toBe(true);
      expect(pdfBuffer.length).toBeGreaterThan(4000);
      expect(pdfBuffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    });

    it('generates a valid GST compliant PDF buffer for inter-state receipt', async () => {
      const receipt = store.receipts.find((r) => r.id === 'rcpt-03')!;
      expect(receipt).toBeDefined();

      const pdfBuffer = await generateReceiptPdfBuffer(receipt);
      expect(Buffer.isBuffer(pdfBuffer)).toBe(true);
      expect(pdfBuffer.length).toBeGreaterThan(4000);
      expect(pdfBuffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    });
  });
});
