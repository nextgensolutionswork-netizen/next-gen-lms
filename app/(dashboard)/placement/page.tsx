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
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { store } from '@/lib/services/data-store';
import { JobOpening, PlacementProfile, JobApplication } from '@/types';
import { createJobOpening, updatePlacementProfile, applyForJob } from '@/lib/services/placement-service';
import { formatDate } from '@/lib/utils/formatters';

export default function PlacementPage() {
  const [profiles, setProfiles] = React.useState<PlacementProfile[]>(store.placementProfiles);
  const [jobs, setJobs] = React.useState<JobOpening[]>(store.jobOpenings);
  const [applications, setApplications] = React.useState<JobApplication[]>(store.jobApplications);
  const [isJobModalOpen, setIsJobModalOpen] = React.useState(false);
  const [selectedStudentForProfile, setSelectedStudentForProfile] = React.useState<PlacementProfile | null>(null);

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
  const [techScore, setTechScore] = React.useState(90);
  const [hrScore, setHrScore] = React.useState(85);
  const [placeStatus, setPlaceStatus] = React.useState<any>('Interview Scheduled');

  const refreshData = () => {
    setProfiles([...store.placementProfiles]);
    setJobs([...store.jobOpenings]);
    setApplications([...store.jobApplications]);
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

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudentForProfile) return;
    await updatePlacementProfile(
      selectedStudentForProfile.student_id,
      {
        resume_status: resumeStatus,
        mock_interview_status: mockStatus,
        technical_interview_score: techScore,
        hr_interview_score: hrScore,
        placement_status: placeStatus,
      },
      'usr-placement'
    );
    setSelectedStudentForProfile(null);
    refreshData();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Placement Cell & Corporate Hiring</h1>
          <p className="text-xs text-slate-500 mt-1">
            Student career profiles, resume vetting, mock technical/HR interview scores, and corporate SAP hiring drives.
          </p>
        </div>
        <Button
          variant="sap"
          size="sm"
          onClick={() => setIsJobModalOpen(true)}
          className="text-xs flex items-center space-x-1"
        >
          <Plus className="h-4 w-4" />
          <span>Post Job Opening</span>
        </Button>
      </div>

      {/* Active Job Openings Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {jobs.map((j) => (
          <Card key={j.id} className="hover:border-[#0A6ED1] transition-all">
            <CardContent className="p-5 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">{j.job_title}</h3>
                  <p className="text-xs text-[#0A6ED1] font-semibold mt-0.5">{j.company_name}</p>
                </div>
                <Badge variant="success">{j.status}</Badge>
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
                <span className="font-bold text-slate-700">{j.applications_count || 0} Student Applications</span>
                <span className="text-[10px] text-slate-400">Target: {j.module}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Student Placement Profiles Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Student Placement Profiles & Interview Scores</CardTitle>
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
              {profiles.map((pp) => (
                <tr key={pp.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 font-semibold text-slate-800">{pp.student_name}</td>
                  <td className="px-4 py-3">
                    <Badge variant={pp.resume_status === 'Reviewed & Approved' ? 'success' : 'warning'}>
                      {pp.resume_status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={pp.mock_interview_status === 'Completed' ? 'success' : 'outline'}>
                      {pp.mock_interview_status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 font-bold text-blue-600">{pp.technical_interview_score || '—'} / 100</td>
                  <td className="px-4 py-3 font-bold text-purple-600">{pp.hr_interview_score || '—'} / 100</td>
                  <td className="px-4 py-3">
                    <Badge variant="default">{pp.placement_status}</Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      variant="sap"
                      size="sm"
                      onClick={() => {
                        setSelectedStudentForProfile(pp);
                        setResumeStatus(pp.resume_status);
                        setMockStatus(pp.mock_interview_status);
                        setTechScore(pp.technical_interview_score || 90);
                        setHrScore(pp.hr_interview_score || 85);
                        setPlaceStatus(pp.placement_status);
                      }}
                      className="text-xs px-2.5 py-1"
                    >
                      Update Scores
                    </Button>
                  </td>
                </tr>
              ))}
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

            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Technical Interview Score (0 - 100)"
                type="number"
                min={0}
                max={100}
                value={techScore}
                onChange={(e) => setTechScore(Number(e.target.value))}
              />
              <Input
                label="HR Interview Score (0 - 100)"
                type="number"
                min={0}
                max={100}
                value={hrScore}
                onChange={(e) => setHrScore(Number(e.target.value))}
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
    </div>
  );
}
