import { describe, it, expect } from 'vitest';
import { generateReceiptPdfBuffer, generateCertificatePdfBuffer } from '@/lib/services/pdf-service';
import { store } from '@/lib/services/data-store';
import { NextRequest } from 'next/server';
import { GET as getReceiptPdfRoute } from '@/app/api/receipts/[id]/pdf/route';
import { GET as getCertificatePdfRoute } from '@/app/api/certificates/[id]/pdf/route';

describe('PDF Generation Service & API Routes', () => {
  describe('generateReceiptPdfBuffer', () => {
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
    it('returns 200 with inline application/pdf for a valid receipt ID', async () => {
      const receipt = store.receipts[0];
      const req = new NextRequest(`http://localhost:3000/api/receipts/${receipt.id}/pdf`);
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
      const req = new NextRequest(`http://localhost:3000/api/receipts/${receipt.id}/pdf?download=true`);
      const res = await getReceiptPdfRoute(req, { params: { id: receipt.id } });

      expect(res.status).toBe(200);
      expect(res.headers.get('content-disposition')).toContain('attachment');
      expect(res.headers.get('content-disposition')).toContain(`receipt-${receipt.receipt_number}.pdf`);
    });

    it('looks up receipt by receipt_number as well', async () => {
      const receipt = store.receipts[0];
      const req = new NextRequest(`http://localhost:3000/api/receipts/${receipt.receipt_number}/pdf`);
      const res = await getReceiptPdfRoute(req, { params: { id: receipt.receipt_number } });

      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('application/pdf');
    });

    it('returns 404 for non-existent receipt ID', async () => {
      const req = new NextRequest('http://localhost:3000/api/receipts/non-existent-id/pdf');
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
});
