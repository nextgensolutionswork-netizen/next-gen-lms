'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  Briefcase,
  Plus,
  Search,
  CheckCircle,
  FileCheck,
  Building,
  MapPin,
  Calendar,
  ExternalLink,
  Award,
  ShieldAlert,
  Users,
  Check,
  GraduationCap,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { FileUpload } from '@/components/ui/file-upload';
import { store } from '@/lib/services/data-store';
import { JobOpening, PlacementProfile, JobApplication } from '@/types';
import {
  createJobOpening,
  updatePlacementProfile,
  applyForJob,
  updateJobOpeningStatus,
  deleteJobOpening,
  updateJobApplicationStatus,
} from '@/lib/services/placement-service';
import { formatDate } from '@/lib/utils/formatters';
import { useAuth } from '@/components/providers/auth-provider';

export default function PlacementPage() {
  const { user, role, hasPermission } = useAuth();
  const [profiles, setProfiles] = React.useState<PlacementProfile[]>(store.placementProfiles || []);
  const [jobs, setJobs] = React.useState<JobOpening[]>(store.jobOpenings || []);
  const [applications, setApplications] = React.useState<JobApplication[]>(store.jobApplications || []);
  const [isJobModalOpen, setIsJobModalOpen] = React.useState(false);
  const [selectedStudentForProfile, setSelectedStudentForProfile] = React.useState<PlacementProfile | null>(null);
  const [resumeUrl, setResumeUrl] = React.useState('');

  // Candidate referral modal state (From Job Card)
  const [selectedJobForApply, setSelectedJobForApply] = React.useState<JobOpening | null>(null);
  const [isApplyModalOpen, setIsApplyModalOpen] = React.useState(false);
  const [applyStudentId, setApplyStudentId] = React.useState('');
  const [applyNotes, setApplyNotes] = React.useState('');
  const [applyError, setApplyError] = React.useState<string | null>(null);
  const [applySuccess, setApplySuccess] = React.useState(false);

  // Candidate referral modal state (From Student Row)
  const [selectedStudentForReferral, setSelectedStudentForReferral] = React.useState<PlacementProfile | null>(null);
  const [isReferStudentModalOpen, setIsReferStudentModalOpen] = React.useState(false);
  const [referJobId, setReferJobId] = React.useState('');
  const [referNotes, setReferNotes] = React.useState('');
  const [referError, setReferError] = React.useState<string | null>(null);
  const [referSuccess, setReferSuccess] = React.useState(false);

  // View Applicants modal state
  const [viewJobApplications, setViewJobApplications] = React.useState<JobOpening | null>(null);

  const coordinatorActorId = React.useMemo(() => {
    return user?.id || (store.users || []).find((u) => u.role === 'placement_coordinator')?.id || 'usr-placement';
  }, [user?.id]);

  const canManage =
    hasPermission('placement:write') ||
    role === 'placement_coordinator' ||
    role === 'admin' ||
    role === 'super_admin';

  // New Job form state
  const [company, setCompany] = React.useState('');
  const [title, setTitle] = React.useState('');
  const [module, setModule] = React.useState('SAP FICO');
  const [exp, setExp] = React.useState('0 - 2 Years');
  const [location, setLocation] = React.useState('Hyderabad / Bengaluru');
  const [salary, setSalary] = React.useState('₹6.5 - ₹8.5 LPA');
  const [deadline, setDeadline] = React.useState('2026-04-30');
  const [desc, setDesc] = React.useState('');

  // Profile Edit form state
  const [resumeStatus, setResumeStatus] = React.useState<any>('Reviewed & Approved');
  const [mockStatus, setMockStatus] = React.useState<any>('Completed');
  const [techScore, setTechScore] = React.useState<number | ''>('');
  const [hrScore, setHrScore] = React.useState<number | ''>('');
  const [placeStatus, setPlaceStatus] = React.useState<any>('Interview Scheduled');

  // Search & Filter state
  const [jobSearch, setJobSearch] = React.useState('');
  const [jobStatusFilter, setJobStatusFilter] = React.useState<'All' | 'Open' | 'Closed'>('All');
  const [profileSearch, setProfileSearch] = React.useState('');
  const [profileStageFilter, setProfileStageFilter] = React.useState<string>('All');

  const filteredJobs = React.useMemo(() => {
    return jobs.filter((j) => {
      const q = jobSearch.toLowerCase().trim();
      const matchesSearch =
        !q ||
        j.company_name?.toLowerCase().includes(q) ||
        j.job_title?.toLowerCase().includes(q) ||
        j.module?.toLowerCase().includes(q) ||
        j.location?.toLowerCase().includes(q);
      const matchesStatus = jobStatusFilter === 'All' || j.status === jobStatusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [jobs, jobSearch, jobStatusFilter]);

  const filteredProfiles = React.useMemo(() => {
    return profiles.filter((p) => {
      const q = profileSearch.toLowerCase().trim();
      const matchesSearch =
        !q ||
        p.student_name?.toLowerCase().includes(q) ||
        p.resume_status?.toLowerCase().includes(q) ||
        p.placement_status?.toLowerCase().includes(q);
      const matchesStage = profileStageFilter === 'All' || p.placement_status === profileStageFilter;
      return matchesSearch && matchesStage;
    });
  }, [profiles, profileSearch, profileStageFilter]);

  const refreshData = () => {
    setProfiles([...(store.placementProfiles || [])]);
    setJobs([...(store.jobOpenings || [])]);
    setApplications([...(store.jobApplications || [])]);
  };

  const handleCreateJob = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!company || !title) return;
    await createJobOpening({
      company_name: company,
      job_title: title,
      module,
      experience_required: exp,
      location,
      salary_range: salary,
      application_deadline: deadline,
      description: desc,
      status: 'Open',
    });
    setIsJobModalOpen(false);
    setCompany('');
    setTitle('');
    refreshData();
  };

  const handleToggleJobStatus = async (jobId: string, currentStatus: string) => {
    const newStatus = currentStatus === 'Open' ? 'Closed' : 'Open';
    await updateJobOpeningStatus(jobId, newStatus);
    refreshData();
  };

  const handleDeleteJob = async (jobId: string) => {
    if (confirm('Are you sure you want to delete this job opening?')) {
      await deleteJobOpening(jobId);
      refreshData();
    }
  };

  const handleApplyStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedJobForApply || !applyStudentId) return;
    setApplyError(null);
    setApplySuccess(false);
    try {
      await applyForJob(selectedJobForApply.id, applyStudentId, coordinatorActorId);
      setApplySuccess(true);
      refreshData();
      setTimeout(() => {
        setIsApplyModalOpen(false);
        setSelectedJobForApply(null);
        setApplyStudentId('');
        setApplyNotes('');
        setApplySuccess(false);
      }, 1500);
    } catch (err: any) {
      setApplyError(err.message || 'Failed to submit candidate application');
    }
  };

  const handleReferStudentFromTable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudentForReferral || !referJobId) return;
    setReferError(null);
    setReferSuccess(false);
    try {
      await applyForJob(referJobId, selectedStudentForReferral.student_id, coordinatorActorId);
      setReferSuccess(true);
      refreshData();
      setTimeout(() => {
        setIsReferStudentModalOpen(false);
        setSelectedStudentForReferral(null);
        setReferJobId('');
        setReferNotes('');
        setReferSuccess(false);
      }, 1500);
    } catch (err: any) {
      setReferError(err.message || 'Failed to submit candidate application');
    }
  };

  const handleUpdateApplicantStatus = async (applicationId: string, newStatus: JobApplication['status']) => {
    try {
      await updateJobApplicationStatus(applicationId, newStatus, coordinatorActorId);
      refreshData();
    } catch (err: any) {
      alert('Error updating application status: ' + (err.message || 'Unknown error'));
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudentForProfile) return;
    await updatePlacementProfile(
      selectedStudentForProfile.student_id,
      {
        resume_url: resumeUrl || undefined,
        resume_status: resumeStatus,
        mock_interview_status: mockStatus,
        technical_interview_score: techScore !== '' ? Number(techScore) : undefined,
        hr_interview_score: hrScore !== '' ? Number(hrScore) : undefined,
        placement_status: placeStatus,
      },
      coordinatorActorId
    );
    setSelectedStudentForProfile(null);
    refreshData();
  };

  const canAccess =
    ['super_admin', 'admin', 'placement_coordinator'].includes(role || '') ||
    hasPermission('placement:write') ||
    hasPermission('placements:write');

  if (!canAccess) {
    return (
      <div className="p-8 max-w-xl mx-auto text-center space-y-4">
        <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
          <ShieldAlert className="w-6 h-6" />
        </div>
        <h2 className="text-xl font-bold text-slate-800">Access Restricted</h2>
        <p className="text-sm text-slate-500">
          You do not have administrative permissions to view or manage corporate placement drives and candidate records.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Placement Cell & Corporate Hiring</h1>
          <p className="text-xs text-slate-500 mt-1">
            Student career profiles, resume vetting, mock technical/HR interview scores, and corporate SAP hiring drives.
          </p>
        </div>
        {canManage && (
          <Button
            variant="sap"
            size="sm"
            onClick={() => setIsJobModalOpen(true)}
            className="text-xs flex items-center space-x-1"
          >
            <Plus className="h-4 w-4" />
            <span>Post Job Opening</span>
          </Button>
        )}
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex items-center space-x-2 border-b border-slate-200 pb-3 text-sm">
        <Link
          href="/placement"
          className="px-3 py-1.5 rounded-lg bg-[#0A6ED1] text-white font-semibold flex items-center space-x-2 shadow-xs"
        >
          <Briefcase className="h-4 w-4" />
          <span>Drives & Openings</span>
          <Badge variant="outline" className="ml-1 bg-white/20 text-white border-0 text-[10px]">
            {jobs.length}
          </Badge>
        </Link>
        <Link
          href="/placement/enrollments"
          className="px-3 py-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 font-medium flex items-center space-x-2 transition-colors"
        >
          <CheckCircle className="h-4 w-4 text-purple-600" />
          <span>Enrollments & Candidates</span>
          <Badge variant="secondary" className="ml-1 text-[10px]">
            {store.placementEnrollments?.length || 0}
          </Badge>
        </Link>
      </div>

      {/* Drives Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search drives by company, role, location, module..."
            value={jobSearch}
            onChange={(e) => setJobSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-[#0A6ED1]"
          />
        </div>
        <div className="flex items-center space-x-1.5 text-xs">
          <span className="text-slate-500 font-medium">Status:</span>
          {(['All', 'Open', 'Closed'] as const).map((st) => (
            <button
              key={st}
              onClick={() => setJobStatusFilter(st)}
              className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors ${
                jobStatusFilter === st
                  ? 'bg-[#0A6ED1] text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredJobs.length === 0 ? (
          <div className="col-span-1 md:col-span-2 p-10 text-center bg-white border border-slate-200 rounded-xl space-y-3">
            <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mx-auto">
              <Briefcase className="h-6 w-6" />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 text-sm">
                {jobSearch || jobStatusFilter !== 'All'
                  ? 'No Matching Job Openings Found'
                  : 'No Corporate Job Drives Active'}
              </h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
                {jobSearch || jobStatusFilter !== 'All'
                  ? `No job openings matched "${jobSearch || jobStatusFilter}". Try adjusting your keywords or clearing the filter.`
                  : 'There are currently no corporate hiring drives open. Post a job opening to start referring eligible candidates.'}
              </p>
            </div>
            {canManage && !jobSearch && jobStatusFilter === 'All' && (
              <Button
                variant="sap"
                size="sm"
                onClick={() => setIsJobModalOpen(true)}
                className="text-xs inline-flex items-center space-x-1"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Post Job Opening</span>
              </Button>
            )}
          </div>
        ) : (
          filteredJobs.map((j) => (
            <Card key={j.id} className="hover:border-[#0A6ED1] transition-all">
              <CardContent className="p-5 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm">{j.job_title}</h3>
                    <p className="text-xs text-[#0A6ED1] font-semibold mt-0.5">{j.company_name}</p>
                  </div>
                  <Badge variant={j.status === 'Open' ? 'success' : 'secondary'}>{j.status}</Badge>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs text-slate-600 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                  <div className="flex items-center space-x-1.5">
                    <MapPin className="h-3.5 w-3.5 text-slate-400" />
                    <span>{j.location}</span>
                  </div>
                  <div className="flex items-center space-x-1.5">
                    <Briefcase className="h-3.5 w-3.5 text-slate-400" />
                    <span>{j.salary_range}</span>
                  </div>
                  <div className="flex items-center space-x-1.5 col-span-2">
                    <Calendar className="h-3.5 w-3.5 text-slate-400" />
                    <span>Deadline: {formatDate(j.application_deadline)}</span>
                  </div>
                </div>

                <p className="text-xs text-slate-600">{j.description}</p>

                <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setViewJobApplications(j)}
                    className="font-bold text-[#0A6ED1] hover:underline flex items-center space-x-1.5"
                    title="Click to view all student applicants for this drive"
                  >
                    <Users className="h-3.5 w-3.5" />
                    <span>{j.applications_count || 0} Student Applications</span>
                  </button>
                  <div className="flex items-center space-x-2">
                    <span className="text-[10px] text-slate-400">Target: {j.module}</span>
                    {canManage && (
                      <>
                        <Button
                          variant="sap"
                          size="sm"
                          onClick={() => {
                            setSelectedJobForApply(j);
                            setApplyError(null);
                            setApplySuccess(false);
                            const firstEligible = (store.students || []).find((s) => {
                              const enr = (store.placementEnrollments || []).find((e) => e.student_id === s.id);
                              return enr?.is_placement_eligible;
                            });
                            setApplyStudentId(firstEligible?.id || store.students?.[0]?.id || '');
                            setIsApplyModalOpen(true);
                          }}
                          disabled={j.status !== 'Open'}
                          className="text-xs px-2.5 py-1"
                        >
                          Refer Candidate
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleToggleJobStatus(j.id, j.status)}
                          className="text-xs px-2 py-1"
                        >
                          {j.status === 'Open' ? 'Close Drive' : 'Reopen'}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteJob(j.id)}
                          className="text-xs px-2 py-1 text-rose-600 hover:bg-rose-50"
                        >
                          Delete
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Student Placement Profiles Table */}
      <Card>
        <CardHeader className="pb-3 border-b border-slate-100">
          <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
            <div>
              <CardTitle className="text-sm">Student Placement Profiles & Interview Scores</CardTitle>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Technical and HR mock ratings, resume vetting, and active placement pipeline stages.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
              <div className="relative w-full sm:w-56">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filter candidate by name..."
                  value={profileSearch}
                  onChange={(e) => setProfileSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-[#0A6ED1]"
                />
              </div>

              <select
                value={profileStageFilter}
                onChange={(e) => setProfileStageFilter(e.target.value)}
                className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700 font-semibold focus:outline-none focus:ring-1 focus:ring-[#0A6ED1]"
              >
                <option value="All">All Placement Stages</option>
                <option value="Not Started">Not Started</option>
                <option value="Resume Preparation">Resume Preparation</option>
                <option value="Mock Interview">Mock Interview</option>
                <option value="Interview Scheduled">Interview Scheduled</option>
                <option value="Placed">Placed</option>
              </select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 text-slate-600 uppercase border-b border-slate-100 font-semibold">
              <tr>
                <th className="px-4 py-3">Student Name</th>
                <th className="px-4 py-3">Resume Status</th>
                <th className="px-4 py-3">Mock Interview</th>
                <th className="px-4 py-3">Tech Score</th>
                <th className="px-4 py-3">HR Score</th>
                <th className="px-4 py-3">Placement Stage</th>
                <th className="px-4 py-3 text-right">Update</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredProfiles.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center">
                    <div className="max-w-md mx-auto space-y-3">
                      <div className="w-12 h-12 rounded-full bg-purple-50 text-purple-600 flex items-center justify-center mx-auto">
                        <GraduationCap className="h-6 w-6" />
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-800 text-sm">
                          {profileSearch || profileStageFilter !== 'All'
                            ? 'No Matching Candidate Profiles Found'
                            : 'No Student Placement Profiles Found'}
                        </h4>
                        <p className="text-xs text-slate-500 mt-1">
                          {profileSearch || profileStageFilter !== 'All'
                            ? 'No candidate profiles matched your search or stage filter. Try clearing the filter.'
                            : 'Candidate profiles will appear here once students are enrolled in placement services.'}
                        </p>
                      </div>
                      <div className="pt-1">
                        <Link href="/placement/enrollments">
                          <Button variant="outline" size="sm" className="text-xs text-purple-700 border-purple-200 hover:bg-purple-50">
                            Manage Placement Enrollments &rarr;
                          </Button>
                        </Link>
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredProfiles.map((pp) => (
                  <tr key={pp.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-semibold text-slate-800">{pp.student_name}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center space-x-2">
                        <Badge variant={pp.resume_status === 'Reviewed & Approved' ? 'success' : 'warning'}>
                          {pp.resume_status}
                        </Badge>
                        {pp.resume_url && (
                          <a
                            href={pp.resume_url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-blue-600 hover:text-blue-800 p-1"
                            title="Open student resume"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={pp.mock_interview_status === 'Completed' ? 'success' : 'outline'}>
                        {pp.mock_interview_status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 font-bold text-blue-600">
                      {typeof pp.technical_interview_score === 'number' ? `${pp.technical_interview_score} / 100` : '—'}
                    </td>
                    <td className="px-4 py-3 font-bold text-purple-600">
                      {typeof pp.hr_interview_score === 'number' ? `${pp.hr_interview_score} / 100` : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="default">{pp.placement_status}</Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {canManage && (
                        <div className="flex items-center justify-end space-x-1.5">
                          <Button
                            variant="sap"
                            size="sm"
                            onClick={() => {
                              setSelectedStudentForReferral(pp);
                              setReferError(null);
                              setReferSuccess(false);
                              const openJobs = (store.jobOpenings || []).filter((job) => job.status === 'Open');
                              setReferJobId(openJobs[0]?.id || '');
                              setIsReferStudentModalOpen(true);
                            }}
                            className="text-xs px-2.5 py-1 shadow-xs"
                          >
                            Refer to Drive
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedStudentForProfile(pp);
                              setResumeUrl(pp.resume_url || '');
                              setResumeStatus(pp.resume_status);
                              setMockStatus(pp.mock_interview_status);
                              setTechScore(typeof pp.technical_interview_score === 'number' ? pp.technical_interview_score : '');
                              setHrScore(typeof pp.hr_interview_score === 'number' ? pp.hr_interview_score : '');
                              setPlaceStatus(pp.placement_status);
                            }}
                            className="text-xs px-2.5 py-1"
                          >
                            Update Profile
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Post Job Opening Modal */}
      <Modal
        isOpen={isJobModalOpen}
        onClose={() => setIsJobModalOpen(false)}
        title="Post Corporate Job Opportunity"
        description="Share enterprise SAP consultant vacancies with eligible students."
      >
        <form onSubmit={handleCreateJob} className="space-y-4 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Hiring Company *"
              placeholder="e.g. Deloitte / TCS / IBM"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              required
            />
            <Input
              label="Job Role Title *"
              placeholder="e.g. SAP FICO Associate Consultant"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Target Module
              </label>
              <select
                value={module}
                onChange={(e) => setModule(e.target.value)}
                className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800"
              >
                <option value="SAP FICO">SAP FICO</option>
                <option value="SAP MM">SAP MM</option>
                <option value="SAP SD">SAP SD</option>
                <option value="SAP ABAP">SAP ABAP on HANA</option>
              </select>
            </div>
            <Input
              label="Location"
              placeholder="e.g. Hyderabad / Bengaluru"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Salary Range (CTC)"
              placeholder="e.g. ₹6.5 - ₹8.5 LPA"
              value={salary}
              onChange={(e) => setSalary(e.target.value)}
            />
            <Input
              label="Application Deadline *"
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
              Job Description & Skill Requirements
            </label>
            <textarea
              rows={3}
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="Candidate requirements, interview rounds, and project responsibilities..."
              className="w-full text-xs bg-white border border-slate-300 rounded-lg p-2.5 text-slate-800 focus:ring-2 focus:ring-[#0A6ED1] focus:outline-none"
            />
          </div>

          <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
            <Button type="button" variant="outline" size="sm" onClick={() => setIsJobModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="sap" size="sm">
              Publish Opportunity
            </Button>
          </div>
        </form>
      </Modal>

      {/* Update Student Placement Profile Modal */}
      {selectedStudentForProfile && (
        <Modal
          isOpen={!!selectedStudentForProfile}
          onClose={() => setSelectedStudentForProfile(null)}
          title={`Update Placement Profile: ${selectedStudentForProfile.student_name}`}
          description="Log mock interview ratings, technical interview scores, and corporate placement stage."
        >
          <form onSubmit={handleSaveProfile} className="space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                  Resume Status
                </label>
                <select
                  value={resumeStatus}
                  onChange={(e) => setResumeStatus(e.target.value)}
                  className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800"
                >
                  <option value="Not Uploaded">Not Uploaded</option>
                  <option value="Pending Review">Pending Review</option>
                  <option value="Reviewed & Approved">Reviewed & Approved</option>
                  <option value="Needs Improvement">Needs Improvement</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                  Mock Interview Status
                </label>
                <select
                  value={mockStatus}
                  onChange={(e) => setMockStatus(e.target.value)}
                  className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800"
                >
                  <option value="Not Scheduled">Not Scheduled</option>
                  <option value="Scheduled">Scheduled</option>
                  <option value="Completed">Completed</option>
                  <option value="Needs Retake">Needs Retake</option>
                </select>
              </div>
            </div>

            <div>
              <FileUpload
                bucket="resumes"
                entityId={selectedStudentForProfile.student_id}
                value={resumeUrl}
                onChange={(url) => {
                  setResumeUrl(url);
                  if (resumeStatus === 'Not Uploaded') {
                    setResumeStatus('Pending Review');
                  }
                }}
                onRemove={() => {
                  setResumeUrl('');
                  setResumeStatus('Not Uploaded');
                }}
                label="Candidate Resume / CV File"
                description="Upload student's latest CV for hiring partners (PDF or Word, max 10MB)"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Technical Interview Score (0 - 100)"
                type="number"
                min={0}
                max={100}
                placeholder="e.g. 85 (leave blank if pending)"
                value={techScore}
                onChange={(e) => setTechScore(e.target.value === '' ? '' : Number(e.target.value))}
              />
              <Input
                label="HR Interview Score (0 - 100)"
                type="number"
                min={0}
                max={100}
                placeholder="e.g. 80 (leave blank if pending)"
                value={hrScore}
                onChange={(e) => setHrScore(e.target.value === '' ? '' : Number(e.target.value))}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Placement Stage
              </label>
              <select
                value={placeStatus}
                onChange={(e) => setPlaceStatus(e.target.value)}
                className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800 font-semibold"
              >
                <option value="Not Started">Not Started</option>
                <option value="Resume Preparation">Resume Preparation</option>
                <option value="Mock Interview">Mock Interview</option>
                <option value="Job Search">Job Search</option>
                <option value="Interview Scheduled">Interview Scheduled</option>
                <option value="Interview Completed">Interview Completed</option>
                <option value="Offer Received">Offer Received</option>
                <option value="Placed">Placed</option>
              </select>
            </div>

            <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
              <Button type="button" variant="outline" size="sm" onClick={() => setSelectedStudentForProfile(null)}>
                Cancel
              </Button>
              <Button type="submit" variant="sap" size="sm">
                Save Placement Profile
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Apply / Refer Candidate Modal */}
      {selectedJobForApply && (
        <Modal
          isOpen={isApplyModalOpen}
          onClose={() => {
            setIsApplyModalOpen(false);
            setSelectedJobForApply(null);
            setApplyError(null);
            setApplySuccess(false);
          }}
          title={`Refer Candidate: ${selectedJobForApply.job_title}`}
          description={`Submit a student application to ${selectedJobForApply.company_name} (${selectedJobForApply.module}).`}
        >
          <form onSubmit={handleApplyStudent} className="space-y-4 text-xs">
            {applyError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg">
                <p className="font-semibold">{applyError}</p>
              </div>
            )}
            {applySuccess && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg">
                <p className="font-semibold">Candidate application successfully submitted!</p>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Select Candidate *
              </label>
              <select
                value={applyStudentId}
                onChange={(e) => setApplyStudentId(e.target.value)}
                className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800 font-semibold"
                required
              >
                <option value="">Select a student...</option>
                {(store.students || []).map((s) => {
                  const enr = (store.placementEnrollments || []).find((e) => e.student_id === s.id);
                  const isEligible = enr?.is_placement_eligible;
                  const alreadyApplied = (store.jobApplications || []).some(
                    (a) => a.job_id === selectedJobForApply.id && a.student_id === s.id
                  );
                  return (
                    <option key={s.id} value={s.id} disabled={alreadyApplied}>
                      {s.full_name} ({s.student_code} — {s.course_name}) {alreadyApplied ? '[Already Applied]' : isEligible ? '[Eligible ✓]' : '[Needs Eligibility Review]'}
                    </option>
                  );
                })}
              </select>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1 text-slate-600">
              <p className="font-bold text-slate-800">Job Specifications:</p>
              <p>Company: <strong className="text-slate-900">{selectedJobForApply.company_name}</strong></p>
              <p>Location: <strong className="text-slate-900">{selectedJobForApply.location}</strong></p>
              <p>Package: <strong className="text-slate-900">{selectedJobForApply.salary_range}</strong></p>
              <p>Deadline: <strong className="text-slate-900">{formatDate(selectedJobForApply.application_deadline)}</strong></p>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Referral Note / Coordinator Remarks
              </label>
              <textarea
                rows={2}
                value={applyNotes}
                onChange={(e) => setApplyNotes(e.target.value)}
                placeholder="Optional recommendation notes for corporate recruiter..."
                className="w-full text-xs bg-white border border-slate-300 rounded-lg p-2.5 text-slate-800"
              />
            </div>

            <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setIsApplyModalOpen(false);
                  setSelectedJobForApply(null);
                  setApplyError(null);
                }}
              >
                Cancel
              </Button>
              <Button type="submit" variant="sap" size="sm">
                Submit Application
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Refer Candidate to Job Modal (From Student Table) */}
      {selectedStudentForReferral && (
        <Modal
          isOpen={isReferStudentModalOpen}
          onClose={() => {
            setIsReferStudentModalOpen(false);
            setSelectedStudentForReferral(null);
            setReferError(null);
            setReferSuccess(false);
          }}
          title={`Refer Student: ${selectedStudentForReferral.student_name}`}
          description={`Submit this student's profile for an active corporate hiring drive.`}
        >
          <form onSubmit={handleReferStudentFromTable} className="space-y-4 text-xs">
            {referError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg">
                <p className="font-semibold">{referError}</p>
              </div>
            )}
            {referSuccess && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg">
                <p className="font-semibold">Candidate application successfully submitted!</p>
              </div>
            )}

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
              <div className="flex justify-between">
                <span className="font-semibold text-slate-600">Candidate:</span>
                <span className="font-bold text-slate-900">{selectedStudentForReferral.student_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-semibold text-slate-600">Resume Status:</span>
                <Badge variant={selectedStudentForReferral.resume_status === 'Reviewed & Approved' ? 'success' : 'warning'} className="text-[10px]">
                  {selectedStudentForReferral.resume_status}
                </Badge>
              </div>
              <div className="flex justify-between">
                <span className="font-semibold text-slate-600">Mock Interview:</span>
                <Badge variant={selectedStudentForReferral.mock_interview_status === 'Completed' ? 'success' : 'outline'} className="text-[10px]">
                  {selectedStudentForReferral.mock_interview_status}
                </Badge>
              </div>
              <div className="flex justify-between">
                <span className="font-semibold text-slate-600">Scores:</span>
                <span className="font-mono text-slate-700">
                  Tech: {typeof selectedStudentForReferral.technical_interview_score === 'number' ? `${selectedStudentForReferral.technical_interview_score}%` : '—'} | HR: {typeof selectedStudentForReferral.hr_interview_score === 'number' ? `${selectedStudentForReferral.hr_interview_score}%` : '—'}
                </span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Select Open Corporate Job Drive *
              </label>
              <select
                value={referJobId}
                onChange={(e) => setReferJobId(e.target.value)}
                className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800 font-semibold"
                required
              >
                <option value="">Select an open job drive...</option>
                {jobs.filter((j) => j.status === 'Open').map((job) => {
                  const alreadyApplied = (store.jobApplications || []).some(
                    (a) => a.job_id === job.id && a.student_id === selectedStudentForReferral.student_id
                  );
                  return (
                    <option key={job.id} value={job.id} disabled={alreadyApplied}>
                      {job.company_name} — {job.job_title} ({job.module} | {job.location}) {alreadyApplied ? '[Already Applied]' : ''}
                    </option>
                  );
                })}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Coordinator Referral Remarks
              </label>
              <textarea
                rows={2}
                value={referNotes}
                onChange={(e) => setReferNotes(e.target.value)}
                placeholder="Candidate recommended based on top mock technical interview performance..."
                className="w-full text-xs bg-white border border-slate-300 rounded-lg p-2.5 text-slate-800"
              />
            </div>

            <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setIsReferStudentModalOpen(false);
                  setSelectedStudentForReferral(null);
                  setReferError(null);
                }}
              >
                Cancel
              </Button>
              <Button type="submit" variant="sap" size="sm">
                Submit Referral
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* View Job Applicants Modal */}
      {viewJobApplications && (
        <Modal
          isOpen={!!viewJobApplications}
          onClose={() => setViewJobApplications(null)}
          title={`Applicants: ${viewJobApplications.job_title}`}
          description={`${viewJobApplications.company_name} • ${viewJobApplications.location} • Target: ${viewJobApplications.module}`}
        >
          <div className="space-y-4 text-xs">
            {applications.filter((a) => a.job_id === viewJobApplications.id).length === 0 ? (
              <div className="py-8 text-center text-slate-400">
                <Users className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                <p className="font-semibold text-slate-600">No Student Applications Yet</p>
                <p className="text-[11px] mt-0.5">Use "Refer Candidate" to submit eligible students to this opening.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden max-h-96 overflow-y-auto">
                {applications
                  .filter((a) => a.job_id === viewJobApplications.id)
                  .map((app) => (
                    <div key={app.id} className="p-3 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-slate-50">
                      <div>
                        <p className="font-bold text-slate-900">{app.student_name}</p>
                        <p className="text-[11px] text-slate-500">
                          Applied on {formatDate(app.applied_at)}
                        </p>
                      </div>

                      <div className="flex items-center space-x-2">
                        <select
                          value={app.status}
                          onChange={(e) => handleUpdateApplicantStatus(app.id, e.target.value as any)}
                          className="text-xs bg-white border border-slate-300 rounded px-2 py-1 text-slate-700 font-semibold"
                        >
                          <option value="Applied">Applied</option>
                          <option value="Shortlisted">Shortlisted</option>
                          <option value="Interview Scheduled">Interview Scheduled</option>
                          <option value="Selected">Selected</option>
                          <option value="Rejected">Rejected</option>
                        </select>
                        <Badge
                          variant={
                            app.status === 'Selected'
                              ? 'success'
                              : app.status === 'Shortlisted'
                              ? 'info'
                              : app.status === 'Rejected'
                              ? 'destructive'
                              : 'secondary'
                          }
                          className="text-[10px]"
                        >
                          {app.status}
                        </Badge>
                      </div>
                    </div>
                  ))}
              </div>
            )}

            <div className="flex justify-end pt-2 border-t border-slate-100">
              <Button variant="outline" size="sm" onClick={() => setViewJobApplications(null)}>
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
