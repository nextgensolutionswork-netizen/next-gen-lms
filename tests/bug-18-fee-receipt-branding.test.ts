import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  OFFICIAL_INSTITUTE_NAME,
  OFFICIAL_INSTITUTE_ADDRESS,
  OFFICIAL_INSTITUTE_PHONE,
  OFFICIAL_LOGO_PATH,
  OFFICIAL_LOGO_WEBP,
  OFFICIAL_RECEIPT_TERMS,
  OFFICIAL_RECEIPT_TERMS_TEXT,
  resolveInstituteAddress,
  resolveReceiptTerms,
  LOGO_ORIGINAL_WIDTH,
  LOGO_ORIGINAL_HEIGHT,
  LOGO_ASPECT_RATIO,
} from '@/lib/constants/branding';
import { generateReceiptPdfBuffer } from '@/lib/services/pdf-service';
import type { Receipt } from '@/types';

import { inflateSync } from 'zlib';

function extractPdfText(buffer: Buffer): string {
  let text = '';
  for (const match of buffer.toString('latin1').matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    let stream: string;
    try {
      stream = inflateSync(Buffer.from(match[1], 'latin1')).toString('latin1');
    } catch {
      continue;
    }
    for (const token of stream.matchAll(/<([a-f0-9]+)>/gi)) {
      text += Buffer.from(token[1], 'hex').toString('latin1');
    }
  }
  return text;
}

