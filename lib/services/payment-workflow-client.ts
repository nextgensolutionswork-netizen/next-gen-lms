import type { ManualPaymentVerification } from './manual-payment-verification';
import { mergeWorkflowSnapshot } from './payment-workflow-state';
import type { CreateAdmissionInput } from './admission-service';
import type { feeWorkflowService } from './fee-workflow-service';
import type { StudentPaymentRecord } from '@/types';

const pending = new Map<string, Promise<any>>();
const keys = new Map<string, string>();
let refreshTask: Promise<any> | undefined;
async function request(body?: unknown, endpoint = '/api/fees/payments') {
  const res = await fetch(endpoint, { method: body ? 'POST' : 'GET', headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined, cache: 'no-store', credentials: 'same-origin' });
  const data = await res.json();
  if (!res.ok || !data.success) throw Object.assign(new Error(data.error || 'Payment request failed.'), { fieldErrors: data.fieldErrors });
  if (data.snapshot) mergeWorkflowSnapshot(data.snapshot);
  return data;
}
export const paymentWorkflowClient = {
  async feeOperation(method: string, ...args: any[]) {
    return (await request({ method, args }, '/api/fees/proposals')).result;
  },
  refresh() {
    // Share overlapping reads (including development Strict Mode mounts), but
    // never cache a completed financial snapshot.
    if (!refreshTask) refreshTask = request().finally(() => { refreshTask = undefined; });
    return refreshTask;
  },
  async refreshAdmissions() { return request(undefined, '/api/admissions'); },
  async refreshReceipts() { return request(undefined, '/api/fees/receipts'); },
  recordPayment(input: Parameters<typeof feeWorkflowService.recordPayment>[0], _userId?: string, _role?: string): Promise<StudentPaymentRecord> {
    const signature = JSON.stringify(input);
    if (pending.has(signature)) return pending.get(signature)!;
    const key = keys.get(signature) || crypto.randomUUID();
    keys.set(signature, key);
    const task = request({ action: 'record', input: { ...input, idempotency_key: key } }).then((data) => { keys.delete(signature); return data.payment; }).finally(() => pending.delete(signature));
    pending.set(signature, task);
    return task;
  },
  async updatePayment(paymentId: string, input: Parameters<typeof feeWorkflowService.updatePayment>[1], _userId?: string, _role?: string) {
    return (await request({ action: 'update', paymentId, input })).payment as StudentPaymentRecord;
  },
  async verifyPayment(paymentId: string, _userId?: string, notes?: string, verification?: ManualPaymentVerification) {
    return (await request({ action: 'approve', paymentId, notes, verification })).payment as StudentPaymentRecord;
  },
  async rejectPayment(paymentId: string, _userId: string, reason: string) {
    return (await request({ action: 'reject', paymentId, reason })).payment as StudentPaymentRecord;
  },
  async voidReceipt(receiptId: string, reason: string) {
    return (await request({ action: 'void_receipt', receiptId, reason })).result;
  },
  async createAdmission(input: CreateAdmissionInput) {
    const signature = JSON.stringify({ email: input.email, course_id: input.course_id, date: input.admission_date, phone: input.phone });
    const key = input.idempotency_key || keys.get(signature) || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `adm-key-${Date.now()}`);
    keys.set(signature, key);
    return (await request({ ...input, idempotency_key: key }, '/api/admissions')).result;
  },
};
