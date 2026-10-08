'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  Briefcase,
  Search,
  CheckCircle,
  FileCheck,
  AlertCircle,
  Clock,
  UserCheck,
  Building,
  MapPin,
  Calendar,
  ExternalLink,
  ShieldCheck,
  Award,
  ChevronRight,
  Filter,
  Sliders,
  XCircle,
  PauseCircle,
  HelpCircle,
  Check,
  X,
  FileText,
  User,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { store } from '@/lib/services/data-store';
import {
  PlacementEnrollment,
  PlacementEnrollmentStatus,
  PlacementEligibilitySettings,
  PlacementEnrollmentStatusHistory,
} from '@/types';
import {
  getPlacementEnrollments,
  getPlacementEligibilitySettings,
  updatePlacementEligibilitySettings,
  updatePlacementEnrollmentStatus,
  evaluatePlacementEligibility,
  assignPlacementOfficer,
  addInternalNoteToEnrollment,
  overridePlacementEligibility,
  verifyEnrollmentDocument,
  getPlacementEnrollmentHistory,
} from '@/lib/services/placement-service';
import { formatDate, formatDateTime, formatINR } from '@/lib/utils/formatters';

export default function PlacementEnrollmentsPage() {
  const [enrollments, setEnrollments] = React.useState<PlacementEnrollment[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [statusFilter, setStatusFilter] = React.useState<string>('all');
  const [moduleFilter, setModuleFilter] = React.useState<string>('all');
  const [searchQuery, setSearchQuery] = React.useState('');

  // Selected Enrollment for Detail/Review Modal
  const [selectedEnrollment, setSelectedEnrollment] = React.useState<PlacementEnrollment | null>(null);
  const [enrollmentHistory, setEnrollmentHistory] = React.useState<PlacementEnrollmentStatusHistory[]>([]);
  const [evaluationResult, setEvaluationResult] = React.useState<any>(null);

  // Modals
  const [isReviewModalOpen, setIsReviewModalOpen] = React.useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = React.useState(false);
  const [isRejectModalOpen, setIsRejectModalOpen] = React.useState(false);
  const [isHoldModalOpen, setIsHoldModalOpen] = React.useState(false);
  const [isChangesModalOpen, setIsChangesModalOpen] = React.useState(false);
  const [isOverrideModalOpen, setIsOverrideModalOpen] = React.useState(false);
  const [isOfficerModalOpen, setIsOfficerModalOpen] = React.useState(false);

  // Form states for modals
  const [actionReason, setActionReason] = React.useState('');
  const [internalNoteText, setInternalNoteText] = React.useState('');
  const [selectedOfficerId, setSelectedOfficerId] = React.useState('usr-placement');

  // Eligibility Settings state
  const [settings, setSettings] = React.useState<PlacementEligibilitySettings>(store.placementEligibilitySettings);
  const [settingsForm, setSettingsForm] = React.useState<PlacementEligibilitySettings>(store.placementEligibilitySettings);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await getPlacementEnrollments({
        status: (statusFilter as any) || 'all',
        module: moduleFilter || 'all',
        search: searchQuery,
      });
      setEnrollments(data);
      const s = await getPlacementEligibilitySettings();
      setSettings(s);
      setSettingsForm(s);
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    loadData();
  }, [statusFilter, moduleFilter, searchQuery]);

  const handleOpenReview = async (enrollment: PlacementEnrollment) => {
    setSelectedEnrollment(enrollment);
    const hist = await getPlacementEnrollmentHistory(enrollment.id);
    setEnrollmentHistory(hist);
    const evalRes = await evaluatePlacementEligibility(enrollment.student_id);
    setEvaluationResult(evalRes);
    setIsReviewModalOpen(true);
  };

  const handleApproveEnrollment = async () => {
    if (!selectedEnrollment) return;
    try {
      const updated = await updatePlacementEnrollmentStatus(
        selectedEnrollment.id,
        'Enrollment Approved',
        'usr-placement',
        'Enrollment application verified and approved by Placement Cell.'
      );
      setSelectedEnrollment({ ...updated });
      await loadData();
      const evalRes = await evaluatePlacementEligibility(updated.student_id);
      setEvaluationResult(evalRes);
      const hist = await getPlacementEnrollmentHistory(updated.id);
      setEnrollmentHistory(hist);
    } catch (err: any) {
      alert(err.message || 'Error approving enrollment');
    }
  };

  const handleRejectEnrollment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEnrollment || !actionReason.trim()) return;
    try {
      const updated = await updatePlacementEnrollmentStatus(
        selectedEnrollment.id,
        'Enrollment Rejected',
        'usr-placement',
        actionReason.trim()
      );
      setSelectedEnrollment({ ...updated });
      setIsRejectModalOpen(false);
      setActionReason('');
      await loadData();
      const hist = await getPlacementEnrollmentHistory(updated.id);
      setEnrollmentHistory(hist);
    } catch (err: any) {
      alert(err.message || 'Error rejecting enrollment');
    }
  };

  const handleHoldEnrollment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEnrollment || !actionReason.trim()) return;
    try {
      const updated = await updatePlacementEnrollmentStatus(
        selectedEnrollment.id,
        'Enrollment On Hold',
        'usr-placement',
        actionReason.trim()
      );
      setSelectedEnrollment({ ...updated });
      setIsHoldModalOpen(false);
      setActionReason('');
      await loadData();
      const hist = await getPlacementEnrollmentHistory(updated.id);
      setEnrollmentHistory(hist);
    } catch (err: any) {
      alert(err.message || 'Error putting enrollment on hold');
    }
  };

  const handleRequestChanges = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEnrollment || !actionReason.trim()) return;
    try {
      const updated = await updatePlacementEnrollmentStatus(
        selectedEnrollment.id,
        'More Information Required',
        'usr-placement',
        actionReason.trim(),
        'Student instructed to revise details or re-upload documents.'
      );
      setSelectedEnrollment({ ...updated });
      setIsChangesModalOpen(false);
      setActionReason('');
      await loadData();
      const hist = await getPlacementEnrollmentHistory(updated.id);
      setEnrollmentHistory(hist);
    } catch (err: any) {
      alert(err.message || 'Error requesting changes');
    }
  };

  const handleOverrideEligibility = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEnrollment || !actionReason.trim()) return;
    try {
      const updated = await overridePlacementEligibility(
        selectedEnrollment.id,
        'usr-placement',
        actionReason.trim()
      );
      setSelectedEnrollment({ ...updated });
      setIsOverrideModalOpen(false);
      setActionReason('');
      await loadData();
      const evalRes = await evaluatePlacementEligibility(updated.student_id);
      setEvaluationResult(evalRes);
      const hist = await getPlacementEnrollmentHistory(updated.id);
      setEnrollmentHistory(hist);
    } catch (err: any) {
      alert(err.message || 'Error granting override');
    }
  };

  const handleAssignOfficer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEnrollment) return;
    const officer = store.users.find((u) => u.id === selectedOfficerId);
    const officerName = officer?.full_name || 'Placement Officer';
    try {
      const updated = await assignPlacementOfficer(
        selectedEnrollment.id,
        selectedOfficerId,
        officerName,
        'usr-placement'
      );
      setSelectedEnrollment({ ...updated });
      setIsOfficerModalOpen(false);
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Error assigning officer');
    }
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEnrollment || !internalNoteText.trim()) return;
    try {
      const updated = await addInternalNoteToEnrollment(
        selectedEnrollment.id,
        internalNoteText.trim(),
        'usr-placement'
      );
      setSelectedEnrollment({ ...updated });
      setInternalNoteText('');
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Error adding note');
    }
  };

  const handleToggleDocVerification = async (docId: string, currentVerified?: boolean) => {
    if (!selectedEnrollment) return;
    try {
      const updated = await verifyEnrollmentDocument(
        selectedEnrollment.id,
        docId,
        !currentVerified,
        !currentVerified ? 'Document verified by placement coordinator' : 'Document unverified',
        'usr-placement'
      );
      setSelectedEnrollment({ ...updated });
      const evalRes = await evaluatePlacementEligibility(updated.student_id);
      setEvaluationResult(evalRes);
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Error updating document status');
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const updated = await updatePlacementEligibilitySettings(settingsForm, 'usr-placement');
      setSettings(updated);
      setIsSettingsModalOpen(false);
      if (selectedEnrollment) {
        const evalRes = await evaluatePlacementEligibility(selectedEnrollment.student_id);
        setEvaluationResult(evalRes);
      }
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Error saving settings');
    }
  };

  // KPI Calculations
  const totalCount = store.placementEnrollments.length;
  const underReviewCount = store.placementEnrollments.filter(
    (e) => e.enrollment_status === 'Application Submitted' || e.enrollment_status === 'Under Review'
  ).length;
  const approvedCount = store.placementEnrollments.filter(
    (e) =>
      e.enrollment_status === 'Enrollment Approved' ||
      e.enrollment_status === 'Placement Eligible' ||
      e.enrollment_status === 'Active Placement'
  ).length;
  const eligibleCount = store.placementEnrollments.filter((e) => e.is_placement_eligible).length;
  const onHoldCount = store.placementEnrollments.filter((e) => e.enrollment_status === 'Enrollment On Hold').length;

  return (
    <div className="space-y-6">
      {/* Header & Sub-Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Placement Enrollments & Candidate Review
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Manage student enrollment requests, document verification, placement eligibility rules, and corporate vetting lifecycle.
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsSettingsModalOpen(true)}
            className="text-xs flex items-center space-x-1 border-slate-300"
          >
            <Sliders className="h-3.5 w-3.5 text-blue-600" />
            <span>Eligibility Rules Engine</span>
          </Button>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex items-center space-x-2 border-b border-slate-200 pb-3 text-sm">
        <Link
          href="/placement"
          className="px-3 py-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 font-medium flex items-center space-x-2 transition-colors"
        >
          <Briefcase className="h-4 w-4 text-slate-500" />
          <span>Drives & Openings</span>
          <Badge variant="secondary" className="ml-1 text-[10px]">
            {store.jobOpenings.length}
          </Badge>
        </Link>
        <Link
          href="/placement/enrollments"
          className="px-3 py-1.5 rounded-lg bg-[#0A6ED1] text-white font-semibold flex items-center space-x-2 shadow-xs"
        >
          <CheckCircle className="h-4 w-4" />
          <span>Enrollments & Candidates</span>
          <Badge variant="outline" className="ml-1 bg-white/20 text-white border-0 text-[10px]">
            {totalCount}
          </Badge>
        </Link>
      </div>

      {/* Quick KPI Strip */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card className="p-3 border-l-4 border-l-slate-600">
          <p className="text-[10px] font-bold text-slate-400 uppercase">Total Enrollments</p>
          <h3 className="text-xl font-bold text-slate-800 mt-0.5">{totalCount}</h3>
          <p className="text-[10px] text-slate-500">Student Opt-ins</p>
        </Card>
        <Card className="p-3 border-l-4 border-l-amber-500">
          <p className="text-[10px] font-bold text-amber-600 uppercase">Action Pending</p>
          <h3 className="text-xl font-bold text-amber-700 mt-0.5">{underReviewCount}</h3>
          <p className="text-[10px] text-amber-600">Awaiting Review</p>
        </Card>
        <Card className="p-3 border-l-4 border-l-blue-600">
          <p className="text-[10px] font-bold text-blue-600 uppercase">Enrollment Approved</p>
          <h3 className="text-xl font-bold text-blue-700 mt-0.5">{approvedCount}</h3>
          <p className="text-[10px] text-blue-600">In Preparation</p>
        </Card>
        <Card className="p-3 border-l-4 border-l-emerald-600 bg-emerald-50/30">
          <p className="text-[10px] font-bold text-emerald-700 uppercase">Placement Eligible</p>
          <h3 className="text-xl font-bold text-emerald-800 mt-0.5">{eligibleCount}</h3>
          <p className="text-[10px] text-emerald-700">Can Apply For Jobs</p>
        </Card>
        <Card className="p-3 border-l-4 border-l-rose-500">
          <p className="text-[10px] font-bold text-rose-600 uppercase">On Hold / Issues</p>
          <h3 className="text-xl font-bold text-rose-700 mt-0.5">{onHoldCount}</h3>
          <p className="text-[10px] text-rose-600">Disciplinary / Docs</p>
        </Card>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-3 rounded-xl border border-slate-200">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search by student name, LMS code, company, or qualification..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 text-xs h-9 bg-slate-50 border-slate-200"
          />
        </div>

        <div className="flex items-center space-x-2">
          <div className="flex items-center space-x-1.5 text-xs text-slate-500">
            <Filter className="h-3.5 w-3.5" />
            <span>Filter:</span>
          </div>

          <select
            value={moduleFilter}
            onChange={(e) => setModuleFilter(e.target.value)}
            className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700 focus:outline-none focus:ring-1 focus:ring-[#0A6ED1]"
          >
            <option value="all">All SAP Modules</option>
            <option value="SAP FICO">SAP FICO</option>
            <option value="SAP MM">SAP MM</option>
            <option value="SAP SD">SAP SD</option>
            <option value="SAP ABAP">SAP ABAP</option>
            <option value="SAP S/4HANA">SAP S/4HANA</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700 focus:outline-none focus:ring-1 focus:ring-[#0A6ED1]"
          >
            <option value="all">All Statuses</option>
            <option value="Application Submitted">Application Submitted</option>
            <option value="Under Review">Under Review</option>
            <option value="More Information Required">More Info Required</option>
            <option value="Enrollment Approved">Enrollment Approved</option>
            <option value="Placement Eligible">Placement Eligible</option>
            <option value="Active Placement">Active Placement</option>
            <option value="Placed">Placed</option>
            <option value="Enrollment On Hold">Enrollment On Hold</option>
            <option value="Enrollment Rejected">Enrollment Rejected</option>
            <option value="Student Withdrawn">Student Withdrawn</option>
            <option value="Re-enrollment Requested">Re-enrollment Requested</option>
          </select>
        </div>
      </div>

      {/* Main Enrollments Table */}
      <Card className="overflow-hidden border-slate-200 shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-semibold text-slate-600">
                <th className="p-3">Student Name & LMS ID</th>
                <th className="p-3">Course & SAP Module</th>
                <th className="p-3">Current Status</th>
                <th className="p-3">Employment</th>
                <th className="p-3">Resume Status</th>
                <th className="p-3">Documents</th>
                <th className="p-3">Enrollment Date</th>
                <th className="p-3">Placement Officer</th>
                <th className="p-3">Enrollment Status</th>
                <th className="p-3">Placement Eligibility</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {enrollments.length === 0 ? (
                <tr>
                  <td colSpan={11} className="p-8 text-center text-slate-400">
                    No placement enrollments matching current filters.
                  </td>
                </tr>
              ) : (
                enrollments.map((enr) => {
                  const verifiedDocs = enr.documents?.filter((d) => d.is_verified).length || 0;
                  const totalDocs = enr.documents?.length || 0;

                  return (
                    <tr key={enr.id} className="hover:bg-slate-50/60 transition-colors">
                      {/* Student Name & Code */}
                      <td className="p-3">
                        <div className="font-bold text-slate-900">{enr.student_name}</div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          {enr.admission_number || enr.student_code}
                        </div>
                      </td>

                      {/* Course & SAP Module */}
                      <td className="p-3">
                        <div className="font-medium text-slate-800">{enr.sap_module}</div>
                        <div className="text-[10px] text-slate-500 truncate max-w-[150px]">{enr.course_name}</div>
                      </td>

                      {/* Current Status */}
                      <td className="p-3">
                        <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-700">
                          {enr.current_status}
                        </span>
                      </td>

                      {/* Employment Status */}
                      <td className="p-3">
                        <span className="text-slate-700">{enr.employment_status}</span>
                        {enr.current_company && (
                          <div className="text-[10px] text-slate-400 truncate max-w-[120px]">
                            {enr.current_company}
                          </div>
                        )}
                      </td>

                      {/* Resume Status */}
                      <td className="p-3">
                        <Badge
                          variant={
                            enr.resume_status === 'Reviewed & Approved'
                              ? 'success'
                              : enr.resume_status === 'Pending Review'
                              ? 'warning'
                              : 'secondary'
                          }
                          className="text-[10px]"
                        >
                          {enr.resume_status}
                        </Badge>
                      </td>

                      {/* Documents Status */}
                      <td className="p-3">
                        <span
                          className={`text-[11px] font-medium ${
                            verifiedDocs > 0 && verifiedDocs === totalDocs
                              ? 'text-emerald-700'
                              : verifiedDocs > 0
                              ? 'text-amber-700'
                              : 'text-slate-400'
                          }`}
                        >
                          {verifiedDocs}/{totalDocs} Verified
                        </span>
                      </td>

                      {/* Enrollment Date */}
                      <td className="p-3 text-slate-500 whitespace-nowrap">
                        {formatDate(enr.enrollment_date)}
                      </td>

                      {/* Placement Officer */}
                      <td className="p-3">
                        <span className="text-slate-800 font-medium">
                          {enr.assigned_placement_officer_name || 'Unassigned'}
                        </span>
                      </td>

                      {/* Enrollment Status */}
                      <td className="p-3">
                        <Badge
                          variant={
                            enr.enrollment_status === 'Placement Eligible' || enr.enrollment_status === 'Active Placement'
                              ? 'success'
                              : enr.enrollment_status === 'Enrollment Approved'
                              ? 'info'
                              : enr.enrollment_status === 'Under Review' || enr.enrollment_status === 'Application Submitted'
                              ? 'warning'
                              : enr.enrollment_status === 'Enrollment Rejected'
                              ? 'destructive'
                              : 'secondary'
                          }
                          className="text-[10px] font-semibold"
                        >
                          {enr.enrollment_status}
                        </Badge>
                      </td>

                      {/* Eligibility Status */}
                      <td className="p-3">
                        {enr.is_placement_eligible ? (
                          <span className="inline-flex items-center space-x-1 text-emerald-700 font-bold text-[10px] bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                            <CheckCircle className="h-3 w-3 text-emerald-600" />
                            <span>Eligible to Apply</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center space-x-1 text-amber-700 font-medium text-[10px] bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                            <Clock className="h-3 w-3 text-amber-500" />
                            <span>Pending Criteria</span>
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="p-3 text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleOpenReview(enr)}
                          className="text-[11px] h-7 px-2.5 bg-blue-50 text-[#0A6ED1] border-blue-200 hover:bg-blue-100 font-semibold"
                        >
                          Review & Action
                        </Button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ========================================================================= */}
      {/* COMPREHENSIVE ADMIN ENROLLMENT REVIEW MODAL */}
      {/* ========================================================================= */}
      {selectedEnrollment && (
        <Modal
          isOpen={isReviewModalOpen}
          onClose={() => setIsReviewModalOpen(false)}
          title={`Review Placement Enrollment: ${selectedEnrollment.student_name}`}
          description={`LMS ID: ${selectedEnrollment.admission_number || selectedEnrollment.student_code} | Module: ${selectedEnrollment.sap_module}`}
          className="max-w-4xl"
        >
          <div className="space-y-6 text-xs max-h-[75vh] overflow-y-auto pr-1">
            {/* Top Status & Next Step Alert Banner */}
            <div
              className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 ${
                selectedEnrollment.is_placement_eligible
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : selectedEnrollment.enrollment_status === 'Enrollment Approved'
                  ? 'bg-blue-50 border-blue-200 text-blue-900'
                  : selectedEnrollment.enrollment_status === 'Enrollment Rejected'
                  ? 'bg-rose-50 border-rose-200 text-rose-900'
                  : selectedEnrollment.enrollment_status === 'Enrollment On Hold'
                  ? 'bg-amber-50 border-amber-200 text-amber-900'
                  : 'bg-indigo-50 border-indigo-200 text-indigo-900'
              }`}
            >
              <div>
                <div className="flex items-center space-x-2">
                  <span className="font-bold text-sm">Enrollment Status: {selectedEnrollment.enrollment_status}</span>
                  {selectedEnrollment.is_placement_eligible ? (
                    <Badge variant="success">Placement Eligible</Badge>
                  ) : (
                    <Badge variant="warning">Eligibility Pending</Badge>
                  )}
                </div>
                <p className="text-[11px] mt-0.5 opacity-90">
                  Enrolled on: {formatDateTime(selectedEnrollment.enrollment_date)} | Officer: {selectedEnrollment.assigned_placement_officer_name || 'Unassigned'}
                </p>
                {selectedEnrollment.rejection_reason && (
                  <p className="text-[11px] text-rose-700 font-semibold mt-1">
                    Rejection Reason: {selectedEnrollment.rejection_reason}
                  </p>
                )}
                {selectedEnrollment.hold_reason && (
                  <p className="text-[11px] text-amber-800 font-semibold mt-1">
                    Hold Reason: {selectedEnrollment.hold_reason}
                  </p>
                )}
              </div>

              <div className="flex items-center space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsOfficerModalOpen(true)}
                  className="text-[11px] bg-white h-7"
                >
                  Change Officer
                </Button>
              </div>
            </div>

            {/* Section 1: Academic & LMS Profile */}
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
              <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider flex items-center space-x-1.5">
                <User className="h-4 w-4 text-blue-600" />
                <span>LMS Academic & Training Progress</span>
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[11px]">
                <div>
                  <span className="text-slate-400 block">Course Name:</span>
                  <span className="font-semibold text-slate-800">{selectedEnrollment.course_name}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Batch & Faculty:</span>
                  <span className="font-semibold text-slate-800">{selectedEnrollment.batch_name || 'N/A'} ({selectedEnrollment.trainer_name || 'N/A'})</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Email & Mobile:</span>
                  <span className="font-semibold text-slate-800">{selectedEnrollment.email} / {selectedEnrollment.mobile_number}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">WhatsApp:</span>
                  <span className="font-semibold text-slate-800">{selectedEnrollment.whatsapp_number}</span>
                </div>
              </div>
            </div>

            {/* Section 2: Current Status & Professional Experience */}
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
              <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider flex items-center space-x-1.5">
                <Building className="h-4 w-4 text-emerald-600" />
                <span>Current & Professional Employment Details</span>
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[11px]">
                <div>
                  <span className="text-slate-400 block">Current Status:</span>
                  <span className="font-semibold text-slate-800">{selectedEnrollment.current_status}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Employment Status:</span>
                  <span className="font-semibold text-slate-800">{selectedEnrollment.employment_status}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Current Company:</span>
                  <span className="font-semibold text-slate-800">{selectedEnrollment.current_company || 'Fresher / None'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Current Designation:</span>
                  <span className="font-semibold text-slate-800">{selectedEnrollment.current_designation || 'None'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Total Experience:</span>
                  <span className="font-semibold text-slate-800">{selectedEnrollment.total_experience_years ?? 0} Years</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Relevant SAP Exp:</span>
                  <span className="font-semibold text-slate-800">{selectedEnrollment.relevant_sap_experience_years ?? 0} Years</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Current CTC:</span>
                  <span className="font-semibold text-slate-800">{selectedEnrollment.current_ctc_lpa ? `₹${selectedEnrollment.current_ctc_lpa} LPA` : 'N/A'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Notice Period:</span>
                  <span className="font-semibold text-slate-800">{selectedEnrollment.notice_period || 'Immediate'}</span>
                </div>
              </div>
            </div>

            {/* Section 3: Academic Education & Preferences */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
                <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider flex items-center space-x-1.5">
                  <Award className="h-4 w-4 text-purple-600" />
                  <span>Academic Education</span>
                </h4>
                <div className="space-y-1 text-[11px]">
                  <p><strong className="text-slate-600">Qualification:</strong> {selectedEnrollment.highest_qualification} ({selectedEnrollment.degree})</p>
                  <p><strong className="text-slate-600">Specialization:</strong> {selectedEnrollment.specialization}</p>
                  <p><strong className="text-slate-600">University / College:</strong> {selectedEnrollment.college_university}</p>
                  <p><strong className="text-slate-600">Graduation Year:</strong> {selectedEnrollment.graduation_year} | <strong className="text-slate-600">CGPA / %:</strong> {selectedEnrollment.percentage_or_cgpa}</p>
                </div>
              </div>

              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
                <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider flex items-center space-x-1.5">
                  <MapPin className="h-4 w-4 text-rose-600" />
                  <span>Placement Preferences</span>
                </h4>
                <div className="space-y-1 text-[11px]">
                  <p><strong className="text-slate-600">Target Roles:</strong> {selectedEnrollment.preferred_job_roles?.join(', ')}</p>
                  <p><strong className="text-slate-600">Preferred Locations:</strong> {selectedEnrollment.preferred_locations?.join(', ')}</p>
                  <p><strong className="text-slate-600">Work Mode:</strong> {selectedEnrollment.preferred_work_mode} | <strong className="text-slate-600">Expected CTC:</strong> ₹{selectedEnrollment.expected_ctc_lpa} LPA</p>
                  <p><strong className="text-slate-600">Willing to Relocate:</strong> {selectedEnrollment.willing_to_relocate ? 'Yes' : 'No'} | <strong className="text-slate-600">Immediate Joiner:</strong> {selectedEnrollment.immediate_joiner ? 'Yes' : 'No'}</p>
                </div>
              </div>
            </div>

            {/* Section 4: Resume & Initial Document Verification Desk */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider flex items-center space-x-1.5">
                  <FileCheck className="h-4 w-4 text-blue-600" />
                  <span>Resume & Document Verification Desk</span>
                </h4>
                {selectedEnrollment.resume_url && (
                  <a
                    href={selectedEnrollment.resume_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-[#0A6ED1] hover:underline flex items-center space-x-1"
                  >
                    <span>View Resume File</span>
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>

              <div className="divide-y divide-slate-100 border border-slate-100 rounded-lg">
                {/* Resume Row */}
                <div className="p-3 flex items-center justify-between">
                  <div>
                    <span className="font-bold text-slate-800">Corporate Resume / CV</span>
                    <p className="text-[10px] text-slate-500">
                      File: {selectedEnrollment.resume_name || 'Resume.pdf'} · Status: {selectedEnrollment.resume_status}
                    </p>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Badge
                      variant={selectedEnrollment.resume_status === 'Reviewed & Approved' ? 'success' : 'warning'}
                    >
                      {selectedEnrollment.resume_status}
                    </Badge>
                  </div>
                </div>

                {/* Uploaded Documents List */}
                {selectedEnrollment.documents?.map((doc) => (
                  <div key={doc.id} className="p-3 flex items-center justify-between">
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="font-bold text-slate-800">{doc.document_type}</span>
                        {doc.is_verified ? (
                          <span className="text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded font-bold">
                            Verified ✓
                          </span>
                        ) : (
                          <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-bold">
                            Pending Verification
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-500">
                        {doc.file_name} · Uploaded {formatDate(doc.uploaded_at)}
                        {doc.verified_by && ` · Verified by ${doc.verified_by}`}
                      </p>
                    </div>

                    <div className="flex items-center space-x-2">
                      <Button
                        variant={doc.is_verified ? 'outline' : 'sap'}
                        size="sm"
                        onClick={() => handleToggleDocVerification(doc.id, doc.is_verified)}
                        className="text-[11px] h-7"
                      >
                        {doc.is_verified ? 'Mark Unverified' : 'Verify Document ✓'}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Section 5: Dynamic Eligibility Rules Engine Evaluation Card */}
            <div className="bg-slate-900 text-slate-100 p-4 rounded-xl border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-xs uppercase tracking-wider text-emerald-400 flex items-center space-x-1.5">
                    <ShieldCheck className="h-4 w-4" />
                    <span>Dynamic Placement Eligibility Rules Evaluation</span>
                  </h4>
                  <p className="text-[10px] text-slate-400">
                    Live audit against institutional benchmarks. Students can only apply for jobs once all criteria pass or an administrative override is granted.
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsOverrideModalOpen(true)}
                  className="text-xs bg-slate-800 text-amber-300 border-amber-600/50 hover:bg-slate-700 h-7"
                >
                  Grant Admin Override
                </Button>
              </div>

              {evaluationResult && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs pt-1">
                  {evaluationResult.criteriaResults.map((c: any, idx: number) => (
                    <div
                      key={idx}
                      className={`p-2.5 rounded-lg border flex items-start space-x-2 ${
                        c.passed
                          ? 'bg-slate-800/80 border-emerald-500/30 text-slate-200'
                          : 'bg-rose-950/30 border-rose-500/30 text-rose-200'
                      }`}
                    >
                      {c.passed ? (
                        <CheckCircle className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                      ) : (
                        <XCircle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
                      )}
                      <div>
                        <div className="font-bold text-[11px] flex items-center space-x-1.5">
                          <span>{c.criterion}</span>
                          <span className={`text-[10px] px-1 py-0.2 rounded font-mono ${c.passed ? 'bg-emerald-900 text-emerald-200' : 'bg-rose-900 text-rose-200'}`}>
                            {c.currentValue}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-400 mt-0.5">{c.message}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Section 6: Terms and Declaration Acceptance Audit */}
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
              <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider flex items-center space-x-1.5">
                <ShieldCheck className="h-4 w-4 text-emerald-600" />
                <span>Declaration Acceptance Audit Trail</span>
              </h4>
              <p className="text-[10px] text-slate-500">
                Accepted by: <strong className="text-slate-700">{selectedEnrollment.declaration.accepted_by_name}</strong> on {formatDateTime(selectedEnrollment.declaration.accepted_at)} (Terms Version: {selectedEnrollment.declaration.terms_version})
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-[10px] text-slate-600 pt-1">
                <span className="flex items-center space-x-1">
                  <Check className="h-3 w-3 text-emerald-600" />
                  <span>Confirmed Information Correct</span>
                </span>
                <span className="flex items-center space-x-1">
                  <Check className="h-3 w-3 text-emerald-600" />
                  <span>Understands Placement Guarantee Disclaimer</span>
                </span>
                <span className="flex items-center space-x-1">
                  <Check className="h-3 w-3 text-emerald-600" />
                  <span>Agrees to Attend Scheduled Interviews</span>
                </span>
                <span className="flex items-center space-x-1">
                  <Check className="h-3 w-3 text-emerald-600" />
                  <span>Agrees to Inform External Offers</span>
                </span>
                <span className="flex items-center space-x-1">
                  <Check className="h-3 w-3 text-emerald-600" />
                  <span>Authorized Resume Sharing With Employers</span>
                </span>
                <span className="flex items-center space-x-1">
                  <Check className="h-3 w-3 text-emerald-600" />
                  <span>Understands Sensitive Documents Policy</span>
                </span>
                <span className="flex items-center space-x-1">
                  <Check className="h-3 w-3 text-emerald-600" />
                  <span>Agrees to Keep Profile Updated</span>
                </span>
              </div>
            </div>

            {/* Section 7: Internal Notes & Officer Notes */}
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
              <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider">
                Internal Placement Notes
              </h4>
              <div className="space-y-1.5 max-h-32 overflow-y-auto">
                {selectedEnrollment.internal_notes?.length ? (
                  selectedEnrollment.internal_notes.map((note, idx) => (
                    <div key={idx} className="p-2 bg-white rounded border border-slate-200 text-[11px] text-slate-700">
                      {note}
                    </div>
                  ))
                ) : (
                  <p className="text-[11px] text-slate-400 italic">No internal notes added yet.</p>
                )}
              </div>
              <form onSubmit={handleAddNote} className="flex gap-2">
                <Input
                  placeholder="Add an internal note about candidate..."
                  value={internalNoteText}
                  onChange={(e) => setInternalNoteText(e.target.value)}
                  className="text-xs h-8 bg-white"
                />
                <Button type="submit" variant="sap" size="sm" className="text-xs h-8 px-3">
                  Save Note
                </Button>
              </form>
            </div>

            {/* Section 8: Status History Audit Trail (Never Overwritten) */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-3">
              <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider flex items-center space-x-1.5">
                <Clock className="h-4 w-4 text-purple-600" />
                <span>Immutable Status History & Audit Trail</span>
              </h4>
              <div className="space-y-2">
                {enrollmentHistory.map((hist) => (
                  <div key={hist.id} className="p-2.5 bg-slate-50 rounded-lg border border-slate-200 text-xs">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <span className="font-mono text-[10px] text-slate-500">{hist.old_status}</span>
                        <ArrowRight className="h-3 w-3 text-slate-400" />
                        <span className="font-bold text-slate-900">{hist.new_status}</span>
                      </div>
                      <span className="text-[10px] text-slate-400">{formatDateTime(hist.changed_at)}</span>
                    </div>
                    {hist.reason && (
                      <p className="text-[11px] text-slate-700 font-medium mt-1">
                        Reason: {hist.reason}
                      </p>
                    )}
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      Changed by: {hist.changed_by_name} ({hist.changed_by_role})
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Admin Action Buttons Footer */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-4 border-t border-slate-200">
              <div className="flex items-center space-x-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsReviewModalOpen(false)}
                >
                  Close
                </Button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setActionReason('');
                    setIsChangesModalOpen(true);
                  }}
                  className="text-amber-700 border-amber-300 hover:bg-amber-50"
                >
                  Request Changes
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setActionReason('');
                    setIsHoldModalOpen(true);
                  }}
                  className="text-orange-700 border-orange-300 hover:bg-orange-50"
                >
                  Put On Hold
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setActionReason('');
                    setIsRejectModalOpen(true);
                  }}
                  className="text-rose-700 border-rose-300 hover:bg-rose-50"
                >
                  Reject Enrollment
                </Button>

                <Button
                  type="button"
                  variant="sap"
                  size="sm"
                  onClick={handleApproveEnrollment}
                  className="bg-emerald-600 hover:bg-emerald-700"
                >
                  Approve Placement Enrollment ✓
                </Button>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* ========================================================================= */}
      {/* MODAL: REJECT ENROLLMENT (MANDATORY REASON) */}
      {/* ========================================================================= */}
      <Modal
        isOpen={isRejectModalOpen}
        onClose={() => setIsRejectModalOpen(false)}
        title="Reject Placement Enrollment"
        description="A detailed justification reason is mandatory. The student will be notified."
      >
        <form onSubmit={handleRejectEnrollment} className="space-y-4 text-xs">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Rejection Reason <span className="text-rose-500">*</span>
            </label>
            <textarea
              required
              rows={4}
              placeholder="e.g. Incomplete course prerequisites, unverified qualifications, or policy violation..."
              value={actionReason}
              onChange={(e) => setActionReason(e.target.value)}
              className="w-full text-xs p-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-rose-500"
            />
          </div>

          <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
            <Button type="button" variant="outline" size="sm" onClick={() => setIsRejectModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="danger" size="sm">
              Confirm Rejection
            </Button>
          </div>
        </form>
      </Modal>

      {/* ========================================================================= */}
      {/* MODAL: PUT ON HOLD (MANDATORY REASON) */}
      {/* ========================================================================= */}
      <Modal
        isOpen={isHoldModalOpen}
        onClose={() => setIsHoldModalOpen(false)}
        title="Put Placement Enrollment On Hold"
        description="A mandatory reason is required to temporarily hold placement eligibility."
      >
        <form onSubmit={handleHoldEnrollment} className="space-y-4 text-xs">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Hold Reason <span className="text-orange-500">*</span>
            </label>
            <textarea
              required
              rows={4}
              placeholder="e.g. Pending final semester results, temporary medical leave, or fee clearance required..."
              value={actionReason}
              onChange={(e) => setActionReason(e.target.value)}
              className="w-full text-xs p-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-orange-500"
            />
          </div>

          <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
            <Button type="button" variant="outline" size="sm" onClick={() => setIsHoldModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="sap" size="sm" className="bg-orange-600 hover:bg-orange-700">
              Confirm Hold
            </Button>
          </div>
        </form>
      </Modal>

      {/* ========================================================================= */}
      {/* MODAL: REQUEST CHANGES / MORE INFORMATION */}
      {/* ========================================================================= */}
      <Modal
        isOpen={isChangesModalOpen}
        onClose={() => setIsChangesModalOpen(false)}
        title="Request Changes / More Information"
        description="Instruct the student on what details or documents need revision."
      >
        <form onSubmit={handleRequestChanges} className="space-y-4 text-xs">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Revision Instructions <span className="text-amber-500">*</span>
            </label>
            <textarea
              required
              rows={4}
              placeholder="e.g. Upload a clearer degree certificate scan, correct notice period date..."
              value={actionReason}
              onChange={(e) => setActionReason(e.target.value)}
              className="w-full text-xs p-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
          </div>

          <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
            <Button type="button" variant="outline" size="sm" onClick={() => setIsChangesModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="sap" size="sm">
              Send Revision Request
            </Button>
          </div>
        </form>
      </Modal>

      {/* ========================================================================= */}
      {/* MODAL: ADMINISTRATIVE OVERRIDE FOR PLACEMENT ELIGIBILITY */}
      {/* ========================================================================= */}
      <Modal
        isOpen={isOverrideModalOpen}
        onClose={() => setIsOverrideModalOpen(false)}
        title="Authorized Placement Eligibility Override"
        description="Grant immediate placement eligibility even if some automated rules have not met the threshold."
      >
        <form onSubmit={handleOverrideEligibility} className="space-y-4 text-xs">
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 space-y-1">
            <p className="font-bold flex items-center space-x-1">
              <AlertCircle className="h-4 w-4 text-amber-600" />
              <span>Administrative Override Policy</span>
            </p>
            <p className="text-[11px]">
              This action will mark the candidate as Placement Eligible immediately and unlock job application privileges. A detailed justification is required for the permanent audit trail.
            </p>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Override Justification <span className="text-amber-600">*</span>
            </label>
            <textarea
              required
              rows={4}
              placeholder="e.g. Direct recommendation by Managing Director; 5 years previous domain experience in SAP MM; specialized client interview clearance..."
              value={actionReason}
              onChange={(e) => setActionReason(e.target.value)}
              className="w-full text-xs p-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
          </div>

          <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
            <Button type="button" variant="outline" size="sm" onClick={() => setIsOverrideModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="sap" size="sm" className="bg-amber-600 hover:bg-amber-700">
              Grant Eligibility Override
            </Button>
          </div>
        </form>
      </Modal>

      {/* ========================================================================= */}
      {/* MODAL: ASSIGN PLACEMENT OFFICER */}
      {/* ========================================================================= */}
      <Modal
        isOpen={isOfficerModalOpen}
        onClose={() => setIsOfficerModalOpen(false)}
        title="Assign Dedicated Placement Officer"
        description="Allocate candidate portfolio to an authorized placement coordinator."
      >
        <form onSubmit={handleAssignOfficer} className="space-y-4 text-xs">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Select Placement Officer</label>
            <select
              value={selectedOfficerId}
              onChange={(e) => setSelectedOfficerId(e.target.value)}
              className="w-full text-xs bg-white border border-slate-300 rounded-lg p-2.5 text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#0A6ED1]"
            >
              <option value="usr-placement">Sunita Reddy (Placement Head)</option>
              <option value="usr-admin">Rajesh Kumar (Center Director)</option>
              <option value="usr-counsellor">Priya Sharma (Career Counsellor)</option>
            </select>
          </div>

          <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
            <Button type="button" variant="outline" size="sm" onClick={() => setIsOfficerModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="sap" size="sm">
              Save Assignment
            </Button>
          </div>
        </form>
      </Modal>

      {/* ========================================================================= */}
      {/* MODAL: CONFIGURABLE PLACEMENT ELIGIBILITY RULES SETTINGS */}
      {/* ========================================================================= */}
      <Modal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        title="Configurable Placement Eligibility Rules Engine"
        description="Set institutional criteria required for students to become Placement Eligible. Never hardcoded."
      >
        <form onSubmit={handleSaveSettings} className="space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              type="number"
              label="Minimum Course Completion (%)"
              min={0}
              max={100}
              value={settingsForm.min_course_progress_percentage}
              onChange={(e) =>
                setSettingsForm({ ...settingsForm, min_course_progress_percentage: Number(e.target.value) })
              }
              required
            />

            <Input
              type="number"
              label="Minimum Attendance (%)"
              min={0}
              max={100}
              value={settingsForm.min_attendance_percentage}
              onChange={(e) =>
                setSettingsForm({ ...settingsForm, min_attendance_percentage: Number(e.target.value) })
              }
              required
            />

            <Input
              type="number"
              label="Minimum Technical Mock Score (/100)"
              min={0}
              max={100}
              value={settingsForm.min_mock_interview_score}
              onChange={(e) =>
                setSettingsForm({ ...settingsForm, min_mock_interview_score: Number(e.target.value) })
              }
              required
            />
          </div>

          <div className="space-y-2 pt-2 border-t border-slate-100">
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={settingsForm.require_assessments_completed}
                onChange={(e) =>
                  setSettingsForm({ ...settingsForm, require_assessments_completed: e.target.checked })
                }
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-slate-800 font-medium">Require All Course Assessments & Homework Completed</span>
            </label>

            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={settingsForm.require_mock_interview_completed}
                onChange={(e) =>
                  setSettingsForm({ ...settingsForm, require_mock_interview_completed: e.target.checked })
                }
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-slate-800 font-medium">Require Technical Mock Interview Completed</span>
            </label>

            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={settingsForm.require_resume_approved}
                onChange={(e) =>
                  setSettingsForm({ ...settingsForm, require_resume_approved: e.target.checked })
                }
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-slate-800 font-medium">Require Approved Corporate Resume</span>
            </label>

            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={settingsForm.require_mandatory_documents_verified}
                onChange={(e) =>
                  setSettingsForm({ ...settingsForm, require_mandatory_documents_verified: e.target.checked })
                }
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-slate-800 font-medium">Require Degree Certificate & ID Proof Verified</span>
            </label>

            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={settingsForm.require_fees_cleared}
                onChange={(e) =>
                  setSettingsForm({ ...settingsForm, require_fees_cleared: e.target.checked })
                }
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-slate-800 font-medium">Require Full Tuition Fee Clearance (No Dues)</span>
            </label>

            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={settingsForm.allow_admin_override}
                onChange={(e) =>
                  setSettingsForm({ ...settingsForm, allow_admin_override: e.target.checked })
                }
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-slate-800 font-medium">Allow Authorized Admin Override With Mandatory Justification</span>
            </label>
          </div>

          <div className="flex justify-end space-x-2 pt-3 border-t border-slate-100">
            <Button type="button" variant="outline" size="sm" onClick={() => setIsSettingsModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="sap" size="sm">
              Save Rules Configuration
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