describe('BUG-18: Official Fee Receipt & Invoice Branding Update', () => {
  describe('Task 1 — Original Company Logo Asset Verification', () => {
    it('1.1 verifies downloaded official logo exists in public/branding directory as webp and png', () => {
      const webpPath = path.join(process.cwd(), 'public', 'branding', 'nextgen-logo.webp');
      const pngPath = path.join(process.cwd(), 'public', 'branding', 'nextgen-logo.png');

      expect(fs.existsSync(webpPath), 'nextgen-logo.webp must exist in public/branding').toBe(true);
      expect(fs.existsSync(pngPath), 'nextgen-logo.png must exist in public/branding').toBe(true);

      const webpStats = fs.statSync(webpPath);
      const pngStats = fs.statSync(pngPath);

      expect(webpStats.size).toBeGreaterThan(10000);
      expect(pngStats.size).toBeGreaterThan(10000);
    });

    it('1.2 verifies aspect ratio matches original 480x182 logo dimensions', () => {
      expect(LOGO_ORIGINAL_WIDTH).toBe(480);
      expect(LOGO_ORIGINAL_HEIGHT).toBe(182);
      expect(LOGO_ASPECT_RATIO).toBeCloseTo(2.63736, 4);
      expect(OFFICIAL_LOGO_PATH).toBe('/branding/nextgen-logo.png');
      expect(OFFICIAL_LOGO_WEBP).toBe('/branding/nextgen-logo.webp');
    });
  });

  describe('Task 2 — Replace Institute Address', () => {
    const expectedAddress =
      'Pillar No 707, Flat No. 502, 5th Floor, Plot No 129, PJR ARCADE Sri Sai Nagar Colony, near JNTU, opp. Sri Chaitanya Junior Kalasala, Jawaharlal Nehru Technological University, Hyderabad, Telangana 500085';

    it('2.1 matches exact authoritative institute address string', () => {
      expect(OFFICIAL_INSTITUTE_ADDRESS).toBe(expectedAddress);
    });

    it('2.2 resolves legacy Silicon Valley Towers placeholder to the new authoritative address', () => {
      expect(resolveInstituteAddress('Plot 42, Silicon Valley Towers, Hitec City, Hyderabad 500081')).toBe(
        expectedAddress
      );
      expect(resolveInstituteAddress('')).toBe(expectedAddress);
      expect(resolveInstituteAddress(null as any)).toBe(expectedAddress);
      expect(resolveInstituteAddress(undefined as any)).toBe(expectedAddress);
    });

    it('2.3 preserves explicit custom institute address when specified', () => {
      const custom = 'Branch Office, Tech Park, Whitefield, Bengaluru, Karnataka 560066';
      expect(resolveInstituteAddress(custom)).toBe(custom);
    });
  });

  describe('Task 3 — Terms & Conditions Update', () => {
    it('3.1 contains exactly the three approved conditions and removes late fees clause', () => {
      expect(OFFICIAL_RECEIPT_TERMS).toHaveLength(3);

      expect(OFFICIAL_RECEIPT_TERMS[0]).toBe(
        '1. All fee payments are non-refundable and non-transferable unless specified in writing by institute management.'
      );
      expect(OFFICIAL_RECEIPT_TERMS[1]).toBe(
        '2. Receipts are issued subject to bank realization of cheques, UPI, and online transfers.'
      );
      expect(OFFICIAL_RECEIPT_TERMS[2]).toBe(
        "3. Jurisdiction: Any disputes arising hereunder shall be subject to the exclusive jurisdiction of the institute's principal city."
      );

      // Verify complete absence of late fee text
      for (const term of OFFICIAL_RECEIPT_TERMS) {
        expect(term.toLowerCase()).not.toContain('late fee');
        expect(term.toLowerCase()).not.toContain('automated late fees');
      }
      expect(OFFICIAL_RECEIPT_TERMS_TEXT.toLowerCase()).not.toContain('late fee');
    });

    it('3.2 sanitizes legacy 4-line receipt terms containing automated late fees', () => {
      const legacyTerms = `1. All fee payments are non-refundable and non-transferable unless specified in writing by institute management.
2. Receipts are issued subject to bank realization of cheques, UPI, and online transfers.
3. Installment payments must be cleared on or before the due date to avoid automated late fees.
4. Jurisdiction: Any disputes arising hereunder shall be subject to the exclusive jurisdiction of the institute's principal city.`;

      const resolved = resolveReceiptTerms(legacyTerms);
      expect(resolved).toBe(OFFICIAL_RECEIPT_TERMS_TEXT);
      expect(resolved).not.toContain('Installment payments must be cleared on or before the due date to avoid automated late fees');
    });

    it('3.3 resolves empty or null terms to the three official conditions', () => {
      expect(resolveReceiptTerms('')).toBe(OFFICIAL_RECEIPT_TERMS_TEXT);
      expect(resolveReceiptTerms(null)).toBe(OFFICIAL_RECEIPT_TERMS_TEXT);
      expect(resolveReceiptTerms(undefined)).toBe(OFFICIAL_RECEIPT_TERMS_TEXT);
    });
  });

  describe('Task 4, 5, 6 — End-to-End PDF Generation & Field Preservation', () => {
    const sampleReceipt: Receipt = {
      id: 'rec-test-001',
      tenant_id: 'default',
      receipt_number: 'REC-2026-0042',
      payment_id: 'pay-test-001',
      student_id: 'stu-test-001',
      student_name: 'Ananya Sharma',
      student_email: 'ananya.sharma@example.com',
      admission_number: 'ADM-2026-0038',
      course_name: 'SAP S/4HANA Finance (FI/CO)',
      payment_amount: 25000,
      payment_mode: 'UPI',
      transaction_reference: 'UPI/261124/998877',
      payment_date: '2026-11-24',
      remaining_balance: 15000,
      due_date: '2026-12-15',
      authorized_by: 'Suresh Kumar (Chief Accountant)',
      institute_name: OFFICIAL_INSTITUTE_NAME,
      institute_address: OFFICIAL_INSTITUTE_ADDRESS,
      institute_phone: OFFICIAL_INSTITUTE_PHONE,
      institute_gst: '36AAACN1234F1Z8',
      place_of_supply: 'Telangana (36)',
      created_at: '2026-11-24T10:00:00.000Z',
    };

    it('4.1 generates valid PDF buffer with logo image embedded and proper structure', async () => {
      const pdfBuffer = await generateReceiptPdfBuffer(sampleReceipt);

      expect(Buffer.isBuffer(pdfBuffer)).toBe(true);
      expect(pdfBuffer.length).toBeGreaterThan(20000);
      expect(pdfBuffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');

      const raw = extractPdfText(pdfBuffer);
      // Receipt identifiers preserved
      expect(raw).toContain('REC-2026-0042');
      expect(raw).toContain('Ananya Sharma');
      expect(raw).toContain('ADM-2026-0038');
      expect(raw).toContain('SAP S/4HANA Finance');
      expect(raw).toContain('Suresh Kumar');
      expect(raw).toContain('UPI/261124/998877');

      // Terms & Conditions presence
      expect(raw).toContain('TERMS & CONDITIONS:');
      expect(raw).toContain('non-refundable and non-transferable');
      expect(raw).toContain('bank realization');
      expect(raw).toContain('exclusive jurisdiction');
      expect(raw).not.toContain('automated late fees');
    });

    it('4.2 preserves all financial and audit metadata without mutation', async () => {
      const originalReceipt = { ...sampleReceipt };
      await generateReceiptPdfBuffer(sampleReceipt);

      // Verify sampleReceipt was not mutated
      expect(sampleReceipt.receipt_number).toBe(originalReceipt.receipt_number);
      expect(sampleReceipt.payment_amount).toBe(originalReceipt.payment_amount);
      expect(sampleReceipt.remaining_balance).toBe(originalReceipt.remaining_balance);
      expect(sampleReceipt.payment_date).toBe(originalReceipt.payment_date);
      expect(sampleReceipt.authorized_by).toBe(originalReceipt.authorized_by);
      expect(sampleReceipt.transaction_reference).toBe(originalReceipt.transaction_reference);
    });

    it('4.3 generates single-page A4 output without spilling onto accidental page 2', async () => {
      const pdfBuffer = await generateReceiptPdfBuffer(sampleReceipt);
      const content = pdfBuffer.toString('latin1');
      // Count /Type /Page occurrences (excluding /Pages)
      const pageMatches = content.match(/\/Type\s*\/Page[^s]/g) || [];
      expect(pageMatches.length).toBe(1);
    });
  });
});
