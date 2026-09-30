import { store } from './data-store';
import { PlacementProfile, JobOpening, JobApplication } from '@/types';
import { recordAuditLog } from './audit-service';
import { createClient, isLiveSupabaseEnabled } from '@/lib/supabase/db';

export async function getPlacementProfiles(): Promise<PlacementProfile[]> {
  if (isLiveSupabaseEnabled()) {
    try {
      const supabase = createClient();
      const { data, error } = await supabase.from('placement_profiles').select('*');
      if (!error && data && data.length > 0) {
        store.placementProfiles = data as PlacementProfile[];
        return data as PlacementProfile[];
      }
    } catch (err) {
      console.warn('Supabase placement profiles query error, fallback to local persistent store:', err);
    }
  }
  return [...store.placementProfiles];
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

      if (!error && data) {
        return data as PlacementProfile;
      }
    } catch (err) {
      console.warn('Supabase getPlacementProfileForStudent error, checking local store:', err);
    }
  }

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

  Object.assign(profile, updates, { updated_at: new Date().toISOString() });

  // Update in student profile if placement status changed
  if (updates.placement_status) {
    const student = store.students.find((s) => s.id === studentId);
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

export async function getJobOpenings(): Promise<JobOpening[]> {
  if (isLiveSupabaseEnabled()) {
    try {
      const supabase = createClient();
      const { data, error } = await supabase.from('job_openings').select('*').order('created_at', { ascending: false });
      if (!error && data && data.length > 0) {
        store.jobOpenings = data as JobOpening[];
        return data as JobOpening[];
      }
    } catch (err) {
      console.warn('Supabase job openings query error, fallback to local persistent store:', err);
    }
  }
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
  store.persist();

  if (isLiveSupabaseEnabled()) {
    try {
      const supabase = createClient();
      await supabase.from('job_openings').insert({
        id: job.id,
        company_name: job.company_name,
        job_title: job.job_title,
        module: job.module,
        experience_required: job.experience_required,
        location: job.location,
        salary_range: job.salary_range,
        description: job.description,
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

export async function getJobApplications(): Promise<JobApplication[]> {
  if (isLiveSupabaseEnabled()) {
    try {
      const supabase = createClient();
      const { data, error } = await supabase.from('job_applications').select('*').order('applied_at', { ascending: false });
      if (!error && data && data.length > 0) {
        store.jobApplications = data as JobApplication[];
        return data as JobApplication[];
      }
    } catch (err) {
      console.warn('Supabase job applications query error, fallback to local persistent store:', err);
    }
  }
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

  return application;
}
