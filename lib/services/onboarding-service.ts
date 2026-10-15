import { store } from './data-store';
import { assertSameTenant, tenantId } from '@/lib/auth/tenant';
import { paymentNotification } from './payment-events';
import type { StudentPaymentRecord } from '@/types';
import {
  OnboardingCase,
  OnboardingStatus,
  OnboardingChecklistKey,
  OnboardingChecklistItem,
  OnboardingDocument,
  OnboardingAuditEvent,
  OnboardingKpis,
  OnboardingStaffPerformance,
  LegacyBackfillResult,
  UserProfile,
  Admission,
  Student,
} from '@/types';
import { canAccessOnboardingCase, canAssignOnboardingStaff } from '@/lib/auth/rbac';
import {
  dispatchMultiChannelNotification,
  sendMultiChannelNotification,
  sendResendEmail,
  buildStudentWelcomeEmailHtml,
} from './notification-service';

export interface OnboardingFilters {
  search?: string;
  status?: string;
  courseId?: string;
  staffId?: string;
}

export function buildDefaultChecklist(): Record<OnboardingChecklistKey, OnboardingChecklistItem> {
  return {
    admission_confirmation: {
      key: 'admission_confirmation',
      title: 'Admission & Enrollment Verification',
      description: 'Confirm verified admission number, student code, and enrollment record',
      completed: true, // Auto-verified when admission confirmed
      completed_at: new Date().toISOString(),
      mandatory: true,
    },
    student_details_verification: {
      key: 'student_details_verification',
      title: 'Student Details & Contact Confirmation',
      description: 'Confirm phone, email, WhatsApp, residential address, and qualification background',
      completed: false,
      mandatory: true,
    },
    document_verification: {
      key: 'document_verification',
      title: 'Required Student Documents Check',
      description: 'Verify government ID proof, degree certificates, and passport photo in storage',
      completed: false,
      mandatory: true,
    },
    course_confirmation: {
      key: 'course_confirmation',
      title: 'Course Selection Verification',
      description: 'Verify registered SAP module curriculum, training mode, and syllabus alignment',
      completed: false,
      mandatory: true,
    },
    batch_allocation: {
      key: 'batch_allocation',
      title: 'Batch Assignment Coordination',
      description: 'Coordinate batch timetable, schedule slot, and primary faculty assignment',
      completed: false,
      mandatory: true,
    },
    fee_clearance_verification: {
      key: 'fee_clearance_verification',
      title: 'Financial Clearance Verification',
      description: 'Verify initial fee payment clearance without modifying accounts or ledgers',
      completed: false,
      mandatory: true,
    },
    lms_account_activation: {
      key: 'lms_account_activation',
      title: 'LMS Account Provisioning & Activation',
      description: 'Coordinate LMS portal credentials and ensure active student portal access',
      completed: false,
      mandatory: true,
    },
    welcome_notification: {
      key: 'welcome_notification',
      title: 'Welcome Notification & Guidelines Dispatched',
      description: 'Send official onboarding kit, LMS access guide, and academic calendar',
      completed: false,
      mandatory: true,
    },
    orientation_confirmation: {
      key: 'orientation_confirmation',
      title: 'Student Orientation Confirmation',
      description: 'Coordinate and confirm attendance at scheduled orientation session',
      completed: false,
      mandatory: true,
    },
    first_class_confirmation: {
      key: 'first_class_confirmation',
      title: 'First-Class Session Confirmation',
      description: 'Confirm successful first class attendance, live lab, and server connectivity',
      completed: false,
      mandatory: true,
    },
    academic_handover: {
      key: 'academic_handover',
      title: 'Academic Operations Handover',
      description: 'Formal handover to academic operations desk, trainer, and support mentor',
      completed: false,
      mandatory: true,
    },
  };
}

