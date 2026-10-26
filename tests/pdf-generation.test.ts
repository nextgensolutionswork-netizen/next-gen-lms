import { generateAuthCookieSignatureSync, AUTH_COOKIE_NAME, AUTH_SIG_COOKIE_NAME } from '@/lib/security/auth-cookie';
import { describe, it, expect } from 'vitest';
import {
  generateReceiptPdfBuffer,
  generateCertificatePdfBuffer,
  generateAndSaveReceiptPdf,
  generateAndSaveCertificatePdf,
} from '@/lib/services/pdf-service';
import { store } from '@/lib/services/data-store';
import { NextRequest } from 'next/server';
import { inflateSync } from 'node:zlib';
import { GET as getReceiptPdfRoute } from '@/app/api/receipts/[id]/pdf/route';
import { GET as getCertificatePdfRoute } from '@/app/api/certificates/[id]/pdf/route';

function receiptRequest(url: string) {
  const user = store.users.find((u) => u.role === 'accountant' && u.is_active)!;
  const value = encodeURIComponent(JSON.stringify(user));
  return new NextRequest(url, { headers: { cookie: AUTH_COOKIE_NAME + '=' + value + '; ' + AUTH_SIG_COOKIE_NAME + '=' + generateAuthCookieSignatureSync(value) } });
}

function pdfText(buffer: Buffer): string {
  let text = '';
  for (const match of buffer.toString('latin1').matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    let stream: string;
    try { stream = inflateSync(Buffer.from(match[1], 'latin1')).toString('latin1'); } catch { continue; }
    for (const token of stream.matchAll(/<([a-f0-9]+)>/gi)) text += Buffer.from(token[1], 'hex').toString('latin1');
  }
  return text;
}

