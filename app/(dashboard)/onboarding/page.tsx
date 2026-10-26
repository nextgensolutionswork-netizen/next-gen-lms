'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  UserCheck,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Search,
  Filter,
  FileText,
  ShieldCheck,
  Key,
  Upload,
  Calendar,
  Lock,
  RefreshCw,
  Eye,
  BookOpen,
  Users,
  CheckSquare,
  XSquare,
  AlertCircle,
  ExternalLink,
  ChevronRight,
  Sparkles,
  BarChart3,
  TrendingUp,
  Activity,
  Zap,
  Database,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { FileUpload } from '@/components/ui/file-upload';
import { useAuth } from '@/components/providers/auth-provider';
import { store } from '@/lib/services/data-store';
import {
  OnboardingCase,
  OnboardingStatus,
  OnboardingChecklistKey,
  OnboardingDocument,
  OnboardingAuditEvent,
  OnboardingKpis,
  OnboardingStaffPerformance,
  UserProfile,
} from '@/types';
import {
  getOnboardingCases,
  getOnboardingKpis,
  assignOnboardingStaff,
  updateChecklistItem,
  uploadStudentDocument,
  verifyStudentDocument,
  provisionStudentLmsAccount,
  arrangeStudentOrientation,
  confirmStudentPortalAccess,
  setCaseBlocked,
  unblockCase,
  completeOnboardingWorkflow,
  getOnboardingAuditLogs,
  getEligibleOnboardingStaff,
  getOnboardingStaffPerformance,
  getUnbackfilledAdmissionsCount,
  backfillLegacyAdmissions,
  dispatchStudentWelcomeNotification,
} from '@/lib/services/onboarding-client';
import { formatINR, formatDate } from '@/lib/utils/formatters';

