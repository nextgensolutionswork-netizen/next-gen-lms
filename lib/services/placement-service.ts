import { store } from './data-store';
import { PlacementProfile, JobOpening, JobApplication } from '@/types';
import { recordAuditLog } from './audit-service';

export async function getPlacementProfiles(): Promise<PlacementProfile[]> {
  return [...store.placementProfiles];
}

export async function getPlacementProfileForStudent(studentId: string): Promise<PlacementProfile | undefined> {
  let profile = store.placementProfiles.find((p) => p.student_id === studentId);
  if (!profile) {
    const student = store.students.find((s) => s.id === studentId);
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
      store.placementProfiles.push(profile);
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

  Object.assign(profile, updates, { updated_at: new Date().toISOString() });

  // Update in student profile if placement status changed
  if (updates.placement_status) {
    const student = store.students.find((s) => s.id === studentId);
    if (student) student.placement_status = updates.placement_status;
  }

  const coordinator = store.users.find((u) => u.id === coordinatorUserId);

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

  const student = store.students.find((s) => s.id === studentId);
  if (student) {
    (student as any).resume_url = resumeUrl;
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

export async function getJobOpenings(): Promise<JobOpening[]> {
  return [...store.jobOpenings];
}

export async function createJobOpening(data: Omit<JobOpening, 'id' | 'applications_count' | 'created_at'>): Promise<JobOpening> {
  const job: JobOpening = {
    ...data,
    id: `job-${Date.now()}`,
    applications_count: 0,
    created_at: new Date().toISOString(),
  };
  store.jobOpenings.unshift(job);
  return job;
}

export async function getJobApplications(): Promise<JobApplication[]> {
  return [...store.jobApplications];
}

export async function applyForJob(jobId: string, studentId: string): Promise<JobApplication> {
  const existing = store.jobApplications.find(
    (a) => a.job_id === jobId && a.student_id === studentId
  );
  if (existing) throw new Error('Already applied to this opening');

  const job = store.jobOpenings.find((j) => j.id === jobId);
  const student = store.students.find((s) => s.id === studentId);

  const application: JobApplication = {
    id: `app-${Date.now()}`,
    job_id: jobId,
    job_title: job?.job_title,
    company_name: job?.company_name,
    student_id: studentId,
    student_name: student?.full_name,
    applied_at: new Date().toISOString(),
    status: 'Applied',
  };

  store.jobApplications.push(application);
  if (job) job.applications_count = (job.applications_count || 0) + 1;

  return application;
}
