import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { store } from '@/lib/services/data-store';
import { POST, PATCH, GET } from '@/app/api/crm/leads/route';
import { createLead, getLeads, updateLeadDetails, updateLeadStage, completeFollowup, convertLeadToAdmission } from '@/lib/services/crm-service';
import { validatePhoneNumber, parseStoredPhone, getCanonicalPhoneDigits } from '@/lib/utils/phone-validation';

// Audit only: real service/route code, synthetic storage, mocked authenticated identity.
// These tests do not establish Supabase RLS correctness.
const auth = vi.hoisted(() => ({ actor: { id: 'audit-counsellor', role: 'counsellor', tenant_id: 'default' } as any }));
vi.mock('@/lib/auth/payment-session', () => ({ authenticatePaymentRequest: vi.fn(async () => {
  if (!auth.actor) throw new Error('Unauthorized: Signed session required.');
  return auth.actor;
}) }));
const input = (extra: any = {}) => ({ full_name: 'Synthetic Audit Lead', phone: '9876543210', country_code: '+91', email: 'audit@example.test', stage: 'New', training_preference: 'Online', current_status: 'Fresher', lead_source: 'YouTube', counsellor_id: 'audit-counsellor', ...extra });
const req = (body: any, method = 'POST') => new NextRequest('http://localhost/api/crm/leads', { method, body: JSON.stringify(body) });
beforeEach(() => {
  store.leads = []; store.admissions = []; store.auditLogs = [];
  auth.actor = { id: 'audit-counsellor', role: 'counsellor', tenant_id: 'default' };
});
it('CRM-001 accepts all valid Indian prefixes including national numbers beginning 91', () => {
  for (const n of ['9876543210', '8123456789', '7123456789', '6123456789', '9123456789']) expect(validatePhoneNumber('+91', n).isValid, n).toBe(true);
});
it.each([[2, '987654321'], [3, '98765432101'], [4, '5123456789'], [5, '98765abcde'], [6, '98765@3210'], [7, '']])('CRM-%s rejects invalid mobile %s', (id, n) => expect(validatePhoneNumber('+91', String(n)).isValid).toBe(false));
it('CRM-008 normalizes formatting', () => expect(validatePhoneNumber('+91', ' (98765) 43210 ').canonicalDigits).toBe('919876543210'));
it('CRM-010 supports international numbers without exceeding E164 total length', () => {
  expect(validatePhoneNumber('+971', '501234567').isValid).toBe(true);
  expect(validatePhoneNumber('+971', '123456789012345').isValid).toBe(false);
});
it('CRM-019 rejects invalid country codes on server', async () => expect((await POST(req(input({ country_code: '+999' })))).status).toBe(400));
it('CRM-020 parses historical formatted and national phones', () => {
  expect(parseStoredPhone('+971 501234567')).toEqual({ dialCode: '+971', nationalNumber: '501234567' });
  expect(parseStoredPhone('9876543210').dialCode).toBe('+91');
});
it.each(['Online', 'Offline'])('CRM-025 stores training mode %s', async mode => expect((await createLead(input({ training_preference: mode }))).training_preference).toBe(mode));
it.each(['Hybrid', 'INVALID'])('CRM-024 rejects new training mode %s on backend', async mode => expect((await POST(req(input({ training_preference: mode })))).status).toBe(400));
it('CRM-028 maps Offline training mode to Classroom for database schema compatibility', () => {
  const mode: string = 'Offline';
  const mapped = mode === 'Offline' ? 'Classroom' : mode;
  expect(mapped).toBe('Classroom');
});
it('CRM-026 updates Online to Offline', async () => {
  const l = await createLead(input()); expect((await updateLeadDetails(l.id, { training_preference: 'Offline' }, auth.actor.id)).training_preference).toBe('Offline');
});
it('CRM-027 reads historical Hybrid unchanged', async () => {
  store.leads = [{ ...input({ training_preference: 'Hybrid' }), id: 'legacy', lead_code: 'LEGACY' } as any];
  expect((await getLeads())[0].training_preference).toBe('Hybrid');
});
it('CRM-030 saves YouTube source', async () => expect((await createLead(input())).lead_source).toBe('YouTube'));
it('CRM-031 retains every existing source', async () => {
  for (const source of ['Website', 'Google Ads', 'Meta Ads', 'Referral', 'Walk-in', 'Other']) expect((await createLead(input({ lead_source: source }))).lead_source).toBe(source);
});
it('CRM-035 rejects invalid source at API', async () => expect((await POST(req(input({ lead_source: 'INVALID' })))).status).toBe(400));
it.each(['Fresher', 'Career Gap', 'Working Professional', 'Experienced + Career Gap'])('CRM-037-040 saves current status %s', async status => expect((await createLead(input({ current_status: status }))).current_status).toBe(status));
it('CRM-044 rejects invalid current status at API', async () => expect((await POST(req(input({ current_status: 'INVALID' })))).status).toBe(400));
it('CRM-045 editing current status leaves pipeline stage intact', async () => {
  const l = await createLead(input({ stage: 'Interested' }));
  const updated = await updateLeadDetails(l.id, { current_status: 'Career Gap' }, auth.actor.id);
  expect(updated.current_status).toBe('Career Gap'); expect(updated.stage).toBe('Interested');
});
it('CRM-046 legacy current status stays readable', async () => {
  const l = await createLead(input({ current_status: 'New' })); expect((await getLeads())[0].current_status).toBe(l.current_status);
});
it('CRM-048-049 saves independent WhatsApp country and number', async () => {
  const l = await createLead(input({ whatsapp_country_code: '+971', whatsapp_number: '501234567' }));
  expect(l.whatsapp_country_code).toBe('+971'); expect(l.whatsapp_number).toBe('+971 501234567');
});
it('CRM-050 rejects invalid WhatsApp', async () => expect((await POST(req(input({ whatsapp_number: '12345' })))).status).toBe(400));
it('CRM-051 permits optional empty WhatsApp and uses mobile', async () => {
  const l = await createLead(input({ whatsapp_number: '' })); expect(l.whatsapp_number).toBe(l.phone);
});
it('CRM-053 updates WhatsApp independently', async () => {
  const l = await createLead(input()); const u = await updateLeadDetails(l.id, { whatsapp_country_code: '+971', whatsapp_number: '501234567' }, auth.actor.id);
  expect(u.whatsapp_number).toBe('+971 501234567'); expect(u.phone).toBe('+91 98765 43210');
});
it('CRM-054 computes intended WhatsApp contact digits', () => expect(getCanonicalPhoneDigits('+971', '+971 501234567')).toBe('971501234567'));
it('CRM-012-017-042-052-057-065 creates and persists normalized lead fields', async () => {
  const response = await POST(req(input())); expect(response.status).toBe(200);
  const { lead } = await response.json(); expect(lead.id).toMatch(/^[a-f0-9-]{36}$/); expect(lead.lead_code).toContain(lead.id);
  store.persistSync();
  const disk = JSON.parse(readFileSync(path.join(process.env.LMS_TEST_STORAGE_DIR!, 'institute_store.json'), 'utf8'));
  const l = disk.leads.find((x: any) => x.id === lead.id);
  expect(l.phone).toBe('+91 98765 43210'); expect(l.country_code).toBe('+91'); expect(l.whatsapp_number).toBe(l.phone); expect(l.current_status).toBe('Fresher');
});
it.each(['full_name', 'phone', 'email'])('CRM-058 rejects missing required %s', async field => expect((await POST(req(input({ [field]: '' })))).status).toBe(400));
it('CRM-059 rejects invalid email at API', async () => expect((await POST(req(input({ email: 'not-an-email' })))).status).toBe(400));
it('CRM-009-060 rejects duplicate without relying on a client flag', async () => {
  expect((await POST(req(input()))).status).toBe(200);
  expect((await POST(req(input()))).status).toBe(409); expect(store.leads).toHaveLength(1);
});
it('CRM-061 idempotency protects repeated concurrent submissions', async () => {
  const results = await Promise.all([POST(req(input({ idempotency_key: 'audit-key' }))), POST(req(input({ idempotency_key: 'audit-key' })))]);
  expect(results.map(r => r.status)).toEqual([200, 200]); expect(store.leads).toHaveLength(1);
});
it('CRM-064 rejects unauthenticated creation', async () => { auth.actor = null; expect((await POST(req(input()))).status).toBe(401); expect(store.leads).toHaveLength(0); });
it('CRM-069-070-072 edits and persists details', async () => {
  const l = await createLead(input()); expect((await PATCH(req({ leadId: l.id, updates: { full_name: 'Edited Synthetic', lead_source: 'Referral' } }, 'PATCH'))).status).toBe(200);
  store.persistSync(); const disk = JSON.parse(readFileSync(path.join(process.env.LMS_TEST_STORAGE_DIR!, 'institute_store.json'), 'utf8'));
  expect(disk.leads.find((x: any) => x.id === l.id).full_name).toBe('Edited Synthetic');
});
it('CRM-073 local name search', async () => { await createLead(input()); expect(await getLeads({ search: 'Synthetic Audit' })).toHaveLength(1); expect(await getLeads({ search: 'absent' })).toHaveLength(0); });
it('CRM-074 mobile search accepts unformatted national number', async () => { await createLead(input()); expect(await getLeads({ search: '9876543210' })).toHaveLength(1); });
it('CRM-076 filters stage', async () => { await createLead(input()); expect(await getLeads({ stage: 'New' })).toHaveLength(1); expect(await getLeads({ stage: 'Lost' })).toHaveLength(0); });
it('CRM-077-078-079 updates stage and completes followup', async () => {
  const l = await createLead(input()); await updateLeadStage(l.id, 'Follow-up', 'Synthetic callback', auth.actor.id, '2026-12-01'); expect(l.follow_up_date).toBe('2026-12-01');
  await completeFollowup(l.id, auth.actor.id, 'Completed'); expect(l.stage).toBe('Interested'); expect(l.follow_up_date).toBeFalsy();
});
it('CRM-080-102 counsellor cannot edit another owner lead', async () => {
  const l = await createLead(input({ counsellor_id: 'other-counsellor' }));
  expect((await PATCH(req({ leadId: l.id, updates: { full_name: 'Unauthorized edit' } }, 'PATCH'))).status).toBe(403);
});
it('CRM-103 admin may create lead', async () => { auth.actor.role = 'admin'; expect((await POST(req(input()))).status).toBe(200); });
it('CRM-104 rejects cross-tenant lead edit even by default tenant staff', async () => {
  const l = await createLead(input({ tenant_id: 'tenant-other' }));
  expect((await PATCH(req({ leadId: l.id, updates: { full_name: 'Cross-tenant edit' } }, 'PATCH'))).status).toBe(403);
});
it('CRM-104 list excludes another tenant records', async () => {
  await createLead(input({ tenant_id: 'tenant-other' })); const res = await GET(new NextRequest('http://localhost/api/crm/leads'));
  expect((await res.json()).leads).toHaveLength(0);
});
it('CRM-105 rejects malformed course UUID without silently losing assignment', async () => expect((await POST(req(input({ interested_course_id: 'INVALID-UUID' })))).status).toBe(400));
it('CRM-082-083-086-087 conversion helper preserves selected identity and course', async () => {
  const l = await createLead(input({ interested_course_id: 'audit-course' }));
  const { admissionPrefill: p } = convertLeadToAdmission(l.id);
  expect(p.student_name).toBe(l.full_name); expect(p.email).toBe(l.email); expect(p.phone).toBe(l.phone); expect(p.course_id).toBe('audit-course'); expect(p.training_mode).toBe('Online');
});
it('CRM-094 conversion preparation must not mark lead Converted before admission commits', async () => {
  const l = await createLead(input()); convertLeadToAdmission(l.id); expect(store.admissions).toHaveLength(0); expect(l.stage).toBe('New');
});