export default function OnboardingPage() {
  const { user, role } = useAuth();

  // State
  const [cases, setCases] = React.useState<OnboardingCase[]>([]);
  const [kpis, setKpis] = React.useState<OnboardingKpis>({
    total: 0,
    pending: 0,
    inProgress: 0,
    completed: 0,
    blocked: 0,
    overdue: 0,
  });
  const [eligibleStaff, setEligibleStaff] = React.useState<UserProfile[]>([]);
  const [search, setSearch] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState<string>('All');
  const [courseFilter, setCourseFilter] = React.useState<string>('All');
  const [staffFilter, setStaffFilter] = React.useState<string>('All');
  const [isLoading, setIsLoading] = React.useState(true);
  const [activeViewTab, setActiveViewTab] = React.useState<'cases' | 'performance'>('cases');
  const [staffPerformance, setStaffPerformance] = React.useState<OnboardingStaffPerformance[]>([]);
  const [unbackfilledCount, setUnbackfilledCount] = React.useState<number>(0);
  const [isBackfilling, setIsBackfilling] = React.useState<boolean>(false);
  const [pageSuccessMsg, setPageSuccessMsg] = React.useState<string | null>(null);
  const [pageErrorMsg, setPageErrorMsg] = React.useState<string | null>(null);

  // Selected Case Modal
  const [selectedCase, setSelectedCase] = React.useState<OnboardingCase | null>(null);
  const [caseAuditLogs, setCaseAuditLogs] = React.useState<OnboardingAuditEvent[]>([]);
  const [auditLoading, setAuditLoading] = React.useState(false);
  const [actionSuccessMsg, setActionSuccessMsg] = React.useState<string | null>(null);
  const [actionErrorMsg, setActionErrorMsg] = React.useState<string | null>(null);

  // Reassignment Modal (Admin only)
  const [isReassignModal, setIsReassignModal] = React.useState(false);
  const [selectedStaffId, setSelectedStaffId] = React.useState('');

  // Block Modal
  const [isBlockModal, setIsBlockModal] = React.useState(false);
  const [blockReason, setBlockReason] = React.useState('');

  // Upload Document Modal
  const [isUploadDocModal, setIsUploadDocModal] = React.useState(false);
  const [docName, setDocName] = React.useState('');
  const [docType, setDocType] = React.useState<OnboardingDocument['doc_type']>('id_proof');
  const [docUrl, setDocUrl] = React.useState('');

  // Orientation Modal
  const [isOrientationModal, setIsOrientationModal] = React.useState(false);
  const [orientationDate, setOrientationDate] = React.useState(
    new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10)
  );
  const [orientationMode, setOrientationMode] = React.useState<'Online' | 'Classroom' | 'Hybrid'>('Online');
  const [orientationNotes, setOrientationNotes] = React.useState('');

  const currentUserProfile = React.useMemo<UserProfile>(() => user || {
    id: 'usr-admin',
    email: 'admin@next-generpsolutions.com',
    full_name: 'Priya Nair (Operations Head)',
    role: (role as any) || 'admin',
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, [user, role]);

  const isAdmin = currentUserProfile.role === 'super_admin' || currentUserProfile.role === 'admin';

  const loadData = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const caseList = await getOnboardingCases(currentUserProfile, {
        search,
        status: statusFilter,
        courseId: courseFilter,
        staffId: staffFilter,
      });
      setCases(caseList);

      const kpiData = await getOnboardingKpis(currentUserProfile);
      setKpis(kpiData);

      const staffList = await getEligibleOnboardingStaff();
      setEligibleStaff(staffList);
      if (staffList.length > 0) {
        setSelectedStaffId((current) => current || staffList[0].id);
      }

      if (isAdmin) {
        try {
          const perfList = await getOnboardingStaffPerformance(currentUserProfile);
          setStaffPerformance(perfList);
        } catch (perfErr) {
          console.warn('Error fetching staff performance:', perfErr);
        }
        try {
          const unbackfilled = await getUnbackfilledAdmissionsCount(currentUserProfile);
          setUnbackfilledCount(unbackfilled);
        } catch (unbErr) {
          console.warn('Error fetching unbackfilled admissions count:', unbErr);
        }
      }
    } catch (err) {
      console.warn('Error loading onboarding cases:', err);
    } finally {
      setIsLoading(false);
    }
  }, [currentUserProfile, search, statusFilter, courseFilter, staffFilter, isAdmin]);

  const handleBackfillAdmissions = async () => {
    if (!isAdmin) return;
    setIsBackfilling(true);
    setPageErrorMsg(null);
    setPageSuccessMsg(null);
    try {
      const res = await backfillLegacyAdmissions(currentUserProfile);
      await loadData();
      setPageSuccessMsg(res.message);
    } catch (err: any) {
      setPageErrorMsg(err?.message || 'Failed to backfill legacy admissions');
    } finally {
      setIsBackfilling(false);
    }
  };

  React.useEffect(() => {
    loadData();
    const timer = window.setInterval(loadData, 15000);
    return () => window.clearInterval(timer);
  }, [loadData]);

  const openCaseDetails = async (c: OnboardingCase) => {
    setSelectedCase(c);
    setActionSuccessMsg(null);
    setActionErrorMsg(null);
    setAuditLoading(true);
    try {
      const logs = await getOnboardingAuditLogs(c.id, currentUserProfile);
      setCaseAuditLogs(logs);
    } catch (err) {
      setCaseAuditLogs([]);
    } finally {
      setAuditLoading(false);
    }
  };

  const refreshCurrentCase = async (caseId: string) => {
    const updated = store.onboardingCases.find((c) => c.id === caseId);
    if (updated) {
      setSelectedCase({ ...updated });
      const logs = await getOnboardingAuditLogs(caseId, currentUserProfile);
      setCaseAuditLogs(logs);
    }
    await loadData();
  };

  // Checklist Item Toggle Handler
  const handleToggleChecklist = async (
    itemKey: OnboardingChecklistKey,
    currentCompleted: boolean
  ) => {
    if (!selectedCase) return;
    setActionErrorMsg(null);
    setActionSuccessMsg(null);
    try {
      const updated = await updateChecklistItem(
        selectedCase.id,
        itemKey,
        !currentCompleted,
        undefined,
        currentUserProfile
      );
      await refreshCurrentCase(updated.id);
      setActionSuccessMsg(
        `✓ "${selectedCase.checklist[itemKey].title}" marked as ${!currentCompleted ? 'Completed' : 'Pending'}.`
      );
    } catch (err: any) {
      setActionErrorMsg(err?.message || 'Failed to update checklist item');
    }
  };

  // LMS Account Provisioning Handler
  const handleProvisionLms = async () => {
    if (!selectedCase) return;
    setActionErrorMsg(null);
    setActionSuccessMsg(null);
    try {
      const result = await provisionStudentLmsAccount(selectedCase.id, currentUserProfile);
      await refreshCurrentCase(selectedCase.id);
      setActionSuccessMsg(result.message);
    } catch (err: any) {
      setActionErrorMsg(err?.message || 'Failed to provision LMS account');
    }
  };

  // Multi-Channel Welcome Notification Dispatch Handler
  const handleDispatchWelcomeNotification = async () => {
    if (!selectedCase) return;
    setActionErrorMsg(null);
    setActionSuccessMsg(null);
    try {
      const result = await dispatchStudentWelcomeNotification(
        selectedCase.id,
        currentUserProfile,
        {
          orientationDate: selectedCase.orientation_date,
          orientationMode: selectedCase.orientation_mode,
        }
      );
      await refreshCurrentCase(selectedCase.id);
      setActionSuccessMsg(result.message);
    } catch (err: any) {
      setActionErrorMsg(err?.message || 'Failed to dispatch welcome notification');
    }
  };

  // Document Verification Handler
  const handleVerifyDoc = async (docId: string, status: 'verified' | 'rejected') => {
    if (!selectedCase) return;
    setActionErrorMsg(null);
    setActionSuccessMsg(null);
    try {
      const updated = await verifyStudentDocument(
        selectedCase.id,
        docId,
        status,
        status === 'rejected' ? 'Document image unreadable or expired' : undefined,
        currentUserProfile
      );
      await refreshCurrentCase(updated.id);
      setActionSuccessMsg(`✓ Document marked as ${status}.`);
    } catch (err: any) {
      setActionErrorMsg(err?.message || 'Failed to update document status');
    }
  };

  // Upload Document Handler
  const handleUploadDoc = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCase || !docUrl) return;
    const finalDocName = docName.trim() || `${docType.replace(/_/g, ' ').toUpperCase()}`;
    setActionErrorMsg(null);
    try {
      const updated = await uploadStudentDocument(
        selectedCase.id,
        { name: finalDocName, doc_type: docType, file_url: docUrl },
        currentUserProfile
      );
      await refreshCurrentCase(updated.id);
      setIsUploadDocModal(false);
      setDocName('');
      setDocUrl('');
      setActionSuccessMsg(`✓ Document "${finalDocName}" uploaded and attached successfully.`);
    } catch (err: any) {
      setActionErrorMsg(err?.message || 'Failed to upload document');
    }
  };

  // Orientation Schedule Handler
  const handleScheduleOrientation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCase || !orientationDate) return;
    setActionErrorMsg(null);
    try {
      const updated = await arrangeStudentOrientation(
        selectedCase.id,
        orientationDate,
        orientationMode,
        orientationNotes,
        currentUserProfile
      );
      await refreshCurrentCase(updated.id);
      setIsOrientationModal(false);
      setActionSuccessMsg(
        `✓ Orientation confirmed for ${orientationDate} via ${orientationMode}. Multi-channel welcome kit & portal link dispatched via Resend Email & WhatsApp.`
      );
    } catch (err: any) {
      setActionErrorMsg(err?.message || 'Failed to arrange orientation');
    }
  };

  // Portal Access Confirmation Handler
  const handleConfirmPortalAccess = async () => {
    if (!selectedCase) return;
    setActionErrorMsg(null);
    try {
      const updated = await confirmStudentPortalAccess(
        selectedCase.id,
        'Student successfully logged in and attended first lecture',
        currentUserProfile
      );
      await refreshCurrentCase(updated.id);
      setActionSuccessMsg('✓ Student portal access and first lecture attendance confirmed.');
    } catch (err: any) {
      setActionErrorMsg(err?.message || 'Failed to confirm portal access');
    }
  };

  // Block Case Handler
  const handleBlockCase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCase || !blockReason.trim()) return;
    setActionErrorMsg(null);
    try {
      const updated = await setCaseBlocked(selectedCase.id, blockReason.trim(), currentUserProfile);
      await refreshCurrentCase(updated.id);
      setIsBlockModal(false);
      setBlockReason('');
      setActionSuccessMsg(`✓ Case placed on hold: "${updated.blocked_reason}".`);
    } catch (err: any) {
      setActionErrorMsg(err?.message || 'Failed to block case');
    }
  };

  // Unblock Case Handler
  const handleUnblockCase = async () => {
    if (!selectedCase) return;
    setActionErrorMsg(null);
    try {
      const updated = await unblockCase(selectedCase.id, currentUserProfile);
      await refreshCurrentCase(updated.id);
      setActionSuccessMsg('✓ Onboarding case unblocked and resumed.');
    } catch (err: any) {
      setActionErrorMsg(err?.message || 'Failed to unblock case');
    }
  };

  // Reassign Case Handler (Admin)
  const handleReassignStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCase || !selectedStaffId) return;
    setActionErrorMsg(null);
    try {
      const updated = await assignOnboardingStaff(
        selectedCase.id,
        selectedStaffId,
        currentUserProfile
      );
      await refreshCurrentCase(updated.id);
      setIsReassignModal(false);
      setActionSuccessMsg(`✓ Case assigned to ${updated.assigned_staff_name}.`);
    } catch (err: any) {
      setActionErrorMsg(err?.message || 'Failed to assign staff');
    }
  };

  // Complete Onboarding Handler
  const handleCompleteOnboarding = async () => {
    if (!selectedCase) return;
    setActionErrorMsg(null);
    try {
      const updated = await completeOnboardingWorkflow(selectedCase.id, currentUserProfile);
      await refreshCurrentCase(updated.id);
      setActionSuccessMsg(
        `✓ Congratulations! Onboarding for ${updated.student_name} is fully completed and handed over to Academic Operations.`
      );
    } catch (err: any) {
      setActionErrorMsg(err?.message || 'Failed to complete onboarding');
    }
  };

  // Find fee account for read-only financial verification
  const selectedStudentFeeAccount = selectedCase
    ? store.feeAccounts.find(
        (fa) =>
          fa.admission_id === selectedCase.admission_id ||
          fa.student_id === selectedCase.student_id
      )
    : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Student Onboarding & Handoff Workspace
            </h1>
            <Badge
              variant="outline"
              className="bg-teal-50 text-teal-800 border-teal-300 text-xs uppercase font-semibold"
            >
              {currentUserProfile.role.replace('_', ' ')}
            </Badge>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Standardized 11-step onboarding lifecycle for admitted SAP students with default-deny RBAC isolation.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          {isAdmin && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleBackfillAdmissions}
              disabled={isBackfilling || unbackfilledCount === 0}
              className="text-xs flex items-center space-x-1.5 hover:bg-amber-50 hover:text-amber-800"
              title={
                unbackfilledCount > 0
                  ? `${unbackfilledCount} legacy admissions pending onboarding sync`
                  : 'All legacy admissions synced'
              }
            >
              <Database className="h-3.5 w-3.5 text-blue-600" />
              <span>Import / Sync Unassigned Admissions</span>
              {unbackfilledCount > 0 && (
                <Badge
                  variant="outline"
                  className="ml-1 bg-amber-100 text-amber-800 border-amber-300 text-[10px] py-0 px-1 font-bold"
                >
                  {unbackfilledCount}
                </Badge>
              )}
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={loadData}
            className="text-xs flex items-center space-x-1"
          >
            <RefreshCw className="h-3.5 w-3.5 text-slate-500" />
            <span>Refresh</span>
          </Button>
          <Link href="/admissions">
            <Button variant="sap" size="sm" className="text-xs flex items-center space-x-1">
              <Users className="h-3.5 w-3.5" />
              <span>Admissions Register</span>
            </Button>
          </Link>
        </div>
      </div>

      {/* Page-Level Feedback Messages */}
      {pageSuccessMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-xs font-medium flex items-center justify-between shadow-sm">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            <span>{pageSuccessMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setPageSuccessMsg(null)}
            className="text-emerald-700 hover:text-emerald-900 font-bold ml-2 text-sm leading-none"
          >
            ×
          </button>
        </div>
      )}

      {pageErrorMsg && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 text-xs font-medium flex items-center justify-between shadow-sm">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
            <span>{pageErrorMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setPageErrorMsg(null)}
            className="text-rose-700 hover:text-rose-900 font-bold ml-2 text-sm leading-none"
          >
            ×
          </button>
        </div>
      )}

      {/* Legacy Admission Backfill Banner (Admin Only) */}
      {isAdmin && unbackfilledCount > 0 && (
        <div className="p-4 bg-gradient-to-r from-amber-50 via-white to-blue-50 border border-amber-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
          <div className="flex items-start sm:items-center space-x-3.5">
            <div className="p-2.5 bg-amber-100 text-amber-800 rounded-lg shrink-0">
              <Database className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-bold text-slate-900">
                  {unbackfilledCount} Legacy Confirmed Admission{unbackfilledCount > 1 ? 's' : ''} Ready for Onboarding Sync
                </p>
                <Badge
                  variant="outline"
                  className="bg-amber-100 text-amber-800 border-amber-300 text-[10px] font-semibold"
                >
                  Requires Sync
                </Badge>
              </div>
              <p className="text-xs text-slate-600 mt-1">
                Admitted prior to onboarding lifecycle activation. 1-click sync creates individual audit checklist cases and automatically preserves verified batch, course, and payment details.
              </p>
            </div>
          </div>
          <Button
            variant="sap"
            size="sm"
            disabled={isBackfilling}
            onClick={handleBackfillAdmissions}
            className="text-xs shrink-0 flex items-center space-x-1.5 self-start sm:self-center font-semibold"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isBackfilling ? 'animate-spin' : ''}`} />
            <span>{isBackfilling ? 'Syncing Cases...' : `1-Click Sync (${unbackfilledCount})`}</span>
          </Button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Card className="border-slate-200">
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                Total Assigned
              </span>
              <Users className="h-4 w-4 text-blue-600" />
            </div>
            <p className="text-2xl font-bold text-slate-900 mt-1">{kpis.total}</p>
            <p className="text-[10px] text-slate-400 mt-0.5">Admitted students</p>
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                Pending Start
              </span>
              <Clock className="h-4 w-4 text-slate-500" />
            </div>
            <p className="text-2xl font-bold text-slate-700 mt-1">{kpis.pending}</p>
            <p className="text-[10px] text-slate-400 mt-0.5">Awaiting staff pickup</p>
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-blue-700 uppercase tracking-wider">
                In Progress
              </span>
              <UserCheck className="h-4 w-4 text-blue-600" />
            </div>
            <p className="text-2xl font-bold text-blue-700 mt-1">{kpis.inProgress}</p>
            <p className="text-[10px] text-slate-400 mt-0.5">Active checklist</p>
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-amber-700 uppercase tracking-wider">
                Blocked / On Hold
              </span>
              <AlertTriangle className="h-4 w-4 text-amber-600" />
            </div>
            <p className="text-2xl font-bold text-amber-700 mt-1">{kpis.blocked}</p>
            <p className="text-[10px] text-slate-400 mt-0.5">Action required</p>
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wider">
                Completed
              </span>
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            </div>
            <p className="text-2xl font-bold text-emerald-700 mt-1">{kpis.completed}</p>
            <p className="text-[10px] text-slate-400 mt-0.5">Handed over</p>
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-rose-700 uppercase tracking-wider">
                Overdue Tasks
              </span>
              <AlertCircle className="h-4 w-4 text-rose-600" />
            </div>
            <p className="text-2xl font-bold text-rose-700 mt-1">{kpis.overdue}</p>
            <p className="text-[10px] text-slate-400 mt-0.5">Beyond 7-day SLA</p>
          </CardContent>
        </Card>
      </div>

      {/* View Switcher (Admin / Super Admin) */}
      {isAdmin && (
        <div className="flex border-b border-slate-200 gap-6">
          <button
            type="button"
            onClick={() => setActiveViewTab('cases')}
            className={`pb-3 text-sm font-semibold flex items-center space-x-2 border-b-2 transition-colors ${
              activeViewTab === 'cases'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <UserCheck className="h-4 w-4" />
            <span>Assigned Student Cases</span>
            <Badge variant="secondary" className="ml-1 text-[11px]">
              {cases.length}
            </Badge>
          </button>

          <button
            type="button"
            onClick={() => setActiveViewTab('performance')}
            className={`pb-3 text-sm font-semibold flex items-center space-x-2 border-b-2 transition-colors ${
              activeViewTab === 'performance'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <BarChart3 className="h-4 w-4" />
            <span>Team Performance & Workload</span>
            <Badge
              variant="outline"
              className="ml-1 text-[11px] bg-blue-50 text-blue-700 border-blue-200"
            >
              {staffPerformance.length} Staff
            </Badge>
          </button>
        </div>
      )}

      {activeViewTab === 'cases' ? (
        <>
          {/* Filter and Search Bar */}
          <Card>
            <CardContent className="p-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                  <Input
                    placeholder="Search student, case #, phone..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-8 text-xs"
                  />
                </div>

                <div>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800"
                  >
                    <option value="All">All Statuses</option>
                    <option value="pending">Pending</option>
                    <option value="in_progress">In Progress</option>
                    <option value="blocked">Blocked / On Hold</option>
                    <option value="completed">Completed</option>
                  </select>
                </div>

                <div>
                  <select
                    value={courseFilter}
                    onChange={(e) => setCourseFilter(e.target.value)}
                    className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800"
                  >
                    <option value="All">All SAP Courses</option>
                    {store.courses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.course_name}
                      </option>
                    ))}
                  </select>
                </div>

                {isAdmin && (
                  <div>
                    <select
                      value={staffFilter}
                      onChange={(e) => setStaffFilter(e.target.value)}
                      className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800"
                    >
                      <option value="All">All Onboarding Staff</option>
                      {eligibleStaff.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.full_name} ({s.role})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Cases Table */}
          <Card>
            <CardHeader className="py-3 px-4 border-b border-slate-100 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-bold text-slate-800 flex items-center space-x-2">
                <UserCheck className="h-4 w-4 text-blue-600" />
                <span>Assigned Onboarding Cases ({cases.length})</span>
              </CardTitle>
              <span className="text-[11px] text-slate-500">
                {isAdmin
                  ? 'Admin View: Full enterprise scope across all staff'
                  : 'Specialist View: Restricted strictly to your assigned students'}
              </span>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 text-slate-600 uppercase border-b border-slate-100 font-semibold text-[10px]">
                    <tr>
                      <th className="px-4 py-3">Case # / Admission</th>
                      <th className="px-4 py-3">Student Name</th>
                      <th className="px-4 py-3">Course & Batch</th>
                      <th className="px-4 py-3">Assigned Staff</th>
                      <th className="px-4 py-3">Checklist Progress</th>
                      <th className="px-4 py-3">Financial Clearance</th>
                      <th className="px-4 py-3">LMS Access</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {cases.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="px-4 py-8 text-center text-slate-400">
                          No onboarding cases match your current filters.
                        </td>
                      </tr>
                    ) : (
                      cases.map((c) => {
                        const checklistItems = Object.values(c.checklist);
                        const completedCount = checklistItems.filter((i) => i.completed).length;
                        const totalCount = checklistItems.length;
                        const percent = Math.round((completedCount / totalCount) * 100);

                        const fa = store.feeAccounts.find(
                          (f) => f.admission_id === c.admission_id || f.student_id === c.student_id
                        );
                        const isFinanciallyCleared = fa ? fa.paid_amount > 0 : false;

                        return (
                          <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                            <td className="px-4 py-3">
                              <p className="font-bold text-slate-900">{c.case_number}</p>
                              <p className="text-[10px] text-slate-400 font-mono">{c.admission_number}</p>
                            </td>
                            <td className="px-4 py-3">
                              <p className="font-semibold text-slate-900">{c.student_name}</p>
                              <p className="text-[10px] text-slate-500">{c.student_email}</p>
                              <p className="text-[10px] text-slate-400">{c.student_phone}</p>
                            </td>
                            <td className="px-4 py-3">
                              <p className="font-medium text-slate-800">{c.course_name}</p>
                              <p className="text-[10px] text-slate-500">{c.batch_name || 'Batch TBD'}</p>
                            </td>
                            <td className="px-4 py-3">
                              {c.assigned_staff_name ? (
                                <span className="font-medium text-slate-800">{c.assigned_staff_name}</span>
                              ) : (
                                <span className="text-amber-700 italic font-semibold">Unassigned</span>
                              )}
                              {isAdmin && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedCase(c);
                                    setIsReassignModal(true);
                                  }}
                                  className="block text-[10px] text-blue-600 hover:underline mt-0.5"
                                >
                                  Reassign Staff
                                </button>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <div className="w-28">
                                <div className="flex justify-between text-[10px] mb-1 font-semibold text-slate-600">
                                  <span>
                                    {completedCount} / {totalCount}
                                  </span>
                                  <span>{percent}%</span>
                                </div>
                                <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full ${
                                      percent === 100
                                        ? 'bg-emerald-600'
                                        : percent > 50
                                        ? 'bg-blue-600'
                                        : 'bg-amber-500'
                                    }`}
                                    style={{ width: `${percent}%` }}
                                  />
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              {isFinanciallyCleared ? (
                                <Badge
                                  variant="outline"
                                  className="bg-emerald-50 text-emerald-800 border-emerald-300 text-[10px]"
                                >
                                  Cleared ({formatINR(fa?.paid_amount || 0)})
                                </Badge>
                              ) : (
                                <Badge
                                  variant="outline"
                                  className="bg-amber-50 text-amber-800 border-amber-300 text-[10px]"
                                >
                                  Pending Clearance
                                </Badge>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              {c.lms_account_created ? (
                                <Badge
                                  variant="outline"
                                  className="bg-blue-50 text-blue-800 border-blue-300 text-[10px] flex items-center gap-1 w-fit"
                                >
                                  <CheckCircle2 className="h-3 w-3 text-blue-600" />
                                  <span>Active</span>
                                </Badge>
                              ) : (
                                <Badge
                                  variant="outline"
                                  className="bg-slate-100 text-slate-600 border-slate-300 text-[10px]"
                                >
                                  Not Provisioned
                                </Badge>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <Badge
                                variant={
                                  c.status === 'completed'
                                    ? 'success'
                                    : c.status === 'in_progress'
                                    ? 'info'
                                    : c.status === 'blocked'
                                    ? 'destructive'
                                    : 'secondary'
                                }
                                className="capitalize text-[10px]"
                              >
                                {c.status.replace('_', ' ')}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <Button
                                variant="sap"
                                size="sm"
                                onClick={() => openCaseDetails(c)}
                                className="text-xs flex items-center space-x-1"
                              >
                                <span>Manage Case</span>
                                <ChevronRight className="h-3 w-3" />
                              </Button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      ) : (
        /* Team Performance & SLA Analytics View */
        <div className="space-y-4">
          {/* Team Capacity & Performance Overview Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <Card className="border-slate-200 bg-white">
              <CardContent className="p-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    Total Specialists
                  </span>
                  <Users className="h-4 w-4 text-blue-600" />
                </div>
                <p className="text-2xl font-bold text-slate-900 mt-1">
                  {staffPerformance.length}
                </p>
                <div className="flex items-center gap-1.5 mt-1 text-[11px] text-slate-500">
                  <span className="text-emerald-600 font-medium">
                    {staffPerformance.filter((s) => s.workload_status === 'Available').length} Available
                  </span>
                  <span>•</span>
                  <span className="text-blue-600 font-medium">
                    {staffPerformance.filter((s) => s.workload_status === 'Balanced').length} Balanced
                  </span>
                  {staffPerformance.some((s) => s.workload_status === 'High Workload') && (
                    <>
                      <span>•</span>
                      <span className="text-rose-600 font-medium">
                        {staffPerformance.filter((s) => s.workload_status === 'High Workload').length} Heavy
                      </span>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="border-slate-200 bg-white">
              <CardContent className="p-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wider">
                    Team SLA Compliance
                  </span>
                  <TrendingUp className="h-4 w-4 text-emerald-600" />
                </div>
                <p className="text-2xl font-bold text-emerald-700 mt-1">
                  {staffPerformance.length > 0
                    ? Math.round(
                        staffPerformance.reduce((acc, s) => acc + s.sla_compliance_rate, 0) /
                          staffPerformance.length
                      )
                    : 100}%
                </p>
                <p className="text-[10px] text-slate-400 mt-0.5">7-day resolution benchmark</p>
              </CardContent>
            </Card>

            <Card className="border-slate-200 bg-white">
              <CardContent className="p-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-indigo-700 uppercase tracking-wider">
                    Avg Completion Time
                  </span>
                  <Activity className="h-4 w-4 text-indigo-600" />
                </div>
                <p className="text-2xl font-bold text-indigo-700 mt-1">
                  {staffPerformance.length > 0
                    ? Number(
                        (
                          staffPerformance.reduce((acc, s) => acc + s.avg_completion_days, 0) /
                          Math.max(1, staffPerformance.filter((s) => s.completed_count > 0).length)
                        ).toFixed(1)
                      )
                    : 0}{' '}
                  <span className="text-sm font-normal text-slate-500">Days</span>
                </p>
                <p className="text-[10px] text-slate-400 mt-0.5">From admission to academic handoff</p>
              </CardContent>
            </Card>

            <Card className="border-slate-200 bg-white">
              <CardContent className="p-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-amber-700 uppercase tracking-wider">
                    Overdue Bottlenecks
                  </span>
                  <AlertCircle className="h-4 w-4 text-amber-600" />
                </div>
                <p className="text-2xl font-bold text-amber-700 mt-1">
                  {staffPerformance.reduce((acc, s) => acc + s.overdue_count, 0)}
                </p>
                <p className="text-[10px] text-slate-400 mt-0.5">Cases exceeding 7-day turnaround</p>
              </CardContent>
            </Card>
          </div>

          {/* Staff Performance Table */}
          <Card>
            <CardHeader className="py-3 px-4 border-b border-slate-100 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-sm font-bold text-slate-800 flex items-center space-x-2">
                  <BarChart3 className="h-4 w-4 text-blue-600" />
                  <span>Onboarding Specialist Performance & SLA Metrics</span>
                </CardTitle>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Real-time workload distribution, average turnaround time, and 7-day SLA compliance rates per staff member.
                </p>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 text-slate-600 uppercase border-b border-slate-100 font-semibold text-[10px]">
                    <tr>
                      <th className="px-4 py-3">Specialist</th>
                      <th className="px-4 py-3">Workload Status</th>
                      <th className="px-4 py-3 text-center">Total Assigned</th>
                      <th className="px-4 py-3 text-center">Active Pipeline</th>
                      <th className="px-4 py-3 text-center">Completed</th>
                      <th className="px-4 py-3 text-center">Overdue (&gt;7d)</th>
                      <th className="px-4 py-3 text-center">Avg Turnaround</th>
                      <th className="px-4 py-3">7-Day SLA Compliance</th>
                      <th className="px-4 py-3 text-right">Quick Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {staffPerformance.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="px-4 py-8 text-center text-slate-400">
                          No onboarding staff members registered.
                        </td>
                      </tr>
                    ) : (
                      staffPerformance.map((s) => {
                        const activeCount = s.pending_count + s.in_progress_count + s.blocked_count;
                        return (
                          <tr key={s.staff_id} className="hover:bg-slate-50 transition-colors">
                            <td className="px-4 py-3">
                              <div className="flex items-center space-x-3">
                                <div className="h-8 w-8 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center text-xs">
                                  {s.staff_name
                                    .split(' ')
                                    .map((n) => n[0])
                                    .join('')
                                    .slice(0, 2)
                                    .toUpperCase()}
                                </div>
                                <div>
                                  <p className="font-semibold text-slate-900">{s.staff_name}</p>
                                  <p className="text-[10px] text-slate-400 font-mono">{s.staff_email}</p>
                                </div>
                              </div>
                            </td>

                            <td className="px-4 py-3">
                              <Badge
                                variant="outline"
                                className={`text-[10px] font-semibold ${
                                  s.workload_status === 'Available'
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                                    : s.workload_status === 'Balanced'
                                    ? 'bg-blue-50 text-blue-700 border-blue-300'
                                    : 'bg-rose-50 text-rose-700 border-rose-300'
                                }`}
                              >
                                {s.workload_status}
                              </Badge>
                            </td>

                            <td className="px-4 py-3 text-center font-bold text-slate-800">
                              {s.total_assigned}
                            </td>

                            <td className="px-4 py-3 text-center">
                              <div className="flex items-center justify-center gap-1">
                                {s.pending_count > 0 && (
                                  <Badge variant="outline" className="bg-slate-100 text-slate-600 text-[10px] py-0 px-1.5" title="Pending">
                                    {s.pending_count} P
                                  </Badge>
                                )}
                                {s.in_progress_count > 0 && (
                                  <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-[10px] py-0 px-1.5" title="In Progress">
                                    {s.in_progress_count} IP
                                  </Badge>
                                )}
                                {s.blocked_count > 0 && (
                                  <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-[10px] py-0 px-1.5" title="Blocked / On Hold">
                                    {s.blocked_count} B
                                  </Badge>
                                )}
                                {activeCount === 0 && (
                                  <span className="text-[10px] text-slate-400">0 Active</span>
                                )}
                              </div>
                            </td>

                            <td className="px-4 py-3 text-center font-bold text-emerald-700">
                              {s.completed_count}
                            </td>

                            <td className="px-4 py-3 text-center">
                              {s.overdue_count > 0 ? (
                                <Badge variant="outline" className="bg-rose-50 text-rose-700 border-rose-200 text-[10px] font-bold">
                                  {s.overdue_count}
                                </Badge>
                              ) : (
                                <span className="text-slate-400 text-[11px]">-</span>
                              )}
                            </td>

                            <td className="px-4 py-3 text-center">
                              {s.completed_count > 0 ? (
                                <span className="font-semibold text-slate-800">
                                  {s.avg_completion_days} <span className="text-[10px] font-normal text-slate-500">days</span>
                                </span>
                              ) : (
                                <span className="text-slate-400 text-[11px]">N/A</span>
                              )}
                            </td>

                            <td className="px-4 py-3">
                              <div className="w-32">
                                <div className="flex justify-between text-[10px] mb-1 font-semibold text-slate-700">
                                  <span>{s.sla_compliance_rate}%</span>
                                  <span className="text-slate-400 font-normal">7d SLA</span>
                                </div>
                                <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full ${
                                      s.sla_compliance_rate >= 90
                                        ? 'bg-emerald-600'
                                        : s.sla_compliance_rate >= 75
                                        ? 'bg-blue-600'
                                        : 'bg-amber-500'
                                    }`}
                                    style={{ width: `${s.sla_compliance_rate}%` }}
                                  />
                                </div>
                              </div>
                            </td>

                            <td className="px-4 py-3 text-right">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setStaffFilter(s.staff_id);
                                  setActiveViewTab('cases');
                                }}
                                className="text-xs flex items-center space-x-1 hover:bg-blue-50 hover:text-blue-700"
                              >
                                <Filter className="h-3 w-3" />
                                <span>Filter Cases</span>
                              </Button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Case Management Drawer / Modal */}
      {selectedCase && (
        <Modal
          isOpen={Boolean(selectedCase)}
          onClose={() => setSelectedCase(null)}
          title={`Onboarding Case: ${selectedCase.case_number} — ${selectedCase.student_name}`}
          description={`Admission No: ${selectedCase.admission_number} | Course: ${selectedCase.course_name}`}
        >
          <div className="space-y-4 text-xs max-h-[80vh] overflow-y-auto pr-1">
            {/* Alerts */}
            {actionSuccessMsg && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 font-medium flex items-center space-x-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                <span>{actionSuccessMsg}</span>
              </div>
            )}
            {actionErrorMsg && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 font-medium flex items-center space-x-2">
                <AlertCircle className="h-4 w-4 text-rose-600 flex-shrink-0" />
                <span>{actionErrorMsg}</span>
              </div>
            )}

            {/* Status & Assignment Header Bar */}
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center space-x-3">
                <Badge
                  variant={
                    selectedCase.status === 'completed'
                      ? 'success'
                      : selectedCase.status === 'in_progress'
                      ? 'info'
                      : selectedCase.status === 'blocked'
                      ? 'destructive'
                      : 'secondary'
                  }
                  className="text-xs uppercase font-bold"
                >
                  Status: {selectedCase.status.replace('_', ' ')}
                </Badge>
                {selectedCase.status === 'blocked' && (
                  <span className="text-rose-700 font-semibold text-xs">
                    Hold Reason: {selectedCase.blocked_reason}
                  </span>
                )}
              </div>

              <div className="flex items-center space-x-2">
                {selectedCase.status === 'blocked' ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleUnblockCase}
                    className="text-emerald-700 border-emerald-300 hover:bg-emerald-50"
                  >
                    Unblock Case
                  </Button>
                ) : selectedCase.status !== 'completed' ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setIsBlockModal(true)}
                    className="text-amber-700 border-amber-300 hover:bg-amber-50"
                  >
                    Place On Hold
                  </Button>
                ) : null}

                {isAdmin && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setIsReassignModal(true)}
                  >
                    Reassign Staff
                  </Button>
                )}

                {selectedCase.status !== 'completed' && (
                  <Button
                    size="sm"
                    variant="sap"
                    onClick={handleCompleteOnboarding}
                    className="flex items-center space-x-1"
                  >
                    <CheckSquare className="h-3.5 w-3.5" />
                    <span>Complete Onboarding</span>
                  </Button>
                )}
              </div>
            </div>

            {/* Read-Only Financial Clearance Card */}
            <div className="p-3.5 bg-blue-50/60 border border-blue-200 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <ShieldCheck className="h-4 w-4 text-blue-700" />
                  <span className="font-bold text-slate-800 text-xs">
                    Accounts Clearance Status (Read-Only)
                  </span>
                </div>
                <span className="text-[10px] text-slate-500 italic">
                  Separation of duties: Onboarding staff cannot edit ledgers or approve fees
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 border-t border-blue-100 text-[11px]">
                <div>
                  <span className="text-slate-500 block text-[10px]">Net Course Fee:</span>
                  <span className="font-bold text-slate-900">
                    {formatINR(selectedStudentFeeAccount?.net_payable || 0)}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">Paid Amount:</span>
                  <span className="font-bold text-emerald-700">
                    {formatINR(selectedStudentFeeAccount?.paid_amount || 0)}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">Outstanding Balance:</span>
                  <span className="font-bold text-amber-800">
                    {formatINR(selectedStudentFeeAccount?.outstanding_amount || 0)}
                  </span>
                </div>
                
              </div>
            </div>

            {/* Interactive 11-Step Onboarding Checklist */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-slate-900 uppercase tracking-wider text-xs">
                  Mandatory Onboarding Verification Checklist (11 Steps)
                </h4>
                <span className="text-[10px] text-slate-500">
                  Every step is audited with employee timestamps
                </span>
              </div>

              <div className="divide-y divide-slate-200 border border-slate-200 rounded-xl bg-white overflow-hidden">
                {Object.values(selectedCase.checklist).map((item, idx) => {
                  const isCompleted = item.completed;

                  return (
                    <div
                      key={item.key}
                      className={`p-3 transition-colors ${
                        isCompleted ? 'bg-emerald-50/30' : 'bg-white hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start space-x-2.5">
                          <button
                            type="button"
                            onClick={() => handleToggleChecklist(item.key, isCompleted)}
                            className="mt-0.5 text-slate-700 hover:text-blue-600 transition-colors"
                          >
                            {isCompleted ? (
                              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                            ) : (
                              <div className="h-4 w-4 rounded border border-slate-300 bg-white" />
                            )}
                          </button>
                          <div>
                            <div className="flex items-center space-x-2">
                              <span className="text-xs font-bold text-slate-900">
                                {idx + 1}. {item.title}
                              </span>
                              {item.mandatory && (
                                <span className="text-[10px] text-rose-600 font-bold">*Mandatory</span>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-500 mt-0.5">{item.description}</p>
                            {item.notes && (
                              <p className="text-[10px] text-slate-600 font-mono mt-1 bg-slate-100 px-2 py-0.5 rounded w-fit">
                                Note: {item.notes}
                              </p>
                            )}
                            {isCompleted && item.completed_at && (
                              <p className="text-[10px] text-emerald-700 mt-0.5">
                                ✓ Verified by {item.completed_by_name || 'Staff'} on{' '}
                                {formatDate(item.completed_at)}
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Step-specific Interactive Actions */}
                        <div className="flex items-center space-x-2 flex-shrink-0">
                          {item.key === 'document_verification' && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => setIsUploadDocModal(true)}
                              className="text-[10px] h-7 px-2"
                            >
                              <Upload className="h-3 w-3 mr-1" />
                              <span>Upload Document</span>
                            </Button>
                          )}

                          {item.key === 'lms_account_activation' && !selectedCase.lms_account_created && (
                            <Button
                              type="button"
                              variant="sap"
                              size="sm"
                              onClick={handleProvisionLms}
                              className="text-[10px] h-7 px-2 flex items-center space-x-1"
                            >
                              <Key className="h-3 w-3" />
                              <span>Provision LMS Access</span>
                            </Button>
                          )}

                          {item.key === 'welcome_notification' && (
                            <Button
                              type="button"
                              variant={isCompleted ? "outline" : "sap"}
                              size="sm"
                              onClick={handleDispatchWelcomeNotification}
                              className="text-[10px] h-7 px-2 flex items-center space-x-1"
                            >
                              <Sparkles className="h-3 w-3 mr-1" />
                              <span>{isCompleted ? 'Resend Welcome Kit' : 'Send Welcome & Orientation Kit'}</span>
                            </Button>
                          )}

                          {item.key === 'orientation_confirmation' && !isCompleted && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => setIsOrientationModal(true)}
                              className="text-[10px] h-7 px-2"
                            >
                              <Calendar className="h-3 w-3 mr-1" />
                              <span>Schedule Orientation</span>
                            </Button>
                          )}

                          {item.key === 'first_class_confirmation' &&
                            !isCompleted &&
                            selectedCase.lms_account_created && (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={handleConfirmPortalAccess}
                                className="text-[10px] h-7 px-2 text-blue-700 border-blue-300"
                              >
                                <span>Confirm Attendance</span>
                              </Button>
                            )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Uploaded Documents Verification Section */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-slate-900 uppercase tracking-wider text-xs">
                  Submitted Student Documents ({selectedCase.documents.length})
                </h4>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setIsUploadDocModal(true)}
                  className="text-xs h-7"
                >
                  <Upload className="h-3 w-3 mr-1" />
                  <span>Add Document</span>
                </Button>
              </div>

              {selectedCase.documents.length === 0 ? (
                <div className="p-4 border border-dashed border-slate-300 rounded-xl text-center text-slate-400 text-xs">
                  No documents uploaded yet. Upload government ID or degree certificate.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {selectedCase.documents.map((d) => (
                    <div
                      key={d.id}
                      className="p-2.5 border border-slate-200 rounded-lg bg-white flex items-center justify-between"
                    >
                      <div className="overflow-hidden pr-2">
                        <p className="font-semibold text-slate-800 truncate">{d.name}</p>
                        <p className="text-[10px] text-slate-400 uppercase">{d.doc_type}</p>
                        {d.rejection_reason && (
                          <p className="text-[10px] text-rose-600">Reason: {d.rejection_reason}</p>
                        )}
                      </div>

                      <div className="flex items-center space-x-1.5 flex-shrink-0">
                        {d.status === 'verified' ? (
                          <Badge
                            variant="outline"
                            className="bg-emerald-50 text-emerald-800 border-emerald-300 text-[10px]"
                          >
                            Verified ✓
                          </Badge>
                        ) : d.status === 'rejected' ? (
                          <Badge
                            variant="outline"
                            className="bg-rose-50 text-rose-800 border-rose-300 text-[10px]"
                          >
                            Rejected ✗
                          </Badge>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => handleVerifyDoc(d.id, 'verified')}
                              className="px-2 py-1 bg-emerald-600 text-white rounded text-[10px] font-semibold hover:bg-emerald-700"
                            >
                              Verify
                            </button>
                            <button
                              type="button"
                              onClick={() => handleVerifyDoc(d.id, 'rejected')}
                              className="px-2 py-1 bg-rose-600 text-white rounded text-[10px] font-semibold hover:bg-rose-700"
                            >
                              Reject
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Auditable Activity Timeline */}
            <div className="space-y-2">
              <h4 className="font-bold text-slate-900 uppercase tracking-wider text-xs">
                Audited Onboarding Action Log
              </h4>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2 max-h-48 overflow-y-auto">
                {auditLoading ? (
                  <p className="text-slate-400 text-center py-2 text-xs">Loading activity logs...</p>
                ) : caseAuditLogs.length === 0 ? (
                  <p className="text-slate-400 text-center py-2 text-xs">No audit events recorded yet.</p>
                ) : (
                  caseAuditLogs.map((log) => (
                    <div
                      key={log.id}
                      className="text-[11px] pb-1.5 border-b border-slate-200 last:border-b-0"
                    >
                      <div className="flex items-center justify-between text-slate-500 text-[10px]">
                        <span className="font-semibold text-slate-800">{log.action}</span>
                        <span>{formatDate(log.timestamp)}</span>
                      </div>
                      <p className="text-slate-700 mt-0.5">{log.details}</p>
                      <p className="text-[10px] text-slate-400">
                        Actor: {log.actor_name} ({log.actor_role})
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* Admin Reassign Staff Modal */}
      {isReassignModal && (
        <Modal
          isOpen={isReassignModal}
          onClose={() => setIsReassignModal(false)}
          title="Reassign Onboarding Specialist"
          description={`Reassign ${selectedCase?.student_name} (${selectedCase?.case_number})`}
        >
          <form onSubmit={handleReassignStaff} className="space-y-3 text-xs">
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-700 mb-1">
                Select Staff Member *
              </label>
              <select
                value={selectedStaffId}
                onChange={(e) => setSelectedStaffId(e.target.value)}
                className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800 font-semibold"
              >
                {eligibleStaff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.full_name} ({s.role.replace('_', ' ')})
                  </option>
                ))}
              </select>
            </div>
            <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
              <Button type="button" variant="outline" size="sm" onClick={() => setIsReassignModal(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="sap" size="sm">
                Confirm Assignment
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Block / Place on Hold Modal */}
      {isBlockModal && (
        <Modal
          isOpen={isBlockModal}
          onClose={() => setIsBlockModal(false)}
          title="Place Onboarding Case on Hold"
          description="Provide a mandatory reason explaining why onboarding is blocked."
        >
          <form onSubmit={handleBlockCase} className="space-y-3 text-xs">
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-700 mb-1">
                Hold Reason *
              </label>
              <Input
                placeholder="e.g. Student requested batch postponement / Documents unverified"
                value={blockReason}
                onChange={(e) => setBlockReason(e.target.value)}
                required
              />
            </div>
            <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
              <Button type="button" variant="outline" size="sm" onClick={() => setIsBlockModal(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="danger" size="sm">
                Place on Hold
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Upload Document Modal */}
      {isUploadDocModal && (
        <Modal
          isOpen={isUploadDocModal}
          onClose={() => setIsUploadDocModal(false)}
          title="Upload Student Onboarding Document"
          description="Directly upload student identity proof, marksheets, degree certificates, or photograph into secure cloud storage."
        >
          <form onSubmit={handleUploadDoc} className="space-y-3.5 text-xs">
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-700 mb-1">
                Document Type *
              </label>
              <select
                value={docType}
                onChange={(e) => {
                  const newType = e.target.value as any;
                  setDocType(newType);
                  if (!docName.trim()) {
                    const typeLabels: Record<string, string> = {
                      id_proof: 'Government ID / Passport / Aadhaar',
                      degree_certificate: 'Highest Degree Certificate',
                      marksheets: 'Academic Marksheets',
                      photo: 'Student Photograph',
                      experience_letter: 'Experience Letter',
                      other: 'Supporting Document',
                    };
                    setDocName(`${typeLabels[newType] || 'Document'} - ${selectedCase?.student_name || ''}`);
                  }
                }}
                className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800"
              >
                <option value="id_proof">Government ID / Passport / Aadhaar</option>
                <option value="degree_certificate">Highest Degree Certificate</option>
                <option value="marksheets">Academic Marksheets</option>
                <option value="photo">Passport Size Photograph</option>
                <option value="experience_letter">Experience / Relieving Letter</option>
                <option value="other">Other Supporting Document</option>
              </select>
            </div>

            {/* Direct File Uploader (Multipart /api/upload integration) */}
            <div className="space-y-1">
              <label className="block text-xs font-semibold uppercase text-slate-700">
                Upload File from Device *
              </label>
              <FileUpload
                bucket="documents"
                entityId={selectedCase?.id}
                value={docUrl}
                onChange={(url, result) => {
                  setDocUrl(url);
                  if (result?.fileName && !docName.trim()) {
                    setDocName(result.fileName);
                  }
                }}
                onRemove={() => setDocUrl('')}
                description="Drag & drop or browse PDF, PNG, JPG, or WEBP up to 20MB."
              />
            </div>

            <Input
              label="Document Label / Title *"
              placeholder="e.g. Aadhaar_Card.pdf"
              value={docName}
              onChange={(e) => setDocName(e.target.value)}
              required
            />

            {/* Optional / Fallback Direct Storage URI input */}
            <div>
              <details className="text-[11px] text-slate-500 cursor-pointer">
                <summary className="hover:text-slate-700 select-none">
                  Manual Storage URL fallback (optional)
                </summary>
                <div className="pt-2">
                  <Input
                    label="Direct File URL / Storage URI"
                    placeholder="https://storage.next-gen.com/docs/..."
                    value={docUrl}
                    onChange={(e) => setDocUrl(e.target.value)}
                  />
                </div>
              </details>
            </div>

            <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
              <Button type="button" variant="outline" size="sm" onClick={() => setIsUploadDocModal(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="sap" size="sm" disabled={!docUrl}>
                Upload & Attach
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Orientation Schedule Modal */}
      {isOrientationModal && (
        <Modal
          isOpen={isOrientationModal}
          onClose={() => setIsOrientationModal(false)}
          title="Arrange Student Orientation Session"
          description="Schedule and confirm orientation session slot."
        >
          <form onSubmit={handleScheduleOrientation} className="space-y-3 text-xs">
            <Input
              label="Orientation Date *"
              type="date"
              value={orientationDate}
              onChange={(e) => setOrientationDate(e.target.value)}
              required
            />
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-700 mb-1">
                Orientation Mode *
              </label>
              <select
                value={orientationMode}
                onChange={(e) => setOrientationMode(e.target.value as any)}
                className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800"
              >
                <option value="Online">Online Live Meeting (Teams / Zoom)</option>
                <option value="Classroom">Classroom Campus Walkthrough</option>
                <option value="Hybrid">Hybrid Orientation</option>
              </select>
            </div>
            <Input
              label="Internal Orientation Notes"
              placeholder="e.g. Shared Google Meet link, trainer introduced"
              value={orientationNotes}
              onChange={(e) => setOrientationNotes(e.target.value)}
            />
            <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
              <Button type="button" variant="outline" size="sm" onClick={() => setIsOrientationModal(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="sap" size="sm">
                Confirm Orientation
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