function recordAuditEvent(
  caseId: string,
  action: string,
  actor: UserProfile,
  details: string
): void {
  const event: OnboardingAuditEvent = {
    tenant_id: tenantId(actor),
    id: `onb-aud-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    case_id: caseId,
    timestamp: new Date().toISOString(),
    action,
    actor_id: actor.id,
    actor_name: actor.full_name,
    actor_role: actor.role,
    details,
  };
  store.onboardingAuditLogs.unshift(event);
  store.persist();
}

/**
 * Retrieves onboarding cases scoped by user permissions and filters.
 * Super Admin & Admin see all cases.
 * Onboarding Team members ONLY see cases assigned to them.
 */
export async function getOnboardingCases(
  user: UserProfile,
  filters?: OnboardingFilters
): Promise<OnboardingCase[]> {
  if (!user || !user.is_active) return [];

  let cases: OnboardingCase[] = [];

  if (user.role === 'super_admin' || user.role === 'admin') {
    cases = store.onboardingCases.filter((c) => tenantId(c) === tenantId(user));
  } else if (user.role === 'onboarding_team') {
    cases = store.onboardingCases.filter((c) => c.assigned_staff_id === user.id && tenantId(c) === tenantId(user));
  } else {
    // Default-deny for any other role
    return [];
  }

  if (filters?.search?.trim()) {
    const q = filters.search.toLowerCase().trim();
    cases = cases.filter(
      (c) =>
        c.student_name?.toLowerCase().includes(q) ||
        c.admission_number?.toLowerCase().includes(q) ||
        c.case_number?.toLowerCase().includes(q) ||
        c.student_email?.toLowerCase().includes(q) ||
        c.student_phone?.includes(q)
    );
  }

  if (filters?.status && filters.status !== 'All') {
    cases = cases.filter((c) => c.status === filters.status);
  }

  if (filters?.courseId && filters.courseId !== 'All') {
    cases = cases.filter((c) => c.course_id === filters.courseId);
  }

  if (filters?.staffId && filters.staffId !== 'All') {
    cases = cases.filter((c) => c.assigned_staff_id === filters.staffId);
  }

  return cases.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

/**
 * Retrieves a single onboarding case by ID with assignment-level authorization.
 */
export async function getOnboardingCaseById(
  id: string,
  user: UserProfile
): Promise<OnboardingCase | undefined> {
  const caseRecord = store.onboardingCases.find((c) => c.id === id);
  if (!caseRecord) return undefined;

  if (!canAccessOnboardingCase(user, caseRecord)) {
    throw new Error('Access denied: You are not authorized to view this onboarding case.');
  }

  return caseRecord;
}

/**
 * Computes dashboard KPIs scoped to the requesting user.
 */
export async function getOnboardingKpis(user: UserProfile): Promise<OnboardingKpis> {
  const cases = await getOnboardingCases(user);
  const now = new Date();

  return {
    total: cases.length,
    pending: cases.filter((c) => c.status === 'pending').length,
    inProgress: cases.filter((c) => c.status === 'in_progress').length,
    completed: cases.filter((c) => c.status === 'completed').length,
    blocked: cases.filter((c) => c.status === 'blocked').length,
    overdue: cases.filter(
      (c) => c.status !== 'completed' && c.due_date && new Date(c.due_date) < now
    ).length,
  };
}

/**
 * Initializes an onboarding case from an authorized admission.
 * IDEMPOTENT: Prevents duplicate onboarding cases for the same admission or student.
 * STRICT: Only Confirmed admissions are allowed to enter onboarding.
 */
export async function ensureOnboardingCaseForAdmission(
  admissionId: string,
  performedByUserId?: string
): Promise<OnboardingCase> {
  return initializeOnboardingCase(admissionId, performedByUserId);
}

function initializeOnboardingCase(
  admissionId: string,
  performedByUserId?: string
): OnboardingCase {
  // Check if case already exists for this admission
  const existing = store.onboardingCases.find((c) => c.admission_id === admissionId);
  if (existing) {
    const actor = store.users.find((u) => u.id === performedByUserId);
    if (actor) assertSameTenant(actor, existing);
    return existing;
  }

  const admission = store.admissions.find((a) => a.id === admissionId);
  if (!admission) {
    throw new Error(`Admission not found: ${admissionId}`);
  }
  const initiatingUser = store.users.find((u) => u.id === performedByUserId);
  if (initiatingUser) assertSameTenant(initiatingUser, admission);

  if (admission.status !== 'Confirmed') {
    throw new Error(
      `Cannot initialize onboarding: Admission status is '${admission.status}'. Only Confirmed admissions are eligible for onboarding.`
    );
  }

  const student = store.students.find(
    (s) => s.admission_id === admission.id || s.admission_number === admission.admission_number
  );
  if (!student) {
    throw new Error(`Student record not found for admission: ${admission.admission_number}`);
  }

  // Double-check no existing case for this student
  const existingStudentCase = store.onboardingCases.find((c) => c.student_id === student.id);
  if (existingStudentCase) {
    return existingStudentCase;
  }

  const actor =
    store.users.find((u) => u.id === performedByUserId) ||
    store.users.find((u) => u.role === 'admin') || {
      id: 'system',
      full_name: 'Admissions Automation',
      role: 'admin' as const,
      email: 'system@next-gen.com',
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

  const caseSeq = store.onboardingCases.length + 1;
  const caseNumber = `ONB-2026-${String(caseSeq).padStart(4, '0')}`;

  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 7); // Default 7-day onboarding SLA

  const checklist = buildDefaultChecklist();
  checklist.admission_confirmation.completed = true;
  checklist.admission_confirmation.completed_at = new Date().toISOString();
  checklist.admission_confirmation.completed_by = actor.id;
  checklist.admission_confirmation.completed_by_name = actor.full_name;
  checklist.admission_confirmation.notes = `Admission ${admission.admission_number} confirmed with course ${admission.course_name}`;

  const newCase: OnboardingCase = {
    tenant_id: tenantId(admission),
    id: `onb-${crypto.randomUUID()}`,
    case_number: caseNumber,
    admission_id: admission.id,
    admission_number: admission.admission_number,
    student_id: student.id,
    student_name: student.full_name,
    student_email: student.email,
    student_phone: student.phone,
    course_id: student.course_id,
    course_name: student.course_name || 'SAP Course',
    batch_id: student.batch_id,
    batch_name: student.batch_name,
    trainer_id: student.trainer_id,
    trainer_name: student.trainer_name,
    status: 'pending',
    checklist,
    documents: [],
    lms_account_created: false,
    portal_access_confirmed: false,
    academic_handover_confirmed: false,
    due_date: dueDate.toISOString().slice(0, 10),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  store.onboardingCases.unshift(newCase);
  store.persist();

  recordAuditEvent(
    newCase.id,
    'CASE_INITIALIZED',
    actor,
    `Onboarding case ${newCase.case_number} created from confirmed admission ${admission.admission_number}`
  );

  return newCase;
}

/** A cleared partial payment is sufficient to enter onboarding, never to activate LMS access. */
export function forwardApprovedPaymentToOnboarding(payment: StudentPaymentRecord, actor: UserProfile): OnboardingCase | undefined {
  if (payment.verification_status !== 'Verified') return;
  const student = store.students.find((s) => s.id === payment.student_id && tenantId(s) === tenantId(actor));
  const admission = store.admissions.find((a) => a.id === (payment.enrollment_id || student?.admission_id) && tenantId(a) === tenantId(actor));
  if (!student || admission?.status !== 'Confirmed') return;
  const caseRecord = initializeOnboardingCase(admission.id, actor.id);
  assertSameTenant(actor, caseRecord);
  if (caseRecord.status === 'completed') return caseRecord;
  const item = caseRecord.checklist.fee_clearance_verification;
  item.completed = true;
  item.completed_by = actor.id;
  item.completed_by_name = actor.full_name;
  item.completed_at = payment.verified_at;
  item.notes = `Accounts approved payment ${payment.id}; receipt ${payment.receipt_number}.`;
  const staff = store.users.filter((u) => u.role === 'onboarding_team' && u.is_active && tenantId(u) === tenantId(actor));
  if (!caseRecord.assigned_staff_id && staff.length) {
    staff.sort((a, b) => store.onboardingCases.filter((c) => c.assigned_staff_id === a.id && c.status !== 'completed').length - store.onboardingCases.filter((c) => c.assigned_staff_id === b.id && c.status !== 'completed').length || a.id.localeCompare(b.id));
    caseRecord.assigned_staff_id = staff[0].id;
    caseRecord.assigned_staff_name = staff[0].full_name;
    caseRecord.assigned_at = new Date().toISOString();
    recordAuditEvent(caseRecord.id, 'STAFF_ASSIGNED', actor, `Automatically assigned to ${staff[0].full_name} after Accounts approval.`);
  }
  caseRecord.updated_at = new Date().toISOString();
  const recipients = staff.length ? staff : store.users.filter((u) => ['admin', 'super_admin'].includes(u.role) && u.is_active && tenantId(u) === tenantId(actor));
  recipients.forEach((u) => paymentNotification(u, 'Student ready for onboarding', `${student.full_name}: admission confirmed and payment approved.${staff.length ? '' : ' Assign an onboarding staff member.'}`, '/onboarding', `onboarding-ready:${caseRecord.id}`));
  return caseRecord;
}

/**
 * Assigns or reassigns an onboarding case to an onboarding specialist.
 * Restricted to Super Admin and Admin roles.
 */
export async function assignOnboardingStaff(
  caseId: string,
  staffId: string,
  performedBy: UserProfile
): Promise<OnboardingCase> {
  if (!canAssignOnboardingStaff(performedBy)) {
    throw new Error('Unauthorized: Only administrators can assign onboarding staff.');
  }

  const caseRecord = store.onboardingCases.find((c) => c.id === caseId);
  if (!caseRecord) {
    throw new Error(`Onboarding case not found: ${caseId}`);
  }

  const staff = store.users.find((u) => u.id === staffId);
  if (!staff || !staff.is_active) {
    throw new Error('Assigned staff member not found or is inactive.');
  }
  assertSameTenant(performedBy, caseRecord);
  assertSameTenant(performedBy, staff);

  if (
    staff.role !== 'onboarding_team' &&
    staff.role !== 'admin' &&
    staff.role !== 'super_admin'
  ) {
    throw new Error('User does not have an onboarding or administrative role.');
  }

  const prevStaff = caseRecord.assigned_staff_name || 'Unassigned';
  caseRecord.assigned_staff_id = staff.id;
  caseRecord.assigned_staff_name = staff.full_name;
  caseRecord.assigned_at = new Date().toISOString();
  if (caseRecord.status === 'pending') {
    caseRecord.status = 'in_progress';
  }
  caseRecord.updated_at = new Date().toISOString();

  store.persist();

  recordAuditEvent(
    caseRecord.id,
    'STAFF_ASSIGNED',
    performedBy,
    `Assigned staff changed from ${prevStaff} to ${staff.full_name}`
  );

  return caseRecord;
}

/**
 * Updates a checklist item with validation and audit logging.
 */
export async function updateChecklistItem(
  caseId: string,
  itemKey: OnboardingChecklistKey,
  completed: boolean,
  notes: string | undefined,
  performedBy: UserProfile
): Promise<OnboardingCase> {
  const caseRecord = store.onboardingCases.find((c) => c.id === caseId);
  if (!caseRecord) {
    throw new Error(`Onboarding case not found: ${caseId}`);
  }

  if (!canAccessOnboardingCase(performedBy, caseRecord)) {
    throw new Error('Access denied: You are not authorized to update this onboarding case.');
  }

  if (caseRecord.status === 'completed') {
    throw new Error('Cannot update checklist: This onboarding case is already completed.');
  }

  const item = caseRecord.checklist[itemKey];
  if (!item) {
    throw new Error(`Invalid checklist item key: ${itemKey}`);
  }
  if (itemKey === 'lms_account_activation') throw new Error('Use the LMS activation action after completing the required checks.');
  if (itemKey === 'fee_clearance_verification' && completed && !store.studentPayments.some((p) => p.student_id === caseRecord.student_id && tenantId(p) === tenantId(caseRecord) && p.verification_status === 'Verified' && (!p.enrollment_id || p.enrollment_id === caseRecord.admission_id))) throw new Error('Accounts must approve a payment before financial clearance.');

  item.completed = completed;
  if (completed) {
    item.completed_at = new Date().toISOString();
    item.completed_by = performedBy.id;
    item.completed_by_name = performedBy.full_name;
  } else {
    item.completed_at = undefined;
    item.completed_by = undefined;
    item.completed_by_name = undefined;
  }
  if (notes !== undefined) {
    item.notes = notes;
  }

  if (caseRecord.status === 'pending' && completed) {
    caseRecord.status = 'in_progress';
  }
  caseRecord.updated_at = new Date().toISOString();

  store.persist();

  recordAuditEvent(
    caseRecord.id,
    completed ? 'CHECKLIST_ITEM_COMPLETED' : 'CHECKLIST_ITEM_REOPENED',
    performedBy,
    `Checklist "${item.title}" marked as ${completed ? 'Completed' : 'Incomplete'}${notes ? ` (Notes: ${notes})` : ''}`
  );

  // If welcome_notification was marked completed, automatically dispatch multi-channel notification
  if (itemKey === 'welcome_notification' && completed) {
    try {
      await dispatchStudentWelcomeNotification(caseId, performedBy);
    } catch (notifErr) {
      console.warn('[updateChecklistItem] Could not auto-dispatch welcome notification:', notifErr);
    }
  }

  return caseRecord;
}

/**
 * Securely uploads a student document and updates the case record.
 */
export async function uploadStudentDocument(
  caseId: string,
  doc: {
    name: string;
    doc_type: OnboardingDocument['doc_type'];
    file_url: string;
  },
  performedBy: UserProfile
): Promise<OnboardingCase> {
  const caseRecord = store.onboardingCases.find((c) => c.id === caseId);
  if (!caseRecord) {
    throw new Error(`Onboarding case not found: ${caseId}`);
  }

  if (!canAccessOnboardingCase(performedBy, caseRecord)) {
    throw new Error('Access denied: You are not authorized to upload documents for this case.');
  }

  const newDoc: OnboardingDocument = {
    id: `doc-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    name: doc.name,
    doc_type: doc.doc_type,
    status: 'pending',
    file_url: doc.file_url,
    uploaded_at: new Date().toISOString(),
  };

  caseRecord.documents.push(newDoc);
  caseRecord.updated_at = new Date().toISOString();
  store.persist();

  recordAuditEvent(
    caseRecord.id,
    'DOCUMENT_UPLOADED',
    performedBy,
    `Uploaded document "${newDoc.name}" (${newDoc.doc_type})`
  );

  return caseRecord;
}