describe('PDF Generation Service & API Routes', () => {
  describe('generateReceiptPdfBuffer', () => {
    it('exports a legacy receipt without a recorded remaining balance', async () => {
      const receipt = { ...store.receipts[0], receipt_number: 'REC-2026-0001', student_name: 'Amit Gupta' };
      delete (receipt as Partial<typeof receipt>).remaining_balance;
      const buffer = await generateReceiptPdfBuffer(receipt);
      expect(buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
      expect(pdfText(buffer)).toContain('Remaining balance: Not recorded on this receipt');
      expect(pdfText(buffer)).toContain('Amit Gupta');
    });

    it('formats numeric strings and preserves a genuine zero balance', async () => {
      const receipt = { ...store.receipts[0], payment_amount: '40000.50', remaining_balance: '0' };
      const text = pdfText(await generateReceiptPdfBuffer(receipt as any));
      expect(text).toContain('40,000.50');
      expect(text).toContain('Remaining balance: INR 0.00');
    });

    it.each([undefined, null, '', 'invalid', NaN, Infinity])('rejects invalid payment amount %s before PDF construction', async (payment_amount) => {
      await expect(generateReceiptPdfBuffer({ ...store.receipts[0], payment_amount } as any))
        .rejects.toThrow('has no valid payment amount');
    });
    it('exports a 40000 receipt with absent institute metadata without mutating it', async () => {
      const receipt = { ...store.receipts[0], receipt_number: 'REC-2026-0002', payment_amount: 40000 };
      delete (receipt as Partial<typeof receipt>).institute_name;
      delete (receipt as Partial<typeof receipt>).institute_address;
      delete (receipt as Partial<typeof receipt>).institute_phone;
      const before = structuredClone(receipt);
      const buffer = await generateReceiptPdfBuffer(receipt);
      expect(buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
      expect(buffer.toString('latin1')).toContain('%%EOF');
      let text = '';
      for (const match of buffer.toString('latin1').matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
        let stream: string;
        try { stream = inflateSync(Buffer.from(match[1], 'latin1')).toString('latin1'); } catch { continue; }
        for (const token of stream.matchAll(/<([a-f0-9]+)>/gi)) text += Buffer.from(token[1], 'hex').toString('latin1');
      }
      expect(text).toContain('REC-2026-0002');
      expect(text).toContain('40,000.00');
      expect(receipt).toEqual(before);
    });

    it('prints payment and balance without tax details, including for historical receipts', async () => {
      const receipt = { ...store.receipts[0], institute_gst: 'LEGACY-GST-ID', total_tax: 900, irn: 'LEGACY-INVOICE-ID' };
      const before = structuredClone(receipt);
      const buffer = await generateReceiptPdfBuffer(receipt);
      const raw = buffer.toString('latin1');
      let text = '';
      for (const match of raw.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
        let stream: string;
        try { stream = inflateSync(Buffer.from(match[1], 'latin1')).toString('latin1'); } catch { continue; }
        for (const token of stream.matchAll(/<([a-f0-9]+)>/gi)) text += Buffer.from(token[1], 'hex').toString('latin1');
      }
      expect(text).toContain('OFFICIAL FEE RECEIPT');
      expect(text).toContain('Remaining balance:');
      expect(text).not.toMatch(/GST|IRN|Tax|LEGACY-INVOICE-ID|LEGACY-GST-ID/);
      expect(receipt).toEqual(before);
    });

    it('generates a valid A4 PDF buffer for a receipt', async () => {
      const receipt = store.receipts[0];
      expect(receipt).toBeDefined();

      const pdfBuffer = await generateReceiptPdfBuffer(receipt);
      expect(Buffer.isBuffer(pdfBuffer)).toBe(true);
      expect(pdfBuffer.length).toBeGreaterThan(3000);

      // PDF Magic bytes: %PDF-
      const header = pdfBuffer.subarray(0, 5).toString('ascii');
      expect(header).toBe('%PDF-');
    });

    it('generates PDF when optional institute fields are missing/defaulted', async () => {
      const customReceipt = {
        ...store.receipts[0],
        id: 'rec-custom-test',
        receipt_number: 'REC-TEST-9999',
        institute_name: '',
        institute_address: '',
        institute_phone: '',
        institute_gst: '',
        transaction_reference: undefined,
      };

      const pdfBuffer = await generateReceiptPdfBuffer(customReceipt as any);
      expect(Buffer.isBuffer(pdfBuffer)).toBe(true);
      expect(pdfBuffer.length).toBeGreaterThan(3000);
      expect(pdfBuffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    });
  });

  describe('generateCertificatePdfBuffer', () => {
    it('generates a valid A4 Landscape PDF buffer for a certificate', async () => {
      const cert = store.certificates[0];
      expect(cert).toBeDefined();

      const pdfBuffer = await generateCertificatePdfBuffer(cert);
      expect(Buffer.isBuffer(pdfBuffer)).toBe(true);
      expect(pdfBuffer.length).toBeGreaterThan(3000);

      // PDF Magic bytes: %PDF-
      const header = pdfBuffer.subarray(0, 5).toString('ascii');
      expect(header).toBe('%PDF-');
    });

    it('handles missing optional grade and metrics gracefully', async () => {
      const customCert = {
        ...store.certificates[0],
        id: 'cert-custom-test',
        certificate_id: 'CERT-TEST-0001',
        grade: '',
        attendance_percentage: 0,
        assignment_completion_rate: 0,
        exam_score_percentage: 0,
        verification_url: '',
      };

      const pdfBuffer = await generateCertificatePdfBuffer(customCert as any);
      expect(Buffer.isBuffer(pdfBuffer)).toBe(true);
      expect(pdfBuffer.length).toBeGreaterThan(3000);
      expect(pdfBuffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    });
  });

  describe('GET /api/receipts/[id]/pdf Route Handler', () => {
    it('downloads a legacy receipt using its linked payment without changing stored data', async () => {
      const receipt = store.receipts[0];
      const before = structuredClone(receipt);
      const payment = store.payments.find((p) => p.id === receipt.payment_id)!;
      expect(payment).toBeDefined();
      try {
        delete (receipt as Partial<typeof receipt>).payment_amount;
        delete (receipt as Partial<typeof receipt>).remaining_balance;
        const res = await getReceiptPdfRoute(receiptRequest(`http://localhost:3000/api/receipts/${receipt.id}/pdf?download=true`), { params: { id: receipt.id } });
        expect(res.status).toBe(200);
        expect(res.headers.get('content-disposition')).toContain('attachment');
        const text = pdfText(Buffer.from(await res.arrayBuffer()));
        expect(text).toContain(payment.amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
        expect(text).toContain('Not recorded on this receipt');
        expect(receipt.payment_amount).toBeUndefined();
      } finally { store.receipts = store.receipts.map((r) => r.id === before.id ? before : r); }
    });

    it('returns 422 when neither receipt nor linked payment provides an amount', async () => {
      const receipt = store.receipts[0];
      const before = structuredClone(receipt);
      try {
        delete (receipt as Partial<typeof receipt>).payment_amount;
        receipt.payment_id = 'missing-linked-payment';
        const res = await getReceiptPdfRoute(receiptRequest(`http://localhost:3000/api/receipts/${receipt.id}/pdf`), { params: { id: receipt.id } });
        expect(res.status).toBe(422);
        expect((await res.json()).error).toContain('has no valid payment amount');
      } finally { store.receipts = store.receipts.map((r) => r.id === before.id ? before : r); }
    });
    it('returns 200 with inline application/pdf for a valid receipt ID', async () => {
      const receipt = store.receipts[0];
      const req = receiptRequest(`http://localhost:3000/api/receipts/${receipt.id}/pdf`);
      const res = await getReceiptPdfRoute(req, { params: { id: receipt.id } });

      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('application/pdf');
      expect(res.headers.get('content-disposition')).toContain('inline');
      expect(res.headers.get('content-disposition')).toContain(receipt.receipt_number);

      const arrayBuffer = await res.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      expect(buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    });

    it('returns attachment disposition when download=true is requested', async () => {
      const receipt = store.receipts[0];
      const req = receiptRequest(`http://localhost:3000/api/receipts/${receipt.id}/pdf?download=true`);
      const res = await getReceiptPdfRoute(req, { params: { id: receipt.id } });

      expect(res.status).toBe(200);
      expect(res.headers.get('content-disposition')).toContain('attachment');
      expect(res.headers.get('content-disposition')).toContain(`receipt-${receipt.receipt_number}.pdf`);
    });

    it('looks up receipt by receipt_number as well', async () => {
      const receipt = store.receipts[0];
      const req = receiptRequest(`http://localhost:3000/api/receipts/${receipt.receipt_number}/pdf`);
      const res = await getReceiptPdfRoute(req, { params: { id: receipt.receipt_number } });

      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('application/pdf');
    });

    it('returns 404 for non-existent receipt ID', async () => {
      const req = receiptRequest('http://localhost:3000/api/receipts/non-existent-id/pdf');
      const res = await getReceiptPdfRoute(req, { params: { id: 'non-existent-id' } });

      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain('not found');
    });
  });

  describe('GET /api/certificates/[id]/pdf Route Handler', () => {
    it('returns 200 with inline application/pdf for a valid certificate ID', async () => {
      const cert = store.certificates[0];
      const req = new NextRequest(`http://localhost:3000/api/certificates/${cert.certificate_id}/pdf`);
      const res = await getCertificatePdfRoute(req, { params: { id: cert.certificate_id } });

      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('application/pdf');
      expect(res.headers.get('content-disposition')).toContain('inline');
      expect(res.headers.get('content-disposition')).toContain(cert.certificate_id);

      const arrayBuffer = await res.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      expect(buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    });

    it('returns attachment disposition when download=true is requested', async () => {
      const cert = store.certificates[0];
      const req = new NextRequest(`http://localhost:3000/api/certificates/${cert.id}/pdf?download=true`);
      const res = await getCertificatePdfRoute(req, { params: { id: cert.id } });

      expect(res.status).toBe(200);
      expect(res.headers.get('content-disposition')).toContain('attachment');
      expect(res.headers.get('content-disposition')).toContain(`certificate-${cert.certificate_id}.pdf`);
    });

    it('returns 404 for non-existent certificate ID', async () => {
      const req = new NextRequest('http://localhost:3000/api/certificates/invalid-cert-id/pdf');
      const res = await getCertificatePdfRoute(req, { params: { id: 'invalid-cert-id' } });

      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain('not found');
    });
  });

  describe('Persistent Storage & Permanent URL Generation', () => {
    it('generates binary PDF buffer and assigns permanent URL for receipt', async () => {
      const receipt = { ...store.receipts[0] };
      const res = await generateAndSaveReceiptPdf(receipt);

      expect(Buffer.isBuffer(res.buffer)).toBe(true);
      expect(res.buffer.length).toBeGreaterThan(3000);
      expect(res.pdfUrl).toBeDefined();
      expect(res.pdfUrl).toContain(receipt.receipt_number);
      expect(receipt.pdf_url).toBe(res.pdfUrl);
    });

    it('generates binary PDF buffer and assigns permanent URL for certificate', async () => {
      const cert = { ...store.certificates[0] };
      const res = await generateAndSaveCertificatePdf(cert);

      expect(Buffer.isBuffer(res.buffer)).toBe(true);
      expect(res.buffer.length).toBeGreaterThan(3000);
      expect(res.pdfUrl).toBeDefined();
      expect(res.pdfUrl).toContain(cert.certificate_id);
      expect(cert.pdf_url).toBe(res.pdfUrl);
    });
  });
});
