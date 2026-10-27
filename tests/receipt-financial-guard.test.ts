import { describe, it, expect, beforeEach } from 'vitest';
import { generateReceiptPdfBuffer, ReceiptPdfDataError } from '@/lib/services/pdf-service';
import { store } from '@/lib/services/data-store';
import { GET as getReceiptPdfRoute } from '@/app/api/receipts/[id]/pdf/route';
import { NextRequest } from 'next/server';
import { generateAuthCookieSignatureSync, AUTH_COOKIE_NAME, AUTH_SIG_COOKIE_NAME } from '@/lib/security/auth-cookie';

function authRequest(url: string) {
  const user = store.users.find((u) => u.role === 'accountant' && u.is_active)!;
  const value = encodeURIComponent(JSON.stringify(user));
  return new NextRequest(url, {
    headers: {
      cookie: AUTH_COOKIE_NAME + '=' + value + '; ' + AUTH_SIG_COOKIE_NAME + '=' + generateAuthCookieSignatureSync(value),
    },
  });
}

describe('Receipt Financial Integrity & Completeness Guards (FIN-REC-001)', () => {
  beforeEach(() => {
    store.reconcileDualLedgers();
  });

  describe('Server PDF Generation Guards (lib/services/pdf-service.ts)', () => {
    it('strictly forbids PDF generation for receipts with payment_amount: 0', async () => {
      const incompleteReceipt = {
        ...store.receipts[0],
        payment_amount: 0,
      };
      await expect(generateReceiptPdfBuffer(incompleteReceipt as any))
        .rejects.toThrow(ReceiptPdfDataError);
      await expect(generateReceiptPdfBuffer(incompleteReceipt as any))
        .rejects.toThrow('has no valid payment amount');
    });

    it('strictly forbids PDF generation for receipts with negative payment_amount', async () => {
      const negativeReceipt = {
        ...store.receipts[0],
        payment_amount: -5000,
      };
      await expect(generateReceiptPdfBuffer(negativeReceipt as any))
        .rejects.toThrow(ReceiptPdfDataError);
    });

    it('permits PDF generation for valid, verified positive receipts', async () => {
      const validReceipt = {
        ...store.receipts[0],
        payment_amount: 20000,
      };
      const buffer = await generateReceiptPdfBuffer(validReceipt as any);
      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    });
  });

  describe('Download API Endpoint Guard (app/api/receipts/[id]/pdf/route.ts)', () => {
    it('returns HTTP 422 when attempting to download an unfinalized receipt with amount: 0', async () => {
      // Create a temporary unfinalized/zero-amount receipt
      const tempId = 'rcpt-test-zero-download';
      store.receipts.push({
        id: tempId,
        receipt_number: 'REC-ZERO-TEST',
        payment_id: 'pay-test-zero',
        student_id: 'stu-01',
        student_name: 'Test Student',
        admission_number: 'ADM-TEST-001',
        course_name: 'SAP S/4HANA Finance',
        payment_amount: 0,
        amount: 0,
        payment_mode: 'UPI',
        payment_date: '2026-10-27',
        remaining_balance: 0,
        authorized_by: 'Accountant',
        institute_name: 'Next-Gen ERP Solutions',
        institute_address: 'Plot 42, Hitec City',
        institute_phone: '+91 98765 43210',
        institute_gst: '',
        created_at: new Date().toISOString(),
        tenant_id: 'default',
      });

      try {
        const req = authRequest(`http://localhost:3000/api/receipts/${tempId}/pdf?download=true`);
        const res = await getReceiptPdfRoute(req, { params: { id: tempId } });
        expect(res.status).toBe(422);
        const json = await res.json();
        expect(json.success).toBe(false);
        expect(json.error).toContain('has no valid payment amount');
      } finally {
        store.receipts = store.receipts.filter((r) => r.id !== tempId);
      }
    });

    it('returns HTTP 200 when downloading a finalized receipt with positive amount', async () => {
      const receipt = store.receipts.find((r) => r.receipt_number === 'REC-2026-0001');
      expect(receipt).toBeDefined();

      const req = authRequest(`http://localhost:3000/api/receipts/${receipt!.receipt_number}/pdf?download=true`);
      const res = await getReceiptPdfRoute(req, { params: { id: receipt!.receipt_number } });
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('application/pdf');
    });
  });
});
