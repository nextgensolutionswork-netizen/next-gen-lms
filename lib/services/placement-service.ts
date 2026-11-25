import { store } from './data-store';
import {
  PlacementProfile,
  JobOpening,
  JobApplication,
  PlacementEnrollment,
  PlacementEnrollmentStatus,
  PlacementEnrollmentStatusHistory,
  PlacementEligibilitySettings,
  PlacementDocumentItem,
  PlacementDeclaration,
} from '@/types';
import { recordAuditLog } from './audit-service';
import { createClient, isLiveSupabaseEnabled, isProductionEnvironment } from '@/lib/supabase/db';

export async function getPlacementProfiles(): Promise<PlacementProfile[]> {
  if (isLiveSupabaseEnabled()) {
    const supabase = createClient();
    const { data, error } = await supabase.from('placement_profiles').select('*');
    if (error) {
      throw new Error(`Failed to retrieve placement profiles: ${error.message}`);
    }
    // Treat empty array [] as authoritative
    store.placementProfiles = (data || []) as PlacementProfile[];
    return [...store.placementProfiles];
  }
  return [...(store.placementProfiles || [])];
}

export async function getPlacementProfileForStudent(studentId: string): Promise<PlacementProfile | undefined> {
  if (isLiveSupabaseEnabled()) {
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('placement_profiles')
        .select('*')
        .eq('student_id', studentId)
        .maybeSingle();

      if (error) {
        console.error('[placement-service] Supabase getPlacementProfileForStudent error:', error.message || error);
        throw new Error(`Failed to retrieve authoritative placement profile: ${error.message || error}`);
      }

      if (data) {
        return data as PlacementProfile;
      }
    } catch (err: any) {
      if (isProductionEnvironment() || isLiveSupabaseEnabled()) {
        throw err;
      }
      console.warn('Supabase getPlacementProfileForStudent error, checking local store:', err);
    }
  }

  if (isProductionEnvironment() || isLiveSupabaseEnabled()) {
    return undefined;
  }

  let profile = (store.placementProfiles || []).find((p) => p.student_id === studentId);
  if (!profile) {
    const student = (store.students || []).find((s) => s.id === studentId);
    if (student) {
      profile = {
        id: `pp-${Date.now()}`,
        student_id: student.id,
        student_name: student.full_name,
        resume_status: 'Not Uploaded',
        mock_interview_status: 'Not Scheduled',
        skills: ['SAP ERP', 'MS Excel', 'Problem Solving'],
        experience_years: 0,
        preferred_location: 'Hyderabad / Bengaluru / Pune',
        expected_salary_lpa: 6.5,
        placement_status: 'Not Started',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      if (!store.placementProfiles) store.placementProfiles = [];
      store.placementProfiles.push(profile);
      store.persist();
    }
  }
  return profile;
}

export async function updatePlacementProfile(
  studentId: string,
  updates: Partial<PlacementProfile>,
  coordinatorUserId: string
): Promise<PlacementProfile> {
  const profile = await getPlacementProfileForStudent(studentId);
  if (!profile) throw new Error('Placement profile not found');

  if (updates.technical_interview_score !== undefined) {
    if (updates.technical_interview_score < 0 || updates.technical_interview_score > 100 || isNaN(updates.technical_interview_score)) {
      throw new Error('Technical mock interview score must be between 0 and 100.');
    }
  }
  if (updates.hr_interview_score !== undefined) {
    if (updates.hr_interview_score < 0 || updates.hr_interview_score > 100 || isNaN(updates.hr_interview_score)) {
      throw new Error('HR mock interview score must be between 0 and 100.');
    }
  }

  Object.assign(profile, updates, { updated_at: new Date().toISOString() });

  // Update in student profile if placement status changed
  if (updates.placement_status) {
    const student = (store.students || []).find((s) => s.id === studentId);
    if (student) student.placement_status = updates.placement_status;
  }
  store.persist();

  if (isLiveSupabaseEnabled()) {
    try {
      const supabase = createClient();
      await supabase
        .from('placement_profiles')
        .upsert({
          id: profile.id,
          student_id: profile.student_id,
          resume_url: profile.resume_url,
          resume_status: profile.resume_status,
          mock_interview_status: profile.mock_interview_status,
          technical_interview_score: profile.technical_interview_score,
          hr_interview_score: profile.hr_interview_score,
          skills: profile.skills,
          experience_years: profile.experience_years,
          preferred_location: profile.preferred_location,
          expected_salary_lpa: profile.expected_salary_lpa,
          placement_status: profile.placement_status,
          placed_company: profile.placed_company,
          placed_package_lpa: profile.placed_package_lpa,
          placed_date: profile.placed_date,
          updated_at: profile.updated_at,
        });
    } catch (err) {
      console.warn('Supabase placement profile upsert direct query warning, preserved locally:', err);
    }
  }

  const coordinator = (store.users || []).find((u) => u.id === coordinatorUserId);

  await recordAuditLog({
    user_id: coordinatorUserId,
    user_name: coordinator?.full_name || 'Placement Head',
    user_role: coordinator?.role || 'placement_coordinator',
    action: 'PLACEMENT_PROFILE_UPDATED',
    module: 'PLACEMENT',
    record_id: profile.id,
    new_value: updates,
  });

  return profile;
}

export async function uploadStudentResume(
  studentId: string,
  resumeUrl: string,
  uploadedByUserId?: string
): Promise<PlacementProfile> {
  const profile = await getPlacementProfileForStudent(studentId);
  if (!profile) throw new Error('Placement profile not found');

  profile.resume_url = resumeUrl;
  profile.resume_status = 'Pending Review';
  profile.updated_at = new Date().toISOString();

  const student = (store.students || []).find((s) => s.id === studentId);
  if (student) {
    (student as any).resume_url = resumeUrl;
  }

  // Also update corresponding placement enrollment if present
  const enrollment = (store.placementEnrollments || []).find((e) => e.student_id === studentId);
  if (enrollment) {
    enrollment.resume_url = resumeUrl;
    enrollment.resume_status = 'Pending Review';
    enrollment.updated_at = new Date().toISOString();
  }

  store.persist();

  if (isLiveSupabaseEnabled()) {
    try {
      const supabase = createClient();
      await supabase
        .from('placement_profiles')
        .update({
          resume_url: resumeUrl,
          resume_status: 'Pending Review',
          updated_at: profile.updated_at,
        })
        .eq('student_id', studentId);
    } catch (err) {
      console.warn('Supabase resume_url update warning, preserved locally:', err);
    }
  }

  await recordAuditLog({
    user_id: uploadedByUserId || studentId,
    user_name: student?.full_name || 'Student',
    user_role: uploadedByUserId ? 'placement_coordinator' : 'student',
    action: 'RESUME_UPLOADED',
    module: 'PLACEMENT',
    record_id: profile.id,
    new_value: { resume_url: resumeUrl, resume_status: 'Pending Review' },
  });

  return profile;
}

export interface JobApplicationQueryOptions {
  jobId?: string;
  studentId?: string;
  tenantId?: string;
  status?: JobApplication['status'] | 'All';
  search?: string;
  page?: number;
  pageSize?: number;
  deduplicate?: boolean;
}