/**
 * Verifies or rejects a student document.
 */
export async function verifyStudentDocument(
  caseId: string,
  docId: string,
  status: 'verified' | 'rejected',
  rejectionReason: string | undefined,
  performedBy: UserProfile
): Promise<OnboardingCase> {
  const caseRecord = store.onboardingCases.find((c) => c.id === caseId);
  if (!caseRecord) {
    throw new Error(`Onboarding case not found: ${caseId}`);
  }

  if (!canAccessOnboardingCase(performedBy, caseRecord)) {
    throw new Error('Access denied: You are not authorized to verify documents for this case.');
  }

  const doc = caseRecord.documents.find((d) => d.id === docId);
  if (!doc) {
    throw new Error(`Document not found: ${docId}`);
  }

  doc.status = status;
  if (status === 'verified') {
    doc.verified_at = new Date().toISOString();
    doc.verified_by = performedBy.full_name;
    doc.rejection_reason = undefined;
  } else {
    doc.verified_at = undefined;
    doc.verified_by = undefined;
    doc.rejection_reason = rejectionReason || 'Document did not meet verification criteria';
  }

  // If all documents are verified and at least 2 are present, auto-mark document_verification
  const allVerified =
    caseRecord.documents.length >= 2 &&
    caseRecord.documents.every((d) => d.status === 'verified');
  if (allVerified) {
    caseRecord.checklist.document_verification.completed = true;
    caseRecord.checklist.document_verification.completed_at = new Date().toISOString();
    caseRecord.checklist.document_verification.completed_by = performedBy.id;
    caseRecord.checklist.document_verification.completed_by_name = performedBy.full_name;
  }

  caseRecord.updated_at = new Date().toISOString();
  store.persist();

  recordAuditEvent(
    caseRecord.id,
    status === 'verified' ? 'DOCUMENT_VERIFIED' : 'DOCUMENT_REJECTED',
    performedBy,
    `Document "${doc.name}" marked as ${status}${rejectionReason ? ` (Reason: ${rejectionReason})` : ''}`
  );

  return caseRecord;
}

/**
 * Provisions student LMS account access.
 * PRIVILEGED & AUDITED: Safe activation without exposing temporary passwords or service keys.
 * IDEMPOTENT: Safe against repeated activation calls.
 */
