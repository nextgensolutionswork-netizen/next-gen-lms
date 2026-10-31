import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { store } from '@/lib/services/data-store';
import { createAdmissionWorkflow } from '@/lib/services/admission-service';
const actor = 'synthetic-counsellor';
const input: any = { student_name: 'Synthetic Applicant', phone: '9990001234', email: 'applicant@example.invalid', dob: '2000-01-01', gender: 'Other', address: 'Synthetic', city: 'Synthetic', education: 'Graduate', experience_years: 0, current_employment_status: 'Student', course_id: 'synthetic-course', admission_date: '2026-10-30', course_fee: 30000, discount: 0, payment_plan: 'Full Payment', lead_id: 'synthetic-lead' };
beforeEach(() => {
  vi.spyOn(store, 'persist').mockImplementation(() => {}); vi.spyOn(store, 'persistSync').mockReturnValue(true);
  store.users = [{ id: actor, role: 'counsellor', full_name: 'Synthetic Counsellor', email: 'counsellor@example.invalid', is_active: true, tenant_id: 'default' } as any];
  store.courses = [{ id: 'synthetic-course', course_name: 'Synthetic Course', price: 30000, status: 'Published', tenant_id: 'default' } as any];
  store.leads = [{ id: 'synthetic-lead', full_name: 'Synthetic Applicant', counsellor_id: actor, tenant_id: 'default', stage: 'New' } as any];
  store.students = []; store.admissions = []; store.studentFees = []; store.feeAccounts = []; store.installments = []; store.payments = []; store.studentPayments = []; store.receipts = []; store.studentFinancialLedgers = []; store.onboardingCases = []; store.onboardingAuditLogs = []; store.auditLogs = []; store.notifications = []; store.batches = [];
});
afterEach(() => vi.restoreAllMocks());
it('converts an authorized saved lead and creates consistent admission, student and fee records', async () => {
  const r = await createAdmissionWorkflow(input, actor);
  expect(r.admission.lead_id).toBe(input.lead_id); expect(r.student.admission_id).toBe(r.admission.id);
  expect(r.feeAccount.admission_id).toBe(r.admission.id); expect(store.leads[0].stage).toBe('Converted');
  expect(store.studentPayments).toHaveLength(0); expect(store.receipts).toHaveLength(0);
});
it.each(['missing', 'unauthorized', 'converted'])('rejects a %s lead before creating records', async mode => {
  if(mode === 'missing') store.leads = [];
  if(mode === 'unauthorized') store.leads[0].counsellor_id = 'another-counsellor';
  if(mode === 'converted') store.leads[0].stage = 'Converted';
  await expect(createAdmissionWorkflow(input, actor)).rejects.toThrow(); expect(store.admissions).toHaveLength(0); expect(store.students).toHaveLength(0);
});
it('serializes simultaneous conversions without duplicate admissions', async () => {
  const results = await Promise.allSettled([createAdmissionWorkflow(input, actor), createAdmissionWorkflow(input, actor)]);
  expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1); expect(store.admissions).toHaveLength(1); expect(store.students).toHaveLength(1);
});
it('rolls back all local workflow records and lead stage on durable save failure', async () => {
  vi.mocked(store.persistSync).mockReturnValue(false);
  await expect(createAdmissionWorkflow(input, actor)).rejects.toThrow('storage failed');
  expect(store.leads[0].stage).toBe('New'); expect(store.admissions).toHaveLength(0); expect(store.students).toHaveLength(0); expect(store.feeAccounts).toHaveLength(0);
});
it('does not substitute another staff identity for a removed actor', async () => {
  await expect(createAdmissionWorkflow(input, 'removed-actor')).rejects.toThrow(); expect(store.admissions).toHaveLength(0);
});
it('rejects a cross-tenant lead even when counsellor ID matches', async () => {
  (store.leads[0] as any).tenant_id = 'other-tenant';
  await expect(createAdmissionWorkflow(input, actor)).rejects.toThrow(); expect(store.admissions).toHaveLength(0);
});
it('rejects a cross-tenant course', async () => {
  (store.courses[0] as any).tenant_id = 'other-tenant';
  await expect(createAdmissionWorkflow(input, actor)).rejects.toThrow(); expect(store.admissions).toHaveLength(0);
});
it('rejects an archived course', async () => {
  store.courses[0].status = 'Archived';
  await expect(createAdmissionWorkflow(input, actor)).rejects.toThrow(); expect(store.admissions).toHaveLength(0);
});