export interface PaginatedJobApplicationsResult {
  applications: JobApplication[];
  total: number;
  totalForDrive: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * Deduplicate mirrored copies by authoritative application identity.
 * - Primary key: app.id (if unique).
 * - Secondary key: canonical (tenant_id + ':' + job_id + ':' + student_id) tuple.
 * - Preserves application history if requested; otherwise deterministically chooses the current application.
 * - Legitimate separate applications across different drives (different job_id) are PRESERVED.
 * - Distinct students who share an email/phone are PRESERVED (keyed by student_id).
 */
export function deduplicateJobApplications(
  apps: JobApplication[],
  options?: { preserveHistory?: boolean }
): JobApplication[] {
  if (options?.preserveHistory) {
    return [...apps];
  }

  const seenIds = new Set<string>();
  const seenJobStudent = new Map<string, JobApplication>();

  for (const app of apps) {
    if (!app || !app.job_id || !app.student_id) continue;
    if (app.id && seenIds.has(app.id)) continue;
    if (app.id) seenIds.add(app.id);

    const tenantKey = app.tenant_id || 'default-tenant';
    const tupleKey = `${tenantKey}:${app.job_id}:${app.student_id}`;
    const existing = seenJobStudent.get(tupleKey);
    if (!existing) {
      seenJobStudent.set(tupleKey, app);
    } else {
      const existingTime = new Date(existing.applied_at || 0).getTime();
      const currentTime = new Date(app.applied_at || 0).getTime();
      if (currentTime > existingTime) {
        seenJobStudent.set(tupleKey, app);
      } else if (currentTime === existingTime) {
        // Active non-withdrawn application takes precedence over withdrawn
        if (existing.status === 'Withdrawn' && app.status !== 'Withdrawn') {
          seenJobStudent.set(tupleKey, app);
        } else if (existing.status === app.status) {
          // Deterministic tie-breaker by ID
          if ((app.id || '') > (existing.id || '')) {
            seenJobStudent.set(tupleKey, app);
          }
        }
      }
    }
  }

  return Array.from(seenJobStudent.values());
}

/**
 * Synchronize all job openings' applications_count with the authoritative job applications collection.
 */
export function syncJobOpeningApplicationCounts(): void {
  const allApps = deduplicateJobApplications(store.jobApplications || []);
  for (const job of (store.jobOpenings || [])) {
    const driveApps = allApps.filter((a) => a.job_id === job.id && a.status !== 'Withdrawn');
    job.applications_count = driveApps.length;
  }
}

/**
 * Get the authoritative application count for a specific job drive.
 */
export function getJobOpeningApplicationCount(jobId: string, options?: { includeWithdrawn?: boolean }): number {
  const allApps = deduplicateJobApplications(store.jobApplications || []);
  return allApps.filter(
    (a) => a.job_id === jobId && (options?.includeWithdrawn ? true : a.status !== 'Withdrawn')
  ).length;
}

/**
 * Authoritative query engine for job applications supporting drive filtering,
 * deduplication, status filtering, search, pagination, and total count metadata.
 */
export function getAuthoritativeJobApplications(
  options: JobApplicationQueryOptions = {}
): PaginatedJobApplicationsResult {
  const {
    jobId,
    studentId,
    tenantId,
    status = 'All',
    search = '',
    page = 1,
    pageSize = 10,
    deduplicate = true,
  } = options;

  let rawList = [...(store.jobApplications || [])];
  if (deduplicate) {
    rawList = deduplicateJobApplications(rawList);
  }

  // Filter by job_id if requested
  if (jobId) {
    rawList = rawList.filter((a) => a.job_id === jobId);
  }

  // Filter by student_id if requested
  if (studentId) {
    rawList = rawList.filter((a) => a.student_id === studentId);
  }

  // Filter by tenant_id if requested
  if (tenantId) {
    rawList = rawList.filter((a) => !a.tenant_id || a.tenant_id === tenantId);
  }

  // Calculate total active/valid applications for this drive before search/status filter
  const totalForDrive = rawList.filter((a) => a.status !== 'Withdrawn').length;

  // Filter by status if specified
  if (status && status !== 'All') {
    rawList = rawList.filter((a) => a.status === status);
  }

  // Search by student name, code, or email
  if (search && search.trim()) {
    const q = search.trim().toLowerCase();
    rawList = rawList.filter((a) => {
      const student = (store.students || []).find((s) => s.id === a.student_id);
      return (
        a.student_name?.toLowerCase().includes(q) ||
        a.student_id?.toLowerCase().includes(q) ||
        student?.student_code?.toLowerCase().includes(q) ||
        student?.email?.toLowerCase().includes(q) ||
        student?.full_name?.toLowerCase().includes(q)
      );
    });
  }

  // Sort descending by applied_at
  rawList.sort((a, b) => new Date(b.applied_at || 0).getTime() - new Date(a.applied_at || 0).getTime());

  const total = rawList.length;
  const safePageSize = Math.max(1, pageSize);
  const totalPages = Math.max(1, Math.ceil(total / safePageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);

  const startIndex = (safePage - 1) * safePageSize;
  const paginatedApplications = rawList.slice(startIndex, startIndex + safePageSize);

  return {
    applications: paginatedApplications,
    total,
    totalForDrive,
    page: safePage,
    pageSize: safePageSize,
    totalPages,
  };
}

export async function getJobOpenings(): Promise<JobOpening[]> {
  if (isLiveSupabaseEnabled()) {
    const supabase = createClient();
    const { data, error } = await supabase.from('job_openings').select('*').order('created_at', { ascending: false });
    if (error) {
      throw new Error(`Failed to retrieve job openings: ${error.message}`);
    }
    const mapped = (data || []).map((row: any) => ({
      id: row.id,
      company_name: row.company_name,
      job_title: row.job_title || row.position || '',
      position: row.position || row.job_title || '',
      module: row.module || 'SAP FICO',
      experience_required: row.experience_required || '0 - 2 Years',
      location: row.location || 'Hyderabad / Bengaluru',
      salary_range: row.salary_range || '₹6.5 - ₹8.5 LPA',
      description: row.description || row.job_description || '',
      job_description: row.job_description || row.description || '',
      application_deadline: row.application_deadline,
      status: row.status || 'Open',
      created_at: row.created_at,
    }));
    store.jobOpenings = mapped as JobOpening[];
    syncJobOpeningApplicationCounts();
    return [...store.jobOpenings];
  }
  syncJobOpeningApplicationCounts();
  return [...(store.jobOpenings || [])];
}

export async function createJobOpening(data: Omit<JobOpening, 'id' | 'applications_count' | 'created_at'>): Promise<JobOpening> {
  const jobId = (data as any).id || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `job-${Date.now()}`);
  const job: JobOpening = {
    ...data,
    id: jobId,
    applications_count: 0,
    created_at: new Date().toISOString(),
  };
  if (!store.jobOpenings) store.jobOpenings = [];
  store.jobOpenings.unshift(job);
  store.persist();

  if (isLiveSupabaseEnabled()) {
    try {
      const supabase = createClient();
      await supabase.from('job_openings').insert({
        id: job.id,
        company_name: job.company_name,
        job_title: job.job_title,
        position: job.job_title,
        module: job.module,
        experience_required: job.experience_required,
        location: job.location,
        salary_range: job.salary_range,
        description: job.description,
        job_description: job.description,
        application_deadline: job.application_deadline,
        status: job.status,
        created_at: job.created_at,
      });
    } catch (err) {
      console.warn('Supabase createJobOpening direct query warning, preserved locally:', err);
    }
  }

  return job;
}

export async function updateJobOpening(
  jobId: string,
  updates: Partial<Omit<JobOpening, 'id' | 'applications_count' | 'created_at'>>
): Promise<JobOpening | null> {
  const job = (store.jobOpenings || []).find((j) => j.id === jobId);
  if (!job) return null;
  Object.assign(job, updates);
  store.persist();

  if (isLiveSupabaseEnabled()) {
    try {
      const supabase = createClient();
      const payload: Record<string, any> = {
        updated_at: new Date().toISOString(),
      };
      if (updates.company_name !== undefined) payload.company_name = updates.company_name;
      if (updates.job_title !== undefined) {
        payload.job_title = updates.job_title;
        payload.position = updates.job_title;
      }
      if (updates.module !== undefined) payload.module = updates.module;
      if (updates.experience_required !== undefined) payload.experience_required = updates.experience_required;
      if (updates.location !== undefined) payload.location = updates.location;
      if (updates.salary_range !== undefined) payload.salary_range = updates.salary_range;
      if (updates.description !== undefined) {
        payload.description = updates.description;
        payload.job_description = updates.description;
      }
      if (updates.application_deadline !== undefined) payload.application_deadline = updates.application_deadline;
      if (updates.status !== undefined) payload.status = updates.status;

      await supabase.from('job_openings').update(payload).eq('id', jobId);
    } catch (err) {
      console.warn('Supabase updateJobOpening warning, preserved locally:', err);
    }
  }

  return job;
}

export async function updateJobOpeningStatus(jobId: string, status: 'Open' | 'Closed'): Promise<JobOpening | null> {
  const job = (store.jobOpenings || []).find((j) => j.id === jobId);
  if (!job) return null;
  job.status = status;
  store.persist();

  if (isLiveSupabaseEnabled()) {
    try {
      const supabase = createClient();
      await supabase.from('job_openings').update({ status, updated_at: new Date().toISOString() }).eq('id', jobId);
    } catch (err) {
      console.warn('Supabase updateJobOpeningStatus warning, preserved locally:', err);
    }
  }

  return job;
}

export async function deleteJobOpening(jobId: string): Promise<boolean> {
  const idx = (store.jobOpenings || []).findIndex((j) => j.id === jobId);
  if (idx === -1) return false;
  if (!store.jobOpenings) store.jobOpenings = [];
  store.jobOpenings.splice(idx, 1);
  store.persist();

  if (isLiveSupabaseEnabled()) {
    try {
      const supabase = createClient();
      await supabase.from('job_openings').delete().eq('id', jobId);
    } catch (err) {
      console.warn('Supabase deleteJobOpening warning, preserved locally:', err);
    }
  }

  return true;
}

export async function getJobApplications(): Promise<JobApplication[]> {
  if (isLiveSupabaseEnabled()) {
    const supabase = createClient();
    const { data, error } = await supabase.from('job_applications').select('*').order('applied_at', { ascending: false });
    if (error) {
      throw new Error(`Failed to retrieve job applications: ${error.message}`);
    }
    // Treat empty array [] as authoritative: display zero applications and clear stale records
    const deduped = deduplicateJobApplications((data || []) as JobApplication[]);
    store.jobApplications = deduped;
    syncJobOpeningApplicationCounts();
    return [...deduped];
  }
  const deduped = deduplicateJobApplications(store.jobApplications || []);
  store.jobApplications = deduped;
  syncJobOpeningApplicationCounts();
  return [...deduped];
}

/**
 * Apply for Job Opening.
 * Strictly enforces that the student has an approved Placement Enrollment AND is Placement Eligible.
 */
export async function applyForJob(
  jobId: string,
  studentId: string,
  appliedByUserId?: string
): Promise<JobApplication> {
  // Business Invariant: LMS Student -> Placement Enrolled -> Placement Eligible
  const enrollment = (store.placementEnrollments || []).find((e) => e.student_id === studentId);
  if (!enrollment || enrollment.enrollment_status === 'Not Enrolled') {
    throw new Error('Student has not enrolled for placement support. Please enroll for Placement Support first.');
  }

  if (!enrollment.is_placement_eligible) {
    throw new Error(
      'Student is not yet Placement Eligible. You must complete required attendance, course completion, assessments, resume review, mock interviews, and fee clearance.'
    );
  }

  const existing = (store.jobApplications || []).find(
    (a) => a.job_id === jobId && a.student_id === studentId && a.status !== 'Withdrawn'
  );
  if (existing) throw new Error('Already applied to this opening');

  const job = (store.jobOpenings || []).find((j) => j.id === jobId);
  if (!job) {
    throw new Error('Job opening not found.');
  }
  if (job.status !== 'Open') {
    throw new Error('Job opening is closed for applications.');
  }
  if (job.application_deadline) {
    const deadlineTime = new Date(job.application_deadline).setHours(23, 59, 59, 999);
    if (!isNaN(deadlineTime) && deadlineTime < Date.now()) {
      throw new Error('Job application deadline has passed.');
    }
  }

  const student = (store.students || []).find((s) => s.id === studentId);
  if (!student) {
    throw new Error('Student not found.');
  }

  const application: JobApplication = {
    id: `app-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    job_id: jobId,
    job_title: job?.job_title,
    company_name: job?.company_name,
    student_id: studentId,
    student_name: student?.full_name,
    student_code: student?.student_code,
    student_email: student?.email,
    applied_at: new Date().toISOString(),
    status: 'Applied',
  };

  if (!store.jobApplications) store.jobApplications = [];
  store.jobApplications.push(application);
  syncJobOpeningApplicationCounts();
  store.persist();

  if (isLiveSupabaseEnabled()) {
    try {
      const supabase = createClient();
      await supabase.from('job_applications').insert({
        id: application.id,
        job_id: application.job_id,
        student_id: application.student_id,
        applied_at: application.applied_at,
        status: application.status,
      });
    } catch (err) {
      console.warn('Supabase applyForJob direct query warning, preserved locally:', err);
    }
  }

  const actor = (store.users || []).find((u) => u.id === appliedByUserId);
  await recordAuditLog({
    user_id: appliedByUserId || studentId,
    user_name: actor?.full_name || student?.full_name || 'Placement Coordinator',
    user_role: actor?.role || (appliedByUserId ? 'placement_coordinator' : 'student'),
    action: 'JOB_APPLICATION_SUBMITTED',
    module: 'PLACEMENT',
    record_id: application.id,
    new_value: {
      job_id: jobId,
      company: job?.company_name,
      job_title: job?.job_title,
      student_id: studentId,
      student_name: student?.full_name,
    },
  });

  return application;
}

export async function updateJobApplicationStatus(
  applicationId: string,
  status: JobApplication['status'],
  updatedByUserId?: string
): Promise<JobApplication> {
  const application = (store.jobApplications || []).find((a) => a.id === applicationId);
  if (!application) throw new Error('Job application not found');

  const actor = (store.users || []).find((u) => u.id === updatedByUserId);
  if (actor && !['super_admin', 'admin', 'placement_coordinator'].includes(actor.role)) {
    throw new Error('Unauthorized: Only Placement Coordinators or Administrators can update application status.');
  }

  application.status = status;
  syncJobOpeningApplicationCounts();
  store.persist();

  if (isLiveSupabaseEnabled()) {
    try {
      const supabase = createClient();
      await supabase
        .from('job_applications')
        .update({ status })
        .eq('id', applicationId);
    } catch (err) {
      console.warn('Supabase updateJobApplicationStatus warning, preserved locally:', err);
    }
  }

  await recordAuditLog({
    user_id: updatedByUserId || 'usr-placement',
    user_name: actor?.full_name || 'Placement Coordinator',
    user_role: actor?.role || 'placement_coordinator',
    action: 'JOB_APPLICATION_STATUS_UPDATED',
    module: 'PLACEMENT',
    record_id: applicationId,
    new_value: { status },
  });

  return application;
}

/**
 * Withdraw a job application.
 * Callable by the student candidate themselves or an authorized placement coordinator/administrator.
 */
export async function withdrawJobApplication(
  applicationId: string,
  actorUserId: string,
  reason?: string
): Promise<JobApplication> {
  const application = (store.jobApplications || []).find((a) => a.id === applicationId);
  if (!application) throw new Error('Job application not found');

  const actor = (store.users || []).find((u) => u.id === actorUserId);
  const student = (store.students || []).find(
    (s) => s.id === application.student_id || s.user_id === application.student_id
  );
  const actorStudent = (store.students || []).find(
    (s) => s.id === actorUserId || s.user_id === actorUserId || (s.email && s.email.toLowerCase() === actor?.email?.toLowerCase())
  );

  // Check if actor is the owner student: either actorUserId directly matches student_id,
  // or the actor's student record matches the application's student record.
  const isOwnerStudent =
    actorUserId === application.student_id ||
    (actorStudent && student && actorStudent.id === student.id) ||
    Boolean(actor?.role === 'student' && actorStudent && student && actorStudent.id === student.id);

  const isAuthorizedStaff = ['super_admin', 'admin', 'placement_coordinator'].includes(actor?.role || '');

  if (!isOwnerStudent && !isAuthorizedStaff) {
    throw new Error('Unauthorized: You do not possess permission to withdraw this application.');
  }

  // Cross-tenant access check
  if (actor?.tenant_id && application.tenant_id && actor.tenant_id !== application.tenant_id) {
    throw new Error('Unauthorized: Cross-tenant access is prohibited.');
  }

  // Handle repeated withdrawal safely (idempotent)
  if (application.status === 'Withdrawn') {
    if (reason && reason !== application.withdrawal_reason) {
      application.withdrawal_reason = reason;
      store.persist();
    }
    return application;
  }

  const now = new Date().toISOString();
  application.status = 'Withdrawn';
  application.withdrawn_at = now;
  application.withdrawal_reason = reason || 'Withdrawn by candidate';

  syncJobOpeningApplicationCounts();
  store.persist();

  if (isLiveSupabaseEnabled()) {
    try {
      const supabase = createClient();
      await supabase
        .from('job_applications')
        .update({
          status: 'Withdrawn',
          withdrawn_at: now,
          withdrawal_reason: application.withdrawal_reason,
        })
        .eq('id', applicationId);
    } catch (err) {
      console.warn('Supabase withdrawJobApplication warning, preserved locally:', err);
    }
  }

  await recordAuditLog({
    user_id: actorUserId,
    user_name: actor?.full_name || application.student_name || 'Candidate',
    user_role: actor?.role || (isOwnerStudent ? 'student' : 'placement_coordinator'),
    action: 'JOB_APPLICATION_WITHDRAWN',
    module: 'PLACEMENT',
    record_id: applicationId,
    new_value: { status: 'Withdrawn', reason: application.withdrawal_reason },
  });

  return application;
}

// ============================================================================
// PLACEMENT ENROLLMENT, STATUS LIFECYCLE & ELIGIBILITY RULES ENGINE
// ============================================================================

export async function getPlacementEnrollments(filters?: {
  status?: PlacementEnrollmentStatus | 'all';
  search?: string;
  module?: string;
}): Promise<PlacementEnrollment[]> {
  if (isLiveSupabaseEnabled()) {
    try {
      const supabase = createClient();
      const { data, error } = await supabase.from('placement_enrollments').select('*').order('created_at', { ascending: false });
      if (error) {
        console.error('[placement-service] Supabase placement enrollments query error:', error.message || error);
        throw new Error(`Failed to retrieve authoritative placement enrollments: ${error.message || error}`);
      }
      if (Array.isArray(data)) {
        store.placementEnrollments = data as PlacementEnrollment[];
      }
    } catch (err: any) {
      if (isProductionEnvironment() || isLiveSupabaseEnabled()) {
        throw err;
      }
      console.warn('Supabase placement enrollments query error, falling back to local persistent store:', err);
    }
  } else if (isProductionEnvironment()) {
    store.placementEnrollments = [];
  }

  let list = [...(store.placementEnrollments || [])];

  if (filters?.status && filters.status !== 'all') {
    list = list.filter((e) => e.enrollment_status === filters.status);
  }

  if (filters?.module && filters.module !== 'all') {
    list = list.filter((e) => e.sap_module?.toLowerCase() === filters.module?.toLowerCase());
  }

  if (filters?.search && filters.search.trim()) {
    const q = filters.search.trim().toLowerCase();
    list = list.filter(
      (e) =>
        e.student_name.toLowerCase().includes(q) ||
        e.student_code?.toLowerCase().includes(q) ||
        e.admission_number?.toLowerCase().includes(q) ||
        e.email?.toLowerCase().includes(q) ||
        e.current_company?.toLowerCase().includes(q) ||
        e.highest_qualification?.toLowerCase().includes(q)
    );
  }

  return list;
}

export const DEFAULT_PLACEMENT_ELIGIBILITY_SETTINGS: PlacementEligibilitySettings = {
  id: 'pes-default',
  min_course_progress_percentage: 80,
  min_attendance_percentage: 80,
  require_assessments_completed: true,
  require_mock_interview_completed: true,
  min_mock_interview_score: 75,
  require_resume_approved: true,
  require_mandatory_documents_verified: true,
  require_fees_cleared: true,
  allow_admin_override: true,
  updated_at: '2026-01-01T00:00:00Z',
  updated_by: 'usr-admin',
};

export async function getPlacementEnrollmentByStudentId(studentId: string): Promise<PlacementEnrollment | undefined> {
  return (store.placementEnrollments || []).find((e) => e.student_id === studentId);
}

export async function getPlacementEnrollmentHistory(enrollmentId: string): Promise<PlacementEnrollmentStatusHistory[]> {
  return (store.placementEnrollmentStatusHistories || [])
    .filter((h) => h.enrollment_id === enrollmentId)
    .sort((a, b) => new Date(b.changed_at).getTime() - new Date(a.changed_at).getTime());
}

export async function getPlacementEligibilitySettings(): Promise<PlacementEligibilitySettings> {
  return { ...(store.placementEligibilitySettings || DEFAULT_PLACEMENT_ELIGIBILITY_SETTINGS) };
}

export async function updatePlacementEligibilitySettings(
  updates: Partial<PlacementEligibilitySettings>,
  adminUserId: string
): Promise<PlacementEligibilitySettings> {
  const admin = (store.users || []).find((u) => u.id === adminUserId);
  store.placementEligibilitySettings = {
    ...(store.placementEligibilitySettings || DEFAULT_PLACEMENT_ELIGIBILITY_SETTINGS),
    ...updates,
    updated_at: new Date().toISOString(),
    updated_by: adminUserId,
  };
  store.persist();

  await recordAuditLog({
    user_id: adminUserId,
    user_name: admin?.full_name || 'Admin',
    user_role: admin?.role || 'admin',
    action: 'PLACEMENT_ELIGIBILITY_SETTINGS_UPDATED',
    module: 'PLACEMENT',
    record_id: store.placementEligibilitySettings.id,
    new_value: updates,
  });

  return { ...store.placementEligibilitySettings };
}

export interface EligibilityEvaluationResult {
  isEligible: boolean;
  criteriaResults: {
    criterion: string;
    passed: boolean;
    currentValue: string | number;
    requiredValue: string | number;
    message: string;
  }[];
  reasons: string[];
}

export interface EnrollmentPrerequisiteAudit {
  student_id: string;
  student_name: string;
  attendance_percentage: number;
  min_attendance_percentage: number;
  passes_attendance: boolean;
  course_progress: number;
  min_course_progress: number;
  passes_progress: boolean;
  outstanding_amount: number;
  passes_fees: boolean;
  require_fees_cleared: boolean;
  all_passed: boolean;
  unmet_criteria: string[];
}

/**
 * Automated Pre-requisite Audit Engine before Student Enrollment
 * Evaluates minimum attendance (80%), course progress (80%), and fee dues clearance (0 balance)
 * against institutional configuration.
 */
export function evaluateEnrollmentPrerequisites(studentId: string): EnrollmentPrerequisiteAudit {
  const student = (store.students || []).find((s) => s.id === studentId);
  const settings = store.placementEligibilitySettings || DEFAULT_PLACEMENT_ELIGIBILITY_SETTINGS;

  const attendance = student?.attendance_percentage ?? 0;
  const progress = student?.course_progress ?? 0;
  const outstanding = student?.outstanding_amount ?? 0;

  const minAtt = settings.min_attendance_percentage ?? 80;
  const minProg = settings.min_course_progress_percentage ?? 80;
  const requireFees = settings.require_fees_cleared ?? true;

  const passesAttendance = attendance >= minAtt;
  const passesProgress = progress >= minProg;
  const passesFees = !requireFees || outstanding <= 0;
  const allPassed = passesAttendance && passesProgress && passesFees;

  const unmet: string[] = [];
  if (!passesAttendance) {
    unmet.push(`Attendance ${attendance}% is below minimum required (${minAtt}%)`);
  }
  if (!passesProgress) {
    unmet.push(`Course progress ${progress}% is below minimum required (${minProg}%)`);
  }
  if (!passesFees) {
    unmet.push(`Outstanding tuition fee arrears of ₹${outstanding.toLocaleString('en-IN')} pending clearance`);
  }

  return {
    student_id: studentId,
    student_name: student?.full_name || 'Student',
    attendance_percentage: attendance,
    min_attendance_percentage: minAtt,
    passes_attendance: passesAttendance,
    course_progress: progress,
    min_course_progress: minProg,
    passes_progress: passesProgress,
    outstanding_amount: outstanding,
    passes_fees: passesFees,
    require_fees_cleared: requireFees,
    all_passed: allPassed,
    unmet_criteria: unmet,
  };
}

/**
 * Dynamic Configurable Placement Eligibility Engine
 * Evaluates candidate standing against institutional settings without hardcoded thresholds.
 */
export async function evaluatePlacementEligibility(studentId: string): Promise<EligibilityEvaluationResult> {
  const enrollment = (store.placementEnrollments || []).find((e) => e.student_id === studentId);
  const student = (store.students || []).find((s) => s.id === studentId);
  const profile = (store.placementProfiles || []).find((p) => p.student_id === studentId);
  const settings = store.placementEligibilitySettings || DEFAULT_PLACEMENT_ELIGIBILITY_SETTINGS;

  if (!enrollment) {
    return {
      isEligible: false,
      criteriaResults: [],
      reasons: ['No placement enrollment found for student.'],
    };
  }

  // Administrative Override Check
  if (enrollment.eligibility_overridden) {
    const result: EligibilityEvaluationResult = {
      isEligible: true,
      criteriaResults: [
        {
          criterion: 'Authorized Administrative Override',
          passed: true,
          currentValue: 'Override Granted',
          requiredValue: 'Granted',
          message: enrollment.override_reason || 'Cleared by authorized placement officer override.',
        },
      ],
      reasons: [],
    };
    enrollment.is_placement_eligible = true;
    enrollment.eligibility_reasons = [];
    store.persist();
    return result;
  }

  const results: EligibilityEvaluationResult['criteriaResults'] = [];

  // 1. Enrollment Approved Status
  const isApprovedLifecycle = [
    'Enrollment Approved',
    'Profile Completion Pending',
    'Documents Pending',
    'Resume Review Pending',
    'Mock Interview Pending',
    'Placement Eligible',
    'Active Placement',
  ].includes(enrollment.enrollment_status);

  results.push({
    criterion: 'Placement Enrollment Approved',
    passed: isApprovedLifecycle,
    currentValue: enrollment.enrollment_status,
    requiredValue: 'Enrollment Approved',
    message: isApprovedLifecycle
      ? 'Placement enrollment has been reviewed and approved.'
      : `Enrollment status is "${enrollment.enrollment_status}", approval required.`,
  });

  // 2. Course Progress
  const currentProgress = student?.course_progress || 0;
  const progressPassed = currentProgress >= settings.min_course_progress_percentage;
  results.push({
    criterion: 'Course Completion Percentage',
    passed: progressPassed,
    currentValue: `${currentProgress}%`,
    requiredValue: `≥ ${settings.min_course_progress_percentage}%`,
    message: progressPassed
      ? `Course progress ${currentProgress}% satisfies minimum requirement (${settings.min_course_progress_percentage}%).`
      : `Course progress ${currentProgress}% is below minimum required (${settings.min_course_progress_percentage}%).`,
  });

  // 3. Attendance Percentage
  const currentAttendance = student?.attendance_percentage || 0;
  const attendancePassed = currentAttendance >= settings.min_attendance_percentage;
  results.push({
    criterion: 'Class Attendance Percentage',
    passed: attendancePassed,
    currentValue: `${currentAttendance}%`,
    requiredValue: `≥ ${settings.min_attendance_percentage}%`,
    message: attendancePassed
      ? `Attendance ${currentAttendance}% satisfies requirement (${settings.min_attendance_percentage}%).`
      : `Attendance ${currentAttendance}% is below benchmark (${settings.min_attendance_percentage}%).`,
  });

  // 4. Academic Assessments
  if (settings.require_assessments_completed) {
    const courseAssignments = (store.assignments || []).filter((a) => a.course_id === student?.course_id);
    const completedSubmissions = (store.submissions || []).filter((s) => s.student_id === studentId);
    const assessmentsPassed = courseAssignments.length === 0 || completedSubmissions.length >= courseAssignments.length;
    results.push({
      criterion: 'Course Assessments & Assignments',
      passed: assessmentsPassed,
      currentValue: `${completedSubmissions.length} of ${courseAssignments.length} submitted`,
      requiredValue: `${courseAssignments.length} mandatory submissions`,
      message: assessmentsPassed
        ? 'All mandatory module assignments and practical assessments completed.'
        : `Pending ${courseAssignments.length - completedSubmissions.length} course assignments.`,
    });
  }

  // 5. Mock Interview & Score
  if (settings.require_mock_interview_completed) {
    const mockStatus = profile?.mock_interview_status;
    const mockScore = profile?.technical_interview_score || 0;
    const mockPassed = mockStatus === 'Completed' && mockScore >= settings.min_mock_interview_score;
    results.push({
      criterion: 'Technical Mock Interview & Score',
      passed: mockPassed,
      currentValue: `${mockStatus || 'Not Scheduled'} (Score: ${mockScore}/100)`,
      requiredValue: `Completed with ≥ ${settings.min_mock_interview_score}/100`,
      message: mockPassed
        ? `Mock interview cleared with score ${mockScore}/100.`
        : mockStatus !== 'Completed'
        ? 'Technical mock interview has not been completed.'
        : `Mock interview score ${mockScore}/100 is below benchmark (${settings.min_mock_interview_score}/100).`,
    });
  }

  // 6. Resume Approved
  if (settings.require_resume_approved) {
    const isResumeApproved = enrollment.resume_status === 'Reviewed & Approved';
    results.push({
      criterion: 'Official Resume Approval',
      passed: isResumeApproved,
      currentValue: enrollment.resume_status || 'Not Uploaded',
      requiredValue: 'Reviewed & Approved',
      message: isResumeApproved
        ? 'Resume vetted and officially approved by placement coordinator.'
        : 'Resume is pending upload or awaiting coordinator review approval.',
    });
  }

  // 7. Mandatory Documents Verified
  if (settings.require_mandatory_documents_verified) {
    const hasDegree = enrollment.documents?.some(
      (d) => d.document_type === 'Degree Certificate' && d.is_verified === true
    );
    const hasId = enrollment.documents?.some(
      (d) => (d.document_type === 'Aadhaar / ID Proof' || d.document_type === 'PAN Card') && d.is_verified === true
    );
    const docsPassed = Boolean(hasDegree && hasId);
    results.push({
      criterion: 'Mandatory Documents Verification',
      passed: docsPassed,
      currentValue: docsPassed ? 'Verified (Degree & ID Proof)' : 'Verification Pending',
      requiredValue: 'Degree Certificate & Photo ID Verified',
      message: docsPassed
        ? 'Mandatory qualification and identity documents verified.'
        : 'Degree Certificate or Photo ID document is missing or not yet verified.',
    });
  }

  // 8. Fees Cleared
  if (settings.require_fees_cleared) {
    const outstanding = student?.outstanding_amount || 0;
    const feesPassed = outstanding <= 0;
    results.push({
      criterion: 'Tuition Fee Dues Cleared',
      passed: feesPassed,
      currentValue: outstanding > 0 ? `₹${outstanding.toLocaleString('en-IN')} Due` : 'Fees Cleared',
      requiredValue: 'Zero Outstanding',
      message: feesPassed
        ? 'Institute tuition fees fully cleared.'
        : `Outstanding balance of ₹${outstanding.toLocaleString('en-IN')} must be cleared.`,
    });
  }

  // 9. No Active Hold
  const noHold = enrollment.enrollment_status !== 'Enrollment On Hold';
  results.push({
    criterion: 'No Active Placement Hold',
    passed: noHold,
    currentValue: noHold ? 'Active' : 'On Hold',
    requiredValue: 'Active',
    message: noHold ? 'No disciplinary or academic hold.' : `Active hold reason: ${enrollment.hold_reason || 'Administrative Hold'}`,
  });

  const isEligible = results.every((r) => r.passed);
  const reasons = results.filter((r) => !r.passed).map((r) => r.message);

  enrollment.is_placement_eligible = isEligible;
  enrollment.eligibility_reasons = reasons;

  // Auto-upgrade status to 'Placement Eligible' if all criteria met and enrollment was approved
  if (isEligible && isApprovedLifecycle && enrollment.enrollment_status !== 'Active Placement' && enrollment.enrollment_status !== 'Placed') {
    enrollment.enrollment_status = 'Placement Eligible';
  } else if (!isEligible && enrollment.enrollment_status === 'Placement Eligible') {
    enrollment.enrollment_status = 'Enrollment Approved';
  }

  store.persist();

  return {
    isEligible,
    criteriaResults: results,
    reasons,
  };
}

/**
 * Student Self-Enrollment into Placement Support
 */
export async function createPlacementEnrollment(
  input: Partial<PlacementEnrollment>,
  studentUserId: string
): Promise<PlacementEnrollment> {
  const student = (store.students || []).find((s) => s.id === input.student_id);
  if (!student) throw new Error('Student record not found in LMS');

  // Verify 7 mandatory declarations
  const decl = input.declaration;
  if (
    !decl ||
    !decl.confirmed_information_correct ||
    !decl.understands_no_guarantee ||
    !decl.agrees_attend_scheduled_interviews ||
    !decl.agrees_inform_external_offer ||
    !decl.authorizes_resume_sharing ||
    !decl.understands_sensitive_docs_policy ||
    !decl.agrees_keep_profile_updated
  ) {
    throw new Error('All 7 terms and declarations must be accepted before submitting placement enrollment.');
  }

  if (!store.placementEnrollments) store.placementEnrollments = [];
  if (!store.placementEnrollmentStatusHistories) store.placementEnrollmentStatusHistories = [];

  // Check if active enrollment already exists
  const existing = store.placementEnrollments.find((e) => e.student_id === input.student_id);
  if (existing && !['Student Withdrawn', 'Placement Closed', 'Enrollment Rejected'].includes(existing.enrollment_status)) {
    throw new Error(`An active placement enrollment already exists with status: ${existing.enrollment_status}`);
  }

  const enrollmentId = `pe-${Date.now()}`;
  const now = new Date().toISOString();
  const prereqAudit = evaluateEnrollmentPrerequisites(student.id);
  const initialEligibilityReasons = input.eligibility_overridden
    ? []
    : prereqAudit.all_passed
    ? ['Prerequisites verified (Attendance & Fees Cleared). Pending document and interview review.']
    : prereqAudit.unmet_criteria;

  const newEnrollment: PlacementEnrollment = {
    id: enrollmentId,
    student_id: student.id,
    student_name: student.full_name,
    admission_number: student.admission_number || student.student_code || 'ADM-000',
    student_code: student.student_code || student.admission_number || 'STU-000',
    email: student.email || 'student@example.com',
    mobile_number: input.mobile_number || student.phone || '',
    whatsapp_number: input.whatsapp_number || student.phone || '',
    course_id: student.course_id || 'crs-default',
    course_name: input.course_name || student.course_name || 'SAP ERP Program',
    sap_module: input.sap_module || student.sap_module || 'SAP ERP',
    batch_id: student.batch_id,
    batch_name: student.batch_name,
    trainer_id: student.trainer_id,
    trainer_name: student.trainer_name,

    enrollment_status: 'Application Submitted',
    is_placement_eligible: Boolean(input.eligibility_overridden),
    eligibility_overridden: input.eligibility_overridden,
    override_reason: input.override_reason,
    overridden_by: input.overridden_by,
    overridden_at: input.overridden_at || (input.eligibility_overridden ? now : undefined),
    eligibility_reasons: initialEligibilityReasons,

    current_status: input.current_status || 'Fresher',
    employment_status: input.employment_status || 'Fresher',

    current_company: input.current_company,
    current_designation: input.current_designation,
    total_experience_years: input.total_experience_years ?? 0,
    relevant_sap_experience_years: input.relevant_sap_experience_years ?? 0,
    current_ctc_lpa: input.current_ctc_lpa,
    expected_ctc_lpa: input.expected_ctc_lpa ?? 6.5,
    notice_period: input.notice_period || 'Immediate',
    last_working_date: input.last_working_date,

    highest_qualification: input.highest_qualification || 'Bachelor of Engineering / B.Tech',
    degree: input.degree || 'B.Tech',
    specialization: input.specialization || 'Computer Science / Engineering',
    college_university: input.college_university || 'State Technical University',
    graduation_year: input.graduation_year || 2024,
    percentage_or_cgpa: input.percentage_or_cgpa || '7.5 CGPA',

    preferred_job_roles: input.preferred_job_roles?.length ? input.preferred_job_roles : ['SAP Functional Consultant'],
    preferred_locations: input.preferred_locations?.length ? input.preferred_locations : ['Bengaluru', 'Hyderabad', 'Pune'],
    preferred_work_mode: input.preferred_work_mode || 'Hybrid',
    willing_to_relocate: input.willing_to_relocate ?? true,
    immediate_joiner: input.immediate_joiner ?? true,
    preferred_industry: input.preferred_industry || 'Information Technology / Consulting',

    resume_url: input.resume_url || (student as any).resume_url,
    resume_name: input.resume_name || 'Student_Resume.pdf',
    resume_status: input.resume_url ? 'Pending Review' : 'Not Uploaded',
    documents: input.documents || [],

    declaration: {
      ...decl,
      terms_version: decl.terms_version || 'v2026.1',
      accepted_by: student.id,
      accepted_by_name: student.full_name,
      accepted_at: now,
    },

    enrollment_date: now,
    internal_notes: [],
    created_at: now,
    updated_at: now,
  };

  if (existing) {
    const idx = store.placementEnrollments.findIndex((e) => e.student_id === input.student_id);
    if (idx !== -1) {
      store.placementEnrollments[idx] = newEnrollment;
    } else {
      store.placementEnrollments.push(newEnrollment);
    }
  } else {
    store.placementEnrollments.push(newEnrollment);
  }

  // Create initial status history entry
  const historyItem: PlacementEnrollmentStatusHistory = {
    id: `pesh-${Date.now()}`,
    enrollment_id: newEnrollment.id,
    student_id: student.id,
    old_status: 'Not Enrolled',
    new_status: 'Application Submitted',
    changed_by: studentUserId || student.id,
    changed_by_name: student.full_name,
    changed_by_role: 'student',
    changed_at: now,
    reason: 'Student submitted placement enrollment application form with accepted terms and declarations.',
  };
  store.placementEnrollmentStatusHistories.push(historyItem);

  // Update student placement status
  student.placement_status = 'Resume Preparation';
  store.persist();

  if (isLiveSupabaseEnabled()) {
    try {
      const supabase = createClient();
      const isStudentUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(student.id);
      if (isStudentUUID) {
        await supabase.from('placement_enrollments').upsert({
          id: newEnrollment.id,
          tenant_id: (newEnrollment as any).tenant_id || 'default-tenant',
          student_id: student.id,
          student_name: newEnrollment.student_name,
          admission_number: newEnrollment.admission_number,
          student_code: newEnrollment.student_code,
          email: newEnrollment.email,
          mobile_number: newEnrollment.mobile_number,
          sap_module: newEnrollment.sap_module,
          enrollment_status: newEnrollment.enrollment_status,
          is_placement_eligible: newEnrollment.is_placement_eligible,
          eligibility_overridden: Boolean(newEnrollment.eligibility_overridden),
          override_reason: newEnrollment.override_reason || null,
          enrollment_date: newEnrollment.enrollment_date,
          created_at: newEnrollment.created_at,
          updated_at: newEnrollment.updated_at,
        });
      }
    } catch (err) {
      console.warn('Supabase createPlacementEnrollment upsert warning, preserved locally:', err);
    }
  }

  await recordAuditLog({
    user_id: studentUserId || student.id,
    user_name: student.full_name,
    user_role: 'student',
    action: 'PLACEMENT_ENROLLMENT_SUBMITTED',
    module: 'PLACEMENT',
    record_id: newEnrollment.id,
    new_value: { status: 'Application Submitted', role: newEnrollment.preferred_job_roles },
  });

  return newEnrollment;
}

/**
 * Update Placement Enrollment Status with audit tracking & reason capture
 */
export async function updatePlacementEnrollmentStatus(
  enrollmentId: string,
  newStatus: PlacementEnrollmentStatus,
  actorUserId: string,
  reason?: string,
  notes?: string
): Promise<PlacementEnrollment> {
  if (!store.placementEnrollments) store.placementEnrollments = [];
  if (!store.placementEnrollmentStatusHistories) store.placementEnrollmentStatusHistories = [];
  const enrollment = store.placementEnrollments.find((e) => e.id === enrollmentId);
  if (!enrollment) throw new Error('Placement enrollment record not found');

  if (newStatus === 'Enrollment Rejected' && !reason?.trim()) {
    throw new Error('A detailed rejection reason is mandatory when rejecting placement enrollment.');
  }

  if (newStatus === 'Enrollment On Hold' && !reason?.trim()) {
    throw new Error('A mandatory reason is required when putting enrollment on hold.');
  }

  const oldStatus = enrollment.enrollment_status;
  const actor = (store.users || []).find((u) => u.id === actorUserId);
  const now = new Date().toISOString();

  enrollment.enrollment_status = newStatus;
  enrollment.reviewed_at = now;
  enrollment.reviewed_by = actorUserId;
  enrollment.reviewed_by_name = actor?.full_name || 'Placement Officer';
  enrollment.updated_at = now;

  if (newStatus === 'Enrollment Rejected') {
    enrollment.rejection_reason = reason;
    enrollment.is_placement_eligible = false;
  } else if (newStatus === 'Enrollment On Hold') {
    enrollment.hold_reason = reason;
    enrollment.is_placement_eligible = false;
  } else if (newStatus === 'More Information Required') {
    enrollment.more_info_required_notes = reason || notes;
  } else if (newStatus === 'Student Withdrawn') {
    enrollment.withdrawal_reason = reason;
    enrollment.is_placement_eligible = false;
  }

  // Record status history - NEVER OVERWRITE
  const historyItem: PlacementEnrollmentStatusHistory = {
    id: `pesh-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    enrollment_id: enrollment.id,
    student_id: enrollment.student_id,
    old_status: oldStatus,
    new_status: newStatus,
    changed_by: actorUserId,
    changed_by_name: actor?.full_name || 'Placement Officer',
    changed_by_role: actor?.role || 'placement_coordinator',
    changed_at: now,
    reason: reason || undefined,
    notes: notes || undefined,
  };
  store.placementEnrollmentStatusHistories.push(historyItem);

  // If approved, trigger dynamic eligibility evaluation
  if (newStatus === 'Enrollment Approved') {
    await evaluatePlacementEligibility(enrollment.student_id);
  }

  store.persist();

  if (isLiveSupabaseEnabled()) {
    try {
      const supabase = createClient();
      await supabase.from('placement_enrollments').update({
        enrollment_status: newStatus,
        is_placement_eligible: enrollment.is_placement_eligible,
        rejection_reason: enrollment.rejection_reason || null,
        hold_reason: enrollment.hold_reason || null,
        withdrawal_reason: enrollment.withdrawal_reason || null,
        more_info_required_notes: enrollment.more_info_required_notes || null,
        reviewed_at: enrollment.reviewed_at,
        reviewed_by: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(actorUserId) ? actorUserId : null,
        reviewed_by_name: enrollment.reviewed_by_name,
        updated_at: now,
      }).eq('id', enrollment.id);
    } catch (err) {
      console.warn('Supabase updatePlacementEnrollmentStatus update warning, preserved locally:', err);
    }
  }

  await recordAuditLog({
    user_id: actorUserId,
    user_name: actor?.full_name || 'Placement Officer',
    user_role: actor?.role || 'placement_coordinator',
    action: 'PLACEMENT_ENROLLMENT_STATUS_CHANGED',
    module: 'PLACEMENT',
    record_id: enrollment.id,
    old_value: { status: oldStatus },
    new_value: { status: newStatus, reason, notes },
  });

  return enrollment;
}

/**
 * Assign Placement Officer to Enrollment
 */
export async function assignPlacementOfficer(
  enrollmentId: string,
  officerId: string,
  officerName: string,
  actorUserId: string
): Promise<PlacementEnrollment> {
  if (!store.placementEnrollments) store.placementEnrollments = [];
  const enrollment = store.placementEnrollments.find((e) => e.id === enrollmentId);
  if (!enrollment) throw new Error('Placement enrollment not found');

  enrollment.assigned_placement_officer_id = officerId;
  enrollment.assigned_placement_officer_name = officerName;
  enrollment.updated_at = new Date().toISOString();
  store.persist();

  const actor = (store.users || []).find((u) => u.id === actorUserId);
  await recordAuditLog({
    user_id: actorUserId,
    user_name: actor?.full_name || 'Placement Head',
    user_role: actor?.role || 'placement_coordinator',
    action: 'PLACEMENT_OFFICER_ASSIGNED',
    module: 'PLACEMENT',
    record_id: enrollment.id,
    new_value: { assigned_officer: officerName, assigned_officer_id: officerId },
  });

  return enrollment;
}

/**
 * Add Internal Note to Enrollment
 */
export async function addInternalNoteToEnrollment(
  enrollmentId: string,
  note: string,
  actorUserId: string
): Promise<PlacementEnrollment> {
  if (!store.placementEnrollments) store.placementEnrollments = [];
  const enrollment = store.placementEnrollments.find((e) => e.id === enrollmentId);
  if (!note?.trim()) return enrollment!;
  if (!enrollment) throw new Error('Placement enrollment not found');

  const actor = (store.users || []).find((u) => u.id === actorUserId);
  const formattedNote = `[${new Date().toLocaleDateString('en-IN')} - ${actor?.full_name || 'Staff'}]: ${note.trim()}`;

  enrollment.internal_notes = [...(enrollment.internal_notes || []), formattedNote];
  enrollment.updated_at = new Date().toISOString();
  store.persist();

  await recordAuditLog({
    user_id: actorUserId,
    user_name: actor?.full_name || 'Staff',
    user_role: actor?.role || 'placement_coordinator',
    action: 'PLACEMENT_INTERNAL_NOTE_ADDED',
    module: 'PLACEMENT',
    record_id: enrollment.id,
    new_value: { note: formattedNote },
  });

  return enrollment;
}

/**
 * Authorize Placement Eligibility Override with mandatory reason
 */
export async function overridePlacementEligibility(
  enrollmentId: string,
  actorUserId: string,
  reason: string,
  actorRoleOverride?: string,
  actorNameOverride?: string
): Promise<PlacementEnrollment> {
  if (!reason || !reason.trim()) {
    throw new Error('Mandatory justification reason is required for administrative eligibility override.');
  }

  if (!store.placementEnrollments) store.placementEnrollments = [];
  if (!store.placementEnrollmentStatusHistories) store.placementEnrollmentStatusHistories = [];
  
  let enrollment = store.placementEnrollments.find((e) => e.id === enrollmentId);
  if (!enrollment && isLiveSupabaseEnabled()) {
    try {
      const supabase = createClient();
      const { data } = await supabase.from('placement_enrollments').select('*').eq('id', enrollmentId).maybeSingle();
      if (data) {
        enrollment = data as PlacementEnrollment;
        store.placementEnrollments.push(enrollment);
      }
    } catch (err) {
      console.warn('Error fetching enrollment from Supabase:', err);
    }
  }

  if (!enrollment) throw new Error('Placement enrollment not found');

  const actor = (store.users || []).find((u) => u.id === actorUserId);
  const effectiveRole = actorRoleOverride || actor?.role || (actorUserId === 'usr-placement' || actorUserId === '66666666-6666-6666-6666-666666666666' ? 'placement_coordinator' : undefined);
  const effectiveName = actorNameOverride || actor?.full_name || (effectiveRole === 'placement_coordinator' ? 'Placement Head' : 'Administrator');

  if (!effectiveRole || !['super_admin', 'admin', 'placement_coordinator'].includes(effectiveRole)) {
    throw new Error('Unauthorized: Only Placement Coordinators or Administrators can override placement eligibility.');
  }

  const now = new Date().toISOString();
  const oldStatus = enrollment.enrollment_status;
  const oldEligible = enrollment.is_placement_eligible;
  const oldOverridden = enrollment.eligibility_overridden;

  enrollment.is_placement_eligible = true;
  enrollment.eligibility_overridden = true;
  enrollment.override_reason = reason.trim();
  enrollment.overridden_by = actorUserId;
  enrollment.overridden_at = now;
  enrollment.enrollment_status = 'Placement Eligible';
  enrollment.updated_at = now;

  const historyItem: PlacementEnrollmentStatusHistory = {
    id: `pesh-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    enrollment_id: enrollment.id,
    student_id: enrollment.student_id,
    old_status: oldStatus,
    new_status: 'Placement Eligible',
    changed_by: actorUserId,
    changed_by_name: effectiveName,
    changed_by_role: effectiveRole as any,
    changed_at: now,
    reason: `Administrative Eligibility Override: ${reason.trim()}`,
  };
  store.placementEnrollmentStatusHistories.push(historyItem);
  store.persist();

  if (isLiveSupabaseEnabled()) {
    try {
      const supabase = createClient();
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(actorUserId);
      const uuidActor = isUUID ? actorUserId : '66666666-6666-6666-6666-666666666666';

      await supabase.from('placement_enrollments').update({
        enrollment_status: 'Placement Eligible',
        is_placement_eligible: true,
        eligibility_overridden: true,
        override_reason: reason.trim(),
        overridden_by: uuidActor,
        overridden_at: now,
        updated_at: now,
      }).eq('id', enrollment.id);
    } catch (err) {
      console.warn('Supabase placement enrollment override update warning, preserved locally:', err);
    }
  }

  await recordAuditLog({
    user_id: actorUserId,
    user_name: effectiveName,
    user_role: effectiveRole,
    action: 'PLACEMENT_ELIGIBILITY_OVERRIDDEN',
    module: 'PLACEMENT',
    record_id: enrollment.id,
    old_value: { enrollment_status: oldStatus, is_placement_eligible: oldEligible, eligibility_overridden: oldOverridden },
    new_value: { enrollment_status: 'Placement Eligible', is_placement_eligible: true, eligibility_overridden: true, reason: reason.trim(), overridden_by: effectiveName },
  });

  return enrollment;
}

/**
 * Request Re-Enrollment for withdrawn or closed candidates
 */
export async function requestReEnrollment(
  studentId: string,
  reason: string
): Promise<PlacementEnrollment> {
  if (!reason?.trim()) {
    throw new Error('Reason for re-enrollment request is required.');
  }

  if (!store.placementEnrollments) store.placementEnrollments = [];
  if (!store.placementEnrollmentStatusHistories) store.placementEnrollmentStatusHistories = [];
  const enrollment = store.placementEnrollments.find((e) => e.student_id === studentId);
  if (!enrollment) throw new Error('No previous placement enrollment record found to re-enroll.');

  const oldStatus = enrollment.enrollment_status;
  const now = new Date().toISOString();

  enrollment.enrollment_status = 'Re-enrollment Requested';
  enrollment.updated_at = now;

  const historyItem: PlacementEnrollmentStatusHistory = {
    id: `pesh-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    enrollment_id: enrollment.id,
    student_id: enrollment.student_id,
    old_status: oldStatus,
    new_status: 'Re-enrollment Requested',
    changed_by: studentId,
    changed_by_name: enrollment.student_name,
    changed_by_role: 'student',
    changed_at: now,
    reason: `Student requested re-enrollment: ${reason.trim()}`,
  };
  store.placementEnrollmentStatusHistories.push(historyItem);
  store.persist();

  await recordAuditLog({
    user_id: studentId,
    user_name: enrollment.student_name,
    user_role: 'student',
    action: 'PLACEMENT_RE_ENROLLMENT_REQUESTED',
    module: 'PLACEMENT',
    record_id: enrollment.id,
    new_value: { reason },
  });

  return enrollment;
}

/**
 * Verify or Reject an Initial Verification Document
 */
export async function verifyEnrollmentDocument(
  enrollmentId: string,
  documentId: string,
  isVerified: boolean,
  notes: string | undefined,
  actorUserId: string
): Promise<PlacementEnrollment> {
  if (!store.placementEnrollments) store.placementEnrollments = [];
  const enrollment = store.placementEnrollments.find((e) => e.id === enrollmentId);
  if (!enrollment) throw new Error('Placement enrollment not found');

  const doc = enrollment.documents?.find((d) => d.id === documentId);
  if (!doc) throw new Error('Document item not found in enrollment');

  const actor = (store.users || []).find((u) => u.id === actorUserId);
  const now = new Date().toISOString();

  doc.is_verified = isVerified;
  doc.verified_by = actor?.full_name || actorUserId;
  doc.verified_at = now;
  doc.verification_notes = notes;
  enrollment.updated_at = now;

  // Re-run eligibility evaluation
  await evaluatePlacementEligibility(enrollment.student_id);

  store.persist();

  await recordAuditLog({
    user_id: actorUserId,
    user_name: actor?.full_name || 'Placement Officer',
    user_role: actor?.role || 'placement_coordinator',
    action: 'PLACEMENT_DOCUMENT_VERIFIED',
    module: 'PLACEMENT',
    record_id: enrollment.id,
    new_value: { document_id: documentId, document_type: doc.document_type, is_verified: isVerified, notes },
  });

  return enrollment;
}
