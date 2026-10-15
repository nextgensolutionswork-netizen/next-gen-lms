import type * as Service from './onboarding-service';
import { store } from './data-store';

async function call(path: string, body?: unknown, method = 'PATCH') {
  const response = await fetch(`/api/onboarding${path}`, { method: body ? method : 'GET', headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' });
  const data = await response.json();
  if (!response.ok || !data.success) throw new Error(data.error || 'Onboarding request failed.');
  if (data.case) store.onboardingCases = [data.case, ...store.onboardingCases.filter((c) => c.id !== data.case.id)];
  return data;
}
async function change(id: string, action: string, values: object = {}) { return call(`/cases/${encodeURIComponent(id)}`, { action, ...values }); }
export const getOnboardingCases: typeof Service.getOnboardingCases = async (_user, filters) => {
  const query = new URLSearchParams(Object.entries(filters || {}).filter(([, v]) => !!v) as [string, string][]);
  const data = await call(`/cases?${query}`);
  store.onboardingCases = data.cases;
  return data.cases;
};
export const getOnboardingKpis: typeof Service.getOnboardingKpis = async () => (await call('/analytics')).kpis;
export const getEligibleOnboardingStaff: typeof Service.getEligibleOnboardingStaff = async () => (await call('/analytics')).eligibleStaff || [];
export const getOnboardingStaffPerformance: typeof Service.getOnboardingStaffPerformance = async () => (await call('/analytics')).staffPerformance || [];
export const getUnbackfilledAdmissionsCount: typeof Service.getUnbackfilledAdmissionsCount = async () => (await call('/analytics')).unbackfilledCount || 0;
export const getOnboardingAuditLogs: typeof Service.getOnboardingAuditLogs = async (id) => (await call(`/cases/${encodeURIComponent(id)}`)).auditEvents;
export const assignOnboardingStaff: typeof Service.assignOnboardingStaff = async (id, staffId) => (await change(id, 'assign_staff', { staffId })).case;
export const updateChecklistItem: typeof Service.updateChecklistItem = async (id, itemKey, completed, notes) => (await change(id, 'update_checklist', { itemKey, completed, notes })).case;
export const uploadStudentDocument: typeof Service.uploadStudentDocument = async (id, doc) => (await change(id, 'upload_document', doc)).case;
export const verifyStudentDocument: typeof Service.verifyStudentDocument = async (id, docId, status, rejectionReason) => (await change(id, 'verify_document', { documentId: docId, status, rejectionReason })).case;
export const provisionStudentLmsAccount: typeof Service.provisionStudentLmsAccount = async (id) => { const data = await change(id, 'provision_lms'); return { ...data, caseRecord: data.case }; };
export const arrangeStudentOrientation: typeof Service.arrangeStudentOrientation = async (id, orientationDate, orientationMode, orientationNotes) => (await change(id, 'arrange_orientation', { orientationDate, orientationMode, orientationNotes })).case;
export const dispatchStudentWelcomeNotification: typeof Service.dispatchStudentWelcomeNotification = async (id, _user, options) => { const data = await change(id, 'dispatch_welcome_notification', options); return { ...data, caseRecord: data.case }; };
export const confirmStudentPortalAccess: typeof Service.confirmStudentPortalAccess = async (id, notes) => (await change(id, 'confirm_portal_access', { notes })).case;
export const setCaseBlocked: typeof Service.setCaseBlocked = async (id, reason) => (await change(id, 'block_case', { reason })).case;
export const unblockCase: typeof Service.unblockCase = async (id) => (await change(id, 'unblock_case')).case;
export const completeOnboardingWorkflow: typeof Service.completeOnboardingWorkflow = async (id) => (await change(id, 'complete_workflow')).case;
export const backfillLegacyAdmissions: typeof Service.backfillLegacyAdmissions = async () => (await call('/backfill', {}, 'POST')).result;
