'use client';

import * as React from 'react';
import { paymentWorkflowClient } from '@/lib/services/payment-workflow-client';
import { FileUpload } from '@/components/ui/file-upload';
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
  CreditCard,
  Edit3,
  ExternalLink,
  CheckCircle,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/components/providers/auth-provider';
import { store } from '@/lib/services/data-store';
import { feeWorkflowService } from '@/lib/services/fee-workflow-service';
import {
  StudentFee,
  FeeApprovalStatus,
  FeeCategoryItem,
  FeeApprovalHistory,
  UserProfile,
  StudentPaymentRecord,
  PaymentMethod,
} from '@/types';
import { formatINR } from '@/lib/utils/formatters';

function safeAmount(val: unknown): number {
  if (typeof val === 'number') return Number.isFinite(val) ? val : 0;
  if (!val) return 0;
  const num = Number(val);
  return Number.isFinite(num) ? num : 0;
}

export default function FeeApprovalsPage() {
  const { user, role, hasPermission } = useAuth();
  const canAccessApprovals =
    hasPermission('accounts:read') ||
    role === 'accountant' ||
    role === 'admin' ||
    role === 'super_admin' ||
    role === 'counsellor';

  // Active Desk View: 'fee_proposals' | 'payment_approvals'
  const [activeDesk, setActiveDesk] = React.useState<'fee_proposals' | 'payment_approvals'>('fee_proposals');

  const [fees, setFees] = React.useState<StudentFee[]>([]);
  const [categories, setCategories] = React.useState<FeeCategoryItem[]>([]);
  const [payments, setPayments] = React.useState<StudentPaymentRecord[]>([]);

  // Fee Proposals filters
  const [activeTab, setActiveTab] = React.useState<string>('Pending Accountant Approval');
  const [categoryFilter, setCategoryFilter] = React.useState<string>('All');
  const [searchQuery, setSearchQuery] = React.useState<string>('');

  // Payment Approvals filters
  const [activePaymentTab, setActivePaymentTab] = React.useState<string>('Pending Verification');
  const [paymentSearchQuery, setPaymentSearchQuery] = React.useState<string>('');

  const canApproveFees = role === 'accountant' || role === 'super_admin' || role === 'admin';
  const canProposeFee = hasPermission('accounts:write') || role === 'counsellor' || role === 'admin' || role === 'super_admin';
  const canManageCategories = role === 'admin' || role === 'super_admin';

  // Fee Modals state
  const [selectedFee, setSelectedFee] = React.useState<StudentFee | null>(null);
  const [approvalModalOpen, setApprovalModalOpen] = React.useState(false);
  const [rejectModalOpen, setRejectModalOpen] = React.useState(false);
  const [correctionModalOpen, setCorrectionModalOpen] = React.useState(false);
  const [historyModalOpen, setHistoryModalOpen] = React.useState(false);
  const [newProposalModalOpen, setNewProposalModalOpen] = React.useState(false);
  const [revisionModalOpen, setRevisionModalOpen] = React.useState(false);
  const [categoryModalOpen, setCategoryModalOpen] = React.useState(false);
  const [isResubmitting, setIsResubmitting] = React.useState(false);

  // Payment Verification Modals state
  const [selectedPayment, setSelectedPayment] = React.useState<StudentPaymentRecord | null>(null);
  const [paymentVerifyModalOpen, setPaymentVerifyModalOpen] = React.useState(false);
  const [paymentRejectModalOpen, setPaymentRejectModalOpen] = React.useState(false);
  const [paymentVerificationNotes, setPaymentVerificationNotes] = React.useState('');
  const [paymentRejectionReason, setPaymentRejectionReason] = React.useState('');

  // Counsellor Payment Update Modal state
  const [paymentUpdateModalOpen, setPaymentUpdateModalOpen] = React.useState(false);
  const [updatingPayment, setUpdatingPayment] = React.useState<StudentPaymentRecord | null>(null);
  const [editAmount, setEditAmount] = React.useState<number>(0);
  const [editPaymentMode, setEditPaymentMode] = React.useState<PaymentMethod>('UPI');
  const [editDate, setEditDate] = React.useState<string>('');
  const [editTxnRef, setEditTxnRef] = React.useState<string>('');
  const [editBankRef, setEditBankRef] = React.useState<string>('');
  const [editProofUrl, setEditProofUrl] = React.useState<string>('');
  const [editNotes, setEditNotes] = React.useState<string>('');

  // Record Payment Modal state (Counsellor / Staff)
  const [recordPaymentModalOpen, setRecordPaymentModalOpen] = React.useState(false);
  const [recFeeId, setRecFeeId] = React.useState<string>('');
  const [recAmount, setRecAmount] = React.useState<number>(15000);
  const [recMode, setRecMode] = React.useState<PaymentMethod>('UPI');
  const [recDate, setRecDate] = React.useState<string>(new Date().toISOString().slice(0, 10));
  const [recTxnRef, setRecTxnRef] = React.useState<string>('');
  const [recBankRef, setRecBankRef] = React.useState<string>('');
  const [recProofUrl, setRecProofUrl] = React.useState<string>('');
  const [paymentProofUploading, setPaymentProofUploading] = React.useState(false);
  const [recNotes, setRecNotes] = React.useState<string>('');

  // Form inputs
  const [approvalNotes, setApprovalNotes] = React.useState('');
  const [rejectionReason, setRejectionReason] = React.useState('');
  const [correctionReason, setCorrectionReason] = React.useState('');
  const [correctionNotes, setCorrectionNotes] = React.useState('');
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = React.useState<string | null>(null);

  // New Proposal Form
  const [selectedStudentId, setSelectedStudentId] = React.useState<string>(() => store.students[0]?.id || '');
  const [selectedFeeCategory, setSelectedFeeCategory] = React.useState('Course Fee');
  const [proposedStandardFee, setProposedStandardFee] = React.useState<number>(60000);
  const [proposedFeeAmount, setProposedFeeAmount] = React.useState<number>(60000);
  const [proposedDiscount, setProposedDiscount] = React.useState<number>(0);
  const [proposedDiscountPercent, setProposedDiscountPercent] = React.useState<number>(0);
  const [proposedDiscountReason, setProposedDiscountReason] = React.useState('');
  const [proposedDueDate, setProposedDueDate] = React.useState<string>(
    new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString().split('T')[0]
  );
  const [proposedNotes, setProposedNotes] = React.useState('');

  // Fee Revision Form
  const [revisionType, setRevisionType] = React.useState<'Additional Discount' | 'Wrong Fee Amount' | 'Course Change' | 'Offer Adjustment' | 'Cancellation'>('Additional Discount');
  const [revisionJustification, setRevisionJustification] = React.useState('');
  const [revisionNewFee, setRevisionNewFee] = React.useState<number>(0);
  const [revisionNewDiscount, setRevisionNewDiscount] = React.useState<number>(0);

  // Category Configuration Form
  const [newCatName, setNewCatName] = React.useState('');
  const [newCatCode, setNewCatCode] = React.useState('');
  const [newCatAmount, setNewCatAmount] = React.useState<number>(5000);
  const [newCatRefType, setNewCatRefType] = React.useState<'Course' | 'Placement' | 'Certification' | 'Assessment' | 'Fast Track' | 'General' | 'Other'>('General');
  const [newCatDesc, setNewCatDesc] = React.useState('');

  const loadData = React.useCallback(async () => {
    try { await paymentWorkflowClient.refresh(); } catch (error: any) { setActionError(error.message); return; }
    store.reconcileDualLedgers();
    setFees([...(store.studentFees || [])]);
    setCategories([...(store.feeCategories || [])]);
    setPayments([...(store.studentPayments || [])]);
  }, []);

  React.useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      if (document.visibilityState !== 'hidden') await loadData();
      if (active) timer = setTimeout(poll, 15000);
    };
    void poll();
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const deskParam = params.get('desk') || params.get('tab');
      const paymentId = params.get('paymentId') || params.get('payment_id');
      if (deskParam === 'payments' || deskParam === 'payment_approvals' || paymentId) {
        setActiveDesk('payment_approvals');
      }
      if (paymentId) {
        setPaymentSearchQuery(paymentId);
      }
    }
    return () => { active = false; clearTimeout(timer); };
  }, [loadData]);

  // Sync category default fee when category changes in proposal form
  React.useEffect(() => {
    if (isResubmitting) return;
    const cat = categories.find((c) => c.name === selectedFeeCategory);
    if (cat) {
      setProposedStandardFee(cat.default_amount);
      setProposedFeeAmount(cat.default_amount);
    }
  }, [selectedFeeCategory, categories, isResubmitting]);

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

  // Counts & sums for Payment Approvals desk
  const pendingPaymentsCount = payments.filter((p) => p.verification_status === 'Pending Verification').length;
  const verifiedPaymentsCount = payments.filter((p) => p.verification_status === 'Verified').length;
  const rejectedPaymentsCount = payments.filter((p) => p.verification_status === 'Rejected').length;

  const totalPendingPaymentsAmount = payments
    .filter((p) => p.verification_status === 'Pending Verification')
    .reduce((sum, p) => sum + (p.amount_paid || 0), 0);

  const totalVerifiedPaymentsAmount = payments
    .filter((p) => p.verification_status === 'Verified')
    .reduce((sum, p) => sum + (p.amount_paid || 0), 0);

  const totalPaymentsAmount = payments.reduce((sum, p) => sum + (p.amount_paid || 0), 0);

  // Filtered Payments List
  const filteredPayments = React.useMemo(() => {
    return payments.filter((p) => {
      if (activePaymentTab !== 'All' && p.verification_status !== activePaymentTab) {
        return false;
      }
      if (paymentSearchQuery.trim()) {
        const q = paymentSearchQuery.toLowerCase();
        const matchesStudent = p.student_name?.toLowerCase().includes(q) || p.admission_number?.toLowerCase().includes(q);
        const matchesCategory = p.fee_category?.toLowerCase().includes(q);
        const matchesTxn = p.transaction_reference?.toLowerCase().includes(q) || p.bank_upi_reference?.toLowerCase().includes(q);
        const matchesRecorded = p.recorded_by_name?.toLowerCase().includes(q) || p.updated_by_name?.toLowerCase().includes(q);
        const matchesNotes = p.notes?.toLowerCase().includes(q);
        if (!matchesStudent && !matchesCategory && !matchesTxn && !matchesRecorded && !matchesNotes) {
          return false;
        }
      }
      return true;
    });
  }, [payments, activePaymentTab, paymentSearchQuery]);

  // Separation of duties helper:
  // Is current user the creator/submitter of selected fee?
  const isCreatorOfFee = (fee: StudentFee | null): boolean => {
    if (!fee) return false;
    return fee.counsellor_id === user?.id || fee.submitted_by === user?.id;
  };

  const isOwnRecordedPayment = (p: StudentPaymentRecord | null): boolean => {
    if (!p) return false;
    return p.recorded_by === user?.id;
  };

  // Payment Actions
  const handleVerifyPayment = async () => {
    if (!selectedPayment) return;
    if (!user) {
      setActionError('You must be logged in to verify payments.');
      return;
    }
    if (selectedPayment.recorded_by === user.id) {
      setActionError('Separation of duties violation: Payment recorder cannot verify their own payment entry.');
      return;
    }
    setActionError(null);
    try {
      await paymentWorkflowClient.verifyPayment(selectedPayment.id, user.id, paymentVerificationNotes);
      store.reconcileDualLedgers();
      store.persist();
      setActionSuccess(`Payment of ${formatINR(selectedPayment.amount_paid)} for ${selectedPayment.student_name} verified & credited! Official payment receipt generated.`);
      setPaymentVerifyModalOpen(false);
      setSelectedPayment(null);
      setPaymentVerificationNotes('');
      loadData();
    } catch (err: any) {
      setActionError(err.message || 'Failed to verify payment.');
    }
  };

  const handleRejectPayment = async () => {
    if (!selectedPayment) return;
    if (!user) {
      setActionError('You must be logged in to reject payments.');
      return;
    }
    if (!paymentRejectionReason.trim()) {
      setActionError('Please provide a mandatory reason for rejecting this payment.');
      return;
    }
    setActionError(null);
    try {
      await paymentWorkflowClient.rejectPayment(selectedPayment.id, user.id, paymentRejectionReason);
      store.reconcileDualLedgers();
      store.persist();
      setActionSuccess(`Payment of ${formatINR(selectedPayment.amount_paid)} has been rejected.`);
      setPaymentRejectModalOpen(false);
      setSelectedPayment(null);
      setPaymentRejectionReason('');
      loadData();
    } catch (err: any) {
      setActionError(err.message || 'Failed to reject payment.');
    }
  };

  const handleOpenUpdatePaymentModal = (p: StudentPaymentRecord) => {
    setUpdatingPayment(p);
    setEditAmount(p.amount_paid);
    setEditPaymentMode(p.payment_mode);
    setEditDate(p.payment_date || new Date().toISOString().slice(0, 10));
    setEditTxnRef(p.transaction_reference || '');
    setEditBankRef(p.bank_upi_reference || '');
    setEditProofUrl(p.payment_proof_url || '');
    setEditNotes(p.notes || '');
    setActionError(null);
    setPaymentUpdateModalOpen(true);
  };

  const handleUpdatePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (paymentProofUploading) return;
    if (!updatingPayment || !user) return;
    setActionError(null);
    try {
      await paymentWorkflowClient.updatePayment(
        updatingPayment.id,
        {
          amount_paid: editAmount,
          payment_mode: editPaymentMode,
          payment_date: editDate,
          transaction_reference: editTxnRef,
          bank_upi_reference: editBankRef,
          payment_proof_url: editProofUrl,
          notes: editNotes,
        },
        user.id,
        role || 'counsellor'
      );
      store.reconcileDualLedgers();
      store.persist();
      setActionSuccess(`Payment for ${updatingPayment.student_name} updated successfully! Status set to Pending Approval for accountant approval.`);
      setPaymentUpdateModalOpen(false);
      setUpdatingPayment(null);
      loadData();
    } catch (err: any) {
      setActionError(err.message || 'Failed to update payment.');
    }
  };

  const handleOpenRecordPaymentModal = () => {
    const approvedList = (store.studentFees || []).filter((f) => f.approval_status === 'Approved' && f.outstanding_amount > 0);
    setRecFeeId(approvedList[0]?.id || (store.studentFees[0]?.id || ''));
    setRecAmount(approvedList[0]?.outstanding_amount || 15000);
    setRecMode('UPI');
    setRecDate(new Date().toISOString().slice(0, 10));
    setRecTxnRef('');
    setRecBankRef('');
    setRecProofUrl('');
    setRecNotes('');
    setActionError(null);
    setRecordPaymentModalOpen(true);
  };

  const handleRecordPaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (paymentProofUploading) return;
    if (!user) return;
    if (!recFeeId) {
      setActionError('Please select a student fee account.');
      return;
    }
    setActionError(null);
    try {
      await paymentWorkflowClient.recordPayment(
        {
          fee_id: recFeeId,
          amount_paid: recAmount,
          payment_mode: recMode,
          payment_date: recDate,
          transaction_reference: recTxnRef,
          bank_upi_reference: recBankRef,
          payment_proof_url: recProofUrl,
          notes: recNotes,
        },
        user.id,
        role || 'counsellor'
      );
      store.reconcileDualLedgers();
      store.persist();
      setActionSuccess(
        `Payment of ${formatINR(recAmount)} submitted. Status: Pending Approval.`
      );
      setRecordPaymentModalOpen(false);
      loadData();
    } catch (err: any) {
      setActionError(err.message || 'Failed to record payment.');
    }
  };

  // Actions
  const handleApprove = async () => {
    if (!selectedFee) return;
    if (!canApproveFees) {
      setActionError('Unauthorized: Only an Accountant, Admin, or Super Admin can approve fee proposals.');
      return;
    }
    if (!user) {
      setActionError('You must be logged in to approve fee proposals.');
      return;
    }
    if (selectedFee.counsellor_id === user.id || selectedFee.submitted_by === user.id) {
      setActionError('Separation of duties violation: The creator or submitter of a fee proposal cannot approve their own proposal.');
      return;
    }
    setActionError(null);
    try {
      await paymentWorkflowClient.feeOperation('approveFee', selectedFee.id, user.id, approvalNotes);
      store.reconcileDualLedgers();
      store.persist();
      setActionSuccess(`Fee proposal for ${selectedFee.student_name} approved successfully!`);
      setApprovalModalOpen(false);
      setApprovalNotes('');
      loadData();
    } catch (err: any) {
      setActionError(err.message || 'Failed to approve fee.');
    }
  };

  const handleReject = async () => {
    if (!selectedFee) return;
    if (!canApproveFees) {
      setActionError('Unauthorized: Only an Accountant, Admin, or Super Admin can reject fee proposals.');
      return;
    }
    if (!user) {
      setActionError('You must be logged in to reject fee proposals.');
      return;
    }
    if (selectedFee.counsellor_id === user.id || selectedFee.submitted_by === user.id) {
      setActionError('Separation of duties violation: You cannot reject a fee proposal that you submitted.');
      return;
    }
    setActionError(null);
    try {
      await paymentWorkflowClient.feeOperation('rejectFee', selectedFee.id, user.id, rejectionReason);
      setActionSuccess(`Fee proposal rejected.`);
      setRejectModalOpen(false);
      setRejectionReason('');
      loadData();
    } catch (err: any) {
      setActionError(err.message || 'Failed to reject fee.');
    }
  };

  const handleCorrection = async () => {
    if (!selectedFee) return;
    if (!canApproveFees) {
      setActionError('Unauthorized: Only an Accountant, Admin, or Super Admin can request corrections.');
      return;
    }
    if (!user) {
      setActionError('You must be logged in to request corrections.');
      return;
    }
    if (selectedFee.counsellor_id === user.id || selectedFee.submitted_by === user.id) {
      setActionError('Separation of duties violation: You cannot return your own fee proposal for correction.');
      return;
    }
    setActionError(null);
    try {
      await paymentWorkflowClient.feeOperation('requestFeeCorrection', 
        selectedFee.id,
        user.id,
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

  const handleCreateProposal = async (autoSubmit: boolean) => {
    if (!canProposeFee || !user?.id) return;
    setActionError(null);
    try {
      if (isResubmitting && selectedFee) {
        await paymentWorkflowClient.feeOperation('updateAndResubmitFee', 
          selectedFee.id,
          user.id,
          {
            proposed_fee: proposedFeeAmount,
            discount_amount: proposedDiscount,
            discount_percentage: proposedDiscountPercent,
            discount_reason: proposedDiscountReason,
            payment_plan: 'Full Payment',
            number_of_installments: 1,
            first_due_date: proposedDueDate,
            counsellor_notes: proposedNotes,
            fee_category: selectedFeeCategory,
          }
        );

        setActionSuccess(
          `Fee proposal for ${selectedFee.student_name} resubmitted for accountant approval.`
        );
        setNewProposalModalOpen(false);
        setIsResubmitting(false);
        setSelectedFee(null);
        setProposedDiscountReason('');
        setProposedNotes('');
        loadData();
        return;
      }

      const student = store.students.find((s) => s.id === selectedStudentId);
      if (!student) throw new Error('Please select a student.');

      const cat = categories.find((c) => c.name === selectedFeeCategory);

      await paymentWorkflowClient.feeOperation('createFeeProposal', 
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
          payment_plan: 'Full Payment',
          number_of_installments: 1,
          first_due_date: proposedDueDate,
          counsellor_notes: proposedNotes,
          auto_submit: autoSubmit,
        },
        user.id,
        role || 'counsellor'
      );

      setActionSuccess(
        `Fee proposal for ${student.full_name} ${autoSubmit ? 'submitted for accountant approval' : 'saved as draft'}.`
      );
      setNewProposalModalOpen(false);
      setIsResubmitting(false);
      setSelectedFee(null);
      setProposedDiscountReason('');
      setProposedNotes('');
      loadData();
    } catch (err: any) {
      setActionError(err.message || 'Failed to process fee proposal.');
    }
  };

  const handleCreateRevision = async () => {
    if (!selectedFee) return;
    if (!user) {
      setActionError('You must be logged in to create a revision request.');
      return;
    }
    setActionError(null);
    try {
      const netFee = Math.max(0, revisionNewFee - revisionNewDiscount);
      const tax = 0;
      const final = netFee + tax;

      await paymentWorkflowClient.feeOperation('createFeeRevisionRequest', 
        selectedFee.id,
        user.id,
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

  const handleCreateCategory = async () => {
    if (!canManageCategories) return;
    setActionError(null);
    try {
      if (!newCatName || !newCatCode) throw new Error('Category Name and Code are mandatory.');
      await paymentWorkflowClient.feeOperation('createFeeCategory', 
        {
          name: newCatName,
          code: newCatCode.toUpperCase(),
          default_amount: Number(newCatAmount) || 0,
          is_taxable: false,
          gst_rate: 0,
          sac_code: '999293',
          reference_type: newCatRefType,
          description: newCatDesc || newCatName,
          is_active: true,
        },
        user?.id || 'usr-admin'
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

  if (!canAccessApprovals) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <Card className="border-red-200 bg-red-50/50 shadow-sm">
          <CardContent className="p-8 text-center space-y-4">
            <div className="mx-auto w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
              <ShieldAlert className="w-6 h-6 text-red-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-red-950">Access Restricted</h2>
              <p className="text-xs text-red-700 mt-1 max-w-md mx-auto">
                You do not possess the required permissions to view or manage student fee approval proposals.
              </p>
            </div>
            <div className="pt-2">
              <Link href={role === 'student' ? '/portal' : '/dashboard'}>
                <Button variant="outline" size="sm" className="text-xs">
                  {role === 'student' ? 'Go to Student Portal' : 'Return to Dashboard'}
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

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

        {/* Action Controls & Active Actor Badge */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Authenticated User Session Badge */}
          <div className="flex items-center space-x-2 bg-slate-100 px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs">
            <span className="text-slate-500 font-medium">Session:</span>
            <span className="font-semibold text-slate-800">{user?.full_name || 'Staff'}</span>
            <Badge variant="outline" className="text-[10px] capitalize bg-white text-slate-700">
              {role?.replace('_', ' ') || 'Staff'}
            </Badge>
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

          {activeDesk === 'fee_proposals' && canProposeFee && (
            <Button
              variant="sap"
              size="sm"
              onClick={() => {
                setSelectedFee(null);
                setIsResubmitting(false);
                setActionError(null);
                setActionSuccess(null);
                const defaultStudent = store.students[0]?.id || '';
                setSelectedStudentId(defaultStudent);
                setSelectedFeeCategory('Course Fee');
                const cat = categories.find((c) => c.name === 'Course Fee');
                const defAmount = cat?.default_amount || 60000;
                setProposedStandardFee(defAmount);
                setProposedFeeAmount(defAmount);
                setProposedDiscount(0);
                setProposedDiscountPercent(0);
                setProposedDiscountReason('');
                setProposedDueDate(new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString().split('T')[0]);
                setProposedNotes('');
                setNewProposalModalOpen(true);
              }}
              className="text-xs flex items-center space-x-1.5 shadow-sm"
            >
              <Plus className="h-4 w-4" />
              <span>Propose Student Fee</span>
            </Button>
          )}

          {activeDesk === 'payment_approvals' && (
            <Button
              variant="sap"
              size="sm"
              onClick={handleOpenRecordPaymentModal}
              className="text-xs flex items-center space-x-1.5 shadow-sm bg-emerald-600 hover:bg-emerald-700"
            >
              <CreditCard className="h-4 w-4" />
              <span>Record Student Payment</span>
            </Button>
          )}
        </div>
      </div>

      {/* Global Separation of Duties Notice */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-3.5 flex items-start space-x-3 text-xs text-blue-900 shadow-xs">
        <ShieldAlert className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
        <div>
          <span className="font-bold">Separation of Duties Invariant:</span> Counsellor proposes the fee and updates payments, Accountant reviews and approves. The submitter or updater can never verify or financially clear their own submission. Only Accountant-approved fees and payments become finalized and credited to the student ledger.
        </div>
      </div>

      {/* Centralized Approval Desks: Fee Proposals vs Payment Verifications */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-3">
        <button
          onClick={() => setActiveDesk('fee_proposals')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
            activeDesk === 'fee_proposals'
              ? 'bg-[#0A6ED1] text-white shadow-xs'
              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          <IndianRupee className="h-4 w-4" />
          <span>Fee Proposals ({fees.length})</span>
          {pendingCount > 0 && (
            <span className="bg-amber-500 text-white text-[10px] px-1.5 py-0.2 rounded-full font-bold ml-1">
              {pendingCount}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveDesk('payment_approvals')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
            activeDesk === 'payment_approvals'
              ? 'bg-[#0A6ED1] text-white shadow-xs'
              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          <CreditCard className="h-4 w-4" />
          <span>Payment Approvals ({payments.length})</span>
          {pendingPaymentsCount > 0 && (
            <span className="bg-amber-500 text-white text-[10px] px-2 py-0.5 rounded-full font-bold ml-1 animate-pulse">
              {pendingPaymentsCount} Pending
            </span>
          )}
        </button>
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

      {/* DESK 1: STUDENT FEE PROPOSALS (Course / Module Fees & Discounts) */}
      {activeDesk === 'fee_proposals' && (
        <div className="space-y-6">
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
                  
                  <th className="px-4 py-3">Counsellor</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredFees.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-12 text-center text-slate-400">
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
                    const canAccountantAct = canApproveFees && !isOwnSubmission;

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
                            
                          </div>
                        </td>
                        

                        {/* Counsellor */}
                        <td className="px-4 py-3 text-slate-600">
                          <div>
                            <p className="font-medium text-slate-800 truncate max-w-[110px]" title={fee.counsellor_name}>
                              {fee.counsellor_name}
                            </p>
                            <p className="text-[10px] text-slate-400">
                              {fee.submitted_at?.split('T')[0] || fee.created_at?.split('T')[0] || '—'}
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

                            {(fee.approval_status === 'Correction Required' || fee.approval_status === 'Draft') &&
                              (isOwnSubmission || role === 'counsellor' || role === 'admin' || role === 'super_admin') && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setSelectedFee(fee);
                                  setIsResubmitting(true);
                                  setSelectedStudentId(fee.student_id);
                                  setSelectedFeeCategory(fee.fee_category);
                                  setProposedStandardFee(fee.standard_fee);
                                  setProposedFeeAmount(fee.proposed_fee);
                                  setProposedDiscount(fee.discount_amount);
                                  setProposedDiscountPercent(fee.discount_percentage);
                                  setProposedDiscountReason(fee.discount_reason || '');
                                  setProposedDueDate(fee.first_due_date || new Date().toISOString().split('T')[0]);
                                  setProposedNotes(fee.counsellor_notes || fee.notes || '');
                                  setActionError(null);
                                  setActionSuccess(null);
                                  setNewProposalModalOpen(true);
                                }}
                                className="text-xs px-2 py-1 h-7 bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100 font-medium"
                              >
                                {fee.approval_status === 'Draft' ? 'Edit & Submit' : 'Edit & Resubmit'}
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
    </div>
  )}

      {/* ========================================================================= */}
      {/* DESK 2: STUDENT PAYMENT APPROVALS & VERIFICATION (Counsellor <-> Accountant) */}
      {/* ========================================================================= */}
      {activeDesk === 'payment_approvals' && (
        <div className="space-y-6">
          {/* Summary KPI Cards for Payments */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <Card className="border-l-4 border-l-amber-500 shadow-xs">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Pending Approval
                  </p>
                  <Clock className="h-4 w-4 text-amber-500" />
                </div>
                <h3 className="text-2xl font-bold text-amber-700 mt-1">{pendingPaymentsCount}</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Value: <span className="font-semibold text-slate-700">{formatINR(totalPendingPaymentsAmount)}</span>
                </p>
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-emerald-500 shadow-xs">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Verified & Credited
                  </p>
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                </div>
                <h3 className="text-2xl font-bold text-emerald-700 mt-1">{verifiedPaymentsCount}</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Value: <span className="font-semibold text-slate-700">{formatINR(totalVerifiedPaymentsAmount)}</span>
                </p>
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-rose-500 shadow-xs">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Rejected / Flagged
                  </p>
                  <AlertTriangle className="h-4 w-4 text-rose-500" />
                </div>
                <h3 className="text-2xl font-bold text-rose-700 mt-1">{rejectedPaymentsCount}</h3>
                <p className="text-xs text-slate-500 mt-0.5">Discrepancies / Bounces</p>
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-slate-400 shadow-xs">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Total Collections
                  </p>
                  <CreditCard className="h-4 w-4 text-slate-500" />
                </div>
                <h3 className="text-2xl font-bold text-slate-900 mt-1">{payments.length}</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Total: <span className="font-semibold text-slate-700">{formatINR(totalPaymentsAmount)}</span>
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Payment Filter and Search Bar */}
          <Card className="p-4 shadow-xs">
            <div className="flex flex-col lg:flex-row gap-4 items-center justify-between">
              {/* Payment Status Tabs */}
              <div className="flex flex-wrap items-center gap-1.5 w-full lg:w-auto">
                {[
                  { id: 'Pending Verification', label: 'Pending Approval', count: pendingPaymentsCount },
                  { id: 'Verified', label: 'Approved & Cleared', count: verifiedPaymentsCount },
                  { id: 'Rejected', label: 'Rejected', count: rejectedPaymentsCount },
                  { id: 'All', label: 'All Collections', count: payments.length },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActivePaymentTab(tab.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center space-x-1.5 ${
                      activePaymentTab === tab.id
                        ? 'bg-[#0A6ED1] text-white shadow-xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    <span>{tab.label}</span>
                    <span
                      className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                        activePaymentTab === tab.id
                          ? 'bg-blue-800 text-white'
                          : 'bg-slate-200 text-slate-700'
                      }`}
                    >
                      {tab.count}
                    </span>
                  </button>
                ))}
              </div>

              {/* Search Box */}
              <div className="relative flex-1 lg:w-72 w-full">
                <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search student, LMS ID, UTR, remarks..."
                  value={paymentSearchQuery}
                  onChange={(e) => setPaymentSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#0A6ED1]"
                />
              </div>
            </div>
          </Card>

          {/* Payment Approvals Table */}
          <Card className="shadow-xs overflow-hidden">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 text-slate-600 uppercase border-b border-slate-100 font-semibold tracking-wider">
                    <tr>
                      <th className="px-4 py-3">Student & LMS ID</th>
                      <th className="px-4 py-3">Fee Category</th>
                      <th className="px-4 py-3 text-right">Amount Paid</th>
                      <th className="px-4 py-3">Mode & Date</th>
                      <th className="px-4 py-3">Reference / UTR / Proof</th>
                      <th className="px-4 py-3">Recorded / Updated By</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredPayments.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-4 py-12 text-center text-slate-400">
                          <div className="flex flex-col items-center justify-center space-y-2">
                            <CreditCard className="h-8 w-8 text-slate-300" />
                            <p className="font-medium text-slate-500">No payment records found in this category.</p>
                            <p className="text-[11px] text-slate-400">
                              When counsellors update or record payments, they appear here for accountant approval.
                            </p>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      filteredPayments.map((p) => {
                        const isOwn = isOwnRecordedPayment(p);
                        const canAccountantVerify =
                          (role === 'accountant' || role === 'admin' || role === 'super_admin') &&
                          !isOwn && p.verification_status === 'Pending Verification';
                        const canCounsellorEdit =
                          p.verification_status !== 'Verified' &&
                          (p.recorded_by === user?.id || role === 'accountant' || role === 'admin' || role === 'super_admin');

                        return (
                          <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                            {/* Student */}
                            <td className="px-4 py-3 font-medium text-slate-900">
                              <div>
                                <span className="font-bold text-slate-800">{p.student_name}</span>
                                <div className="flex items-center space-x-1.5 mt-0.5 text-[11px] text-slate-500">
                                  <span className="font-mono bg-slate-100 px-1 py-0.2 rounded text-[10px]">
                                    {p.admission_number || p.student_id}
                                  </span>
                                </div>
                              </div>
                            </td>

                            {/* Fee Category */}
                            <td className="px-4 py-3">
                              <span className="inline-block px-2 py-0.5 rounded text-[11px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                                {p.fee_category}
                              </span>
                            </td>

                            {/* Amount */}
                            <td className="px-4 py-3 text-right font-mono font-bold text-slate-900 bg-slate-50/40">
                              <span className="text-emerald-700 text-sm">{formatINR(p.amount_paid)}</span>
                            </td>

                            {/* Mode & Date */}
                            <td className="px-4 py-3 text-slate-600">
                              <div>
                                <Badge variant="outline" className="text-[10px] bg-slate-50">
                                  {p.payment_mode}
                                </Badge>
                                <p className="text-[10px] text-slate-400 mt-0.5 font-mono">
                                  {p.payment_date || p.created_at?.split('T')[0]}
                                </p>
                              </div>
                            </td>

                            {/* Reference / Proof */}
                            <td className="px-4 py-3 text-slate-600">
                              <div>
                                <p className="font-mono font-semibold text-slate-800 text-[11px]">
                                  {p.transaction_reference || p.bank_upi_reference || 'N/A'}
                                </p>
                                {p.bank_upi_reference && p.transaction_reference && (
                                  <p className="text-[10px] text-slate-400">{p.bank_upi_reference}</p>
                                )}
                                {p.payment_proof_url && (
                                  <a
                                    href={p.payment_proof_url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-[10px] text-blue-600 hover:underline flex items-center space-x-1 mt-0.5 font-medium"
                                  >
                                    <ExternalLink className="h-3 w-3" />
                                    <span>View Slip / Proof</span>
                                  </a>
                                )}
                              </div>
                            </td>

                            {/* Recorded / Updated By */}
                            <td className="px-4 py-3 text-slate-600">
                              <div>
                                <p className="font-medium text-slate-800 truncate max-w-[130px]" title={p.recorded_by_name}>
                                  {p.recorded_by_name || 'Staff'}
                                </p>
                                <p className="text-[10px] text-slate-400 capitalize">
                                  ({p.recorded_by_role || 'counsellor'})
                                </p>
                                {p.updated_at && (
                                  <Badge variant="outline" className="text-[9px] mt-1 bg-amber-50 text-amber-700 border-amber-200">
                                    Updated: {p.updated_by_name?.split(' ')[0]} ({p.updated_at.split('T')[0]})
                                  </Badge>
                                )}
                              </div>
                            </td>

                            {/* Status */}
                            <td className="px-4 py-3">
                              {p.verification_status === 'Verified' ? (
                                <div>
                                  <Badge variant="success" className="text-[10px]">
                                    Approved & Cleared
                                  </Badge>
                                  {p.receipt_number && (
                                    <p className="text-[10px] text-emerald-700 font-mono font-semibold mt-0.5">
                                      #{p.receipt_number}
                                    </p>
                                  )}
                                </div>
                              ) : p.verification_status === 'Pending Verification' ? (
                                <div>
                                  <Badge variant="warning" className="text-[10px]">
                                    Pending Approval
                                  </Badge>
                                  {isOwn && (
                                    <p className="text-[9px] text-amber-700 font-semibold mt-0.5">
                                      (Your Entry)
                                    </p>
                                  )}
                                </div>
                              ) : (
                                <Badge variant="destructive" className="text-[10px]">
                                  Rejected
                                </Badge>
                              )}
                            </td>

                            {/* Actions */}
                            <td className="px-4 py-3 text-center">
                              <div className="flex items-center justify-center space-x-1.5">
                                {p.verification_status !== 'Verified' && (
                                  <>
                                    {/* Counsellor Update Action */}
                                    {canCounsellorEdit && (
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => handleOpenUpdatePaymentModal(p)}
                                        className="text-xs px-2 py-1 h-7 text-blue-700 border-blue-300 hover:bg-blue-50 flex items-center space-x-1"
                                        title="Counsellor: Update payment amount, UTR reference, proof slip, or notes"
                                      >
                                        <Edit3 className="h-3 w-3" />
                                        <span>Update</span>
                                      </Button>
                                    )}

                                    {/* Accountant Verify & Approve Action */}
                                    <Button
                                      variant="sap"
                                      size="sm"
                                      disabled={!canAccountantVerify}
                                      onClick={() => {
                                        setSelectedPayment(p);
                                        setPaymentVerificationNotes('');
                                        setActionError(null);
                                        setPaymentVerifyModalOpen(true);
                                      }}
                                      className={`text-xs px-2.5 py-1 h-7 ${
                                        canAccountantVerify
                                          ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                                          : 'opacity-50 cursor-not-allowed bg-slate-300 text-slate-600'
                                      }`}
                                      title={
                                        isOwn && role !== 'admin' && role !== 'super_admin'
                                          ? 'Separation of duties: Payment recorder cannot verify their own payment entry.'
                                          : 'Accountant: Verify bank credit and issue official payment receipt'
                                      }
                                    >
                                      <CheckCircle2 className="h-3 w-3 mr-1" />
                                      <span>Verify & Approve</span>
                                    </Button>

                                    {/* Accountant Reject Action */}
                                    {canAccountantVerify && (
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => {
                                          setSelectedPayment(p);
                                          setPaymentRejectionReason('');
                                          setActionError(null);
                                          setPaymentRejectModalOpen(true);
                                        }}
                                        className="text-xs px-2 py-1 h-7 text-rose-600 border-rose-300 hover:bg-rose-50"
                                        title="Reject payment entry"
                                      >
                                        <XCircle className="h-3 w-3 mr-1" />
                                        <span>Reject</span>
                                      </Button>
                                    )}
                                  </>
                                )}

                                {p.verification_status === 'Verified' && (
                                  <Link href={`/accounts/receipts`}>
                                    <Button variant="outline" size="sm" className="text-xs px-2 py-1 h-7 text-emerald-700 border-emerald-300 hover:bg-emerald-50">
                                      View Receipt
                                    </Button>
                                  </Link>
                                )}
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
        </div>
      )}

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
                <span>Net Amount:</span>
                <span className="font-mono">
                  {formatINR(selectedFee.proposed_fee - selectedFee.discount_amount)}
                </span>
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
                placeholder="e.g., Discount verified against merit cutoffs. Fee balance confirmed."
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
      {/* MODAL 4: PROPOSE NEW STUDENT FEE / EDIT & RESUBMIT                       */}
      {/* ========================================================================= */}
      <Modal
        isOpen={newProposalModalOpen}
        onClose={() => {
          setNewProposalModalOpen(false);
          setIsResubmitting(false);
          setSelectedFee(null);
        }}
        title={isResubmitting ? 'Edit & Resubmit Fee Proposal' : 'Create Student Fee Proposal'}
        description={
          isResubmitting
            ? `Address accountant remarks and resubmit proposal #${selectedFee?.id.slice(-6)} for approval.`
            : 'Propose fee structure, apply discounts, and set the fee balance.'
        }
        maxWidth="xl"
      >
        <div className="space-y-4 text-xs">
          {isResubmitting && selectedFee && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 space-y-1">
              <div className="flex items-center space-x-1.5 font-semibold text-amber-800">
                <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                <span>Accountant Correction Requested:</span>
              </div>
              <p className="text-xs pl-5 font-medium">
                {selectedFee.correction_reason || 'Correction requested on fee structure.'}
              </p>
              {selectedFee.correction_notes && (
                <p className="text-[11px] pl-5 text-amber-700 italic">Notes: {selectedFee.correction_notes}</p>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Student Select */}
            <div>
              <label className="block text-slate-700 font-medium mb-1">
                Select Student <span className="text-rose-500">*</span>
              </label>
              {isResubmitting && selectedFee ? (
                <div className="p-2 border border-slate-200 bg-slate-100 rounded-lg text-slate-800 font-medium">
                  {selectedFee.student_name} ({selectedFee.student_code} - {selectedFee.course_name})
                  <span className="text-[10px] text-slate-500 block">Student locked during correction resubmission</span>
                </div>
              ) : (
                <select
                  value={selectedStudentId}
                  onChange={(e) => setSelectedStudentId(e.target.value)}
                  className="w-full text-xs p-2 border border-slate-300 rounded-lg bg-white focus:ring-1 focus:ring-[#0A6ED1] focus:outline-none"
                >
                  {store.students.length === 0 ? (
                    <option value="">No enrolled students available</option>
                  ) : (
                    store.students.map((stu) => (
                      <option key={stu.id} value={stu.id}>
                        {stu.full_name} ({stu.student_code} - {stu.course_name})
                      </option>
                    ))
                  )}
                </select>
              )}
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
                {categories.length === 0 ? (
                  <option value="Course Fee">Course Fee (Default)</option>
                ) : (
                  categories.map((c) => (
                    <option key={c.id} value={c.name}>
                      {c.name} (Std: ₹{c.default_amount.toLocaleString('en-IN')})
                    </option>
                  ))
                )}
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
              <span>Net Fee:</span>
              <span className="font-mono font-semibold">
                {formatINR(Math.max(0, proposedFeeAmount - proposedDiscount))}
              </span>
            </div>
            
            <div className="flex justify-between font-bold text-slate-900 border-t border-slate-200 pt-1 text-sm">
              <span>Total Final Payable:</span>
              <span className="text-emerald-700">
                {formatINR(
                  Math.max(0, proposedFeeAmount - proposedDiscount)
                )}
              </span>
            </div>
          </div>

          <div>
            <label className="block text-slate-700 font-medium mb-1">Fee Payment Due Date</label>
            <input
              type="date"
              value={proposedDueDate}
              onChange={(e) => setProposedDueDate(e.target.value)}
              className="w-full text-xs p-2 border border-slate-300 rounded-lg"
            />
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
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setNewProposalModalOpen(false);
                setIsResubmitting(false);
                setSelectedFee(null);
              }}
            >
              Cancel
            </Button>
            {isResubmitting ? (
              <Button
                variant="sap"
                size="sm"
                onClick={() => handleCreateProposal(true)}
                className="bg-amber-600 hover:bg-amber-700 text-white font-medium"
              >
                Resubmit for Accountant Approval
              </Button>
            ) : (
              <>
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
                  className="bg-[#0A6ED1] text-white font-medium"
                >
                  Submit for Accountant Approval
                </Button>
              </>
            )}
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

      {/* ========================================================================= */}
      {/* MODAL 8: ACCOUNTANT VERIFY & CLEAR PAYMENT                                */}
      {/* ========================================================================= */}
      <Modal
        isOpen={paymentVerifyModalOpen}
        onClose={() => setPaymentVerifyModalOpen(false)}
        title="Verify & Clear Student Payment"
        description="Accountant authorization: verifies bank credit, generates sequential payment receipt, updates student fee balance, and posts to general ledger."
        maxWidth="md"
      >
        {selectedPayment && (
          <div className="space-y-4 text-xs">
            {/* Separation of Duties Warning */}
            {isOwnRecordedPayment(selectedPayment) && (
              <div className="p-3 bg-rose-50 border border-rose-300 rounded-lg text-rose-800 flex items-start space-x-2">
                <ShieldAlert className="h-5 w-5 text-rose-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">Separation of Duties Enforced</p>
                  <p>You recorded this payment entry. An independent Accountant must verify and approve it.</p>
                </div>
              </div>
            )}

            <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-500">Student:</span>
                <span className="font-bold text-slate-800">{selectedPayment.student_name} ({selectedPayment.admission_number || selectedPayment.student_id})</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Category:</span>
                <span className="font-semibold text-indigo-700">{selectedPayment.fee_category}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Amount to Credit:</span>
                <span className="font-mono font-bold text-emerald-700 text-sm">{formatINR(selectedPayment.amount_paid)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Mode & Date:</span>
                <span className="text-slate-800">{selectedPayment.payment_mode} ({selectedPayment.payment_date || selectedPayment.created_at?.split('T')[0]})</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Reference / UTR:</span>
                <span className="font-mono font-semibold text-slate-800">{selectedPayment.transaction_reference || selectedPayment.bank_upi_reference || 'N/A'}</span>
              </div>
              {selectedPayment.payment_proof_url && (
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Deposit Proof:</span>
                  <a
                    href={selectedPayment.payment_proof_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-blue-600 hover:underline flex items-center space-x-1 font-medium"
                  >
                    <ExternalLink className="h-3 w-3" />
                    <span>View Deposit Slip</span>
                  </a>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-slate-500">Recorded By:</span>
                <span className="text-slate-800">{selectedPayment.recorded_by_name} ({selectedPayment.recorded_by_role})</span>
              </div>
              {selectedPayment.updated_at && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Last Modified:</span>
                  <span className="text-amber-800 font-semibold">{selectedPayment.updated_by_name} ({selectedPayment.updated_at.split('T')[0]})</span>
                </div>
              )}
            </div>

            <div>
              <label className="block text-slate-700 font-medium mb-1">
                Accountant Verification Notes / Bank Statement Ref (Optional)
              </label>
              <textarea
                rows={2}
                value={paymentVerificationNotes}
                onChange={(e) => setPaymentVerificationNotes(e.target.value)}
                placeholder="e.g. Verified against HDFC Bank CMS statement on 12-Oct-2026..."
                className="w-full text-xs p-2 border border-slate-300 rounded-lg"
              />
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100">
              <Button variant="outline" size="sm" onClick={() => setPaymentVerifyModalOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="sap"
                size="sm"
                disabled={isOwnRecordedPayment(selectedPayment)}
                onClick={handleVerifyPayment}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <CheckCircle2 className="h-4 w-4 mr-1.5" />
                <span>Confirm & Approve Payment</span>
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ========================================================================= */}
      {/* MODAL 9: ACCOUNTANT REJECT PAYMENT                                        */}
      {/* ========================================================================= */}
      <Modal
        isOpen={paymentRejectModalOpen}
        onClose={() => setPaymentRejectModalOpen(false)}
        title="Reject Student Payment Entry"
        description="Disallow this payment entry with mandatory rationale. Returned to counsellor for correction or re-collection."
        maxWidth="md"
      >
        {selectedPayment && (
          <div className="space-y-4 text-xs">
            <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
              <p className="font-bold text-slate-900">{selectedPayment.student_name} - {formatINR(selectedPayment.amount_paid)}</p>
              <p className="text-slate-500 text-[11px]">UTR / Ref: {selectedPayment.transaction_reference || 'N/A'}</p>
            </div>

            <div>
              <label className="block text-slate-700 font-medium mb-1">
                Mandatory Rejection Reason <span className="text-rose-500">*</span>
              </label>
              <textarea
                rows={3}
                value={paymentRejectionReason}
                onChange={(e) => setPaymentRejectionReason(e.target.value)}
                placeholder="Provide clear reasons (e.g. UTR not matching statement, cheque returned, incorrect bank account)..."
                className="w-full text-xs p-2 border border-slate-300 rounded-lg"
              />
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100">
              <Button variant="outline" size="sm" onClick={() => setPaymentRejectModalOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                disabled={!paymentRejectionReason.trim()}
                onClick={handleRejectPayment}
              >
                Reject Payment
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ========================================================================= */}
      {/* MODAL 10: COUNSELLOR UPDATE PAYMENT                                       */}
      {/* ========================================================================= */}
      <Modal
        isOpen={paymentUpdateModalOpen}
        onClose={() => {
          setPaymentUpdateModalOpen(false);
          setUpdatingPayment(null);
        }}
        title="Update Student Payment Details (Counsellor Edit)"
        description="Correct payment amount, mode, transaction reference (UTR), date, deposit slip link, or remarks while awaiting accountant approval."
        maxWidth="lg"
      >
        {updatingPayment && (
          <form onSubmit={handleUpdatePaymentSubmit} className="space-y-4 text-xs">
            <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 grid grid-cols-2 gap-2">
              <div>
                <span className="text-slate-500 block">Student:</span>
                <span className="font-bold text-slate-800">{updatingPayment.student_name} ({updatingPayment.admission_number || updatingPayment.student_id})</span>
              </div>
              <div>
                <span className="text-slate-500 block">Category:</span>
                <span className="font-semibold text-indigo-700">{updatingPayment.fee_category}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Original Recorder:</span>
                <span className="text-slate-800">{updatingPayment.recorded_by_name} ({updatingPayment.recorded_by_role})</span>
              </div>
              <div>
                <span className="text-slate-500 block">Status:</span>
                <span className="font-bold text-amber-800">{updatingPayment.verification_status}</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-700 font-medium mb-1">
                  Payment Amount (₹) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  required
                  min={1}
                  value={editAmount}
                  onChange={(e) => setEditAmount(Number(e.target.value))}
                  className="w-full text-xs p-2 border border-slate-300 rounded-lg font-mono font-bold text-emerald-700"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-medium mb-1">Payment Mode</label>
                <select
                  value={editPaymentMode}
                  onChange={(e) => setEditPaymentMode(e.target.value as PaymentMethod)}
                  className="w-full text-xs p-2 border border-slate-300 rounded-lg bg-white"
                >
                  <option value="UPI">UPI / QR Code</option>
                  <option value="Bank Transfer">Bank Transfer (NEFT/RTGS/IMPS)</option>
                  <option value="Net Banking">Net Banking</option>
                  <option value="Credit Card">Credit Card</option>
                  <option value="Debit Card">Debit Card</option>
                  <option value="Cash">Cash Receipt</option>
                  <option value="Cheque">Cheque Deposit</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-700 font-medium mb-1">Payment Date</label>
                <input
                  type="date"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                  className="w-full text-xs p-2 border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-medium mb-1">
                  Transaction Reference / UTR Number
                </label>
                <input
                  type="text"
                  placeholder="e.g. UPI/260202/882194 or NEFT-HDFC-998877"
                  value={editTxnRef}
                  onChange={(e) => setEditTxnRef(e.target.value)}
                  className="w-full text-xs p-2 border border-slate-300 rounded-lg font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-medium mb-1">
                  Bank / Account Reference
                </label>
                <input
                  type="text"
                  placeholder="e.g. HDFC Institute A/C #4019"
                  value={editBankRef}
                  onChange={(e) => setEditBankRef(e.target.value)}
                  className="w-full text-xs p-2 border border-slate-300 rounded-lg"
                />
              </div>

              <FileUpload bucket="payment-proofs" label="Replace payment proof" value={editProofUrl} onChange={setEditProofUrl} onUploadingChange={setPaymentProofUploading} />
              <div>
                <label className="block text-slate-700 font-medium mb-1">
                  Payment Slip / Proof Document URL
                </label>
                <input
                  type="text"
                  placeholder="https://cdn.example.com/receipt.pdf"
                  value={editProofUrl}
                  onChange={(e) => setEditProofUrl(e.target.value)}
                  className="w-full text-xs p-2 border border-slate-300 rounded-lg"
                />
              </div>
            </div>

            <div>
              <label className="block text-slate-700 font-medium mb-1">Counsellor Modification Notes</label>
              <textarea
                rows={2}
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                placeholder="Reason for modifying amount or UTR..."
                className="w-full text-xs p-2 border border-slate-300 rounded-lg"
              />
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100">
              <Button
                variant="outline"
                size="sm"
                type="button"
                onClick={() => {
                  setPaymentUpdateModalOpen(false);
                  setUpdatingPayment(null);
                }}
              >
                Cancel
              </Button>
              <Button variant="sap" size="sm" type="submit">
                <CheckCircle className="h-4 w-4 mr-1.5" />
                <span>Save & Resubmit to Accountant</span>
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* ========================================================================= */}
      {/* MODAL 11: COUNSELLOR RECORD PAYMENT                                       */}
      {/* ========================================================================= */}
      <Modal
        isOpen={recordPaymentModalOpen}
        onClose={() => setRecordPaymentModalOpen(false)}
        title="Record Student Tuition Payment"
        description="Collect fee payment against an approved student fee account. Enters 'Pending Approval' for Accounts approval."
        maxWidth="lg"
      >
        <form onSubmit={handleRecordPaymentSubmit} className="space-y-4 text-xs">
          <div>
            <label className="block text-slate-700 font-medium mb-1">
              Select Approved Student Fee Account <span className="text-rose-500">*</span>
            </label>
            <select
              required
              value={recFeeId}
              onChange={(e) => {
                setRecFeeId(e.target.value);
                const found = (store.studentFees || []).find((f) => f.id === e.target.value);
                if (found && found.outstanding_amount > 0) {
                  setRecAmount(found.outstanding_amount);
                }
              }}
              className="w-full text-xs p-2 border border-slate-300 rounded-lg bg-white"
            >
              <option value="" disabled>-- Select Student Fee --</option>
              {(store.studentFees || [])
                .filter((f) => f.approval_status === 'Approved' && f.outstanding_amount > 0)
                .map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.student_name} ({f.admission_number || f.student_code}) — {f.course_name || f.fee_category} [Due: {formatINR(f.outstanding_amount)}]
                  </option>
                ))}
            </select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-700 font-medium mb-1">
                Amount to Collect (₹) <span className="text-rose-500">*</span>
              </label>
              <input
                type="number"
                required
                min={1}
                value={recAmount}
                onChange={(e) => setRecAmount(Number(e.target.value))}
                className="w-full text-xs p-2 border border-slate-300 rounded-lg font-mono font-bold text-emerald-700"
              />
            </div>

            <div>
              <label className="block text-slate-700 font-medium mb-1">Payment Mode</label>
              <select
                value={recMode}
                onChange={(e) => setRecMode(e.target.value as PaymentMethod)}
                className="w-full text-xs p-2 border border-slate-300 rounded-lg bg-white"
              >
                <option value="UPI">UPI / QR Code</option>
                <option value="Bank Transfer">Bank Transfer (NEFT/RTGS/IMPS)</option>
                <option value="Net Banking">Net Banking</option>
                <option value="Credit Card">Credit Card</option>
                <option value="Debit Card">Debit Card</option>
                <option value="Cash">Cash Receipt</option>
                <option value="Cheque">Cheque Deposit</option>
              </select>
            </div>

            <div>
              <label className="block text-slate-700 font-medium mb-1">Payment Date</label>
              <input
                type="date"
                value={recDate}
                onChange={(e) => setRecDate(e.target.value)}
                className="w-full text-xs p-2 border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-slate-700 font-medium mb-1">
                Transaction Reference / UTR
              </label>
              <input
                type="text"
                placeholder="e.g. UPI/260202/882194"
                value={recTxnRef}
                onChange={(e) => setRecTxnRef(e.target.value)}
                className="w-full text-xs p-2 border border-slate-300 rounded-lg font-mono"
              />
            </div>

            <div>
              <label className="block text-slate-700 font-medium mb-1">
                Bank / Account Reference
              </label>
              <input
                type="text"
                placeholder="e.g. HDFC Institute A/C"
                value={recBankRef}
                onChange={(e) => setRecBankRef(e.target.value)}
                className="w-full text-xs p-2 border border-slate-300 rounded-lg"
              />
            </div>

            <FileUpload bucket="payment-proofs" label="Payment proof *" value={recProofUrl} onChange={setRecProofUrl} onUploadingChange={setPaymentProofUploading} />
            <div>
              <label className="block text-slate-700 font-medium mb-1">
                Deposit Proof URL / Slip Link
              </label>
              <input
                type="text"
                placeholder="https://cdn.example.com/slip.pdf"
                value={recProofUrl}
                onChange={(e) => setRecProofUrl(e.target.value)}
                className="w-full text-xs p-2 border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          <div>
            <label className="block text-slate-700 font-medium mb-1">Payment Notes</label>
            <textarea
              rows={2}
              value={recNotes}
              onChange={(e) => setRecNotes(e.target.value)}
              placeholder="Candidate payment details or payment reference..."
              className="w-full text-xs p-2 border border-slate-300 rounded-lg"
            />
          </div>

          <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100">
            <Button
              variant="outline"
              size="sm"
              type="button"
              onClick={() => setRecordPaymentModalOpen(false)}
            >
              Cancel
            </Button>
            <Button variant="sap" size="sm" type="submit">
              <CreditCard className="h-4 w-4 mr-1.5" />
              <span>Record & Submit for Approval</span>
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
