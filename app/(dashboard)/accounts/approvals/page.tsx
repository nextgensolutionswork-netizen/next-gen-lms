'use client';

import { getRoleLabel } from '@/lib/utils/role-labels';
import * as React from 'react';
import { paymentWorkflowClient } from '@/lib/services/payment-workflow-client';
import { useDataSync } from '@/lib/hooks/use-data-sync';
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
  Phone,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/components/providers/auth-provider';
import { store } from '@/lib/services/data-store';
import { feeWorkflowService } from '@/lib/services/fee-workflow-service';
import { BankAccountSearchableDropdown } from '@/components/ui/bank-account-searchable-dropdown';
import {
  getAuthorizedBankAccounts,
  findOriginalReceivingAccount,
  maskSensitiveAccountNumber,
} from '@/lib/utils/bank-autofill';
import {
  StudentFee,
  FeeApprovalStatus,
  FeeCategoryItem,
  FeeApprovalHistory,
  UserProfile,
  StudentPaymentRecord,
  PaymentMethod,
  AuthorizedBankAccount,
} from '@/types';
import { formatINR, formatDate } from '@/lib/utils/formatters';
import { getCanonicalPhoneDigits } from '@/lib/utils/phone-validation';
import { resolveCanonicalCounsellorId } from '@/lib/services/counsellor-service';
import { feeCourseName } from '@/lib/utils/fee-course';
import { isPaymentPending, isPaymentApproved, unifyDualLedgerPayments } from '@/lib/utils/dashboard-metrics';

function courseLabel(fee: StudentFee) {
  return feeCourseName(fee, store.courses || [], store.feeAccounts || [], store.admissions || []);
}

function safeAmount(val: unknown): number {
  if (typeof val === 'number') return Number.isFinite(val) ? val : 0;
  if (!val) return 0;
  const num = Number(val);
  return Number.isFinite(num) ? num : 0;
}

