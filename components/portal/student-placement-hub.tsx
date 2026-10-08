'use client';

import * as React from 'react';
import {
  Briefcase,
  CheckCircle,
  Clock,
  AlertCircle,
  FileText,
  UploadCloud,
  ChevronRight,
  Lock,
  ExternalLink,
  ShieldCheck,
  User,
  Building,
  MapPin,
  Award,
  Check,
  X,
  AlertTriangle,
  ArrowRight,
  RefreshCw,
  Send,
  Plus,
  Sparkles,
  HelpCircle,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { FileUpload } from '@/components/ui/file-upload';
import { store } from '@/lib/services/data-store';
import {
  Student,
  PlacementEnrollment,
  PlacementCurrentStatus,
  PlacementEmploymentStatus,
  PlacementWorkMode,
  PlacementDocumentItem,
  JobOpening,
  JobApplication,
} from '@/types';
import {
  createPlacementEnrollment,
  getPlacementEnrollmentByStudentId,
  evaluatePlacementEligibility,
  requestReEnrollment,
  applyForJob,
  getJobOpenings,
  getJobApplications,
} from '@/lib/services/placement-service';
import { formatDate, formatDateTime, formatINR } from '@/lib/utils/formatters';

interface StudentPlacementHubProps {
  student: Student;
  onOpenResumeModal?: () => void;
}

export function StudentPlacementHub({ student, onOpenResumeModal }: StudentPlacementHubProps) {
  const [enrollment, setEnrollment] = React.useState<PlacementEnrollment | undefined>(
    store.placementEnrollments.find((e) => e.student_id === student.id)
  );
  const [openings, setOpenings] = React.useState<JobOpening[]>(store.jobOpenings);
  const [applications, setApplications] = React.useState<JobApplication[]>(
    store.jobApplications.filter((a) => a.student_id === student.id)
  );
  const [evaluation, setEvaluation] = React.useState<any>(null);

  // Modals
  const [isEnrollModalOpen, setIsEnrollModalOpen] = React.useState(false);
  const [isDocModalOpen, setIsDocModalOpen] = React.useState(false);
  const [isReEnrollModalOpen, setIsReEnrollModalOpen] = React.useState(false);
  const [reEnrollReason, setReEnrollReason] = React.useState('');
  const [applySuccessMessage, setApplySuccessMessage] = React.useState<string | null>(null);

  // Form State for Enrollment Registration
  const [currentStatus, setCurrentStatus] = React.useState<PlacementCurrentStatus>('Student');
  const [employmentStatus, setEmploymentStatus] = React.useState<PlacementEmploymentStatus>('Fresher');
  const [mobileNumber, setMobileNumber] = React.useState(student.phone || '');
  const [whatsappNumber, setWhatsappNumber] = React.useState(student.phone || '');

  // Experienced Fields
  const [currentCompany, setCurrentCompany] = React.useState('');
  const [currentDesignation, setCurrentDesignation] = React.useState('');
  const [totalExpYears, setTotalExpYears] = React.useState(0);
  const [sapExpYears, setSapExpYears] = React.useState(0);
  const [currentCtc, setCurrentCtc] = React.useState<number | undefined>(undefined);
  const [expectedCtc, setExpectedCtc] = React.useState(7.5);
  const [noticePeriod, setNoticePeriod] = React.useState('Immediate Joiner');
  const [lastWorkingDate, setLastWorkingDate] = React.useState('');

  // Education Fields
  const [highestQual, setHighestQual] = React.useState('Bachelor of Engineering / B.Tech');
  const [degree, setDegree] = React.useState('B.Tech / B.E.');
  const [specialization, setSpecialization] = React.useState('Information Technology');
  const [collegeUniversity, setCollegeUniversity] = React.useState('State Technical University');
  const [graduationYear, setGraduationYear] = React.useState(2024);
  const [percentageOrCgpa, setPercentageOrCgpa] = React.useState('8.0 CGPA');

  // Preferences
  const [targetRoles, setTargetRoles] = React.useState<string>('SAP Functional Consultant, Associate Consultant');
  const [prefLocations, setPrefLocations] = React.useState<string>('Bengaluru, Hyderabad, Pune, Mumbai, Remote');
  const [workMode, setWorkMode] = React.useState<PlacementWorkMode>('Hybrid');
  const [willingToRelocate, setWillingToRelocate] = React.useState(true);
  const [immediateJoiner, setImmediateJoiner] = React.useState(true);
  const [prefIndustry, setPrefIndustry] = React.useState('IT Services / Consulting / Enterprise Software');

  // Resume & Document items in enrollment form
  const [resumeUrl, setResumeUrl] = React.useState<string>((student as any).resume_url || '');
  const [documentItems, setDocumentItems] = React.useState<PlacementDocumentItem[]>([]);
  const [newDocType, setNewDocType] = React.useState<any>('Degree Certificate');
  const [newDocUrl, setNewDocUrl] = React.useState('');
  const [newDocName, setNewDocName] = React.useState('');

  // 7 Mandatory Terms & Declarations
  const [declInfoCorrect, setDeclInfoCorrect] = React.useState(false);
  const [declNoGuarantee, setDeclNoGuarantee] = React.useState(false);
  const [declAttendInterviews, setDeclAttendInterviews] = React.useState(false);
  const [declInformOffer, setDeclInformOffer] = React.useState(false);
  const [declShareResume, setDeclShareResume] = React.useState(false);
  const [declSensitiveDocs, setDeclSensitiveDocs] = React.useState(false);
  const [declKeepUpdated, setDeclKeepUpdated] = React.useState(false);

  const areAllDeclarationsAccepted =
    declInfoCorrect &&
    declNoGuarantee &&
    declAttendInterviews &&
    declInformOffer &&
    declShareResume &&
    declSensitiveDocs &&
    declKeepUpdated;

  const refreshData = async () => {
    const enr = store.placementEnrollments.find((e) => e.student_id === student.id);
    setEnrollment(enr);
    setOpenings([...store.jobOpenings]);
    setApplications(store.jobApplications.filter((a) => a.student_id === student.id));
    if (enr) {
      const evalRes = await evaluatePlacementEligibility(student.id);
      setEvaluation(evalRes);
    }
  };

  React.useEffect(() => {
    refreshData();
  }, [student.id]);

  const handleEnrollSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!areAllDeclarationsAccepted) {
      alert('You must accept all 7 mandatory terms and declarations before enrolling.');
      return;
    }

    try {
      const newEnr = await createPlacementEnrollment(
        {
          student_id: student.id,
          student_name: student.full_name,
          mobile_number: mobileNumber,
          whatsapp_number: whatsappNumber,
          sap_module: student.sap_module || 'SAP FICO',
          current_status: currentStatus,
          employment_status: employmentStatus,
          current_company: currentCompany || undefined,
          current_designation: currentDesignation || undefined,
          total_experience_years: totalExpYears,
          relevant_sap_experience_years: sapExpYears,
          current_ctc_lpa: currentCtc,
          expected_ctc_lpa: expectedCtc,
          notice_period: noticePeriod,
          last_working_date: lastWorkingDate || undefined,
          highest_qualification: highestQual,
          degree,
          specialization,
          college_university: collegeUniversity,
          graduation_year: graduationYear,
          percentage_or_cgpa: percentageOrCgpa,
          preferred_job_roles: targetRoles.split(',').map((r) => r.trim()).filter(Boolean),
          preferred_locations: prefLocations.split(',').map((l) => l.trim()).filter(Boolean),
          preferred_work_mode: workMode,
          willing_to_relocate: willingToRelocate,
          immediate_joiner: immediateJoiner,
          preferred_industry: prefIndustry,
          resume_url: resumeUrl || undefined,
          resume_name: resumeUrl ? `${student.full_name.replace(/\s+/g, '_')}_Resume.pdf` : undefined,
          documents: documentItems,
          declaration: {
            terms_version: 'v2026.1',
            accepted_by: student.id,
            accepted_by_name: student.full_name,
            accepted_at: new Date().toISOString(),
            confirmed_information_correct: declInfoCorrect,
            understands_no_guarantee: declNoGuarantee,
            agrees_attend_scheduled_interviews: declAttendInterviews,
            agrees_inform_external_offer: declInformOffer,
            authorizes_resume_sharing: declShareResume,
            understands_sensitive_docs_policy: declSensitiveDocs,
            agrees_keep_profile_updated: declKeepUpdated,
          },
        },
        student.user_id || student.id
      );

      setIsEnrollModalOpen(false);
      await refreshData();
      alert('Placement Enrollment submitted successfully! Your application is under review.');
    } catch (err: any) {
      alert(err.message || 'Error submitting placement enrollment');
    }
  };

  const handleApply = async (jobId: string) => {
    try {
      const app = await applyForJob(jobId, student.id);
      setApplySuccessMessage(`Successfully applied to ${app.company_name} for ${app.job_title}!`);
      setTimeout(() => setApplySuccessMessage(null), 5000);
      await refreshData();
    } catch (err: any) {
      alert(err.message || 'Error applying for job');
    }
  };

  const handleAddDocumentItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDocUrl.trim() && !newDocName.trim()) return;
    const item: PlacementDocumentItem = {
      id: `doc-${Date.now()}`,
      document_type: newDocType,
      file_name: newDocName || `${newDocType.replace(/\s+/g, '_')}.pdf`,
      file_url: newDocUrl || 'https://example.com/docs/file.pdf',
      uploaded_at: new Date().toISOString(),
      is_verified: false,
    };
    setDocumentItems((prev) => [...prev, item]);
    setNewDocName('');
    setNewDocUrl('');
    setIsDocModalOpen(false);
  };

  const handleReEnrollRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reEnrollReason.trim()) return;
    try {
      await requestReEnrollment(student.id, reEnrollReason.trim());
      setIsReEnrollModalOpen(false);
      setReEnrollReason('');
      await refreshData();
      alert('Re-enrollment requested. Placement office has been notified.');
    } catch (err: any) {
      alert(err.message || 'Error requesting re-enrollment');
    }
  };

  const isEnrolled = enrollment && enrollment.enrollment_status !== 'Not Enrolled';
  const isApproved =
    enrollment &&
    [
      'Enrollment Approved',
      'Profile Completion Pending',
      'Documents Pending',
      'Resume Review Pending',
      'Mock Interview Pending',
      'Placement Eligible',
      'Active Placement',
      'Placed',
    ].includes(enrollment.enrollment_status);

  // 7-Step Tracker Logic
  const getStepStatus = (stepIndex: number) => {
    if (!enrollment) return 'inactive';

    // Step 1: Enrollment Submitted
    if (stepIndex === 1) return 'completed';

    // Step 2: Profile Review
    if (stepIndex === 2) {
      if (enrollment.enrollment_status === 'Application Submitted') return 'current';
      if (enrollment.enrollment_status === 'Under Review' || enrollment.enrollment_status === 'More Information Required')
        return 'current';
      if (isApproved) return 'completed';
      return 'inactive';
    }

    // Step 3: Resume Review
    if (stepIndex === 3) {
      if (enrollment.resume_status === 'Reviewed & Approved') return 'completed';
      if (isApproved) return 'current';
      return 'inactive';
    }

    // Step 4: Document Verification
    if (stepIndex === 4) {
      const hasVerifiedDocs = enrollment.documents?.some((d) => d.is_verified);
      const allVerified =
        enrollment.documents?.length && enrollment.documents?.every((d) => d.is_verified);
      if (allVerified) return 'completed';
      if (hasVerifiedDocs || isApproved) return 'current';
      return 'inactive';
    }

    // Step 5: Mock Interview
    if (stepIndex === 5) {
      const profile = store.placementProfiles.find((p) => p.student_id === student.id);
      if (profile?.mock_interview_status === 'Completed') return 'completed';
      if (isApproved) return 'current';
      return 'inactive';
    }

    // Step 6: Placement Eligibility
    if (stepIndex === 6) {
      if (enrollment.is_placement_eligible) return 'completed';
      if (isApproved) return 'current';
      return 'inactive';
    }

    // Step 7: Job Opportunities
    if (stepIndex === 7) {
      if (applications.length > 0) return 'completed';
      if (enrollment.is_placement_eligible) return 'current';
      return 'inactive';
    }

    return 'inactive';
  };

  const steps = [
    { num: 1, title: 'Enrollment Submitted' },
    { num: 2, title: 'Profile Review' },
    { num: 3, title: 'Resume Review' },
    { num: 4, title: 'Document Verification' },
    { num: 5, title: 'Mock Interview' },
    { num: 6, title: 'Placement Eligibility' },
    { num: 7, title: 'Job Opportunities' },
  ];

  // Dynamic next step message
  const getDynamicNextStep = () => {
    if (!enrollment) return 'Enroll for Placement to initiate your career roadmap.';
    if (enrollment.enrollment_status === 'Application Submitted')
      return 'Your application is submitted. Our Placement Cell is conducting initial candidate profiling.';
    if (enrollment.enrollment_status === 'Under Review')
      return 'Placement coordinator is reviewing your academic standing and resume.';
    if (enrollment.enrollment_status === 'More Information Required')
      return `Action Required: ${enrollment.more_info_required_notes || 'Please provide additional details requested by the placement team.'}`;
    if (enrollment.enrollment_status === 'Enrollment Rejected')
      return `Enrollment Rejected: ${enrollment.rejection_reason || 'Please consult the placement department.'}`;
    if (enrollment.enrollment_status === 'Enrollment On Hold')
      return `Profile On Hold: ${enrollment.hold_reason || 'Temporary administrative hold in place.'}`;
    if (enrollment.enrollment_status === 'Student Withdrawn' || enrollment.enrollment_status === 'Placement Closed')
      return 'Placement support is currently closed. You may submit a Re-enrollment request below.';
    if (enrollment.is_placement_eligible)
      return 'You are verified and Placement Eligible! Explore corporate drives and submit applications below.';
    if (enrollment.resume_status !== 'Reviewed & Approved')
      return 'Next Step: Upload your updated resume for coordinator vetting and scoring.';
    return 'Next Step: Attend scheduled technical mock interview and verify qualification certificates.';
  };

  return (
    <div className="space-y-6">
      {applySuccessMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-300 text-emerald-900 rounded-xl flex items-center space-x-2 font-medium text-xs shadow-sm">
          <CheckCircle className="h-5 w-5 text-emerald-600 shrink-0" />
          <span>{applySuccessMessage}</span>
        </div>
      )}

      {/* ========================================================================= */}
      {/* CASE A: STUDENT NOT YET ENROLLED */}
      {/* ========================================================================= */}
      {!isEnrolled ? (
        <div className="space-y-6">
          {/* Hero Banner */}
          <div className="rounded-2xl bg-gradient-to-r from-blue-950 via-indigo-900 to-purple-950 text-white p-6 sm:p-10 shadow-lg border border-indigo-800/40">
            <div className="max-w-3xl space-y-4">
              <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-blue-500/20 text-blue-300 border border-blue-400/30">
                <Sparkles className="h-3.5 w-3.5 text-amber-300" />
                <span>Next-Gen Placement Cell & Corporate Connect</span>
              </span>

              <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
                Start Your Placement Journey
              </h2>

              <p className="text-sm sm:text-base text-slate-200 leading-relaxed">
                Prepare for your career opportunities through our structured placement support process.
                Complete your placement enrollment to access placement support, resume review, interview
                preparation, mock assessments, and eligible corporate job opportunities.
              </p>

              <div className="pt-2">
                <Button
                  variant="sap"
                  size="lg"
                  onClick={() => setIsEnrollModalOpen(true)}
                  className="bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold px-6 py-3 text-sm rounded-xl shadow-md flex items-center space-x-2"
                >
                  <Briefcase className="h-4 w-4" />
                  <span>Enroll for Placement</span>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          {/* 7-Stage Structured Placement Process Overview */}
          <Card className="border-slate-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-slate-800">
                How Next-Gen Placement Support Works
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-xs">
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
                <div className="h-6 w-6 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center text-xs">
                  1
                </div>
                <h4 className="font-bold text-slate-900">1. Placement Enrollment</h4>
                <p className="text-slate-500 leading-relaxed text-[11px]">
                  Submit your placement preferences, career status, previous experience, and accept the code of conduct.
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
                <div className="h-6 w-6 rounded-full bg-indigo-100 text-indigo-700 font-bold flex items-center justify-center text-xs">
                  2
                </div>
                <h4 className="font-bold text-slate-900">2. Resume & Docs Vetting</h4>
                <p className="text-slate-500 leading-relaxed text-[11px]">
                  Upload your CV for formatting review and verify academic degree credentials.
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
                <div className="h-6 w-6 rounded-full bg-purple-100 text-purple-700 font-bold flex items-center justify-center text-xs">
                  3
                </div>
                <h4 className="font-bold text-slate-900">3. Technical Mock Interview</h4>
                <p className="text-slate-500 leading-relaxed text-[11px]">
                  Attend technical and HR mock sessions with SAP industry experts to reach the required benchmark.
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
                <div className="h-6 w-6 rounded-full bg-emerald-100 text-emerald-700 font-bold flex items-center justify-center text-xs">
                  4
                </div>
                <h4 className="font-bold text-slate-900">4. Corporate Hiring Drives</h4>
                <p className="text-slate-500 leading-relaxed text-[11px]">
                  Once verified as Placement Eligible, unlock direct job applications and interview schedules with hiring partners.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Locked Job Openings Banner */}
          <Card className="border-dashed border-slate-300 bg-slate-50/50 p-6 text-center space-y-3">
            <div className="h-12 w-12 rounded-full bg-slate-200 flex items-center justify-center mx-auto text-slate-500">
              <Lock className="h-6 w-6" />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 text-sm">Corporate Job Openings are Locked</h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
                Active corporate SAP hiring drives from Deloitte USI, TCS, Infosys, and partner MNCs will unlock after your placement enrollment is submitted and approved.
              </p>
            </div>
            <Button
              variant="sap"
              size="sm"
              onClick={() => setIsEnrollModalOpen(true)}
              className="text-xs"
            >
              Enroll for Placement Support Now
            </Button>
          </Card>
        </div>
      ) : (
        /* ========================================================================= */
        /* CASE B: STUDENT IS ENROLLED (STATUS SCREEN & TRACKER) */
        /* ========================================================================= */
        <div className="space-y-6">
          {/* Status Header Screen */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Placement Support Desk
                </span>
                <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 mt-0.5">
                  Placement Enrollment Status
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Submitted On: <strong className="text-slate-700">{formatDate(enrollment.enrollment_date)}</strong>
                  {enrollment.assigned_placement_officer_name && (
                    <span> · Officer: <strong className="text-slate-700">{enrollment.assigned_placement_officer_name}</strong></span>
                  )}
                </p>
              </div>

              <div className="flex items-center space-x-2">
                <Badge
                  variant={
                    enrollment.is_placement_eligible
                      ? 'success'
                      : enrollment.enrollment_status === 'Enrollment Approved'
                      ? 'info'
                      : enrollment.enrollment_status === 'Enrollment Rejected'
                      ? 'destructive'
                      : enrollment.enrollment_status === 'Enrollment On Hold'
                      ? 'warning'
                      : 'secondary'
                  }
                  className="text-xs px-3 py-1 font-semibold"
                >
                  Status: {enrollment.enrollment_status}
                </Badge>
              </div>
            </div>

            {/* Dynamic Next Step Banner */}
            <div
              className={`p-3.5 rounded-xl border flex items-start space-x-2.5 text-xs ${
                enrollment.is_placement_eligible
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : enrollment.enrollment_status === 'Enrollment Rejected'
                  ? 'bg-rose-50 border-rose-200 text-rose-900'
                  : enrollment.enrollment_status === 'Enrollment On Hold'
                  ? 'bg-amber-50 border-amber-200 text-amber-900'
                  : 'bg-blue-50 border-blue-200 text-blue-900'
              }`}
            >
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold block">Next Step Recommendation:</span>
                <p className="text-[11px] mt-0.5 opacity-90">{getDynamicNextStep()}</p>
              </div>
            </div>

            {/* Re-enrollment trigger if withdrawn or rejected */}
            {['Student Withdrawn', 'Placement Closed', 'Enrollment Rejected'].includes(enrollment.enrollment_status) && (
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
                <div>
                  <p className="font-bold text-xs text-slate-800">Request Re-Enrollment</p>
                  <p className="text-[11px] text-slate-500">
                    If your previous placement support was closed or withdrawn, submit a re-enrollment request.
                  </p>
                </div>
                <Button
                  variant="sap"
                  size="sm"
                  onClick={() => setIsReEnrollModalOpen(true)}
                  className="text-xs h-8"
                >
                  Request Re-Enrollment
                </Button>
              </div>
            )}

            {/* 7-Step Progress Tracker */}
            <div className="pt-4 border-t border-slate-100">
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3">
                Placement Milestone Roadmap
              </h4>

              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2">
                {steps.map((st) => {
                  const status = getStepStatus(st.num);
                  const isDone = status === 'completed';
                  const isCur = status === 'current';

                  return (
                    <div
                      key={st.num}
                      className={`p-2.5 rounded-xl border text-center transition-all ${
                        isDone
                          ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                          : isCur
                          ? 'bg-blue-50 border-[#0A6ED1] text-blue-900 ring-1 ring-[#0A6ED1]'
                          : 'bg-slate-50 border-slate-200 text-slate-400'
                      }`}
                    >
                      <div
                        className={`h-6 w-6 rounded-full mx-auto flex items-center justify-center text-[10px] font-bold mb-1.5 ${
                          isDone
                            ? 'bg-emerald-600 text-white'
                            : isCur
                            ? 'bg-[#0A6ED1] text-white animate-pulse'
                            : 'bg-slate-200 text-slate-500'
                        }`}
                      >
                        {isDone ? <Check className="h-3.5 w-3.5" /> : st.num}
                      </div>
                      <p className={`text-[10px] font-semibold leading-tight ${isDone || isCur ? 'text-slate-900' : 'text-slate-400'}`}>
                        {st.title} {isDone && '✓'}
                      </p>
                      <span className="text-[9px] mt-0.5 block opacity-75">
                        {isDone ? 'Completed' : isCur ? 'In Progress' : 'Pending'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Placement Profile, Resume & Document Verification Columns */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Column 1: Candidate Preferences & Details */}
            <Card className="border-slate-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center space-x-1.5">
                  <User className="h-4 w-4 text-blue-600" />
                  <span>Enrolled Placement Profile</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-xs">
                <div>
                  <span className="text-slate-400 text-[10px] block">Target Roles:</span>
                  <span className="font-semibold text-slate-800">{enrollment.preferred_job_roles?.join(', ')}</span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] block">Preferred Locations:</span>
                  <span className="font-semibold text-slate-800">{enrollment.preferred_locations?.join(', ')}</span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] block">Current & Employment Status:</span>
                  <span className="font-semibold text-slate-800">{enrollment.current_status} ({enrollment.employment_status})</span>
                </div>
                {enrollment.current_company && (
                  <div>
                    <span className="text-slate-400 text-[10px] block">Current Employer:</span>
                    <span className="font-semibold text-slate-800">{enrollment.current_company} - {enrollment.current_designation}</span>
                  </div>
                )}
                <div>
                  <span className="text-slate-400 text-[10px] block">Work Mode & Expected CTC:</span>
                  <span className="font-semibold text-slate-800">{enrollment.preferred_work_mode} · ₹{enrollment.expected_ctc_lpa} LPA</span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] block">Notice Period:</span>
                  <span className="font-semibold text-slate-800">{enrollment.notice_period || 'Immediate'}</span>
                </div>
              </CardContent>
            </Card>

            {/* Column 2: Resume & Document Verification Desk */}
            <Card className="border-slate-200">
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <CardTitle className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center space-x-1.5">
                  <FileText className="h-4 w-4 text-purple-600" />
                  <span>Resume & Documents</span>
                </CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsDocModalOpen(true)}
                  className="text-[10px] h-6 px-2"
                >
                  <Plus className="h-3 w-3 mr-0.5" />
                  <span>Upload Doc</span>
                </Button>
              </CardHeader>
              <CardContent className="space-y-3 text-xs">
                {/* Resume Status */}
                <div className="p-2.5 rounded-lg border border-slate-100 bg-slate-50 flex items-center justify-between">
                  <div>
                    <span className="font-bold text-slate-800">Resume / CV</span>
                    <p className="text-[10px] text-slate-400">
                      {enrollment.resume_name || 'No resume uploaded'}
                    </p>
                  </div>
                  <Badge variant={enrollment.resume_status === 'Reviewed & Approved' ? 'success' : 'warning'}>
                    {enrollment.resume_status}
                  </Badge>
                </div>

                {/* Uploaded Documents List */}
                <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                  {enrollment.documents?.length ? (
                    enrollment.documents.map((d) => (
                      <div key={d.id} className="p-2 rounded border border-slate-100 flex items-center justify-between text-[11px]">
                        <div>
                          <span className="font-medium text-slate-800">{d.document_type}</span>
                          <p className="text-[9px] text-slate-400">{d.file_name}</p>
                        </div>
                        <span className={`text-[10px] font-bold ${d.is_verified ? 'text-emerald-600' : 'text-amber-600'}`}>
                          {d.is_verified ? 'Verified ✓' : 'Under Review'}
                        </span>
                      </div>
                    ))
                  ) : (
                    <p className="text-[11px] text-slate-400 italic">No verification documents uploaded yet.</p>
                  )}
                </div>

                {onOpenResumeModal && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onOpenResumeModal}
                    className="w-full text-xs h-7 border-purple-200 text-purple-700 hover:bg-purple-50"
                  >
                    Manage / Replace Resume
                  </Button>
                )}
              </CardContent>
            </Card>

            {/* Column 3: Eligibility & Mock Interview Status */}
            <Card className="border-slate-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center space-x-1.5">
                  <ShieldCheck className="h-4 w-4 text-emerald-600" />
                  <span>Placement Eligibility Audit</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-xs">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-slate-700">Official Standing:</span>
                    {enrollment.is_placement_eligible ? (
                      <Badge variant="success">Placement Eligible ✓</Badge>
                    ) : (
                      <Badge variant="warning">Criteria Pending</Badge>
                    )}
                  </div>
                  <p className="text-[10px] text-slate-500 leading-relaxed">
                    {enrollment.is_placement_eligible
                      ? 'You are authorized to apply directly for corporate hiring drives.'
                      : 'You can browse openings, but application submission requires meeting all eligibility criteria.'}
                  </p>
                </div>

                {/* Criteria List */}
                {evaluation?.criteriaResults && (
                  <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                    {evaluation.criteriaResults.map((c: any, idx: number) => (
                      <div key={idx} className="flex items-start space-x-1.5 text-[10px]">
                        {c.passed ? (
                          <Check className="h-3.5 w-3.5 text-emerald-600 shrink-0 mt-0.5" />
                        ) : (
                          <Clock className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
                        )}
                        <span className={c.passed ? 'text-slate-700' : 'text-amber-800 font-medium'}>
                          {c.criterion}: {c.currentValue}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Corporate Job Opportunities Board (Gated: Apply Button is strictly disabled unless eligible) */}
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center space-x-2">
                  <Briefcase className="h-4 w-4 text-[#0A6ED1]" />
                  <span>Corporate Job Openings & Hiring Drives</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {enrollment.is_placement_eligible
                    ? 'Submit applications for active corporate openings matching your SAP module.'
                    : 'Job opportunities are visible. Become Placement Eligible to unlock application submission.'}
                </p>
              </div>

              {!enrollment.is_placement_eligible && (
                <div className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-lg bg-amber-50 border border-amber-300 text-amber-900 text-xs">
                  <Lock className="h-3.5 w-3.5 text-amber-600" />
                  <span className="font-semibold">Apply Button Gated</span>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {openings.map((job) => {
                const hasApplied = applications.some((a) => a.job_id === job.id);
                const canApply = enrollment.is_placement_eligible && !hasApplied && job.status === 'Open';

                return (
                  <Card key={job.id} className="hover:border-slate-300 transition-all">
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <h4 className="font-bold text-slate-900 text-sm">{job.job_title}</h4>
                          <p className="text-xs font-semibold text-[#0A6ED1] mt-0.5">{job.company_name}</p>
                        </div>
                        <Badge variant="outline" className="text-[10px]">
                          {job.module}
                        </Badge>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-600 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                        <div>
                          <span className="text-slate-400 block text-[9px] uppercase">Experience:</span>
                          <span className="font-medium text-slate-800">{job.experience_required}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[9px] uppercase">Location:</span>
                          <span className="font-medium text-slate-800">{job.location}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[9px] uppercase">Salary Range:</span>
                          <span className="font-medium text-emerald-700">{job.salary_range}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[9px] uppercase">Deadline:</span>
                          <span className="font-medium text-slate-800">{formatDate(job.application_deadline)}</span>
                        </div>
                      </div>

                      <p className="text-[11px] text-slate-500 line-clamp-2">{job.description}</p>

                      <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                        <span className="text-[10px] text-slate-400">
                          {job.applications_count || 0} candidates applied
                        </span>

                        {hasApplied ? (
                          <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-3 py-1 rounded-lg border border-emerald-200">
                            Applied ✓
                          </span>
                        ) : (
                          <div className="flex items-center space-x-1.5">
                            {!enrollment.is_placement_eligible && (
                              <span className="text-[10px] text-amber-600 italic hidden sm:inline">
                                Eligibility required
                              </span>
                            )}
                            <Button
                              variant={canApply ? 'sap' : 'outline'}
                              size="sm"
                              disabled={!canApply}
                              onClick={() => handleApply(job.id)}
                              className={`text-xs h-8 px-3.5 ${
                                !canApply
                                  ? 'opacity-60 cursor-not-allowed text-slate-400 border-slate-200 bg-slate-100'
                                  : 'bg-emerald-600 hover:bg-emerald-700'
                              }`}
                              title={
                                !enrollment.is_placement_eligible
                                  ? 'You must be Placement Eligible to apply'
                                  : undefined
                              }
                            >
                              {!enrollment.is_placement_eligible ? (
                                <span className="flex items-center space-x-1">
                                  <Lock className="h-3 w-3" />
                                  <span>Apply (Gated)</span>
                                </span>
                              ) : (
                                <span>Apply for Job</span>
                              )}
                            </Button>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* PLACEMENT ENROLLMENT REGISTRATION FORM MODAL */}
      {/* ========================================================================= */}
      <Modal
        isOpen={isEnrollModalOpen}
        onClose={() => setIsEnrollModalOpen(false)}
        title="Placement Support Enrollment & Registration"
        description="Opt into Next-Gen Placement Support. Pre-filled from your official LMS profile."
        className="max-w-3xl"
      >
        <form onSubmit={handleEnrollSubmit} className="space-y-5 text-xs max-h-[75vh] overflow-y-auto pr-1">
          {/* Pre-filled LMS Info */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
            <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider flex items-center space-x-1">
              <User className="h-3.5 w-3.5 text-blue-600" />
              <span>Pre-Filled LMS Information</span>
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-[11px]">
              <div>
                <span className="text-slate-400 block">Student Name:</span>
                <span className="font-bold text-slate-800">{student.full_name}</span>
              </div>
              <div>
                <span className="text-slate-400 block">LMS Student ID:</span>
                <span className="font-bold text-slate-800 font-mono">{student.admission_number || student.student_code}</span>
              </div>
              <div>
                <span className="text-slate-400 block">Email Address:</span>
                <span className="font-bold text-slate-800">{student.email}</span>
              </div>
              <div>
                <span className="text-slate-400 block">Enrolled Course:</span>
                <span className="font-bold text-slate-800">{student.course_name}</span>
              </div>
              <div>
                <span className="text-slate-400 block">SAP Module:</span>
                <span className="font-bold text-blue-700">{student.sap_module || 'SAP ERP'}</span>
              </div>
              <div>
                <span className="text-slate-400 block">Batch & Faculty:</span>
                <span className="font-bold text-slate-800">{student.batch_name || 'SAP Batch'} ({student.trainer_name || 'Faculty'})</span>
              </div>
            </div>
          </div>

          {/* Contact Numbers */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Primary Mobile Number"
              value={mobileNumber}
              onChange={(e) => setMobileNumber(e.target.value)}
              required
            />
            <Input
              label="WhatsApp Notification Number"
              value={whatsappNumber}
              onChange={(e) => setWhatsappNumber(e.target.value)}
              required
            />
          </div>

          {/* Current Status & Employment Status */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Current Candidate Status *</label>
              <select
                value={currentStatus}
                onChange={(e) => setCurrentStatus(e.target.value as any)}
                className="w-full text-xs bg-white border border-slate-300 rounded-lg p-2.5 text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#0A6ED1]"
              >
                <option value="Student">Student</option>
                <option value="Fresher">Fresher</option>
                <option value="Working Professional">Working Professional</option>
                <option value="Career Restart">Career Restart</option>
                <option value="Looking for Job Change">Looking for Job Change</option>
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Employment Status *</label>
              <select
                value={employmentStatus}
                onChange={(e) => setEmploymentStatus(e.target.value as any)}
                className="w-full text-xs bg-white border border-slate-300 rounded-lg p-2.5 text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#0A6ED1]"
              >
                <option value="Fresher">Fresher</option>
                <option value="Currently Working">Currently Working</option>
                <option value="Not Working">Not Working</option>
                <option value="Serving Notice Period">Serving Notice Period</option>
                <option value="Immediate Joiner">Immediate Joiner</option>
              </select>
            </div>
          </div>

          {/* Professional Experience Section (if not pure fresher) */}
          {(currentStatus === 'Working Professional' ||
            currentStatus === 'Looking for Job Change' ||
            employmentStatus === 'Currently Working' ||
            employmentStatus === 'Serving Notice Period') && (
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
              <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider flex items-center space-x-1">
                <Building className="h-3.5 w-3.5 text-emerald-600" />
                <span>Professional Experience Details</span>
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input
                  label="Current Employer / Company"
                  placeholder="e.g. Tata Consultancy Services"
                  value={currentCompany}
                  onChange={(e) => setCurrentCompany(e.target.value)}
                />
                <Input
                  label="Current Designation"
                  placeholder="e.g. Associate Consultant"
                  value={currentDesignation}
                  onChange={(e) => setCurrentDesignation(e.target.value)}
                />
                <Input
                  type="number"
                  step="0.5"
                  label="Total Experience (Years)"
                  value={totalExpYears}
                  onChange={(e) => setTotalExpYears(Number(e.target.value))}
                />
                <Input
                  type="number"
                  step="0.5"
                  label="Relevant SAP Experience (Years)"
                  value={sapExpYears}
                  onChange={(e) => setSapExpYears(Number(e.target.value))}
                />
                <Input
                  type="number"
                  step="0.5"
                  label="Current CTC (LPA)"
                  placeholder="e.g. 5.5"
                  value={currentCtc || ''}
                  onChange={(e) => setCurrentCtc(Number(e.target.value))}
                />
                <Input
                  label="Notice Period Duration"
                  placeholder="e.g. 30 Days / 60 Days / Serving Notice"
                  value={noticePeriod}
                  onChange={(e) => setNoticePeriod(e.target.value)}
                />
              </div>
            </div>
          )}

          {/* Academic Education */}
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
            <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider flex items-center space-x-1">
              <Award className="h-3.5 w-3.5 text-purple-600" />
              <span>Highest Academic Qualification</span>
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Input
                label="Highest Qualification"
                value={highestQual}
                onChange={(e) => setHighestQual(e.target.value)}
                required
              />
              <Input
                label="Degree / Diploma"
                value={degree}
                onChange={(e) => setDegree(e.target.value)}
                required
              />
              <Input
                label="Specialization / Branch"
                value={specialization}
                onChange={(e) => setSpecialization(e.target.value)}
                required
              />
              <Input
                label="College / University"
                value={collegeUniversity}
                onChange={(e) => setCollegeUniversity(e.target.value)}
                required
              />
              <Input
                type="number"
                label="Graduation Year"
                value={graduationYear}
                onChange={(e) => setGraduationYear(Number(e.target.value))}
                required
              />
              <Input
                label="Percentage / CGPA"
                value={percentageOrCgpa}
                onChange={(e) => setPercentageOrCgpa(e.target.value)}
                required
              />
            </div>
          </div>

          {/* Placement Preferences */}
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
            <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider flex items-center space-x-1">
              <MapPin className="h-3.5 w-3.5 text-rose-600" />
              <span>Placement Preferences</span>
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                label="Preferred Job Roles (comma separated)"
                value={targetRoles}
                onChange={(e) => setTargetRoles(e.target.value)}
                required
              />
              <Input
                label="Preferred Locations (comma separated)"
                value={prefLocations}
                onChange={(e) => setPrefLocations(e.target.value)}
                required
              />
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Preferred Work Mode *</label>
                <select
                  value={workMode}
                  onChange={(e) => setWorkMode(e.target.value as any)}
                  className="w-full text-xs bg-white border border-slate-300 rounded-lg p-2.5 text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#0A6ED1]"
                >
                  <option value="Hybrid">Hybrid</option>
                  <option value="On-Site">On-Site</option>
                  <option value="Remote">Remote</option>
                  <option value="Any">Any Work Mode</option>
                </select>
              </div>
              <Input
                type="number"
                step="0.5"
                label="Expected CTC (LPA)"
                value={expectedCtc}
                onChange={(e) => setExpectedCtc(Number(e.target.value))}
                required
              />
            </div>

            <div className="flex flex-wrap gap-4 pt-2">
              <label className="flex items-center space-x-2 cursor-pointer text-slate-700 font-medium">
                <input
                  type="checkbox"
                  checked={willingToRelocate}
                  onChange={(e) => setWillingToRelocate(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <span>Willing to Relocate Anywhere in India</span>
              </label>

              <label className="flex items-center space-x-2 cursor-pointer text-slate-700 font-medium">
                <input
                  type="checkbox"
                  checked={immediateJoiner}
                  onChange={(e) => setImmediateJoiner(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <span>Available as Immediate Joiner</span>
              </label>
            </div>
          </div>

          {/* Resume Upload / URL */}
          <div className="p-4 bg-purple-50/50 rounded-xl border border-purple-200 space-y-2">
            <h4 className="font-bold text-purple-950 text-xs uppercase tracking-wider flex items-center space-x-1">
              <FileText className="h-3.5 w-3.5 text-purple-600" />
              <span>Placement Resume / CV</span>
            </h4>
            <Input
              label="Resume Document URL or Storage Path"
              placeholder="https://example.com/resumes/my_resume.pdf"
              value={resumeUrl}
              onChange={(e) => setResumeUrl(e.target.value)}
            />
            <p className="text-[10px] text-purple-700">
              You can also upload or update your PDF resume file in the portal at any time before interview drives.
            </p>
          </div>

          {/* Initial Verification Documents Upload */}
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider">
                Initial Verification Documents
              </h4>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsDocModalOpen(true)}
                className="text-[10px] h-6 px-2"
              >
                + Add Document
              </Button>
            </div>
            {documentItems.length === 0 ? (
              <p className="text-[11px] text-slate-400 italic">
                Optional during initial enrollment. You can upload degree certificates, ID proofs, and certifications now or later.
              </p>
            ) : (
              <div className="space-y-1">
                {documentItems.map((doc, idx) => (
                  <div key={idx} className="p-2 bg-white rounded border border-slate-200 flex items-center justify-between text-[11px]">
                    <span className="font-medium text-slate-800">{doc.document_type}: {doc.file_name}</span>
                    <span className="text-[10px] text-emerald-600 font-bold">Attached</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* PLACEMENT TERMS AND DECLARATION: 7 Checkboxes */}
          <div className="p-4 bg-amber-50/60 rounded-xl border border-amber-300 space-y-3">
            <div className="flex items-center space-x-2 text-amber-900 font-bold text-xs">
              <ShieldCheck className="h-4 w-4 text-amber-700 shrink-0" />
              <span>Placement Code of Conduct & Mandatory Declarations (v2026.1)</span>
            </div>
            <p className="text-[11px] text-amber-800">
              You must review and accept all 7 declarations below to enable the enrollment submission.
            </p>

            <div className="space-y-2 text-[11px] text-slate-800 pt-1">
              <label className="flex items-start space-x-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={declInfoCorrect}
                  onChange={(e) => setDeclInfoCorrect(e.target.checked)}
                  className="rounded border-amber-400 text-blue-600 focus:ring-blue-500 mt-0.5"
                />
                <span>I confirm that all the information provided in this placement registration is true, correct, and verified.</span>
              </label>

              <label className="flex items-start space-x-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={declNoGuarantee}
                  onChange={(e) => setDeclNoGuarantee(e.target.checked)}
                  className="rounded border-amber-400 text-blue-600 focus:ring-blue-500 mt-0.5"
                />
                <span>I understand that placement support does not guarantee employment and depends on student performance and employer selection.</span>
              </label>

              <label className="flex items-start space-x-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={declAttendInterviews}
                  onChange={(e) => setDeclAttendInterviews(e.target.checked)}
                  className="rounded border-amber-400 text-blue-600 focus:ring-blue-500 mt-0.5"
                />
                <span>I agree to attend scheduled technical and HR interviews punctually after confirming availability.</span>
              </label>

              <label className="flex items-start space-x-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={declInformOffer}
                  onChange={(e) => setDeclInformOffer(e.target.checked)}
                  className="rounded border-amber-400 text-blue-600 focus:ring-blue-500 mt-0.5"
                />
                <span>I agree to inform the Next-Gen placement team immediately if I receive any external or off-campus job offer.</span>
              </label>

              <label className="flex items-start space-x-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={declShareResume}
                  onChange={(e) => setDeclShareResume(e.target.checked)}
                  className="rounded border-amber-400 text-blue-600 focus:ring-blue-500 mt-0.5"
                />
                <span>I authorize the institute to share my approved resume and placement profile with prospective corporate employers.</span>
              </label>

              <label className="flex items-start space-x-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={declSensitiveDocs}
                  onChange={(e) => setDeclSensitiveDocs(e.target.checked)}
                  className="rounded border-amber-400 text-blue-600 focus:ring-blue-500 mt-0.5"
                />
                <span>I understand that sensitive documents (Aadhaar, PAN, marksheets) will only be shared when required and according to placement policy.</span>
              </label>

              <label className="flex items-start space-x-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={declKeepUpdated}
                  onChange={(e) => setDeclKeepUpdated(e.target.checked)}
                  className="rounded border-amber-400 text-blue-600 focus:ring-blue-500 mt-0.5"
                />
                <span>I agree to keep my placement profile, contact numbers, and resume updated throughout the placement cycle.</span>
              </label>
            </div>
          </div>

          {/* Form Actions with Strict Gating */}
          <div className="flex items-center justify-between pt-3 border-t border-slate-200">
            <span className="text-[11px] text-slate-500">
              {areAllDeclarationsAccepted ? (
                <span className="text-emerald-700 font-bold flex items-center space-x-1">
                  <Check className="h-3.5 w-3.5" />
                  <span>All 7 declarations accepted</span>
                </span>
              ) : (
                <span className="text-amber-700 font-medium">
                  Accept all 7 declarations to unlock submission
                </span>
              )}
            </span>

            <div className="flex space-x-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setIsEnrollModalOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                variant="sap"
                size="sm"
                disabled={!areAllDeclarationsAccepted}
                className={!areAllDeclarationsAccepted ? 'opacity-50 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-700'}
              >
                Submit Placement Enrollment
              </Button>
            </div>
          </div>
        </form>
      </Modal>

      {/* ========================================================================= */}
      {/* MODAL: ADD VERIFICATION DOCUMENT */}
      {/* ========================================================================= */}
      <Modal
        isOpen={isDocModalOpen}
        onClose={() => setIsDocModalOpen(false)}
        title="Upload Placement Verification Document"
        description="Provide required credentials for corporate background verification."
      >
        <form onSubmit={handleAddDocumentItem} className="space-y-4 text-xs">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Document Type *</label>
            <select
              value={newDocType}
              onChange={(e) => setNewDocType(e.target.value as any)}
              className="w-full text-xs bg-white border border-slate-300 rounded-lg p-2.5 text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#0A6ED1]"
            >
              <option value="Degree Certificate">Degree Certificate</option>
              <option value="Aadhaar / ID Proof">Aadhaar / ID Proof</option>
              <option value="PAN Card">PAN Card</option>
              <option value="Passport Photo">Passport Size Photo</option>
              <option value="Marksheets">Marksheets</option>
              <option value="Experience Letter">Experience Letter</option>
              <option value="Relieving Letter">Relieving Letter</option>
              <option value="SAP Certification">SAP Certification</option>
              <option value="Other Certification">Other Certification</option>
            </select>
          </div>

          <Input
            label="Document File Name"
            placeholder="e.g. BE_Degree_Convocation.pdf"
            value={newDocName}
            onChange={(e) => setNewDocName(e.target.value)}
            required
          />

          <Input
            label="File URL / Cloud Document Path"
            placeholder="https://example.com/docs/degree.pdf"
            value={newDocUrl}
            onChange={(e) => setNewDocUrl(e.target.value)}
            required
          />

          <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
            <Button type="button" variant="outline" size="sm" onClick={() => setIsDocModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="sap" size="sm">
              Attach Document
            </Button>
          </div>
        </form>
      </Modal>

      {/* ========================================================================= */}
      {/* MODAL: REQUEST RE-ENROLLMENT */}
      {/* ========================================================================= */}
      <Modal
        isOpen={isReEnrollModalOpen}
        onClose={() => setIsReEnrollModalOpen(false)}
        title="Request Placement Re-Enrollment"
        description="Re-activate your placement lifecycle after previous withdrawal or closure."
      >
        <form onSubmit={handleReEnrollRequest} className="space-y-4 text-xs">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Reason for Re-Enrollment Request <span className="text-rose-500">*</span>
            </label>
            <textarea
              required
              rows={4}
              placeholder="e.g. Completed semester examinations and now available full-time for corporate hiring drives..."
              value={reEnrollReason}
              onChange={(e) => setReEnrollReason(e.target.value)}
              className="w-full text-xs p-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
            <Button type="button" variant="outline" size="sm" onClick={() => setIsReEnrollModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="sap" size="sm">
              Submit Re-Enrollment Request
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
