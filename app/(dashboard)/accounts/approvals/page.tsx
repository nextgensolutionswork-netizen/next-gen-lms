'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  IndianRupee,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RotateCcw,
  Plus,
  Search,
  Filter,
  FileText,
  Clock,
  ShieldAlert,
  ArrowRight,
  History,
  Building,
  UserCheck,
  Percent,
  Calendar,
  Layers,
  Info,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { store } from '@/lib/services/data-store';
import { feeWorkflowService } from '@/lib/services/fee-workflow-service';
import {
  StudentFee,
  FeeApprovalStatus,
  FeeCategoryItem,
  FeeApprovalHistory,
  UserProfile,
} from '@/types';
import { formatINR } from '@/lib/utils/formatters';

export default function FeeApprovalsPage() {
  const [fees, setFees] = React.useState<StudentFee[]>([]);
  const [categories, setCategories] = React.useState<FeeCategoryItem[]>([]);
  const [activeTab, setActiveTab] = React.useState<string>('Pending Accountant Approval');
  const [categoryFilter, setCategoryFilter] = React.useState<string>('All');
  const [searchQuery, setSearchQuery] = React.useState<string>('');

  // Role simulation state (Default to Accountant Suresh Kumar)
  const [currentUser, setCurrentUser] = React.useState<UserProfile>(
    store.users.find((u) => u.id === 'usr-accounts') || store.users[2]
  );

  // Modals state
  const [selectedFee, setSelectedFee] = React.useState<StudentFee | null>(null);
  const [approvalModalOpen, setApprovalModalOpen] = React.useState(false);
  const [rejectModalOpen, setRejectModalOpen] = React.useState(false);
  const [correctionModalOpen, setCorrectionModalOpen] = React.useState(false);
  const [historyModalOpen, setHistoryModalOpen] = React.useState(false);
  const [newProposalModalOpen, setNewProposalModalOpen] = React.useState(false);
  const [revisionModalOpen, setRevisionModalOpen] = React.useState(false);
  const [categoryModalOpen, setCategoryModalOpen] = React.useState(false);

  // Form inputs
  const [approvalNotes, setApprovalNotes] = React.useState('');
  const [rejectionReason, setRejectionReason] = React.useState('');
  const [correctionReason, setCorrectionReason] = React.useState('');
  const [correctionNotes, setCorrectionNotes] = React.useState('');
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = React.useState<string | null>(null);

  // New Proposal Form
  const [selectedStudentId, setSelectedStudentId] = React.useState('');
  const [selectedFeeCategory, setSelectedFeeCategory] = React.useState('Course Fee');
  const [proposedStandardFee, setProposedStandardFee] = React.useState<number>(60000);
  const [proposedFeeAmount, setProposedFeeAmount] = React.useState<number>(60000);
  const [proposedDiscount, setProposedDiscount] = React.useState<number>(0);
  const [proposedDiscountPercent, setProposedDiscountPercent] = React.useState<number>(0);
  const [proposedDiscountReason, setProposedDiscountReason] = React.useState('');
  const [proposedPaymentPlan, setProposedPaymentPlan] = React.useState<'Full Payment' | '2 Installments' | '3 Installments' | 'Custom'>('2 Installments');
  const [proposedInstallments, setProposedInstallments] = React.useState<number>(2);
  const [proposedDueDate, setProposedDueDate] = React.useState<string>(
    new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString().split('T')[0]
  );
  const [proposedNotes, setProposedNotes] = React.useState('');

  // Fee Revision Form
  const [revisionType, setRevisionType] = React.useState<'Additional Discount' | 'Wrong Fee Amount' | 'Course Change' | 'Installment Change' | 'Offer Adjustment' | 'Cancellation'>('Additional Discount');
  const [revisionJustification, setRevisionJustification] = React.useState('');
  const [revisionNewFee, setRevisionNewFee] = React.useState<number>(0);
  const [revisionNewDiscount, setRevisionNewDiscount] = React.useState<number>(0);

  // Category Configuration Form
  const [newCatName, setNewCatName] = React.useState('');
  const [newCatCode, setNewCatCode] = React.useState('');
  const [newCatAmount, setNewCatAmount] = React.useState<number>(5000);
  const [newCatRefType, setNewCatRefType] = React.useState<'Course' | 'Placement' | 'Certification' | 'Assessment' | 'Fast Track' | 'General' | 'Other'>('General');
  const [newCatDesc, setNewCatDesc] = React.useState('');

  const loadData = () => {
    setFees([...(store.studentFees || [])]);
    setCategories([...(store.feeCategories || [])]);
  };

  React.useEffect(() => {
    loadData();
    if (store.students.length > 0 && !selectedStudentId) {
      setSelectedStudentId(store.students[0].id);
    }
  }, []);

  // Sync category default fee when category changes in proposal form
  React.useEffect(() => {
    const cat = categories.find((c) => c.name === selectedFeeCategory);
    if (cat) {
      setProposedStandardFee(cat.default_amount);
      setProposedFeeAmount(cat.default_amount);
    }
  }, [selectedFeeCategory, categories]);

  // Sync discount amount & percent
  const handleDiscountAmountChange = (amt: number) => {
    setProposedDiscount(amt);
    if (proposedFeeAmount > 0) {
      setProposedDiscountPercent(Number(((amt / proposedFeeAmount) * 100).toFixed(2)));
    }
  };

  const handleDiscountPercentChange = (pct: number) => {
    setProposedDiscountPercent(pct);
    if (proposedFeeAmount > 0) {
      setProposedDiscount(Number(((proposedFeeAmount * pct) / 100).toFixed(2)));
    }
  };

  // Filtered List
  const filteredFees = React.useMemo(() => {
    return fees.filter((fee) => {
      // Tab filter
      if (activeTab !== 'All' && fee.approval_status !== activeTab) {
        return false;
      }
      // Category filter
      if (categoryFilter !== 'All' && fee.fee_category !== categoryFilter) {
        return false;
      }
      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = fee.student_name?.toLowerCase().includes(q);
        const matchesCode = fee.student_code?.toLowerCase().includes(q);
        const matchesCourse = fee.course_name?.toLowerCase().includes(q) || fee.sap_module?.toLowerCase().includes(q);
        const matchesCategory = fee.fee_category?.toLowerCase().includes(q);
        const matchesCounsellor = fee.counsellor_name?.toLowerCase().includes(q);
        if (!matchesName && !matchesCode && !matchesCourse && !matchesCategory && !matchesCounsellor) {
          return false;
        }
      }
      return true;
    });
  }, [fees, activeTab, categoryFilter, searchQuery]);

  // Counts for tabs
  const pendingCount = fees.filter((f) => f.approval_status === 'Pending Accountant Approval').length;
  const approvedCount = fees.filter((f) => f.approval_status === 'Approved').length;
  const correctionCount = fees.filter((f) => f.approval_status === 'Correction Required').length;
  const rejectedCount = fees.filter((f) => f.approval_status === 'Rejected').length;

  const totalPendingAmount = fees
    .filter((f) => f.approval_status === 'Pending Accountant Approval')
    .reduce((sum, f) => sum + f.final_payable, 0);

  const totalApprovedAmount = fees
    .filter((f) => f.approval_status === 'Approved')
    .reduce((sum, f) => sum + f.final_payable, 0);

  // Separation of duties helper:
  // Is current user the creator/submitter of selected fee?
  const isCreatorOfFee = (fee: StudentFee | null): boolean => {
    if (!fee) return false;
    return fee.counsellor_id === currentUser.id || fee.submitted_by === currentUser.id;
  };

  // Actions
  const handleApprove = () => {
    if (!selectedFee) return;
    setActionError(null);
    try {
      feeWorkflowService.approveFee(selectedFee.id, currentUser.id, approvalNotes);
      setActionSuccess(`Fee proposal for ${selectedFee.student_name} approved successfully!`);
      setApprovalModalOpen(false);
      setApprovalNotes('');
      loadData();
    } catch (err: any) {
      setActionError(err.message || 'Failed to approve fee.');
    }
  };

  const handleReject = () => {
    if (!selectedFee) return;
    setActionError(null);
    try {
      feeWorkflowService.rejectFee(selectedFee.id, currentUser.id, rejectionReason);
      setActionSuccess(`Fee proposal rejected.`);
      setRejectModalOpen(false);
      setRejectionReason('');
      loadData();
    } catch (err: any) {
      setActionError(err.message || 'Failed to reject fee.');
    }
  };

  const handleCorrection = () => {
    if (!selectedFee) return;
    setActionError(null);
    try {
      feeWorkflowService.requestFeeCorrection(
        selectedFee.id,
        currentUser.id,
        correctionReason,
        correctionNotes
      );
      setActionSuccess(`Correction request dispatched to ${selectedFee.counsellor_name}.`);
      setCorrectionModalOpen(false);
      setCorrectionReason('');
      setCorrectionNotes('');
      loadData();
    } catch (err: any) {
      setActionError(err.message || 'Failed to request correction.');
    }
  };

  const handleCreateProposal = (autoSubmit: boolean) => {
    setActionError(null);
    try {
      const student = store.students.find((s) => s.id === selectedStudentId);
      if (!student) throw new Error('Please select a student.');

      const cat = categories.find((c) => c.name === selectedFeeCategory);

      feeWorkflowService.createFeeProposal(
        {
          student_id: student.id,
          fee_category: selectedFeeCategory,
          reference_type: cat?.reference_type || 'General',
          course_id: student.course_id,
          batch_id: student.batch_id,
          sap_module: student.course_name,
          standard_fee: proposedStandardFee,
          proposed_fee: proposedFeeAmount,
          discount_amount: proposedDiscount,
          discount_percentage: proposedDiscountPercent,
          discount_reason: proposedDiscountReason,
          payment_plan: proposedPaymentPlan,
          number_of_installments: proposedPaymentPlan === 'Full Payment' ? 1 : proposedInstallments,
          first_due_date: proposedDueDate,
          counsellor_notes: proposedNotes,
          auto_submit: autoSubmit,
        },
        currentUser.id,
        currentUser.role
      );

      setActionSuccess(
        `Fee proposal for ${student.full_name} ${autoSubmit ? 'submitted for accountant approval' : 'saved as draft'}.`
      );
      setNewProposalModalOpen(false);
      setProposedDiscountReason('');
      setProposedNotes('');
      loadData();
    } catch (err: any) {
      setActionError(err.message || 'Failed to create fee proposal.');
    }
  };

  const handleCreateRevision = () => {
    if (!selectedFee) return;
    setActionError(null);
    try {
      const netFee = Math.max(0, revisionNewFee - revisionNewDiscount);
      const tax = Number((netFee * 0.18).toFixed(2));
      const final = netFee + tax;

      feeWorkflowService.createFeeRevisionRequest(
        selectedFee.id,
        currentUser.id,
        revisionType,
        revisionJustification,
        {
          proposed_fee: revisionNewFee,
          discount_amount: revisionNewDiscount,
          tax_gst_amount: tax,
          final_payable: final,
          outstanding_amount: final - selectedFee.paid_amount,
        }
      );

      setActionSuccess(`Revision request raised for fee #${selectedFee.id.slice(-6)}.`);
      setRevisionModalOpen(false);
      setRevisionJustification('');
      loadData();
    } catch (err: any) {
      setActionError(err.message || 'Failed to submit revision request.');
    }
  };

  const handleCreateCategory = () => {
    setActionError(null);
    try {
      if (!newCatName || !newCatCode) throw new Error('Category Name and Code are mandatory.');
      feeWorkflowService.createFeeCategory(
        {
          name: newCatName,
          code: newCatCode.toUpperCase(),
          default_amount: Number(newCatAmount) || 0,
          is_taxable: true,
          gst_rate: 18,
          sac_code: '999293',
          reference_type: newCatRefType,
          description: newCatDesc || newCatName,
          is_active: true,
        },
        currentUser.id
      );

      setActionSuccess(`Fee Category "${newCatName}" configured successfully.`);
      setNewCatName('');
      setNewCatCode('');
      setNewCatDesc('');
      setCategoryModalOpen(false);
      loadData();
    } catch (err: any) {
      setActionError(err.message || 'Failed to create fee category.');
    }
  };

  const getStatusBadge = (status: FeeApprovalStatus) => {
    switch (status) {
      case 'Approved':
        return <Badge variant="success">Approved & Payable</Badge>;
      case 'Pending Accountant Approval':
        return <Badge variant="warning">Pending Approval</Badge>;
      case 'Correction Required':
        return <Badge variant="destructive">Correction Required</Badge>;
      case 'Rejected':
        return <Badge variant="destructive">Rejected</Badge>;
      case 'Draft':
        return <Badge variant="secondary">Draft Proposal</Badge>;
      case 'Superseded':
        return <Badge variant="outline">Superseded (Revised)</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Title */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="p-1.5 rounded-lg bg-emerald-100 text-emerald-700">
              <IndianRupee className="h-5 w-5" />
            </span>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Global LMS Fee Approvals Desk
            </h1>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Centralized fee proposals, strict separation of duties, accountant authorizations, discount audits, and ledger posting.
          </p>
        </div>

        {/* Action Controls & Active Actor Switcher */}
        <div className="flex flex-wrap items-center gap-2">
          {/* User Preview Switcher */}
          <div className="flex items-center space-x-2 bg-slate-100 px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs">
            <span className="text-slate-500 font-medium">Acting As:</span>
            <select
              value={currentUser.id}
              onChange={(e) => {
                const u = store.users.find((user) => user.id === e.target.value);
                if (u) setCurrentUser(u);
              }}
              className="bg-white border border-slate-300 rounded px-2 py-0.5 font-semibold text-slate-800 text-xs"
            >
              <option value="usr-accounts">Suresh Kumar (Accountant)</option>
              <option value="usr-counsellor">Ananya Desai (Senior Counsellor)</option>
              <option value="usr-superadmin">Rajesh Sharma (Super Admin)</option>
              <option value="usr-admin">Priya Nair (Operations Head)</option>
            </select>
            <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 text-[10px] font-bold uppercase">
              {currentUser.role}
            </span>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setCategoryModalOpen(true)}
            className="text-xs flex items-center space-x-1.5"
          >
            <Layers className="h-3.5 w-3.5 text-slate-500" />
            <span>Categories ({categories.length})</span>
          </Button>

          <Button
            variant="sap"
            size="sm"
            onClick={() => {
              setActionError(null);
              setActionSuccess(null);
              setNewProposalModalOpen(true);
            }}
            className="text-xs flex items-center space-x-1.5 shadow-sm"
          >
            <Plus className="h-4 w-4" />
            <span>Propose Student Fee</span>
          </Button>
        </div>
      </div>

      {/* Global Separation of Duties Notice */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-3.5 flex items-start space-x-3 text-xs text-blue-900 shadow-xs">
        <ShieldAlert className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
        <div>
          <span className="font-bold">Separation of Duties Invariant:</span> Counsellor proposes the fee, Accountant reviews and approves. The submitter of a fee proposal can never approve or financially clear their own submission. Only Accountant-approved fees become payable.
        </div>
      </div>

      {/* Notification Toasts */}
      {actionSuccess && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-xs flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 flex-shrink-0" />
            <span>{actionSuccess}</span>
          </div>
          <button onClick={() => setActionSuccess(null)} className="text-emerald-600 hover:text-emerald-800 font-bold ml-4">
            ×
          </button>
        </div>
      )}

      {actionError && (
        <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-xs flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <XCircle className="h-4 w-4 text-rose-600 flex-shrink-0" />
            <span>{actionError}</span>
          </div>
          <button onClick={() => setActionError(null)} className="text-rose-600 hover:text-rose-800 font-bold ml-4">
            ×
          </button>
        </div>
      )}

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card className="border-l-4 border-l-amber-500 shadow-xs">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Pending Approval
              </p>
              <Clock className="h-4 w-4 text-amber-500" />
            </div>
            <h3 className="text-2xl font-bold text-amber-700 mt-1">{pendingCount}</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Value: <span className="font-semibold text-slate-700">{formatINR(totalPendingAmount)}</span>
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-emerald-500 shadow-xs">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Approved & Payable
              </p>
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            </div>
            <h3 className="text-2xl font-bold text-emerald-700 mt-1">{approvedCount}</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Value: <span className="font-semibold text-slate-700">{formatINR(totalApprovedAmount)}</span>
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-rose-500 shadow-xs">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Correction Required
              </p>
              <AlertTriangle className="h-4 w-4 text-rose-500" />
            </div>
            <h3 className="text-2xl font-bold text-rose-700 mt-1">{correctionCount}</h3>
            <p className="text-xs text-slate-500 mt-0.5">Sent back to counsellor</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-slate-400 shadow-xs">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Total Proposals
              </p>
              <FileText className="h-4 w-4 text-slate-500" />
            </div>
            <h3 className="text-2xl font-bold text-slate-900 mt-1">{fees.length}</h3>
            <p className="text-xs text-slate-500 mt-0.5">Across all LMS categories</p>
          </CardContent>
        </Card>
      </div>

      {/* Filter and Search Bar */}
      <Card className="p-4 shadow-xs">
        <div className="flex flex-col lg:flex-row gap-4 items-center justify-between">
          {/* Status Tabs */}
          <div className="flex flex-wrap items-center gap-1.5 w-full lg:w-auto">
            {[
              { id: 'Pending Accountant Approval', label: 'Pending Approval', count: pendingCount },
              { id: 'Approved', label: 'Approved', count: approvedCount },
              { id: 'Correction Required', label: 'Correction Required', count: correctionCount },
              { id: 'Rejected', label: 'Rejected', count: rejectedCount },
              { id: 'All', label: 'All Records', count: fees.length },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center space-x-1.5 ${
                  activeTab === tab.id
                    ? 'bg-[#0A6ED1] text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                    activeTab === tab.id
                      ? 'bg-blue-800 text-white'
                      : 'bg-slate-200 text-slate-700'
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          {/* Search & Category Filter */}
          <div className="flex items-center space-x-2 w-full lg:w-auto">
            <div className="relative flex-1 lg:w-64">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search student, LMS ID, module..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#0A6ED1]"
              />
            </div>

            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700 focus:outline-none focus:ring-1 focus:ring-[#0A6ED1]"
            >
              <option value="All">All Categories</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.name}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </Card>

      {/* Main Table */}
      <Card className="shadow-xs overflow-hidden">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 text-slate-600 uppercase border-b border-slate-100 font-semibold tracking-wider">
                <tr>
                  <th className="px-4 py-3">Student & LMS ID</th>
                  <th className="px-4 py-3">Course / Module</th>
                  <th className="px-4 py-3">Fee Category</th>
                  <th className="px-4 py-3 text-right">Standard</th>
                  <th className="px-4 py-3 text-right">Proposed</th>
                  <th className="px-4 py-3 text-right">Discount</th>
                  <th className="px-4 py-3 text-right">Final Payable</th>
                  <th className="px-4 py-3">Plan</th>
                  <th className="px-4 py-3">Counsellor</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredFees.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="px-4 py-12 text-center text-slate-400">
                      <div className="flex flex-col items-center justify-center space-y-2">
                        <FileText className="h-8 w-8 text-slate-300" />
                        <p className="font-medium text-slate-500">No fee proposals found in this category.</p>
                        <p className="text-[11px] text-slate-400">Click &ldquo;Propose Student Fee&rdquo; to create a new proposal.</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredFees.map((fee) => {
                    const isOwnSubmission = isCreatorOfFee(fee);
                    const canAccountantAct =
                      (currentUser.role === 'accountant' || currentUser.role === 'super_admin') &&
                      !isOwnSubmission;

                    return (
                      <tr key={fee.id} className="hover:bg-slate-50/80 transition-colors">
                        {/* Student */}
                        <td className="px-4 py-3 font-medium text-slate-900">
                          <div>
                            <span className="font-bold text-slate-800">{fee.student_name}</span>
                            <div className="flex items-center space-x-1.5 mt-0.5 text-[11px] text-slate-500">
                              <span className="font-mono bg-slate-100 px-1 py-0.2 rounded text-[10px]">
                                {fee.student_code}
                              </span>
                              <span>•</span>
                              <span>{fee.admission_number}</span>
                            </div>
                          </div>
                        </td>

                        {/* Course & Batch */}
                        <td className="px-4 py-3 text-slate-600">
                          <div className="max-w-[180px]">
                            <p className="font-semibold text-slate-800 truncate" title={fee.course_name}>
                              {fee.course_name || fee.sap_module || 'General ERP'}
                            </p>
                            <p className="text-[10px] text-slate-400 truncate">
                              {fee.batch_name || 'Direct Enrollment'}
                            </p>
                          </div>
                        </td>

                        {/* Fee Category */}
                        <td className="px-4 py-3">
                          <span className="inline-block px-2 py-0.5 rounded text-[11px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                            {fee.fee_category}
                          </span>
                        </td>

                        {/* Standard Fee */}
                        <td className="px-4 py-3 text-right font-mono text-slate-500">
                          {formatINR(fee.standard_fee)}
                        </td>

                        {/* Proposed Fee */}
                        <td className="px-4 py-3 text-right font-mono font-medium text-slate-800">
                          {formatINR(fee.proposed_fee)}
                        </td>

                        {/* Discount */}
                        <td className="px-4 py-3 text-right">
                          {fee.discount_amount > 0 ? (
                            <div>
                              <span className="font-mono text-emerald-700 font-semibold">
                                -{formatINR(fee.discount_amount)}
                              </span>
                              <span className="text-[10px] text-slate-400 ml-1">
                                ({fee.discount_percentage}%)
                              </span>
                              {fee.discount_reason && (
                                <p className="text-[10px] text-slate-500 italic truncate max-w-[120px]" title={fee.discount_reason}>
                                  {fee.discount_reason}
                                </p>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-400 font-mono">—</span>
                          )}
                        </td>

                        {/* Final Payable */}
                        <td className="px-4 py-3 text-right font-mono font-bold text-slate-900 bg-slate-50/50">
                          <div>
                            <span className="text-emerald-700">{formatINR(fee.final_payable)}</span>
                            <p className="text-[10px] text-slate-400 font-normal">
                              (incl. ₹{fee.tax_gst_amount.toLocaleString('en-IN')} GST)
                            </p>
                          </div>
                        </td>

                        {/* Payment Plan */}
                        <td className="px-4 py-3 text-slate-600">
                          <div>
                            <span className="font-medium text-slate-800">{fee.payment_plan}</span>
                            <p className="text-[10px] text-slate-400">Due: {fee.first_due_date}</p>
                          </div>
                        </td>

                        {/* Counsellor */}
                        <td className="px-4 py-3 text-slate-600">
                          <div>
                            <p className="font-medium text-slate-800 truncate max-w-[110px]" title={fee.counsellor_name}>
                              {fee.counsellor_name}
                            </p>
                            <p className="text-[10px] text-slate-400">
                              {fee.submitted_at?.split('T')[0] || fee.created_at.split('T')[0]}
                            </p>
                          </div>
                        </td>

                        {/* Status */}
                        <td className="px-4 py-3">
                          {getStatusBadge(fee.approval_status)}
                          {isOwnSubmission && (
                            <p className="text-[9px] text-amber-700 font-semibold mt-0.5">
                              (Your Submission)
                            </p>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-3 text-center">
                          <div className="flex items-center justify-center space-x-1">
                            {fee.approval_status === 'Pending Accountant Approval' && (
                              <>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  disabled={!canAccountantAct}
                                  onClick={() => {
                                    setSelectedFee(fee);
                                    setActionError(null);
                                    setApprovalModalOpen(true);
                                  }}
                                  className={`text-xs px-2 py-1 h-7 ${
                                    canAccountantAct
                                      ? 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100'
                                      : 'opacity-50 cursor-not-allowed text-slate-400'
                                  }`}
                                  title={
                                    isOwnSubmission
                                      ? 'Separation of duties: You cannot approve your own fee proposal.'
                                      : 'Approve this fee proposal'
                                  }
                                >
                                  Approve
                                </Button>

                                <Button
                                  variant="outline"
                                  size="sm"
                                  disabled={!canAccountantAct}
                                  onClick={() => {
                                    setSelectedFee(fee);
                                    setActionError(null);
                                    setCorrectionModalOpen(true);
                                  }}
                                  className={`text-xs px-2 py-1 h-7 ${
                                    canAccountantAct
                                      ? 'bg-amber-50 text-amber-700 border-amber-300 hover:bg-amber-100'
                                      : 'opacity-50 cursor-not-allowed text-slate-400'
                                  }`}
                                  title="Request Correction"
                                >
                                  Correct
                                </Button>

                                <Button
                                  variant="outline"
                                  size="sm"
                                  disabled={!canAccountantAct}
                                  onClick={() => {
                                    setSelectedFee(fee);
                                    setActionError(null);
                                    setRejectModalOpen(true);
                                  }}
                                  className={`text-xs px-2 py-1 h-7 ${
                                    canAccountantAct
                                      ? 'bg-rose-50 text-rose-700 border-rose-300 hover:bg-rose-100'
                                      : 'opacity-50 cursor-not-allowed text-slate-400'
                                  }`}
                                  title="Reject fee proposal"
                                >
                                  Reject
                                </Button>
                              </>
                            )}

                            {fee.approval_status === 'Approved' && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setSelectedFee(fee);
                                  setRevisionNewFee(fee.proposed_fee);
                                  setRevisionNewDiscount(fee.discount_amount);
                                  setRevisionModalOpen(true);
                                }}
                                className="text-xs px-2 py-1 h-7 border-blue-200 text-blue-700 hover:bg-blue-50"
                                title="Request Fee Revision"
                              >
                                Revise
                              </Button>
                            )}

                            {fee.approval_status === 'Correction Required' && isOwnSubmission && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setSelectedFee(fee);
                                  setProposedFeeAmount(fee.proposed_fee);
                                  setProposedDiscount(fee.discount_amount);
                                  setProposedDiscountPercent(fee.discount_percentage);
                                  setProposedDiscountReason(fee.discount_reason || '');
                                  // Open resubmit prompt
                                  alert(
                                    `Accountant Note: "${fee.correction_reason}"\n\nPlease adjust the proposal parameters and resubmit.`
                                  );
                                }}
                                className="text-xs px-2 py-1 h-7 bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100"
                              >
                                Edit & Resubmit
                              </Button>
                            )}

                            {/* Audit History */}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setSelectedFee(fee);
                                setHistoryModalOpen(true);
                              }}
                              className="text-xs p-1 h-7 text-slate-400 hover:text-slate-700"
                              title="View History & Timeline"
                            >
                              <History className="h-4 w-4" />
                            </Button>
                          </div>
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

      {/* ========================================================================= */}
      {/* MODAL 1: ACCOUNTANT APPROVE FEE                                           */}
      {/* ========================================================================= */}
      <Modal
        isOpen={approvalModalOpen}
        onClose={() => setApprovalModalOpen(false)}
        title="Approve Fee Proposal"
        description="Verify fee calculation, discount rationale, and authorize payable status."
        maxWidth="lg"
      >
        {selectedFee && (
          <div className="space-y-4 text-xs">
            {/* Separation of Duty Check Banner */}
            {isCreatorOfFee(selectedFee) && (
              <div className="p-3 bg-rose-50 border border-rose-300 rounded-lg text-rose-800 flex items-start space-x-2">
                <ShieldAlert className="h-5 w-5 text-rose-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">Separation of Duties Enforced</p>
                  <p>You originally proposed this fee ({selectedFee.counsellor_name}). An independent Accountant must approve it.</p>
                </div>
              </div>
            )}

            <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-500">Student:</span>
                <span className="font-bold text-slate-800">{selectedFee.student_name} ({selectedFee.student_code})</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Fee Category:</span>
                <span className="font-semibold text-indigo-700">{selectedFee.fee_category}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Course / Module:</span>
                <span className="text-slate-800">{selectedFee.course_name || selectedFee.sap_module}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Counsellor:</span>
                <span className="text-slate-800">{selectedFee.counsellor_name}</span>
              </div>
            </div>

            {/* Financial Breakdown Table */}
            <div className="border border-slate-200 rounded-lg p-3 space-y-1.5 bg-white">
              <div className="flex justify-between">
                <span className="text-slate-600">Standard Category Fee:</span>
                <span className="font-mono text-slate-600">{formatINR(selectedFee.standard_fee)}</span>
              </div>
              <div className="flex justify-between font-medium">
                <span className="text-slate-700">Proposed Tuition:</span>
                <span className="font-mono text-slate-800">{formatINR(selectedFee.proposed_fee)}</span>
              </div>
              {selectedFee.discount_amount > 0 && (
                <div className="flex justify-between text-emerald-700">
                  <span>Discount ({selectedFee.discount_percentage}% - {selectedFee.discount_reason || 'Approved Rationale'}):</span>
                  <span className="font-mono font-semibold">-{formatINR(selectedFee.discount_amount)}</span>
                </div>
              )}
              <div className="flex justify-between text-slate-600">
                <span>Taxable Net Amount:</span>
                <span className="font-mono">
                  {formatINR(selectedFee.proposed_fee - selectedFee.discount_amount)}
                </span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>GST (18% Sac: 999293):</span>
                <span className="font-mono">{formatINR(selectedFee.tax_gst_amount)}</span>
              </div>
              <div className="border-t border-slate-200 pt-1.5 flex justify-between font-bold text-sm text-slate-900">
                <span>Final Payable Total:</span>
                <span className="text-emerald-700">{formatINR(selectedFee.final_payable)}</span>
              </div>
            </div>

            <div>
              <label className="block text-slate-700 font-medium mb-1">
                Accountant Approval Notes (Optional):
              </label>
              <textarea
                rows={2}
                value={approvalNotes}
                onChange={(e) => setApprovalNotes(e.target.value)}
                placeholder="e.g., Discount verified against merit cutoffs. Installment schedule confirmed."
                className="w-full text-xs p-2.5 border border-slate-300 rounded-lg focus:ring-1 focus:ring-[#0A6ED1] focus:outline-none"
              />
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100">
              <Button variant="outline" size="sm" onClick={() => setApprovalModalOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="sap"
                size="sm"
                disabled={isCreatorOfFee(selectedFee)}
                onClick={handleApprove}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                Confirm & Approve Fee Proposal
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ========================================================================= */}
      {/* MODAL 2: REQUEST CORRECTION                                               */}
      {/* ========================================================================= */}
      <Modal
        isOpen={correctionModalOpen}
        onClose={() => setCorrectionModalOpen(false)}
        title="Request Fee Proposal Correction"
        description="Return proposal back to counsellor with specific requirements."
        maxWidth="md"
      >
        <div className="space-y-4 text-xs">
          <div>
            <label className="block text-slate-700 font-bold mb-1">
              Correction Reason (Mandatory) <span className="text-rose-500">*</span>:
            </label>
            <input
              type="text"
              value={correctionReason}
              onChange={(e) => setCorrectionReason(e.target.value)}
              placeholder="e.g., Discount exceeds policy threshold without director signoff"
              className="w-full text-xs p-2 border border-slate-300 rounded-lg focus:ring-1 focus:ring-[#0A6ED1] focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-slate-700 font-medium mb-1">
              Detailed Instructions for Counsellor:
            </label>
            <textarea
              rows={3}
              value={correctionNotes}
              onChange={(e) => setCorrectionNotes(e.target.value)}
              placeholder="Provide exact instructions on required adjustments or documents..."
              className="w-full text-xs p-2 border border-slate-300 rounded-lg focus:ring-1 focus:ring-[#0A6ED1] focus:outline-none"
            />
          </div>

          <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100">
            <Button variant="outline" size="sm" onClick={() => setCorrectionModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="sap"
              size="sm"
              disabled={!correctionReason.trim()}
              onClick={handleCorrection}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              Send Back for Correction
            </Button>
          </div>
        </div>
      </Modal>

      {/* ========================================================================= */}
      {/* MODAL 3: REJECT FEE PROPOSAL                                              */}
      {/* ========================================================================= */}
      <Modal
        isOpen={rejectModalOpen}
        onClose={() => setRejectModalOpen(false)}
        title="Reject Fee Proposal"
        description="Permanently decline this fee proposal. Mandatory reason required."
        maxWidth="md"
      >
        <div className="space-y-4 text-xs">
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-800">
            <p className="font-semibold">Rejection Audit Log Warning</p>
            <p className="text-[11px] mt-0.5">
              Rejecting this fee will mark it as non-payable and notify the counsellor.
            </p>
          </div>

          <div>
            <label className="block text-slate-700 font-bold mb-1">
              Rejection Reason (Mandatory) <span className="text-rose-500">*</span>:
            </label>
            <textarea
              rows={3}
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="State clear financial or institutional reason for rejection..."
              className="w-full text-xs p-2 border border-slate-300 rounded-lg focus:ring-1 focus:ring-[#0A6ED1] focus:outline-none"
            />
          </div>

          <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100">
            <Button variant="outline" size="sm" onClick={() => setRejectModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              disabled={!rejectionReason.trim()}
              onClick={handleReject}
            >
              Confirm Rejection
            </Button>
          </div>
        </div>
      </Modal>

      {/* ========================================================================= */}
      {/* MODAL 4: PROPOSE NEW STUDENT FEE                                          */}
      {/* ========================================================================= */}
      <Modal
        isOpen={newProposalModalOpen}
        onClose={() => setNewProposalModalOpen(false)}
        title="Create Student Fee Proposal"
        description="Propose fee structure, apply discounts, and configure payment plan."
        maxWidth="xl"
      >
        <div className="space-y-4 text-xs">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Student Select */}
            <div>
              <label className="block text-slate-700 font-medium mb-1">
                Select Student <span className="text-rose-500">*</span>
              </label>
              <select
                value={selectedStudentId}
                onChange={(e) => setSelectedStudentId(e.target.value)}
                className="w-full text-xs p-2 border border-slate-300 rounded-lg bg-white focus:ring-1 focus:ring-[#0A6ED1] focus:outline-none"
              >
                {store.students.map((stu) => (
                  <option key={stu.id} value={stu.id}>
                    {stu.full_name} ({stu.student_code} - {stu.course_name})
                  </option>
                ))}
              </select>
            </div>

            {/* Fee Category */}
            <div>
              <label className="block text-slate-700 font-medium mb-1">
                Fee Category <span className="text-rose-500">*</span>
              </label>
              <select
                value={selectedFeeCategory}
                onChange={(e) => setSelectedFeeCategory(e.target.value)}
                className="w-full text-xs p-2 border border-slate-300 rounded-lg bg-white focus:ring-1 focus:ring-[#0A6ED1] focus:outline-none"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.name} (Std: ₹{c.default_amount.toLocaleString('en-IN')})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* Standard Fee */}
            <div>
              <label className="block text-slate-700 font-medium mb-1">Standard Fee (₹)</label>
              <input
                type="number"
                value={proposedStandardFee}
                onChange={(e) => setProposedStandardFee(Number(e.target.value))}
                className="w-full text-xs p-2 border border-slate-300 rounded-lg bg-slate-50 font-mono"
              />
            </div>

            {/* Proposed Fee */}
            <div>
              <label className="block text-slate-700 font-medium mb-1">Proposed Fee (₹)</label>
              <input
                type="number"
                value={proposedFeeAmount}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setProposedFeeAmount(val);
                  if (proposedDiscountPercent > 0) {
                    setProposedDiscount(Number(((val * proposedDiscountPercent) / 100).toFixed(2)));
                  }
                }}
                className="w-full text-xs p-2 border border-slate-300 rounded-lg font-mono"
              />
            </div>

            {/* Discount Amount */}
            <div>
              <label className="block text-slate-700 font-medium mb-1">Discount Amount (₹)</label>
              <input
                type="number"
                value={proposedDiscount}
                onChange={(e) => handleDiscountAmountChange(Number(e.target.value))}
                className="w-full text-xs p-2 border border-slate-300 rounded-lg font-mono text-emerald-700"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Discount % */}
            <div>
              <label className="block text-slate-700 font-medium mb-1">Discount %</label>
              <input
                type="number"
                value={proposedDiscountPercent}
                onChange={(e) => handleDiscountPercentChange(Number(e.target.value))}
                className="w-full text-xs p-2 border border-slate-300 rounded-lg font-mono text-emerald-700"
              />
            </div>

            {/* Discount Reason */}
            <div>
              <label className="block text-slate-700 font-medium mb-1">Discount Reason / Voucher</label>
              <input
                type="text"
                value={proposedDiscountReason}
                onChange={(e) => setProposedDiscountReason(e.target.value)}
                placeholder="e.g. Early Bird, Merit Scholarship, Corporate Voucher"
                className="w-full text-xs p-2 border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          {/* Auto Calculation Preview */}
          <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
            <div className="flex justify-between text-slate-600 mb-1">
              <span>Net Taxable Fee:</span>
              <span className="font-mono font-semibold">
                {formatINR(Math.max(0, proposedFeeAmount - proposedDiscount))}
              </span>
            </div>
            <div className="flex justify-between text-slate-600 mb-1">
              <span>GST (18%):</span>
              <span className="font-mono">
                {formatINR(Math.max(0, proposedFeeAmount - proposedDiscount) * 0.18)}
              </span>
            </div>
            <div className="flex justify-between font-bold text-slate-900 border-t border-slate-200 pt-1 text-sm">
              <span>Total Final Payable:</span>
              <span className="text-emerald-700">
                {formatINR(
                  Math.max(0, proposedFeeAmount - proposedDiscount) * 1.18
                )}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* Payment Plan */}
            <div>
              <label className="block text-slate-700 font-medium mb-1">Payment Plan</label>
              <select
                value={proposedPaymentPlan}
                onChange={(e) => setProposedPaymentPlan(e.target.value as any)}
                className="w-full text-xs p-2 border border-slate-300 rounded-lg bg-white"
              >
                <option value="Full Payment">Full Payment</option>
                <option value="2 Installments">2 Installments</option>
                <option value="3 Installments">3 Installments</option>
                <option value="Custom">Custom Plan</option>
              </select>
            </div>

            {/* Installments */}
            <div>
              <label className="block text-slate-700 font-medium mb-1">Installments Count</label>
              <input
                type="number"
                disabled={proposedPaymentPlan === 'Full Payment'}
                value={proposedPaymentPlan === 'Full Payment' ? 1 : proposedInstallments}
                onChange={(e) => setProposedInstallments(Number(e.target.value))}
                className="w-full text-xs p-2 border border-slate-300 rounded-lg font-mono disabled:bg-slate-100"
              />
            </div>

            {/* First Due Date */}
            <div>
              <label className="block text-slate-700 font-medium mb-1">First Due Date</label>
              <input
                type="date"
                value={proposedDueDate}
                onChange={(e) => setProposedDueDate(e.target.value)}
                className="w-full text-xs p-2 border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          <div>
            <label className="block text-slate-700 font-medium mb-1">Counsellor Notes</label>
            <textarea
              rows={2}
              value={proposedNotes}
              onChange={(e) => setProposedNotes(e.target.value)}
              placeholder="Any special remarks or candidate background..."
              className="w-full text-xs p-2 border border-slate-300 rounded-lg"
            />
          </div>

          <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100">
            <Button variant="outline" size="sm" onClick={() => setNewProposalModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleCreateProposal(false)}
              className="text-slate-700"
            >
              Save as Draft
            </Button>
            <Button
              variant="sap"
              size="sm"
              onClick={() => handleCreateProposal(true)}
              className="bg-[#0A6ED1] text-white"
            >
              Submit for Accountant Approval
            </Button>
          </div>
        </div>
      </Modal>

      {/* ========================================================================= */}
      {/* MODAL 5: FEE REVISION REQUEST                                             */}
      {/* ========================================================================= */}
      <Modal
        isOpen={revisionModalOpen}
        onClose={() => setRevisionModalOpen(false)}
        title="Request Fee Revision"
        description="Approved fees cannot be directly overwritten. Raise a formal revision request."
        maxWidth="md"
      >
        {selectedFee && (
          <div className="space-y-4 text-xs">
            <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
              <p className="font-semibold text-slate-800">
                Original Approved Fee #{selectedFee.id.slice(-6)}
              </p>
              <p className="text-slate-600 mt-0.5">
                Current Payable: <span className="font-bold text-emerald-700">{formatINR(selectedFee.final_payable)}</span>
              </p>
            </div>

            <div>
              <label className="block text-slate-700 font-medium mb-1">
                Revision Type <span className="text-rose-500">*</span>
              </label>
              <select
                value={revisionType}
                onChange={(e) => setRevisionType(e.target.value as any)}
                className="w-full text-xs p-2 border border-slate-300 rounded-lg bg-white"
              >
                <option value="Additional Discount">Additional Discount</option>
                <option value="Wrong Fee Amount">Wrong Fee Amount</option>
                <option value="Course Change">Course Change</option>
                <option value="Installment Change">Installment Change</option>
                <option value="Offer Adjustment">Offer Adjustment</option>
                <option value="Cancellation">Cancellation / Waiver</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-700 font-medium mb-1">New Proposed Fee (₹)</label>
                <input
                  type="number"
                  value={revisionNewFee}
                  onChange={(e) => setRevisionNewFee(Number(e.target.value))}
                  className="w-full text-xs p-2 border border-slate-300 rounded-lg font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-medium mb-1">New Discount (₹)</label>
                <input
                  type="number"
                  value={revisionNewDiscount}
                  onChange={(e) => setRevisionNewDiscount(Number(e.target.value))}
                  className="w-full text-xs p-2 border border-slate-300 rounded-lg font-mono text-emerald-700"
                />
              </div>
            </div>

            <div>
              <label className="block text-slate-700 font-medium mb-1">
                Justification & Approval Rationale <span className="text-rose-500">*</span>
              </label>
              <textarea
                rows={3}
                value={revisionJustification}
                onChange={(e) => setRevisionJustification(e.target.value)}
                placeholder="Reason why this approved fee must be revised..."
                className="w-full text-xs p-2 border border-slate-300 rounded-lg"
              />
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100">
              <Button variant="outline" size="sm" onClick={() => setRevisionModalOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="sap"
                size="sm"
                disabled={!revisionJustification.trim()}
                onClick={handleCreateRevision}
              >
                Submit Revision Request
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ========================================================================= */}
      {/* MODAL 6: AUDIT HISTORY TIMELINE                                           */}
      {/* ========================================================================= */}
      <Modal
        isOpen={historyModalOpen}
        onClose={() => setHistoryModalOpen(false)}
        title="Fee Approval & Audit History"
        description="Immutable timestamped record of proposals, accountant reviews, and state transitions."
        maxWidth="lg"
      >
        {selectedFee && (
          <div className="space-y-4 text-xs">
            <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
              <p className="font-bold text-slate-900">{selectedFee.student_name} - {selectedFee.fee_category}</p>
              <p className="text-slate-500 text-[11px]">Fee ID: {selectedFee.id} | Version: v{selectedFee.version}</p>
            </div>

            <div className="space-y-3">
              {(store.feeApprovalHistories || [])
                .filter((h) => h.fee_id === selectedFee.id)
                .map((item, idx) => (
                  <div key={item.id || idx} className="flex items-start space-x-3 p-3 bg-white border border-slate-200 rounded-lg">
                    <span className="mt-0.5 p-1 rounded-full bg-blue-100 text-blue-700">
                      <Clock className="h-3.5 w-3.5" />
                    </span>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-800">{item.action}</span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          {new Date(item.timestamp).toLocaleString()}
                        </span>
                      </div>
                      <p className="text-slate-600 mt-0.5">
                        By <span className="font-semibold">{item.actor_name}</span> ({item.actor_role})
                      </p>
                      {item.notes && <p className="text-slate-500 italic mt-1 bg-slate-50 p-2 rounded">{item.notes}</p>}
                      {item.reason && <p className="text-rose-600 mt-1 font-medium">Reason: {item.reason}</p>}
                    </div>
                  </div>
                ))}
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-100">
              <Button variant="outline" size="sm" onClick={() => setHistoryModalOpen(false)}>
                Close
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ========================================================================= */}
      {/* MODAL 7: CONFIGURE FEE CATEGORIES                                         */}
      {/* ========================================================================= */}
      <Modal
        isOpen={categoryModalOpen}
        onClose={() => setCategoryModalOpen(false)}
        title="Configurable Fee Categories"
        description="Manage standard fees across Course, Placement, Certification, and Exam modules."
        maxWidth="xl"
      >
        <div className="space-y-4 text-xs">
          {/* Create Category Form */}
          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-3">
            <p className="font-bold text-slate-800">Add New Fee Category</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <input
                type="text"
                placeholder="Category Name (e.g. Lab Fee)"
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                className="text-xs p-1.5 border border-slate-300 rounded"
              />
              <input
                type="text"
                placeholder="Code (e.g. LAB-FEE)"
                value={newCatCode}
                onChange={(e) => setNewCatCode(e.target.value)}
                className="text-xs p-1.5 border border-slate-300 rounded uppercase"
              />
              <input
                type="number"
                placeholder="Default Amount (₹)"
                value={newCatAmount}
                onChange={(e) => setNewCatAmount(Number(e.target.value))}
                className="text-xs p-1.5 border border-slate-300 rounded font-mono"
              />
            </div>
            <div className="flex items-center justify-between">
              <select
                value={newCatRefType}
                onChange={(e) => setNewCatRefType(e.target.value as any)}
                className="text-xs p-1.5 border border-slate-300 rounded bg-white"
              >
                <option value="Course">Course Reference</option>
                <option value="Placement">Placement Reference</option>
                <option value="Certification">Certification Reference</option>
                <option value="Assessment">Assessment Reference</option>
                <option value="Fast Track">Fast Track Reference</option>
                <option value="General">General Reference</option>
                <option value="Other">Other Reference</option>
              </select>

              <Button variant="sap" size="sm" onClick={handleCreateCategory}>
                Add Category
              </Button>
            </div>
          </div>

          {/* Existing Categories List */}
          <div className="max-h-64 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-lg">
            {categories.map((cat) => (
              <div key={cat.id} className="p-2.5 flex items-center justify-between hover:bg-slate-50">
                <div>
                  <span className="font-bold text-slate-800">{cat.name}</span>
                  <span className="font-mono text-slate-400 text-[10px] ml-2">({cat.code})</span>
                  <p className="text-[10px] text-slate-500">{cat.description}</p>
                </div>
                <div className="text-right">
                  <span className="font-mono font-bold text-slate-800">{formatINR(cat.default_amount)}</span>
                  <p className="text-[10px] text-slate-400">18% GST (999293)</p>
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-end pt-2 border-t border-slate-100">
            <Button variant="outline" size="sm" onClick={() => setCategoryModalOpen(false)}>
              Close
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
