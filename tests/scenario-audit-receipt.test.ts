import { expect, it } from 'vitest';
import { generateReceiptPdfBuffer } from '@/lib/services/pdf-service';
it('refuses an official PDF when the historical remaining balance is absent', async () => {
  const receipt: any = { id: 'synthetic-receipt', receipt_number: 'SYNTHETIC-001', student_name: 'Synthetic Student', payment_date: '2026-10-30', payment_amount: 100, payment_method: 'Cash', course_name: 'Synthetic Course', status: 'Active' };
  await expect(generateReceiptPdfBuffer(receipt)).rejects.toThrow();
});