export async function provisionStudentLmsAccount(
  caseId: string,
  performedBy: UserProfile
): Promise<{ success: boolean; message: string; caseRecord: OnboardingCase }> {
  const caseRecord = store.onboardingCases.find((c) => c.id === caseId);
  if (!caseRecord) {
    throw new Error(`Onboarding case not found: ${caseId}`);
  }

  if (!canAccessOnboardingCase(performedBy, caseRecord)) {
    throw new Error('Access denied: You are not authorized to provision LMS access for this case.');
  }

  assertSameTenant(performedBy, caseRecord);
  const prerequisites: OnboardingChecklistKey[] = ['admission_confirmation', 'student_details_verification', 'document_verification', 'course_confirmation', 'batch_allocation', 'fee_clearance_verification'];
  if (caseRecord.status === 'blocked') throw new Error('Cannot activate LMS access while onboarding is blocked.');
  if (prerequisites.some((key) => !caseRecord.checklist[key]?.completed)) throw new Error('Cannot activate LMS access until admission, identity, documents, course, batch, and payment checks are completed.');
  const admission = store.admissions.find((a) => a.id === caseRecord.admission_id && tenantId(a) === tenantId(performedBy));
  const approvedPayment = store.studentPayments.some((p) => p.student_id === caseRecord.student_id && tenantId(p) === tenantId(performedBy) && p.verification_status === 'Verified' && (!p.enrollment_id || p.enrollment_id === caseRecord.admission_id));
  if (admission?.status !== 'Confirmed' || !approvedPayment) throw new Error('Confirmed admission and an Accounts-approved payment are required for LMS activation.');
  if (caseRecord.lms_account_created) return { success: true, message: 'LMS account is already activated.', caseRecord };

  // Find student user profile
  let studentUser = store.users.find(
    (u) =>
      tenantId(u) === tenantId(caseRecord) && u.role === 'student' &&
      (u.email.toLowerCase() === caseRecord.student_email.toLowerCase() || u.id === caseRecord.student_id)
  );

  if (studentUser) {
    studentUser.is_active = true;
    studentUser.role = 'student';
    studentUser.updated_at = new Date().toISOString();
  } else {
    // Create student user account
    studentUser = {
      tenant_id: tenantId(caseRecord),
      id: `usr-${caseRecord.student_id}`,
      email: caseRecord.student_email,
      full_name: caseRecord.student_name,
      role: 'student',
      phone: caseRecord.student_phone,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    store.users.push(studentUser);
  }

  // Update student status
  const student = store.students.find((s) => s.id === caseRecord.student_id);
  if (student) {
    student.status = 'Active';
    student.updated_at = new Date().toISOString();
  }

  // Update onboarding case record
  caseRecord.lms_account_created = true;
  caseRecord.lms_account_activated_at = new Date().toISOString();
  caseRecord.checklist.lms_account_activation.completed = true;
  caseRecord.checklist.lms_account_activation.completed_at = new Date().toISOString();
  caseRecord.checklist.lms_account_activation.completed_by = performedBy.id;
  caseRecord.checklist.lms_account_activation.completed_by_name = performedBy.full_name;
  caseRecord.checklist.lms_account_activation.notes = `LMS Portal activated for ${caseRecord.student_email}`;

  caseRecord.updated_at = new Date().toISOString();
  store.persist();

  recordAuditEvent(
    caseRecord.id,
    'LMS_ACCOUNT_PROVISIONED',
    performedBy,
    `LMS access provisioned and enabled for ${caseRecord.student_name} (${caseRecord.student_email})`
  );

  // Hook provisionStudentLmsAccount directly to sendResendEmail() and sendMultiChannelNotification()
  try {
    const loginUrl = `${typeof window !== 'undefined' ? window.location.origin : 'https://lms.next-generpsolutions.com'}/login`;
    const coordinator = caseRecord.assigned_staff_name || performedBy.full_name;

    const welcomeEmailHtml = buildStudentWelcomeEmailHtml({
      studentName: caseRecord.student_name,
      courseName: caseRecord.course_name,
      admissionNumber: caseRecord.admission_number,
      batchName: caseRecord.batch_name || 'SAP Core Batch',
      orientationDate: caseRecord.orientation_date,
      orientationMode: caseRecord.orientation_mode || 'Hybrid',
      portalUrl: loginUrl,
      coordinatorName: coordinator,
      helpdeskEmail: 'onboarding@next-generpsolutions.com',
    });

    // 1. Transactional Welcome Email via Resend
    await sendResendEmail({
      to: caseRecord.student_email,
      subject: `Welcome to Next-Gen ERP LMS – Student Portal Credentials & Batch Schedule`,
      html: welcomeEmailHtml,
      text: `Hello ${caseRecord.student_name}, your student portal account has been activated. Login link: ${loginUrl}. Batch: ${caseRecord.batch_name || 'SAP Core Batch'}.`,
    });

    // 2. Real-time Multi-Channel Notification Dispatch (In-App, Realtime Stream, WhatsApp)
    await sendMultiChannelNotification({
      userId: studentUser.id,
      recipientName: caseRecord.student_name,
      recipientEmail: caseRecord.student_email,
      recipientPhone: caseRecord.student_phone,
      title: 'LMS Student Portal Provisioned & Activated',
      message: `Your student portal account is now active. Log in at /login. Assigned Batch: ${caseRecord.batch_name || 'SAP Core Batch'}. Orientation: ${caseRecord.orientation_date || 'Pending Schedule'}.`,
      category: 'onboarding',
      type: 'success',
      channels: ['in_app', 'email', 'whatsapp'],
      actionUrl: '/login',
      metadata: {
        htmlTemplate: welcomeEmailHtml,
        loginUrl,
        batchName: caseRecord.batch_name || 'SAP Core Batch',
        admissionNumber: caseRecord.admission_number,
      },
    });

    // Mark welcome_notification checklist item completed
    if (!caseRecord.checklist.welcome_notification) {
      caseRecord.checklist.welcome_notification = {
        key: 'welcome_notification',
        title: 'Welcome Notification & Guidelines Dispatched',
        description: 'Send official onboarding kit, LMS access guide, and academic calendar',
        completed: false,
        mandatory: true,
      };
    }
    caseRecord.checklist.welcome_notification.completed = true;
    caseRecord.checklist.welcome_notification.completed_at = new Date().toISOString();
    caseRecord.checklist.welcome_notification.completed_by = performedBy.id;
    caseRecord.checklist.welcome_notification.completed_by_name = performedBy.full_name;
    caseRecord.checklist.welcome_notification.notes = `Welcome credentials and login link (/login) dispatched to ${caseRecord.student_email}`;
    store.persist();
  } catch (err) {
    console.warn('[provisionStudentLmsAccount] Notification dispatch error:', err);
  }

  return {
    success: true,
    message: `LMS account activated successfully for ${caseRecord.student_name}. Access credentials dispatched via secure notification.`,
    caseRecord,
  };
}

/**
 * Arranges student orientation session.
 */
export async function arrangeStudentOrientation(
  caseId: string,
  orientationDate: string,
  mode: 'Online' | 'Classroom' | 'Hybrid',
  notes: string | undefined,
  performedBy: UserProfile
): Promise<OnboardingCase> {
  const caseRecord = store.onboardingCases.find((c) => c.id === caseId);
  if (!caseRecord) {
    throw new Error(`Onboarding case not found: ${caseId}`);
  }

  if (!canAccessOnboardingCase(performedBy, caseRecord)) {
    throw new Error('Access denied: You are not authorized to arrange orientation for this case.');
  }

  caseRecord.orientation_date = orientationDate;
  caseRecord.orientation_mode = mode;
  caseRecord.checklist.orientation_confirmation.completed = true;
  caseRecord.checklist.orientation_confirmation.completed_at = new Date().toISOString();
  caseRecord.checklist.orientation_confirmation.completed_by = performedBy.id;
  caseRecord.checklist.orientation_confirmation.completed_by_name = performedBy.full_name;
  caseRecord.checklist.orientation_confirmation.notes = `Orientation scheduled on ${orientationDate} (${mode})${notes ? `: ${notes}` : ''}`;

  caseRecord.updated_at = new Date().toISOString();
  store.persist();

  recordAuditEvent(
    caseRecord.id,
    'ORIENTATION_SCHEDULED',
    performedBy,
    `Orientation confirmed for ${orientationDate} via ${mode}`
  );

  // Auto-dispatch orientation update via multi-channel notification
  try {
    await dispatchStudentWelcomeNotification(caseId, performedBy, {
      orientationDate,
      orientationMode: mode,
      customMessage: `Your student orientation for ${caseRecord.course_name} is confirmed for ${orientationDate} (${mode}).`,
    });
  } catch (notifErr) {
    console.warn('[arrangeStudentOrientation] Could not auto-dispatch orientation update:', notifErr);
  }

  return caseRecord;
}

/**
 * Dispatches multi-channel welcome notification with orientation kit and portal credentials
 * via Resend Email and WhatsApp to the student.
 */
export async function dispatchStudentWelcomeNotification(
  caseId: string,
  performedBy: UserProfile,
  options?: {
    orientationDate?: string;
    orientationMode?: string;
    customMessage?: string;
  }
): Promise<{
  success: boolean;
  message: string;
  caseRecord: OnboardingCase;
  dispatchResult: any;
}> {
  const caseRecord = store.onboardingCases.find((c) => c.id === caseId);
  if (!caseRecord) {
    throw new Error(`Onboarding case not found: ${caseId}`);
  }

  if (!canAccessOnboardingCase(performedBy, caseRecord)) {
    throw new Error('Access denied: You are not authorized to dispatch welcome notifications for this case.');
  }

  // Update orientation info if provided
  if (options?.orientationDate) {
    caseRecord.orientation_date = options.orientationDate;
  }
  if (options?.orientationMode) {
    caseRecord.orientation_mode = options.orientationMode as any;
  }

  const portalUrl = process.env.NEXT_PUBLIC_APP_URL
    ? `${process.env.NEXT_PUBLIC_APP_URL}/portal`
    : 'http://localhost:3000/portal';

  const coordinator = caseRecord.assigned_staff_name || performedBy.full_name;

  const emailHtml = buildStudentWelcomeEmailHtml({
    studentName: caseRecord.student_name,
    courseName: caseRecord.course_name,
    admissionNumber: caseRecord.admission_number,
    batchName: caseRecord.batch_name,
    orientationDate: caseRecord.orientation_date,
    orientationMode: caseRecord.orientation_mode,
    portalUrl,
    coordinatorName: coordinator,
  });

  const waOrientationDetails = caseRecord.orientation_date
    ? `\n🗓 *Orientation*: ${caseRecord.orientation_date} (${caseRecord.orientation_mode || 'Online'})`
    : '';

  const waText = `*Welcome to Next-Gen ERP Solutions Academy!* 🎉\n\nDear ${caseRecord.student_name},\nYour enrollment for *${caseRecord.course_name}* (Adm: ${caseRecord.admission_number}) is confirmed!${waOrientationDetails}\n🎓 *Batch*: ${caseRecord.batch_name || 'To Be Announced'}\n💻 *Student Portal*: ${portalUrl}\n\nYour onboarding coordinator is *${coordinator}*.\nPlease log in to your portal to review class schedules and access the learning center.\n\n_Next-Gen ERP LMS Team_`;

  // Dispatch multi-channel notification
  const dispatchResult = await dispatchMultiChannelNotification({
    userId: caseRecord.student_id,
    recipientName: caseRecord.student_name,
    recipientEmail: caseRecord.student_email,
    recipientPhone: caseRecord.student_phone,
    title: `Welcome to Next-Gen ERP: ${caseRecord.course_name} Orientation Kit`,
    message:
      options?.customMessage ||
      `Welcome to Next-Gen ERP Solutions! Your onboarding kit, portal access link, and orientation details for ${caseRecord.course_name} have been prepared.`,
    category: 'onboarding',
    type: 'success',
    channels: ['in_app', 'email', 'whatsapp'],
    actionUrl: '/portal',
    metadata: {
      htmlTemplate: emailHtml,
      whatsAppText: waText,
      admissionNumber: caseRecord.admission_number,
      orientationDate: caseRecord.orientation_date,
      caseNumber: caseRecord.case_number,
    },
  });

  // Update checklist item
  caseRecord.checklist.welcome_notification.completed = true;
  caseRecord.checklist.welcome_notification.completed_at = new Date().toISOString();
  caseRecord.checklist.welcome_notification.completed_by = performedBy.id;
  caseRecord.checklist.welcome_notification.completed_by_name = performedBy.full_name;
  caseRecord.checklist.welcome_notification.notes = `Welcome kit and orientation dispatched via Email (${caseRecord.student_email}) & WhatsApp (${caseRecord.student_phone})`;

  caseRecord.updated_at = new Date().toISOString();
  store.persist();

  recordAuditEvent(
    caseRecord.id,
    'WELCOME_NOTIFICATION_DISPATCHED',
    performedBy,
    `Multi-channel welcome kit & orientation dispatched via Email & WhatsApp to ${caseRecord.student_name} (${caseRecord.student_email})`
  );

  return {
    success: true,
    message: `✓ Multi-channel welcome kit & orientation details successfully sent to ${caseRecord.student_name} via Resend Email and WhatsApp.`,
    caseRecord,
    dispatchResult,
  };
}

/**
 * Confirms successful portal access and live first class session.
 */
export async function confirmStudentPortalAccess(
  caseId: string,
  notes: string | undefined,
  performedBy: UserProfile
): Promise<OnboardingCase> {
  const caseRecord = store.onboardingCases.find((c) => c.id === caseId);
  if (!caseRecord) {
    throw new Error(`Onboarding case not found: ${caseId}`);
  }

  if (!canAccessOnboardingCase(performedBy, caseRecord)) {
    throw new Error('Access denied: You are not authorized to update this case.');
  }

  if (!caseRecord.lms_account_created) {
    throw new Error('Cannot confirm portal access: LMS account has not been activated yet.');
  }

  caseRecord.portal_access_confirmed = true;
  caseRecord.checklist.first_class_confirmation.completed = true;
  caseRecord.checklist.first_class_confirmation.completed_at = new Date().toISOString();
  caseRecord.checklist.first_class_confirmation.completed_by = performedBy.id;
  caseRecord.checklist.first_class_confirmation.completed_by_name = performedBy.full_name;
  if (notes) caseRecord.checklist.first_class_confirmation.notes = notes;

  caseRecord.updated_at = new Date().toISOString();
  store.persist();

  recordAuditEvent(
    caseRecord.id,
    'PORTAL_ACCESS_CONFIRMED',
    performedBy,
    `Confirmed student logged into LMS portal and attended first session`
  );

  return caseRecord;
}

/**
 * Sets an onboarding case as blocked with a mandatory reason.
 */
export async function setCaseBlocked(
  caseId: string,
  reason: string,
  performedBy: UserProfile
): Promise<OnboardingCase> {
  const caseRecord = store.onboardingCases.find((c) => c.id === caseId);
  if (!caseRecord) {
    throw new Error(`Onboarding case not found: ${caseId}`);
  }

  if (!canAccessOnboardingCase(performedBy, caseRecord)) {
    throw new Error('Access denied: You are not authorized to modify this case.');
  }

  if (!reason?.trim()) {
    throw new Error('A blocking reason is required to place an onboarding case on hold.');
  }

  caseRecord.status = 'blocked';
  caseRecord.blocked_reason = reason.trim();
  caseRecord.updated_at = new Date().toISOString();
  store.persist();

  recordAuditEvent(
    caseRecord.id,
    'CASE_BLOCKED',
    performedBy,
    `Onboarding placed on hold / blocked: ${reason.trim()}`
  );

  return caseRecord;
}

/**
 * Unblocks an onboarding case, returning it to in_progress.
 */
export async function unblockCase(
  caseId: string,
  performedBy: UserProfile
): Promise<OnboardingCase> {
  const caseRecord = store.onboardingCases.find((c) => c.id === caseId);
  if (!caseRecord) {
    throw new Error(`Onboarding case not found: ${caseId}`);
  }

  if (!canAccessOnboardingCase(performedBy, caseRecord)) {
    throw new Error('Access denied: You are not authorized to modify this case.');
  }

  caseRecord.status = 'in_progress';
  const prevReason = caseRecord.blocked_reason;
  caseRecord.blocked_reason = undefined;
  caseRecord.updated_at = new Date().toISOString();
  store.persist();

  recordAuditEvent(
    caseRecord.id,
    'CASE_UNBLOCKED',
    performedBy,
    `Onboarding unblocked and resumed (previous block reason: ${prevReason || 'None'})`
  );

  return caseRecord;
}

/**
 * Completes the onboarding workflow.
 * STRICT CHECKLIST RULE: All mandatory checklist items MUST be completed.
 */
export async function completeOnboardingWorkflow(
  caseId: string,
  performedBy: UserProfile
): Promise<OnboardingCase> {
  const caseRecord = store.onboardingCases.find((c) => c.id === caseId);
  if (!caseRecord) {
    throw new Error(`Onboarding case not found: ${caseId}`);
  }

  if (!canAccessOnboardingCase(performedBy, caseRecord)) {
    throw new Error('Access denied: You are not authorized to complete this onboarding case.');
  }

  // Check mandatory items
  const incompleteMandatory = Object.values(caseRecord.checklist).filter(
    (item) => item.mandatory && !item.completed
  );

  if (incompleteMandatory.length > 0) {
    const itemNames = incompleteMandatory.map((i) => `"${i.title}"`).join(', ');
    throw new Error(
      `Cannot complete onboarding: The following mandatory checklist items must be completed first: ${itemNames}`
    );
  }

  // Mark academic handover
  caseRecord.academic_handover_confirmed = true;
  caseRecord.checklist.academic_handover.completed = true;
  caseRecord.checklist.academic_handover.completed_at = new Date().toISOString();
  caseRecord.checklist.academic_handover.completed_by = performedBy.id;
  caseRecord.checklist.academic_handover.completed_by_name = performedBy.full_name;

  caseRecord.status = 'completed';
  caseRecord.completed_at = new Date().toISOString();
  caseRecord.completed_by = performedBy.full_name;
  caseRecord.updated_at = new Date().toISOString();

  // Update student placement / onboarding status
  const student = store.students.find((s) => s.id === caseRecord.student_id);
  if (student) {
    student.status = 'Active';
    student.placement_status = 'Not Started';
    student.updated_at = new Date().toISOString();
  }

  // 1. Resolve batch & assigned trainer
  const batch = store.batches.find(
    (b) => b.id === caseRecord.batch_id || (student && b.id === student.batch_id)
  );
  const trainer =
    store.users.find(
      (u) =>
        u.id === caseRecord.trainer_id ||
        (student && u.id === student.trainer_id) ||
        (batch && u.id === batch.trainer_id)
    ) || store.users.find((u) => u.role === 'trainer');

  const batchName = caseRecord.batch_name || batch?.batch_name || 'Assigned Batch';
  const orientationDate = caseRecord.orientation_date || 'Attended & Verified';
  const firstLectureConfirmation = caseRecord.portal_access_confirmed
    ? 'Confirmed Attendance'
    : (caseRecord.checklist.first_class_confirmation?.completed ? 'Confirmed Attendance' : 'Cleared for First Lecture');

  const handoverNotes = `Handover package dispatched to Trainer ${trainer?.full_name || 'Academic Faculty'} and Academic Operations for batch ${batchName}. Orientation: ${orientationDate}. First Lecture: ${firstLectureConfirmation}.`;
  caseRecord.checklist.academic_handover.notes = handoverNotes;

  // 2. Prepare Academic Handover HTML template with mandatory payload fields
  const handoverHtml = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;">
      <div style="background-color: #0A6ED1; padding: 24px; text-align: center; color: #ffffff;">
        <h1 style="margin: 0; font-size: 20px; font-weight: 800;">ACADEMIC HANDOVER CONFIRMATION</h1>
        <p style="margin: 4px 0 0; font-size: 13px; opacity: 0.9;">Student Onboarding Successfully Completed</p>
      </div>
      <div style="padding: 24px; color: #1e293b; line-height: 1.6;">
        <p style="font-size: 15px; margin-top: 0;">Academic Team Notification,</p>
        <p style="font-size: 14px; color: #475569;">
          Student <strong>${caseRecord.student_name}</strong> (${caseRecord.student_email}) has completed the full onboarding verification workflow and is ready to attend lectures.
        </p>
        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 20px 0; font-size: 13px;">
          <p style="margin: 0 0 6px;"><strong>Student Name:</strong> ${caseRecord.student_name}</p>
          <p style="margin: 0 0 6px;"><strong>Course:</strong> ${caseRecord.course_name}</p>
          <p style="margin: 0 0 6px;"><strong>Batch:</strong> ${batchName}</p>
          <p style="margin: 0 0 6px;"><strong>Orientation Date:</strong> ${orientationDate}</p>
          <p style="margin: 0 0 6px;"><strong>First Lecture Confirmation:</strong> <span style="color: #059669; font-weight: 700;">${firstLectureConfirmation}</span></p>
          <p style="margin: 0 0 6px;"><strong>Admission No:</strong> ${caseRecord.admission_number}</p>
          <p style="margin: 0 0 6px;"><strong>LMS Portal Access:</strong> <span style="color: #059669; font-weight: 700;">Active & Provisioned</span></p>
          <p style="margin: 0;"><strong>Handover Completed By:</strong> ${performedBy.full_name} (${performedBy.role})</p>
        </div>
        <div style="text-align: center; margin: 24px 0;">
          <a href="http://localhost:3000/academics/batches" style="background-color: #0A6ED1; color: #ffffff; padding: 10px 24px; font-size: 13px; font-weight: 700; text-decoration: none; border-radius: 6px; display: inline-block;">
            View Batch & Student Roster
          </a>
        </div>
      </div>
    </div>
  `;

  // 3. Dispatch Formal Academic Handover Notification to Assigned Trainer (Email & In-App)
  if (trainer) {
    try {
      await sendMultiChannelNotification({
        userId: trainer.id,
        recipientName: trainer.full_name,
        recipientEmail: trainer.email,
        recipientPhone: trainer.phone,
        title: `Academic Handover: ${caseRecord.student_name} (${batchName})`,
        message: `Student ${caseRecord.student_name} has completed onboarding for ${caseRecord.course_name} (Batch: ${batchName}). Orientation Date: ${orientationDate}. First Lecture Confirmation: ${firstLectureConfirmation}. Ready to attend lectures.`,
        type: 'success',
        category: 'onboarding',
        actionUrl: '/academics/batches',
        channels: ['in_app', 'email'],
        metadata: {
          htmlTemplate: handoverHtml,
          studentName: caseRecord.student_name,
          course: caseRecord.course_name,
          batch: batchName,
          orientationDate,
          firstLectureConfirmation,
        },
      });
    } catch (err) {
      console.warn('Failed to dispatch trainer handover notification:', err);
    }
  }

  // 4. Dispatch Notification to Academic Operations Team (Email & In-App)
  const academicOpsUsers = store.users.filter(
    (u) =>
      (u.role === 'support' || u.role === 'admin') &&
      u.id !== trainer?.id &&
      u.id !== performedBy.id
  );

  for (const supportUser of academicOpsUsers) {
    try {
      await sendMultiChannelNotification({
        userId: supportUser.id,
        recipientName: supportUser.full_name,
        recipientEmail: supportUser.email,
        recipientPhone: supportUser.phone,
        title: `Academic Handover Dispatched: ${caseRecord.student_name} (${batchName})`,
        message: `Student ${caseRecord.student_name} has completed onboarding for ${caseRecord.course_name} (Batch: ${batchName}). Orientation Date: ${orientationDate}. First Lecture Confirmation: ${firstLectureConfirmation}. Handover dispatched to Trainer ${trainer?.full_name || 'Faculty'}.`,
        type: 'info',
        category: 'onboarding',
        actionUrl: `/students/${caseRecord.student_id}`,
        channels: ['in_app', 'email'],
        metadata: {
          htmlTemplate: handoverHtml,
          studentName: caseRecord.student_name,
          course: caseRecord.course_name,
          batch: batchName,
          orientationDate,
          firstLectureConfirmation,
        },
      });
    } catch (err) {
      console.warn('Failed to dispatch support handover notification:', err);
    }
  }

  store.persist();

  recordAuditEvent(
    caseRecord.id,
    'ACADEMIC_HANDOVER_DISPATCHED',
    performedBy,
    `Academic handover package dispatched to Trainer ${trainer?.full_name || 'Faculty'} (${trainer?.email || 'N/A'}) for batch ${caseRecord.batch_name || 'Assigned Batch'}`
  );

  recordAuditEvent(
    caseRecord.id,
    'ONBOARDING_COMPLETED',
    performedBy,
    `Onboarding workflow completed and formally handed over to Academic Operations`
  );

  return caseRecord;
}

/**
 * Retrieves audit logs for an onboarding case.
 */
export async function getOnboardingAuditLogs(
  caseId: string,
  user: UserProfile
): Promise<OnboardingAuditEvent[]> {
  const caseRecord = store.onboardingCases.find((c) => c.id === caseId);
  if (!caseRecord) return [];

  if (!canAccessOnboardingCase(user, caseRecord)) {
    throw new Error('Access denied: You are not authorized to view audit logs for this case.');
  }

  return store.onboardingAuditLogs.filter((a) => a.case_id === caseId);
}

/**
 * Returns list of onboarding staff eligible for assignment.
 */
export async function getEligibleOnboardingStaff(): Promise<UserProfile[]> {
  return store.users.filter(
    (u) =>
      u.is_active &&
      (u.role === 'onboarding_team' || u.role === 'admin' || u.role === 'super_admin')
  );
}

/**
 * Returns detailed staff performance and SLA turnaround metrics.
 * STRICT: Restricted exclusively to administrators and super administrators.
 */
export async function getOnboardingStaffPerformance(
  user: UserProfile
): Promise<OnboardingStaffPerformance[]> {
  if (user.role !== 'admin' && user.role !== 'super_admin') {
    throw new Error('Access denied: Only administrators can view staff performance analytics.');
  }

  const staffList = (await getEligibleOnboardingStaff()).filter((u) => tenantId(u) === tenantId(user));
  const now = new Date().getTime();

  return staffList.map((staff) => {
    const staffCases = store.onboardingCases.filter((c) => c.assigned_staff_id === staff.id);
    const total = staffCases.length;
    const pending = staffCases.filter((c) => c.status === 'pending').length;
    const inProgress = staffCases.filter((c) => c.status === 'in_progress').length;
    const blocked = staffCases.filter((c) => c.status === 'blocked').length;
    const completedCases = staffCases.filter((c) => c.status === 'completed');
    const completed = completedCases.length;

    // Overdue: active cases older than 7 days
    const overdue = staffCases.filter((c) => {
      if (c.status === 'completed') return false;
      const createdTime = new Date(c.created_at).getTime();
      return now - createdTime > 7 * 24 * 60 * 60 * 1000;
    }).length;

    // Average completion days & SLA compliance (<= 7 days)
    let totalDays = 0;
    let compliantCount = 0;
    completedCases.forEach((c) => {
      const created = new Date(c.created_at).getTime();
      const finished = c.completed_at ? new Date(c.completed_at).getTime() : now;
      const days = Math.max(1, Math.round((finished - created) / (24 * 60 * 60 * 1000)));
      totalDays += days;
      if (days <= 7) {
        compliantCount += 1;
      }
    });

    const avgDays = completed > 0 ? Number((totalDays / completed).toFixed(1)) : 0;
    const slaRate = completed > 0 ? Math.round((compliantCount / completed) * 100) : 100;

    const activeCount = pending + inProgress + blocked;
    const workloadStatus: 'Available' | 'Balanced' | 'High Workload' =
      activeCount > 10 ? 'High Workload' : activeCount === 0 ? 'Available' : 'Balanced';

    return {
      staff_id: staff.id,
      staff_name: staff.full_name,
      staff_email: staff.email,
      staff_role: staff.role,
      total_assigned: total,
      pending_count: pending,
      in_progress_count: inProgress,
      blocked_count: blocked,
      completed_count: completed,
      overdue_count: overdue,
      avg_completion_days: avgDays,
      sla_compliance_rate: slaRate,
      workload_status: workloadStatus,
    };
  });
}

/**
 * Returns the count of confirmed admissions that do not yet have an onboarding case.
 * Restricted to administrators and super administrators.
 */
export async function getUnbackfilledAdmissionsCount(user: UserProfile): Promise<number> {
  if (user.role !== 'admin' && user.role !== 'super_admin') {
    return 0;
  }
  const confirmedAdmissions = store.admissions.filter((a) => a.status === 'Confirmed' && tenantId(a) === tenantId(user));
  return confirmedAdmissions.filter(
    (a) => !store.onboardingCases.some((c) => c.admission_id === a.id)
  ).length;
}

/**
 * Backfills onboarding cases for legacy confirmed admissions created prior to onboarding system introduction.
 * IDEMPOTENT: Prevents duplicate cases.
 * STRICT: Restricted to administrators and super administrators.
 */
export async function backfillLegacyAdmissions(
  user: UserProfile
): Promise<LegacyBackfillResult> {
  if (user.role !== 'admin' && user.role !== 'super_admin') {
    throw new Error('Access denied: Only administrators can backfill legacy admissions.');
  }

  const confirmedAdmissions = store.admissions.filter((a) => a.status === 'Confirmed' && tenantId(a) === tenantId(user));
  let casesCreated = 0;
  let casesSkipped = 0;
  const createdNumbers: string[] = [];

  for (const adm of confirmedAdmissions) {
    // Check if case already exists by admission_id
    if (store.onboardingCases.some((c) => c.admission_id === adm.id)) {
      casesSkipped += 1;
      continue;
    }

    // Match student record
    const student = store.students.find(
      (s) =>
        s.admission_id === adm.id ||
        s.admission_number === adm.admission_number ||
        s.email === adm.email
    );

    // If student has an existing case by student_id
    if (student && store.onboardingCases.some((c) => c.student_id === student.id)) {
      casesSkipped += 1;
      continue;
    }

    const studentUserId = student?.user_id;
    const studentUser = studentUserId
      ? store.users.find((u) => u.id === studentUserId)
      : store.users.find((u) => u.email === adm.email);

    const feeAccount = student
      ? store.feeAccounts.find(
          (fa) => fa.admission_id === adm.id || fa.student_id === student.id
        )
      : null;

    const caseSeq = store.onboardingCases.length + 1;
    const caseNumber = `ONB-2026-${String(caseSeq).padStart(4, '0')}`;

    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 7);

    const checklist = buildDefaultChecklist();

    // 1. Admission confirmation
    checklist.admission_confirmation.completed = true;
    checklist.admission_confirmation.completed_at = new Date().toISOString();
    checklist.admission_confirmation.completed_by = user.id;
    checklist.admission_confirmation.completed_by_name = user.full_name;
    checklist.admission_confirmation.notes = `Legacy admission ${adm.admission_number} backfilled by ${user.full_name}`;

    // 2. Personal contact info (verified if phone & email present)
    if (adm.phone && adm.email) {
      checklist.student_details_verification.completed = true;
      checklist.student_details_verification.completed_at = new Date().toISOString();
      checklist.student_details_verification.completed_by = user.id;
      checklist.student_details_verification.completed_by_name = user.full_name;
    }

    // 3. Course confirmation
    if (adm.course_id) {
      checklist.course_confirmation.completed = true;
      checklist.course_confirmation.completed_at = new Date().toISOString();
      checklist.course_confirmation.completed_by = user.id;
      checklist.course_confirmation.completed_by_name = user.full_name;
    }

    // 4. Batch allocation (if assigned)
    if (student?.batch_id || adm.batch_id) {
      checklist.batch_allocation.completed = true;
      checklist.batch_allocation.completed_at = new Date().toISOString();
      checklist.batch_allocation.completed_by = user.id;
      checklist.batch_allocation.completed_by_name = user.full_name;
      checklist.batch_allocation.notes = `Batch: ${student?.batch_name || adm.batch_name || 'Assigned'}`;
    }

    // 5. Financial clearance (if payments exist)
    const hasPaid = feeAccount ? feeAccount.paid_amount > 0 : false;
    if (hasPaid) {
      checklist.fee_clearance_verification.completed = true;
      checklist.fee_clearance_verification.completed_at = new Date().toISOString();
      checklist.fee_clearance_verification.completed_by = user.id;
      checklist.fee_clearance_verification.completed_by_name = user.full_name;
      checklist.fee_clearance_verification.notes = `Prior payment recorded: ₹${feeAccount?.paid_amount}`;
    }

    // 6. LMS account activation
    const isLmsActive = studentUser ? studentUser.is_active : false;
    if (isLmsActive) {
      checklist.lms_account_activation.completed = true;
      checklist.lms_account_activation.completed_at = new Date().toISOString();
      checklist.lms_account_activation.completed_by = user.id;
      checklist.lms_account_activation.completed_by_name = user.full_name;
      checklist.lms_account_activation.notes = `Active portal user account confirmed (${studentUser?.email})`;
    }

    const newCase: OnboardingCase = {
      id: `onb-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      case_number: caseNumber,
      admission_id: adm.id,
      admission_number: adm.admission_number,
      student_id: student ? student.id : `stu-legacy-${Date.now()}`,
      student_name: adm.student_name,
      student_email: adm.email,
      student_phone: adm.phone,
      course_id: adm.course_id,
      course_name: adm.course_name || 'SAP Course',
      batch_id: student?.batch_id || adm.batch_id,
      batch_name: student?.batch_name || adm.batch_name,
      trainer_id: student?.trainer_id || adm.trainer_id,
      trainer_name: student?.trainer_name || adm.trainer_name,
      status: 'pending',
      checklist,
      documents: [],
      lms_account_created: isLmsActive,
      portal_access_confirmed: false,
      academic_handover_confirmed: false,
      due_date: dueDate.toISOString().slice(0, 10),
      created_at: adm.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    store.onboardingCases.unshift(newCase);
    casesCreated += 1;
    createdNumbers.push(newCase.case_number);

    recordAuditEvent(
      newCase.id,
      'LEGACY_ADMISSION_BACKFILL',
      user,
      `Legacy confirmed admission ${adm.admission_number} synchronized into onboarding pipeline by ${user.full_name}`
    );
  }

  if (casesCreated > 0) {
    store.persist();
  }

  return {
    total_processed: confirmedAdmissions.length,
    cases_created: casesCreated,
    cases_skipped: casesSkipped,
    created_case_numbers: createdNumbers,
    message:
      casesCreated > 0
        ? `Successfully backfilled ${casesCreated} legacy admission${casesCreated > 1 ? 's' : ''} into the onboarding pipeline (${casesSkipped} skipped).`
        : `No new legacy admissions needed backfilling (${casesSkipped} admissions already have onboarding cases).`,
  };
}