export default function FeeApprovalsPage() {
  const { user, role, hasPermission } = useAuth();
  const isCounsellor = role === 'counsellor';
  const canAccessApprovals =
    !isCounsellor &&
    (role === 'accountant' || role === 'admin' || role === 'super_admin');

  // Active Desk View: 'fee_proposals' | 'payment_approvals'
  const [activeDesk, setActiveDesk] = React.useState<'fee_proposals' | 'payment_approvals'>('payment_approvals');

  const [fees, setFees] = React.useState<StudentFee[]>([]);
  const [categories, setCategories] = React.useState<FeeCategoryItem[]>([]);
  const [payments, setPayments] = React.useState<StudentPaymentRecord[]>([]);

  // Fee Proposals filters
  const [activeTab, setActiveTab] = React.useState<string>('Pending Accountant Approval');
  const [categoryFilter, setCategoryFilter] = React.useState<string>('All');
  const [searchQuery, setSearchQuery] = React.useState<string>('');

  // Payment Approvals filters
  const [activePaymentTab, setActivePaymentTab] = React.useState<string>('Pending Verification');
  const [paymentSearchQuery, setPaymentSearchQuery] = React.useState<string>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      return params.get('paymentId') || params.get('payment_id') || '';
    }
    return '';
  });

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
  const [manualVerification, setManualVerification] = React.useState({ reference: '', amount: '', payment_date: '' });
  const [verificationErrors, setVerificationErrors] = React.useState<Record<string, string>>({});
  const [verificationBusy, setVerificationBusy] = React.useState(false);
  const [paymentRejectionReason, setPaymentRejectionReason] = React.useState('');

  // Accountant Payment Verification - Bank Details State
  const [selectedVerifiedBankAccountId, setSelectedVerifiedBankAccountId] = React.useState<string>('');
  const [verifiedBankName, setVerifiedBankName] = React.useState<string>('');
  const [verifiedBankAccountName, setVerifiedBankAccountName] = React.useState<string>('');
  const [verifiedBankAccountId, setVerifiedBankAccountId] = React.useState<string>('');
  const [verifiedUpiDetails, setVerifiedUpiDetails] = React.useState<string>('');
  const [bankDiscrepancyReason, setBankDiscrepancyReason] = React.useState<string>('');

  const authorizedBankAccounts = React.useMemo(() => {
    return getAuthorizedBankAccounts(role, { includePending: false });
  }, [role]);

  const originalReceivingAccount = React.useMemo(() => {
    if (!selectedPayment) return undefined;
    return findOriginalReceivingAccount(selectedPayment, authorizedBankAccounts);
  }, [selectedPayment, authorizedBankAccounts]);

  const isBankDiscrepancy = React.useMemo(() => {
    if (!selectedPayment || selectedPayment.payment_mode === 'Cash') return false;
    if (!originalReceivingAccount) return false;
    return selectedVerifiedBankAccountId !== '' && selectedVerifiedBankAccountId !== originalReceivingAccount.id;
  }, [selectedPayment, originalReceivingAccount, selectedVerifiedBankAccountId]);

  // Sales Payment Update Modal state
  const [paymentUpdateModalOpen, setPaymentUpdateModalOpen] = React.useState(false);
  const [updatingPayment, setUpdatingPayment] = React.useState<StudentPaymentRecord | null>(null);
  const [editAmount, setEditAmount] = React.useState<number>(0);
  const [editPaymentMode, setEditPaymentMode] = React.useState<PaymentMethod>('UPI');
  const [editDate, setEditDate] = React.useState<string>('');
  const [editTxnRef, setEditTxnRef] = React.useState<string>('');
  const [editBankRef, setEditBankRef] = React.useState<string>('');
  const [editProofUrl, setEditProofUrl] = React.useState<string>('');
  const [editNotes, setEditNotes] = React.useState<string>('');
  const [editBankProfileId, setEditBankProfileId] = React.useState<string>('');
  const [editBankName, setEditBankName] = React.useState<string>('');
  const [editBankAccountName, setEditBankAccountName] = React.useState<string>('');
  const [editBankAccountId, setEditBankAccountId] = React.useState<string>('');
  const [editBankUpiDetails, setEditBankUpiDetails] = React.useState<string>('');
  const [editReason, setEditReason] = React.useState<string>('');

  // Record Payment Modal state (Sales / Staff)
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
  const [recBankProfileId, setRecBankProfileId] = React.useState<string>('');
  const [recBankName, setRecBankName] = React.useState<string>('');
  const [recBankAccountName, setRecBankAccountName] = React.useState<string>('');
  const [recBankAccountId, setRecBankAccountId] = React.useState<string>('');
  const [recBankUpiDetails, setRecBankUpiDetails] = React.useState<string>('');

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
    () => new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString().split('T')[0]
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
    // Unify dual-ledger payments so mirrored records are deduplicated
    const unified = unifyDualLedgerPayments(store.payments || [], store.studentPayments || [], {
      receipts: store.receipts || [],
      students: store.students || [],
      studentFees: store.studentFees || [],
      courses: store.courses || [],
    });

    // Map to StudentPaymentRecord shape preserving authoritative IDs for approval/rejection actions
    const spList: StudentPaymentRecord[] = unified.map((u) => {
      const origSp = (store.studentPayments || []).find((sp) =>
        sp.id === u.id || sp.id === (u as any).student_payment_id || `pay-${sp.id}` === u.id || sp.id === (u.id || '').replace(/^pay-/, '')
      );
      return {
        id: origSp?.id || (u as any).student_payment_id || u.id.replace(/^pay-/, ''),
        fee_id: origSp?.fee_id || (u as any).fee_id || u.fee_account_id,
        enrollment_id: origSp?.enrollment_id || (u as any).enrollment_id,
        installment_id: origSp?.installment_id || u.installment_id,
        student_id: origSp?.student_id || u.student_id,
        student_name: origSp?.student_name || u.student_name || 'Student',
        admission_number: origSp?.admission_number || u.admission_number || '',
        student_unique_id: origSp?.student_unique_id || (u as any).student_unique_id,
        student_code: origSp?.student_code || (u as any).student_code,
        student_phone: origSp?.student_phone || (u as any).student_phone || (u as any).phone,
        counsellor_id: origSp?.counsellor_id || (u as any).counsellor_id,
        counsellor_name: origSp?.counsellor_name || (u as any).counsellor_name,
        fee_category: origSp?.fee_category || (u as any).fee_category || u.course_name || 'Course Fee',
        amount_paid: typeof u.amount === 'number' ? u.amount : origSp?.amount_paid || 0,
        payment_date: origSp?.payment_date || u.payment_date,
        payment_mode: origSp?.payment_mode || (u.payment_mode as any) || 'Cash',
        transaction_reference: origSp?.transaction_reference || u.transaction_reference,
        bank_upi_reference: origSp?.bank_upi_reference || (u as any).bank_upi_reference,
        receipt_number: origSp?.receipt_number || u.receipt_number,
        payment_proof_url: origSp?.payment_proof_url || (u as any).payment_proof_url,
        notes: origSp?.notes || u.notes,
        recorded_by: origSp?.recorded_by || u.collected_by,
        recorded_by_name: origSp?.recorded_by_name || u.collected_by_name || 'Staff',
        recorded_by_role: origSp?.recorded_by_role || (u as any).recorded_by_role || 'counsellor',
        verification_status: (u.verification_status as any) || origSp?.verification_status || 'Pending Verification',
        verified_by: origSp?.verified_by || (u as any).verified_by,
        verified_by_name: origSp?.verified_by_name || (u as any).verified_by_name,
        verified_at: origSp?.verified_at || (u as any).verified_at,
        updated_at: origSp?.updated_at || (u as any).updated_at,
        updated_by: origSp?.updated_by || (u as any).updated_by,
        updated_by_name: origSp?.updated_by_name || (u as any).updated_by_name,
        created_at: origSp?.created_at || u.created_at || new Date().toISOString(),
        status: (u.status as any) || origSp?.status,
        our_bank_profile_id: origSp?.our_bank_profile_id || (u as any).our_bank_profile_id,
        our_bank_name: origSp?.our_bank_name || (u as any).our_bank_name,
        our_bank_account_name: origSp?.our_bank_account_name || (u as any).our_bank_account_name,
        our_bank_account_id: origSp?.our_bank_account_id || (u as any).our_bank_account_id,
        our_upi_details: origSp?.our_upi_details || (u as any).our_upi_details,
        verified_our_bank_name: origSp?.verified_our_bank_name || (u as any).verified_our_bank_name,
        verified_our_bank_account_name: origSp?.verified_our_bank_account_name || (u as any).verified_our_bank_account_name,
        verified_our_bank_account_id: origSp?.verified_our_bank_account_id || (u as any).verified_our_bank_account_id,
        verified_bank_profile_id: origSp?.verified_bank_profile_id || (u as any).verified_bank_profile_id,
        verified_our_upi_details: origSp?.verified_our_upi_details || (u as any).verified_our_upi_details,
        bank_account_discrepancy_reason: origSp?.bank_account_discrepancy_reason || (u as any).bank_account_discrepancy_reason,
      };
    });
    setPayments(spList);
  }, []);

  React.useEffect(() => {
    if (!canAccessApprovals) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      if (document.visibilityState !== 'hidden') await loadData();
      if (active) timer = setTimeout(poll, 15000);
    };
    void poll();
    // paymentId search query is initialized from URL search params
    return () => { active = false; clearTimeout(timer); };
  }, [loadData, canAccessApprovals]);

  useDataSync({
    domain: 'payments',
    onSync: loadData,
  });

  // Category default fee is applied during category selection change

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
        const matchesCourse = courseLabel(fee).toLowerCase().includes(q);
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

  // Counts & sums for Payment Approvals desk using shared accounting rules
  const pendingPayments = React.useMemo(() => payments.filter((p) => isPaymentPending(p)), [payments]);
  const verifiedPayments = React.useMemo(() => payments.filter((p) => isPaymentApproved(p)), [payments]);
  const rejectedPayments = React.useMemo(() => payments.filter((p) => !isPaymentPending(p) && !isPaymentApproved(p)), [payments]);

  const pendingPaymentsCount = pendingPayments.length;
  const verifiedPaymentsCount = verifiedPayments.length;
  const rejectedPaymentsCount = rejectedPayments.length;

  const totalPendingPaymentsAmount = pendingPayments.reduce((sum, p) => sum + safeAmount(p.amount_paid), 0);
  const totalVerifiedPaymentsAmount = verifiedPayments.reduce((sum, p) => sum + safeAmount(p.amount_paid), 0);
  const totalPaymentsAmount = payments.reduce((sum, p) => sum + safeAmount(p.amount_paid), 0);

  // Filtered Payments List
  const filteredPayments = React.useMemo(() => {
    return payments.filter((p) => {
      if (activePaymentTab === 'Pending Verification' && !isPaymentPending(p)) {
        return false;
      }
      if (activePaymentTab === 'Verified' && !isPaymentApproved(p)) {
        return false;
      }
      if (activePaymentTab === 'Rejected' && (isPaymentPending(p) || isPaymentApproved(p))) {
        return false;
      }
      if (paymentSearchQuery.trim()) {
        const q = paymentSearchQuery.toLowerCase();
        const matchingStudent = (store.students || []).find(
          (s) => (p.student_id && s.id === p.student_id) || (p.admission_number && s.admission_number === p.admission_number)
        );
        const matchingAdmission = (store.admissions || []).find(
          (a) => (p.admission_number && a.admission_number === p.admission_number) || (p.student_id && a.student_id === p.student_id)
        );

        const matchesStudent = p.student_name?.toLowerCase().includes(q) || p.admission_number?.toLowerCase().includes(q);
        const matchesLmsId =
          matchingStudent?.student_unique_id?.toLowerCase().includes(q) ||
          matchingStudent?.student_code?.toLowerCase().includes(q) ||
          matchingAdmission?.student_unique_id?.toLowerCase().includes(q) ||
          p.student_unique_id?.toLowerCase().includes(q) ||
          p.student_code?.toLowerCase().includes(q);
        const matchesPhone =
          matchingStudent?.phone?.includes(q) ||
          matchingAdmission?.phone?.includes(q) ||
          p.student_phone?.includes(q) ||
          (p as any).phone?.includes(q);
        const matchesAccount =
          p.our_bank_account_name?.toLowerCase().includes(q) ||
          p.verified_our_bank_account_name?.toLowerCase().includes(q) ||
          p.our_bank_name?.toLowerCase().includes(q);
        const matchesCounsellor =
          matchingAdmission?.counsellor_name?.toLowerCase().includes(q) ||
          p.counsellor_name?.toLowerCase().includes(q);
        const matchesCategory = p.fee_category?.toLowerCase().includes(q);
        const matchesTxn = p.transaction_reference?.toLowerCase().includes(q) || p.bank_upi_reference?.toLowerCase().includes(q);
        const matchesRecorded = p.recorded_by_name?.toLowerCase().includes(q) || p.updated_by_name?.toLowerCase().includes(q);
        const matchesNotes = p.notes?.toLowerCase().includes(q);

        if (
          !matchesStudent &&
          !matchesLmsId &&
          !matchesPhone &&
          !matchesAccount &&
          !matchesCounsellor &&
          !matchesCategory &&
          !matchesTxn &&
          !matchesRecorded &&
          !matchesNotes
        ) {
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
    if (!selectedPayment || verificationBusy) return;
    if (!user) {
      setActionError('You must be logged in to verify payments.');
      return;
    }
    if (selectedPayment.recorded_by === user.id) {
      setActionError('Separation of duties violation: Payment recorder cannot verify their own payment entry.');
      return;
    }
    setActionError(null);
    setVerificationBusy(true);
    setVerificationErrors({});

    // Client-side pre-validation for Receiving Bank Account
    const localErrors: Record<string, string> = {};
    if (selectedPayment.payment_mode !== 'Cash') {
      if (!selectedVerifiedBankAccountId) {
        localErrors.receiving_bank_profile_id = 'Receiving bank account is required for non-cash payment verification.';
      } else if (isBankDiscrepancy && !bankDiscrepancyReason.trim()) {
        localErrors.bank_account_discrepancy_reason =
          'Discrepancy explanation is required when the verified receiving bank account differs from the original payment record.';
      }
    }
    if (Object.keys(localErrors).length > 0) {
      setVerificationErrors(localErrors);
      setVerificationBusy(false);
      return;
    }

    try {
      await paymentWorkflowClient.verifyPayment(
        selectedPayment.id,
        user.id,
        paymentVerificationNotes,
        {
          ...manualVerification,
          reference: selectedPayment.payment_mode === 'Cash' ? undefined : manualVerification.reference,
          receiving_bank_profile_id: selectedVerifiedBankAccountId || undefined,
          bank_account_discrepancy_reason: isBankDiscrepancy ? bankDiscrepancyReason.trim() : undefined,
        }
      );
      store.reconcileDualLedgers();
      store.persist();
      setActionSuccess(`Payment of ${formatINR(selectedPayment.amount_paid)} for ${selectedPayment.student_name} verified & credited! Official payment receipt generated.`);
      setPaymentVerifyModalOpen(false);
      setSelectedPayment(null);
      setPaymentVerificationNotes('');
      setSelectedVerifiedBankAccountId('');
      setVerifiedBankName('');
      setVerifiedBankAccountName('');
      setVerifiedBankAccountId('');
      setVerifiedUpiDetails('');
      setBankDiscrepancyReason('');
      loadData();
    } catch (err: any) {
      setVerificationErrors(err.fieldErrors || { general: err.message || 'Failed to verify payment.' });
      setActionError(err.message || 'Failed to verify payment.');
    } finally {
      setVerificationBusy(false);
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
    setEditReason('');

    // Authoritative Receiving Bank Account resolution for update
    const matchingAdm = (store.admissions || []).find(
      (a) => (p.admission_number && a.admission_number === p.admission_number) || (p.student_id && a.student_id === p.student_id)
    );
    const origAccount = findOriginalReceivingAccount(p, authorizedBankAccounts) || (
      matchingAdm ? findOriginalReceivingAccount(matchingAdm, authorizedBankAccounts) : undefined
    );

    if (origAccount) {
      setEditBankProfileId(origAccount.id);
      setEditBankName(origAccount.bank_name);
      setEditBankAccountName(origAccount.account_holder_name);
      setEditBankAccountId(origAccount.account_number);
      setEditBankUpiDetails(origAccount.upi_id || '');
    } else if (p.our_bank_account_name || p.our_bank_name) {
      setEditBankProfileId(p.our_bank_profile_id || 'custom');
      setEditBankName(p.our_bank_name || '');
      setEditBankAccountName(p.our_bank_account_name || '');
      setEditBankAccountId(p.our_bank_account_id || '');
      setEditBankUpiDetails(p.our_upi_details || '');
    } else {
      setEditBankProfileId('');
      setEditBankName('');
      setEditBankAccountName('');
      setEditBankAccountId('');
      setEditBankUpiDetails('');
    }

    setActionError(null);
    setPaymentUpdateModalOpen(true);
  };

  const handleUpdatePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (paymentProofUploading) return;
    if (!updatingPayment || !user) return;

    if (!editReason.trim()) {
      setActionError('Please provide a mandatory reason for updating this payment transaction.');
      return;
    }

    if (editPaymentMode !== 'Cash' && !editBankProfileId && !editBankAccountName) {
      setActionError('Please select an authorized receiving bank account for non-cash payment.');
      return;
    }

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
          notes: `${editNotes ? editNotes.trim() + '\n' : ''}[Update Reason by ${user.full_name} (${user.role}) on ${new Date().toISOString()}]: ${editReason.trim()}`,
          our_bank_profile_id: editPaymentMode !== 'Cash' && editBankProfileId && editBankProfileId !== 'custom' ? editBankProfileId : undefined,
          our_bank_name: editPaymentMode !== 'Cash' ? editBankName : undefined,
          our_bank_account_name: editPaymentMode !== 'Cash' ? editBankAccountName : undefined,
          our_bank_account_id: editPaymentMode !== 'Cash' ? editBankAccountId : undefined,
          our_upi_details: (editPaymentMode === 'UPI' || editBankUpiDetails) ? editBankUpiDetails : undefined,
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
    setRecBankProfileId('');
    setRecBankName('');
    setRecBankAccountName('');
    setRecBankAccountId('');
    setRecBankUpiDetails('');
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
    if (recMode !== 'Cash' && !recBankProfileId && !recBankAccountName) {
      setActionError('Please select an authorized receiving bank account for non-cash payment.');
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
          our_bank_profile_id: recMode !== 'Cash' && recBankProfileId && recBankProfileId !== 'custom' ? recBankProfileId : undefined,
          our_bank_name: recMode !== 'Cash' ? recBankName : undefined,
          our_bank_account_name: recMode !== 'Cash' ? recBankAccountName : undefined,
          our_bank_account_id: recMode !== 'Cash' ? recBankAccountId : undefined,
          our_upi_details: (recMode === 'UPI' || recBankUpiDetails) ? recBankUpiDetails : undefined,
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
              <span className="inline-block px-2.5 py-0.5 rounded text-[11px] font-mono font-bold bg-red-100 text-red-800 border border-red-200 mb-2">
                403 Forbidden
              </span>
              <h2 className="text-lg font-bold text-red-950">Access Restricted</h2>
              <p className="text-xs text-red-700 mt-1 max-w-md mx-auto">
                Users with the Counsellor role are not authorized to view or manage fee approvals or pending payment queues.
              </p>
            </div>
            <div className="pt-2">
              <Link href={role === 'counsellor' ? '/crm/leads' : role === 'student' ? '/portal' : '/dashboard'}>
                <Button variant="outline" size="sm" className="text-xs">
                  {role === 'counsellor' ? 'Return to CRM Leads' : role === 'student' ? 'Go to Student Portal' : 'Return to Dashboard'}
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
              {getRoleLabel(role) || 'Staff'}
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
          <span className="font-bold">Separation of Duties Invariant:</span> Sales proposes the fee and updates payments, Accountant reviews and approves. The submitter or updater can never verify or financially clear their own submission. Only Accountant-approved fees and payments become finalized and credited to the student ledger.
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
                  
                  <th className="px-4 py-3">Sales</th>
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
                            <p className="font-semibold text-slate-800 truncate" title={courseLabel(fee)}>
                              {courseLabel(fee)}
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
                        

                        {/* Sales */}
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
                              (isOwnSubmission || (role as string) === 'counsellor' || role === 'admin' || role === 'super_admin') && (
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
      {/* DESK 2: STUDENT PAYMENT APPROVALS & VERIFICATION (Sales <-> Accountant) */}
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
                    Verified Collections
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
                    Total Recorded Payments
                  </p>
                  <CreditCard className="h-4 w-4 text-slate-500" />
                </div>
                <h3 className="text-2xl font-bold text-slate-900 mt-1">{payments.length}</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Total: <span className="font-semibold text-slate-700">{formatINR(totalPaymentsAmount)}</span>
                  <span className="block text-[10px] text-slate-400 mt-0.5">All Statuses: Verified, Pending & Rejected</span>
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
                  { id: 'All', label: 'All Recorded Payments', count: payments.length },
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
                  placeholder="Search student, LMS ID, phone, account holder, counsellor..."
                  value={paymentSearchQuery}
                  onChange={(e) => setPaymentSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#0A6ED1]"
                />
              </div>
            </div>
          </Card>

          {/* Payment Approvals Table (7 Custom Columns) */}
          <Card className="shadow-xs overflow-hidden">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 text-slate-600 uppercase border-b border-slate-100 font-semibold tracking-wider">
                    <tr>
                      <th className="px-4 py-3">Student & LMS ID</th>
                      <th className="px-4 py-3">Phone Number</th>
                      <th className="px-4 py-3 text-right">Amount Paid</th>
                      <th className="px-4 py-3">Payment Date</th>
                      <th className="px-4 py-3">Account Holder Name</th>
                      <th className="px-4 py-3">Counsellor Name</th>
                      <th className="px-4 py-3 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredPayments.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-12 text-center text-slate-400">
                          <div className="flex flex-col items-center justify-center space-y-2">
                            <CreditCard className="h-8 w-8 text-slate-300" />
                            <p className="font-medium text-slate-500">No payment records found in this category.</p>
                            <p className="text-[11px] text-slate-400">
                              When sales staff update or record payments, they appear here for accountant approval.
                            </p>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      filteredPayments.map((p) => {
                        const isOwn = isOwnRecordedPayment(p);
                        const canAccountantVerify =
                          (role === 'accountant' || role === 'admin' || role === 'super_admin') &&
                          !isOwn && isPaymentPending(p);
                        const canCounsellorEdit =
                          !isPaymentApproved(p) &&
                          (p.recorded_by === user?.id || role === 'accountant' || role === 'admin' || role === 'super_admin');

                        // 1. Authoritative Student & LMS ID resolution (Never confuse admission number with LMS ID)
                        const matchingStudent = (store.students || []).find(
                          (s) =>
                            (p.student_id && s.id === p.student_id) ||
                            (p.admission_number && s.admission_number === p.admission_number) ||
                            s.admission_id === p.fee_id
                        );
                        const matchingAdmission = (store.admissions || []).find(
                          (a) =>
                            (p.admission_number && a.admission_number === p.admission_number) ||
                            (p.student_id && (a.student_id === p.student_id || a.id === p.student_id)) ||
                            a.id === p.fee_id
                        );
                        const studentName =
                          p.student_name ||
                          matchingStudent?.full_name ||
                          matchingAdmission?.student_name ||
                          'Unknown Student';
                        const isUuid = (val?: string | null) =>
                          Boolean(val && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val.trim()));
                        const rawLmsCandidate =
                          matchingStudent?.student_unique_id ||
                          matchingStudent?.student_code ||
                          matchingAdmission?.student_unique_id ||
                          p.student_unique_id ||
                          p.student_code ||
                          (p.student_id && !p.student_id.startsWith('ADM-') && !isUuid(p.student_id) ? p.student_id : null) ||
                          (matchingStudent?.id && !matchingStudent.id.startsWith('ADM-') && !isUuid(matchingStudent.id) ? matchingStudent.id : null);
                        const lmsId = rawLmsCandidate && !isUuid(rawLmsCandidate) ? rawLmsCandidate : 'Registration Pending';
                        const profileLink = matchingStudent?.id || p.student_id;

                        // 2. Authoritative Phone Number resolution
                        const registeredPhone =
                          matchingStudent?.phone ||
                          matchingAdmission?.phone ||
                          p.student_phone ||
                          (p as any).phone ||
                          '';
                        const cleanPhone = registeredPhone.trim();
                        const displayPhone = cleanPhone
                          ? (cleanPhone.startsWith('+') ? cleanPhone : `+91 ${cleanPhone.replace(/^0+/, '')}`)
                          : 'Not Provided';

                        // 3. Amount Paid (p.amount_paid)

                        // 4. Actual Payment Date (from p.payment_date)
                        const paymentDateStr = p.payment_date || p.created_at?.split('T')[0] || '';
                        const formattedPaymentDate = paymentDateStr ? formatDate(paymentDateStr) : '—';

                        // 6. Assigned Counsellor Name & Linked Admission resolution
                        const linkedAdmission = matchingAdmission || (store.admissions || []).find(
                          (a) =>
                            (p.admission_number && a.admission_number === p.admission_number) ||
                            (p.student_id && (a.student_id === p.student_id || a.id === p.student_id)) ||
                            a.id === p.fee_id
                        );
                        const linkedFeeAccount = !linkedAdmission
                          ? (store.feeAccounts || []).find(
                              (fa) =>
                                (p.student_id && fa.student_id === p.student_id) ||
                                (p.admission_number && fa.admission_id === p.admission_number) ||
                                fa.id === p.fee_id
                            )
                          : null;
                        const admissionFromFa = linkedFeeAccount?.admission_id
                          ? (store.admissions || []).find(
                              (a) => a.id === linkedFeeAccount.admission_id || a.admission_number === linkedFeeAccount.admission_id
                            )
                          : null;
                        const effectiveAdm = linkedAdmission || admissionFromFa;
                        const rawCounsellorId = effectiveAdm?.counsellor_id || p.counsellor_id;
                        const canonicalCounsellorId = rawCounsellorId ? resolveCanonicalCounsellorId(rawCounsellorId) : undefined;
                        const counsellorStaff = (store.users || []).find(
                          (u) =>
                            (rawCounsellorId && u.id === rawCounsellorId) ||
                            (canonicalCounsellorId && u.id === canonicalCounsellorId)
                        );
                        const counsellorName =
                          effectiveAdm?.counsellor_name ||
                          p.counsellor_name ||
                          counsellorStaff?.full_name ||
                          'Unassigned';

                        // 5. Receiving Bank Account Holder Name (Never confuse with student name, never silent fallback)
                        const isApproved = isPaymentApproved(p);
                        const isCash = p.payment_mode === 'Cash';
                        const auditBankEvidence = (store.auditLogs || []).find(
                          (log) =>
                            (log.action === 'PAYMENT_SUBMITTED' || log.action === 'PAYMENT_RECORDED') &&
                            (log.record_id === p.id || log.record_id === `pay-${p.id}` || `spr-${log.record_id}` === p.id) &&
                            log.new_value &&
                            (log.new_value.our_bank_profile_id || log.new_value.our_bank_account_name)
                        )?.new_value as { our_bank_profile_id?: string; our_bank_name?: string; our_bank_account_name?: string; our_bank_account_id?: string } | undefined;
                        const origAccount =
                          findOriginalReceivingAccount(p, authorizedBankAccounts) ||
                          (effectiveAdm ? findOriginalReceivingAccount(effectiveAdm, authorizedBankAccounts) : undefined) ||
                          (auditBankEvidence ? findOriginalReceivingAccount(auditBankEvidence, authorizedBankAccounts) : undefined);

                        let accountHolderName = '';
                        let accountSub = '';
                        let isBankMissingOrInvalid = false;

                        if (isCash) {
                          accountHolderName = 'Institute Cash Counter';
                          accountSub = 'Cash Collection';
                        } else if (isApproved && (p.verified_our_bank_account_name || p.verified_bank_profile_id)) {
                          const vAcc = p.verified_bank_profile_id
                            ? authorizedBankAccounts.find((a) => a.id === p.verified_bank_profile_id)
                            : undefined;
                          accountHolderName = p.verified_our_bank_account_name || vAcc?.account_holder_name || 'Verified Receiving Account';
                          const bankName = p.verified_our_bank_name || vAcc?.bank_name || 'Bank';
                          const rawNum = (p.verified_our_bank_account_id || vAcc?.account_number || '').replace(/\D/g, '');
                          const last4 = rawNum ? rawNum.slice(-4) : '';
                          accountSub = last4 ? `${bankName} — XXXX${last4}` : bankName;
                        } else if (origAccount) {
                          accountHolderName = origAccount.account_holder_name;
                          const rawNum = (origAccount.account_number || '').replace(/\D/g, '');
                          const last4 = rawNum ? rawNum.slice(-4) : '';
                          accountSub = last4 ? `${origAccount.bank_name} — XXXX${last4}` : origAccount.bank_name;
                        } else if (p.our_bank_account_name) {
                          accountHolderName = p.our_bank_account_name;
                          const bankName = p.our_bank_name || 'Bank';
                          const rawNum = (p.our_bank_account_id || '').replace(/\D/g, '');
                          const last4 = rawNum ? rawNum.slice(-4) : '';
                          accountSub = last4 ? `${bankName} — XXXX${last4}` : bankName;
                        } else {
                          // Non-cash payment lacking valid receiving bank account mapping
                          isBankMissingOrInvalid = true;
                          accountHolderName = 'Bank Account Verification Required';
                          accountSub = 'Action needed: Update receiving bank details';
                        }

                        return (
                          <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                            {/* Column 1: Student & LMS ID */}
                            <td className="px-4 py-3 font-medium text-slate-900">
                              <div>
                                <Link
                                  href={`/students/${profileLink}`}
                                  className="font-bold text-slate-800 hover:text-[#0A6ED1] transition-colors block text-xs"
                                >
                                  {studentName}
                                </Link>
                                <div className="flex items-center space-x-1.5 mt-0.5 text-[11px] text-slate-500">
                                  <span className="font-mono bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded text-[10px] border border-slate-200">
                                    LMS ID: {lmsId}
                                  </span>
                                </div>
                              </div>
                            </td>

                            {/* Column 2: Phone Number */}
                            <td className="px-4 py-3 text-slate-700 whitespace-nowrap">
                              <div className="flex items-center space-x-1.5">
                                <span className="font-mono text-xs">{displayPhone}</span>
                                {cleanPhone && (
                                  <a
                                    href={`https://wa.me/${getCanonicalPhoneDigits('+91', cleanPhone)}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    title={`Chat on WhatsApp (${displayPhone})`}
                                    className="h-5 w-5 rounded-full bg-[#25D366]/10 text-[#25D366] hover:bg-[#25D366] hover:text-white flex items-center justify-center transition-all shrink-0 border border-[#25D366]/30 shadow-2xs"
                                  >
                                    <Phone className="h-3 w-3" />
                                  </a>
                                )}
                              </div>
                            </td>

                            {/* Column 3: Amount Paid */}
                            <td className="px-4 py-3 text-right font-mono font-bold text-slate-900 bg-slate-50/40 whitespace-nowrap">
                              <span className="text-emerald-700 text-sm">{formatINR(p.amount_paid)}</span>
                            </td>

                            {/* Column 4: Payment Date */}
                            <td className="px-4 py-3 text-slate-700 whitespace-nowrap">
                              <div className="flex items-center space-x-1.5">
                                <Calendar className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                                <span className="font-mono text-xs">{formattedPaymentDate}</span>
                              </div>
                            </td>

                            {/* Column 5: Account Holder Name */}
                            <td className="px-4 py-3 text-slate-800">
                              <div>
                                {isBankMissingOrInvalid ? (
                                  <div className="flex items-center space-x-1">
                                    <span
                                      className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-100 text-amber-800 border border-amber-300"
                                      title="The recorded payment lacks an authorized receiving bank profile. Please click Update to resolve bank account mapping before approving."
                                    >
                                      <AlertTriangle className="h-3 w-3 mr-1 text-amber-600 shrink-0" />
                                      Bank Account Verification Required
                                    </span>
                                  </div>
                                ) : (
                                  <>
                                    <span className="font-semibold text-slate-900 block text-xs">
                                      {accountHolderName}
                                    </span>
                                    {accountSub && (
                                      <span className="text-[10px] text-slate-500 block truncate max-w-[190px] font-mono" title={accountSub}>
                                        {accountSub}
                                      </span>
                                    )}
                                  </>
                                )}
                              </div>
                            </td>

                            {/* Column 6: Counsellor Name */}
                            <td className="px-4 py-3 text-slate-700 whitespace-nowrap">
                              <div className="flex items-center space-x-1.5">
                                <div className="h-6 w-6 rounded-full bg-blue-50 text-blue-700 font-semibold flex items-center justify-center text-[10px] shrink-0 border border-blue-200">
                                  {counsellorName.charAt(0).toUpperCase()}
                                </div>
                                <span className="font-medium text-xs text-slate-800">{counsellorName}</span>
                              </div>
                            </td>

                            {/* Column 7: Actions — Update & Approve */}
                            <td className="px-4 py-3 text-center whitespace-nowrap">
                              <div className="flex items-center justify-center space-x-1.5">
                                {isPaymentApproved(p) ? (
                                  <div className="flex items-center space-x-1.5">
                                    <Badge variant="success" className="text-[10px]">
                                      Approved
                                    </Badge>
                                    {p.receipt_number && (
                                      <Link href="/accounts/receipts">
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          className="text-xs px-2 py-1 h-7 text-emerald-700 border-emerald-300 hover:bg-emerald-50 flex items-center space-x-1"
                                          title={`View Receipt #${p.receipt_number}`}
                                        >
                                          <FileText className="h-3 w-3" />
                                          <span>Receipt</span>
                                        </Button>
                                      </Link>
                                    )}
                                  </div>
                                ) : (
                                  <>
                                    {/* Action 1: Update */}
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      disabled={!canCounsellorEdit}
                                      onClick={() => handleOpenUpdatePaymentModal(p)}
                                      className={`text-xs px-2.5 py-1 h-7 flex items-center space-x-1 ${
                                        canCounsellorEdit
                                          ? 'text-blue-700 border-blue-300 hover:bg-blue-50'
                                          : 'opacity-50 cursor-not-allowed text-slate-400 border-slate-200'
                                      }`}
                                      title={
                                        canCounsellorEdit
                                          ? 'Sales / Staff: Update payment amount, receiving bank account, UTR reference, proof slip, or notes'
                                          : 'Only authorized staff may update pending payment entries.'
                                      }
                                    >
                                      <Edit3 className="h-3 w-3" />
                                      <span>Update</span>
                                    </Button>

                                    {/* Action 2: Approve */}
                                    <Button
                                      variant="sap"
                                      size="sm"
                                      disabled={!canAccountantVerify || isBankMissingOrInvalid}
                                      onClick={() => {
                                        setSelectedPayment(p);
                                        setPaymentVerificationNotes('');
                                        setActionError(null);
                                        setManualVerification({ reference: '', amount: '', payment_date: '' });
                                        setVerificationErrors({});
                                        const origAcc = findOriginalReceivingAccount(p, authorizedBankAccounts) || (
                                          effectiveAdm ? findOriginalReceivingAccount(effectiveAdm, authorizedBankAccounts) : undefined
                                        );
                                        if (origAcc) {
                                          setSelectedVerifiedBankAccountId(origAcc.id);
                                          setVerifiedBankName(origAcc.bank_name);
                                          setVerifiedBankAccountName(origAcc.account_holder_name);
                                          setVerifiedBankAccountId(origAcc.account_number);
                                          setVerifiedUpiDetails(origAcc.upi_id || '');
                                        } else {
                                          // Never silent fallback to default account! Require explicit accountant resolution.
                                          setSelectedVerifiedBankAccountId('');
                                          setVerifiedBankName('');
                                          setVerifiedBankAccountName('');
                                          setVerifiedBankAccountId('');
                                          setVerifiedUpiDetails('');
                                        }
                                        setBankDiscrepancyReason('');
                                        setPaymentVerifyModalOpen(true);
                                      }}
                                      className={`text-xs px-2.5 py-1 h-7 flex items-center space-x-1 ${
                                        canAccountantVerify && !isBankMissingOrInvalid
                                          ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs'
                                          : 'opacity-50 cursor-not-allowed bg-slate-300 text-slate-600'
                                      }`}
                                      title={
                                        isBankMissingOrInvalid
                                          ? 'Bank Account Verification Required: Please click Update to resolve bank account mapping before approving.'
                                          : isOwn && role !== 'admin' && role !== 'super_admin'
                                          ? 'Separation of duties: Payment recorder cannot verify their own payment entry.'
                                          : !canAccessApprovals
                                          ? 'Restricted to authorized Accountant / Admin users.'
                                          : 'Accountant: Verify bank credit and approve payment entry'
                                      }
                                    >
                                      <CheckCircle2 className="h-3 w-3" />
                                      <span>Approve</span>
                                    </Button>
                                  </>
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
                <span className="text-slate-800">{courseLabel(selectedFee)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Sales:</span>
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
              Detailed Instructions for Sales:
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
                  {selectedFee.student_name} ({selectedFee.student_code} - {courseLabel(selectedFee)})
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
            <label className="block text-slate-700 font-medium mb-1">Sales Notes</label>
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
              {selectedPayment.payment_mode !== 'Cash' && <div className="flex justify-between">
                <span className="text-slate-500">Reference / UTR:</span>
                <span className="font-mono font-semibold text-slate-800">{selectedPayment.transaction_reference || selectedPayment.bank_upi_reference || 'N/A'}</span>
              </div>}
              {selectedPayment.payment_mode !== 'Cash' && selectedPayment.payment_proof_url && (
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
              {selectedPayment.payment_mode !== 'Cash' && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Original Receiving Bank:</span>
                  <span className="font-semibold text-slate-800">
                    {originalReceivingAccount
                      ? `${originalReceivingAccount.account_holder_name} — ${originalReceivingAccount.bank_name} (•••• ${originalReceivingAccount.account_number.replace(/\s+/g, '').slice(-4)})`
                      : (selectedPayment.our_bank_account_name || selectedPayment.our_bank_name
                          ? `${selectedPayment.our_bank_account_name || ''} — ${selectedPayment.our_bank_name || ''} ${selectedPayment.our_bank_account_id ? `(•••• ${selectedPayment.our_bank_account_id.replace(/\s+/g, '').slice(-4)})` : ''}`
                          : 'Not recorded / Unassigned')}
                  </span>
                </div>
              )}
              {selectedPayment.updated_at && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Last Modified:</span>
                  <span className="text-amber-800 font-semibold">{selectedPayment.updated_by_name} ({selectedPayment.updated_at.split('T')[0]})</span>
                </div>
              )}
            </div>

            <div className="space-y-3">
              <p>Manually enter the received payment details for this payment record.</p>
              {([
                ['reference', 'UTR / Transaction Reference', 'text'],
                ['amount', 'Amount Received', 'number'],
                ['payment_date', 'Actual Payment Date', 'date'],
              ] as const).filter(([field]) => field !== 'reference' || selectedPayment.payment_mode !== 'Cash').map(([field, label, type]) => (
                <div key={field}>
                  <label htmlFor={'verify-' + field} className="block text-slate-700 font-medium mb-1">{label} *</label>
                  <input id={'verify-' + field} type={type} required autoComplete="off"
                    step={field === 'amount' ? '0.01' : undefined} min={field === 'amount' ? '0.01' : undefined}
                    value={manualVerification[field]} disabled={verificationBusy}
                    aria-invalid={!!verificationErrors[field]} aria-describedby={verificationErrors[field] ? 'verify-' + field + '-error' : undefined}
                    onChange={(e) => setManualVerification((previous) => ({ ...previous, [field]: e.target.value }))}
                    className="w-full text-xs p-2 border border-slate-300 rounded-lg" />
                  {verificationErrors[field] && <p id={'verify-' + field + '-error'} role="alert" className="text-rose-700 mt-1">{verificationErrors[field]}</p>}
                </div>
              ))}
              {verificationErrors.general && <p role="alert" className="text-rose-700">{verificationErrors.general}</p>}
            </div>

            {/* Bank Details Section */}
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-semibold text-xs text-slate-800 block">
                    Bank Details
                  </span>
                  <span className="text-[10px] text-slate-500">
                    {selectedPayment.payment_mode === 'Cash'
                      ? 'Campus desk cash collection (bank account optional)'
                      : 'Authoritative institutional receiving account for reconciliation'}
                  </span>
                </div>
                {originalReceivingAccount && (
                  <span className="text-[10px] bg-slate-200/70 text-slate-700 px-2 py-0.5 rounded font-mono">
                    Original: {originalReceivingAccount.bank_name} (•••• {originalReceivingAccount.account_number.replace(/\s+/g, '').slice(-4)})
                  </span>
                )}
              </div>

              {/* 1. Receiving Bank Account Selector */}
              <div>
                <label htmlFor="verify-bank-account-selector" className="block text-slate-700 font-medium mb-1">
                  Receiving Bank Account Selector {selectedPayment.payment_mode !== 'Cash' && <span className="text-rose-500">*</span>}
                </label>
                <BankAccountSearchableDropdown
                  id="verify-bank-account-selector"
                  accounts={authorizedBankAccounts}
                  selectedId={selectedVerifiedBankAccountId}
                  mode="fee-collection"
                  allowCustom={false}
                  placeholder="Search & select authorized receiving bank account..."
                  disabled={verificationBusy}
                  onSelect={(acc) => {
                    if (acc === 'custom') return;
                    setSelectedVerifiedBankAccountId(acc.id);
                    setVerifiedBankName(acc.bank_name);
                    setVerifiedBankAccountName(acc.account_holder_name);
                    setVerifiedBankAccountId(acc.account_number);
                    setVerifiedUpiDetails(acc.upi_id || '');
                    setVerificationErrors((prev) => {
                      const copy = { ...prev };
                      delete copy.receiving_bank_profile_id;
                      return copy;
                    });
                  }}
                />
                {verificationErrors.receiving_bank_profile_id && (
                  <p role="alert" className="text-rose-700 text-xs mt-1">
                    {verificationErrors.receiving_bank_profile_id}
                  </p>
                )}
              </div>

              {/* 2-5: Our Bank Name, Our Bank Account Name, Our Bank Account ID (Masked), Our UPI Details */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                <div>
                  <label htmlFor="verify-our-bank-name" className="block text-slate-700 font-medium mb-1">Our Bank Name</label>
                  <input
                    id="verify-our-bank-name"
                    type="text"
                    readOnly
                    disabled
                    value={verifiedBankName}
                    placeholder="Auto-populated upon account selection"
                    className="w-full text-xs p-2 bg-slate-100 border border-slate-300 rounded-lg text-slate-700 cursor-not-allowed font-medium"
                  />
                </div>
                <div>
                  <label htmlFor="verify-our-bank-account-name" className="block text-slate-700 font-medium mb-1">Our Bank Account Name</label>
                  <input
                    id="verify-our-bank-account-name"
                    type="text"
                    readOnly
                    disabled
                    value={verifiedBankAccountName}
                    placeholder="Auto-populated upon account selection"
                    className="w-full text-xs p-2 bg-slate-100 border border-slate-300 rounded-lg text-slate-700 cursor-not-allowed font-medium"
                  />
                </div>
                <div>
                  <label htmlFor="verify-our-bank-account-id" className="block text-slate-700 font-medium mb-1">Our Bank Account ID</label>
                  <input
                    id="verify-our-bank-account-id"
                    type="text"
                    readOnly
                    disabled
                    value={verifiedBankAccountId ? maskSensitiveAccountNumber(verifiedBankAccountId) : ''}
                    placeholder="Auto-populated (masked)"
                    className="w-full text-xs p-2 bg-slate-100 border border-slate-300 rounded-lg text-slate-700 font-mono cursor-not-allowed font-medium"
                  />
                </div>
                <div>
                  <label htmlFor="verify-our-upi-details" className="block text-slate-700 font-medium mb-1">Our UPI Details</label>
                  <input
                    id="verify-our-upi-details"
                    type="text"
                    readOnly
                    disabled
                    value={verifiedUpiDetails || (selectedVerifiedBankAccountId ? 'N/A' : '')}
                    placeholder="Auto-populated when available"
                    className="w-full text-xs p-2 bg-slate-100 border border-slate-300 rounded-lg text-slate-700 font-mono cursor-not-allowed font-medium"
                  />
                </div>
              </div>

              {/* Discrepancy Alert & Mandatory Explanation */}
              {isBankDiscrepancy && (
                <div className="p-2.5 bg-amber-50 border border-amber-300 rounded-lg text-amber-900 space-y-1.5 mt-2">
                  <div className="flex items-center space-x-1.5 text-xs font-semibold text-amber-800">
                    <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0" />
                    <span>Receiving Bank Account Discrepancy Detected</span>
                  </div>
                  <p className="text-[11px] text-amber-700">
                    The verified receiving account ({verifiedBankName}) differs from the original payment record ({originalReceivingAccount?.bank_name || 'Original Record'}). Enter the mandatory reconciliation explanation.
                  </p>
                  <div>
                    <label htmlFor="verify-bank-discrepancy-reason" className="block text-slate-700 font-medium mb-1">
                      Discrepancy Explanation / Rationale <span className="text-rose-500">*</span>
                    </label>
                    <textarea
                      id="verify-bank-discrepancy-reason"
                      rows={2}
                      required
                      value={bankDiscrepancyReason}
                      onChange={(e) => {
                        setBankDiscrepancyReason(e.target.value);
                        setVerificationErrors((prev) => {
                          const copy = { ...prev };
                          delete copy.bank_account_discrepancy_reason;
                          return copy;
                        });
                      }}
                      placeholder="e.g. Student deposited directly into ICICI Tuition account instead of primary HDFC account..."
                      className="w-full text-xs p-2 border border-amber-300 rounded-lg bg-white"
                    />
                    {verificationErrors.bank_account_discrepancy_reason && (
                      <p role="alert" className="text-rose-700 text-xs mt-1">
                        {verificationErrors.bank_account_discrepancy_reason}
                      </p>
                    )}
                  </div>
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

            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setPaymentVerifyModalOpen(false);
                  setPaymentRejectionReason('');
                  setActionError(null);
                  setPaymentRejectModalOpen(true);
                }}
                className="text-rose-600 border-rose-300 hover:bg-rose-50 flex items-center space-x-1"
                title="Disallow this payment entry with mandatory rationale"
              >
                <XCircle className="h-3.5 w-3.5" />
                <span>Reject Payment...</span>
              </Button>

              <div className="flex items-center space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setPaymentVerifyModalOpen(false);
                    setSelectedPayment(null);
                    setSelectedVerifiedBankAccountId('');
                    setVerifiedBankName('');
                    setVerifiedBankAccountName('');
                    setVerifiedBankAccountId('');
                    setVerifiedUpiDetails('');
                    setBankDiscrepancyReason('');
                  }}
                >
                  Cancel
                </Button>
                <Button
                  variant="sap"
                  size="sm"
                  disabled={verificationBusy || isOwnRecordedPayment(selectedPayment)}
                  onClick={handleVerifyPayment}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  <CheckCircle2 className="h-4 w-4 mr-1.5" />
                  <span>Confirm & Approve Payment</span>
                </Button>
              </div>
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
        title="Update Student Payment Details (Sales Edit)"
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

              {editPaymentMode !== 'Cash' && (
                <div className="md:col-span-2">
                  <label className="block text-slate-700 font-medium mb-1">
                    Institute Receiving Bank Account Preset <span className="text-rose-500">*</span>
                  </label>
                  <BankAccountSearchableDropdown
                    accounts={authorizedBankAccounts}
                    selectedId={editBankProfileId}
                    mode="fee-collection"
                    allowCustom={true}
                    placeholder="Search & select institute receiving bank account..."
                    onSelect={(acc) => {
                      if (acc === 'custom') {
                        setEditBankProfileId('custom');
                      } else {
                        setEditBankProfileId(acc.id);
                        setEditBankName(acc.bank_name);
                        setEditBankAccountName(acc.account_holder_name);
                        setEditBankAccountId(acc.account_number);
                        setEditBankUpiDetails(acc.upi_id || '');
                        setEditBankRef(`${acc.bank_name} - ${acc.account_holder_name}`);
                      }
                    }}
                  />
                  {editBankProfileId && editBankProfileId !== 'custom' && (
                    <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded-lg text-xs grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <div>
                        <span className="text-slate-500 block text-[10px]">Account Holder:</span>
                        <span className="font-bold text-slate-800">{editBankAccountName}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block text-[10px]">Bank Name:</span>
                        <span className="font-semibold text-blue-700">{editBankName}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block text-[10px]">Account Number:</span>
                        <span className="font-mono text-slate-700">•••• •••• {editBankAccountId.replace(/\s+/g, '').slice(-4)}</span>
                      </div>
                    </div>
                  )}
                  {editBankProfileId === 'custom' && (
                    <div className="mt-2 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <div>
                        <label className="block text-slate-600 text-[10px] mb-0.5">Bank Name</label>
                        <input
                          type="text"
                          value={editBankName}
                          onChange={(e) => setEditBankName(e.target.value)}
                          className="w-full text-xs p-1.5 border border-slate-300 rounded"
                          placeholder="Bank Name"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-slate-600 text-[10px] mb-0.5">Account Holder</label>
                        <input
                          type="text"
                          value={editBankAccountName}
                          onChange={(e) => setEditBankAccountName(e.target.value)}
                          className="w-full text-xs p-1.5 border border-slate-300 rounded"
                          placeholder="Holder Name"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-slate-600 text-[10px] mb-0.5">Account Number</label>
                        <input
                          type="text"
                          value={editBankAccountId}
                          onChange={(e) => setEditBankAccountId(e.target.value)}
                          className="w-full text-xs p-1.5 border border-slate-300 rounded"
                          placeholder="Account Number"
                          required
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="block text-slate-700 font-medium mb-1">
                  Bank / Account Reference Notes
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
              <label className="block text-slate-700 font-medium mb-1">
                Reason for Update / Correction <span className="text-rose-500">*</span>
              </label>
              <textarea
                rows={2}
                required
                value={editReason}
                onChange={(e) => setEditReason(e.target.value)}
                placeholder="Mandatory rationale (e.g. Corrected receiving bank account from Charitha to E Anasuya per deposit slip)..."
                className="w-full text-xs p-2 border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-slate-700 font-medium mb-1">Sales Modification Notes (Optional)</label>
              <textarea
                rows={2}
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                placeholder="Additional notes for accountant reference..."
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
                    {f.student_name} ({f.admission_number || f.student_code}) — {courseLabel(f)} [Due: {formatINR(f.outstanding_amount)}]
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

            {recMode !== 'Cash' && (
              <div className="md:col-span-2">
                <label className="block text-slate-700 font-medium mb-1">
                  Institute Receiving Bank Account Preset <span className="text-rose-500">*</span>
                </label>
                <BankAccountSearchableDropdown
                  accounts={authorizedBankAccounts}
                  selectedId={recBankProfileId}
                  mode="fee-collection"
                  allowCustom={true}
                  placeholder="Search & select institute receiving bank account..."
                  onSelect={(acc) => {
                    if (acc === 'custom') {
                      setRecBankProfileId('custom');
                    } else {
                      setRecBankProfileId(acc.id);
                      setRecBankName(acc.bank_name);
                      setRecBankAccountName(acc.account_holder_name);
                      setRecBankAccountId(acc.account_number);
                      setRecBankUpiDetails(acc.upi_id || '');
                      setRecBankRef(`${acc.bank_name} - ${acc.account_holder_name}`);
                    }
                  }}
                />
                {recBankProfileId && recBankProfileId !== 'custom' && (
                  <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded-lg text-xs grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div>
                      <span className="text-slate-500 block text-[10px]">Account Holder:</span>
                      <span className="font-bold text-slate-800">{recBankAccountName}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px]">Bank Name:</span>
                      <span className="font-semibold text-blue-700">{recBankName}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px]">Account Number:</span>
                      <span className="font-mono text-slate-700">•••• •••• {recBankAccountId.replace(/\s+/g, '').slice(-4)}</span>
                    </div>
                  </div>
                )}
                {recBankProfileId === 'custom' && (
                  <div className="mt-2 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div>
                      <label className="block text-slate-600 text-[10px] mb-0.5">Bank Name</label>
                      <input
                        type="text"
                        value={recBankName}
                        onChange={(e) => setRecBankName(e.target.value)}
                        className="w-full text-xs p-1.5 border border-slate-300 rounded"
                        placeholder="Bank Name"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-slate-600 text-[10px] mb-0.5">Account Holder</label>
                      <input
                        type="text"
                        value={recBankAccountName}
                        onChange={(e) => setRecBankAccountName(e.target.value)}
                        className="w-full text-xs p-1.5 border border-slate-300 rounded"
                        placeholder="Holder Name"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-slate-600 text-[10px] mb-0.5">Account Number</label>
                      <input
                        type="text"
                        value={recBankAccountId}
                        onChange={(e) => setRecBankAccountId(e.target.value)}
                        className="w-full text-xs p-1.5 border border-slate-300 rounded"
                        placeholder="Account Number"
                        required
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

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
