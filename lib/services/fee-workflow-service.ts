import { store } from './data-store';
import { calculateGstBreakdown } from './gst-service';
import {
  StudentFee,
  FeeCategoryItem,
  FeeApprovalHistory,
  FeeRevisionRequest,
  StudentPaymentRecord,
  StudentFinancialLedgerEntry,
  StudentRefundRequest,
  FinanceWorkflowSettings,
  FeeApprovalStatus,
  PaymentVerificationStatus,
  StudentFinancialStatus,
  GlobalFeeCategory,
  FeeReferenceType,
  PaymentMethod,
} from '@/types';

export class FeeWorkflowService {
  /**
   * List all fee categories
   */
  public getFeeCategories(activeOnly = true): FeeCategoryItem[] {
    const list = store.feeCategories || [];
    return activeOnly ? list.filter((c) => c.is_active) : list;
  }

  /**
   * Create or update a configurable fee category
   */
  public createFeeCategory(
    input: Omit<FeeCategoryItem, 'id' | 'created_at'>,
    adminUserId: string
  ): FeeCategoryItem {
    const user = store.users.find((u) => u.id === adminUserId);
    if (user && user.role !== 'admin' && user.role !== 'super_admin' && user.role !== 'accountant') {
      throw new Error('Unauthorized: Only Finance or Admin staff can configure fee categories.');
    }

    const newCategory: FeeCategoryItem = {
      ...input,
      id: `cat-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      created_at: new Date().toISOString(),
    };

    if (!store.feeCategories) store.feeCategories = [];
    store.feeCategories.push(newCategory);
    store.persist();
    return newCategory;
  }

  /**
   * Get student fees with optional filters
   */
  public getStudentFees(filters?: {
    student_id?: string;
    approval_status?: FeeApprovalStatus;
    fee_category?: string;
    reference_type?: FeeReferenceType;
  }): StudentFee[] {
    let fees = [...(store.studentFees || [])];

    if (filters?.student_id) {
      fees = fees.filter((f) => f.student_id === filters.student_id);
    }
    if (filters?.approval_status) {
      fees = fees.filter((f) => f.approval_status === filters.approval_status);
    }
    if (filters?.fee_category) {
      fees = fees.filter((f) => f.fee_category === filters.fee_category);
    }
    if (filters?.reference_type) {
      fees = fees.filter((f) => f.reference_type === filters.reference_type);
    }

    return fees.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  /**
   * Get single student fee by ID
   */
  public getStudentFeeById(feeId: string): StudentFee | undefined {
    return (store.studentFees || []).find((f) => f.id === feeId);
  }

  /**
   * Create a proposed student fee (Counsellor role or Admin)
   */
  public createFeeProposal(
    input: {
      student_id: string;
      fee_category: string;
      reference_type?: FeeReferenceType;
      reference_id?: string;
      course_id?: string;
      batch_id?: string;
      sap_module?: string;
      placement_enrollment_id?: string;
      standard_fee: number;
      proposed_fee?: number;
      discount_amount?: number;
      discount_percentage?: number;
      discount_reason?: string;
      tax_gst_amount?: number;
      additional_charges?: number;
      payment_plan?: 'Full Payment' | '2 Installments' | '3 Installments' | 'Custom';
      number_of_installments?: number;
      first_due_date?: string;
      counsellor_notes?: string;
      auto_submit?: boolean;
    },
    counsellorUserId: string,
    counsellorRole = 'counsellor'
  ): StudentFee {
    const student = store.students.find((s) => s.id === input.student_id);
    if (!student) {
      throw new Error(`Student not found with ID ${input.student_id}`);
    }

    const counsellorUser = store.users.find((u) => u.id === counsellorUserId);
    const counsellorName = counsellorUser?.full_name || 'Counsellor Staff';

    const standard_fee = Number(input.standard_fee) || 0;
    const proposed_fee = input.proposed_fee !== undefined ? Number(input.proposed_fee) : standard_fee;

    let discount_amount = Number(input.discount_amount) || 0;
    let discount_percentage = Number(input.discount_percentage) || 0;

    if (discount_amount > 0 && discount_percentage === 0 && proposed_fee > 0) {
      discount_percentage = Number(((discount_amount / proposed_fee) * 100).toFixed(2));
    } else if (discount_percentage > 0 && discount_amount === 0 && proposed_fee > 0) {
      discount_amount = Number(((proposed_fee * discount_percentage) / 100).toFixed(2));
    }

    const netFee = Math.max(0, proposed_fee - discount_amount);
    // Standard 18% GST calculation unless specified
    const tax_gst_amount =
      input.tax_gst_amount !== undefined
        ? Number(input.tax_gst_amount)
        : Number((netFee * 0.18).toFixed(2));
    const additional_charges = Number(input.additional_charges) || 0;
    const final_payable = netFee + tax_gst_amount + additional_charges;

    // Determine approval level requirement based on discount
    let discount_approval_level: 'Accountant' | 'Finance Manager' | 'Management' = 'Accountant';
    const settings = store.financeSettings;
    if (settings) {
      if (discount_percentage > settings.exceptional_discount_threshold) {
        discount_approval_level = 'Management';
      } else if (discount_percentage > settings.medium_discount_max_percent) {
        discount_approval_level = 'Finance Manager';
      }
    }

    const course = input.course_id
      ? store.courses.find((c) => c.id === input.course_id)
      : store.courses.find((c) => c.id === student.course_id);
    const batch = input.batch_id
      ? store.batches.find((b) => b.id === input.batch_id)
      : store.batches.find((b) => b.id === student.batch_id);

    const feeId = `fee-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();

    const isSubmitted = !!input.auto_submit;
    const status: FeeApprovalStatus = isSubmitted ? 'Pending Accountant Approval' : 'Draft';

    const newFee: StudentFee = {
      id: feeId,
      student_id: student.id,
      student_name: student.full_name,
      student_code: student.student_code || student.id,
      admission_number: student.admission_number,
      fee_category: input.fee_category,
      reference_type: input.reference_type || 'General',
      reference_id: input.reference_id,
      course_id: course?.id,
      course_name: course?.course_name,
      batch_id: batch?.id,
      batch_name: batch?.batch_name,
      sap_module: input.sap_module || student.course_name,
      placement_enrollment_id: input.placement_enrollment_id,

      standard_fee,
      proposed_fee,
      discount_amount,
      discount_percentage,
      discount_reason: input.discount_reason,
      discount_approval_level,
      tax_gst_amount,
      additional_charges,
      final_payable,
      paid_amount: 0,
      outstanding_amount: final_payable,

      payment_plan: input.payment_plan || 'Full Payment',
      number_of_installments: input.number_of_installments || 1,
      first_due_date: input.first_due_date || now.split('T')[0],

      counsellor_id: counsellorUserId,
      counsellor_name: counsellorName,
      counsellor_notes: input.counsellor_notes,

      approval_status: status,
      submitted_by: isSubmitted ? counsellorUserId : undefined,
      submitted_by_name: isSubmitted ? counsellorName : undefined,
      submitted_at: isSubmitted ? now : undefined,

      version: 1,
      is_payable: false,

      created_at: now,
      updated_at: now,
    };

    if (!store.studentFees) store.studentFees = [];
    store.studentFees.unshift(newFee);

    // Record creation history
    this.recordApprovalHistory({
      fee_id: feeId,
      student_id: student.id,
      action: isSubmitted ? 'Submitted' : 'Created',
      actor_id: counsellorUserId,
      actor_name: counsellorName,
      actor_role: counsellorRole,
      new_status: status,
      amount_snapshot: final_payable,
      discount_snapshot: discount_amount,
      notes: isSubmitted
        ? `Fee proposal auto-submitted for accountant approval: ₹${final_payable}`
        : `Fee proposal drafted by ${counsellorName}`,
    });

    store.persist();
    return newFee;
  }

  /**
   * Submit an existing draft or returned fee for Accountant Approval
   */
  public submitFeeForApproval(
    feeId: string,
    counsellorUserId: string,
    notes?: string
  ): StudentFee {
    const fee = this.getStudentFeeById(feeId);
    if (!fee) throw new Error(`Fee with ID ${feeId} not found.`);

    if (fee.approval_status === 'Approved') {
      throw new Error('This fee is already approved and cannot be re-submitted directly. Use Fee Revision.');
    }

    const user = store.users.find((u) => u.id === counsellorUserId);
    const userName = user?.full_name || 'Counsellor';
    const oldStatus = fee.approval_status;
    const now = new Date().toISOString();

    fee.approval_status = 'Pending Accountant Approval';
    fee.submitted_by = counsellorUserId;
    fee.submitted_by_name = userName;
    fee.submitted_at = now;
    if (notes) fee.counsellor_notes = notes;
    fee.updated_at = now;

    this.recordApprovalHistory({
      fee_id: fee.id,
      student_id: fee.student_id,
      action: 'Submitted',
      actor_id: counsellorUserId,
      actor_name: userName,
      actor_role: user?.role || 'counsellor',
      old_status: oldStatus,
      new_status: 'Pending Accountant Approval',
      amount_snapshot: fee.final_payable,
      discount_snapshot: fee.discount_amount,
      notes: notes || 'Submitted for Accountant review and approval',
    });

    store.persist();
    return fee;
  }

  /**
   * Accountant Approves Fee Proposal
   * STRICT SEPARATION OF DUTIES ENFORCED:
   * The user who created or submitted the fee proposal CANNOT approve it!
   */
  public approveFee(
    feeId: string,
    accountantUserId: string,
    notes?: string
  ): StudentFee {
    const fee = this.getStudentFeeById(feeId);
    if (!fee) throw new Error(`Fee with ID ${feeId} not found.`);

    // Strict Separation of Duties check
    if (fee.counsellor_id === accountantUserId || fee.submitted_by === accountantUserId) {
      throw new Error(
        'Separation of duties violation: The creator or submitter of a fee proposal cannot approve their own fee.'
      );
    }

    const accountantUser = store.users.find((u) => u.id === accountantUserId);
    if (
      accountantUser &&
      accountantUser.role !== 'accountant' &&
      accountantUser.role !== 'super_admin'
    ) {
      throw new Error('Unauthorized: Only an Accountant or Finance Director can approve fees.');
    }

    const accountantName = accountantUser?.full_name || 'Accountant Staff';
    const oldStatus = fee.approval_status;
    const now = new Date().toISOString();

    fee.approval_status = 'Approved';
    fee.approved_by = accountantUserId;
    fee.approved_by_name = accountantName;
    fee.approved_at = now;
    fee.approved_fee = fee.proposed_fee;
    fee.approved_discount = fee.discount_amount;
    fee.approved_tax = fee.tax_gst_amount;
    fee.approved_total = fee.final_payable;
    fee.approval_notes = notes || 'Approved by Finance';
    fee.is_payable = true;
    fee.updated_at = now;

    // Create approval history
    this.recordApprovalHistory({
      fee_id: fee.id,
      student_id: fee.student_id,
      action: 'Approved',
      actor_id: accountantUserId,
      actor_name: accountantName,
      actor_role: accountantUser?.role || 'accountant',
      old_status: oldStatus,
      new_status: 'Approved',
      amount_snapshot: fee.final_payable,
      discount_snapshot: fee.discount_amount,
      notes: notes || 'Fee proposal officially approved and marked payable.',
    });

    // Create initial Student Financial Ledger entry (Fee Raised)
    this.recordLedgerEntry({
      student_id: fee.student_id,
      entry_date: now.split('T')[0],
      entry_type: 'Fee Raised',
      fee_category: fee.fee_category,
      reference_type: fee.reference_type,
      reference_id: fee.id,
      debit: fee.final_payable,
      credit: 0,
      description: `Approved ${fee.fee_category} (Gross: ₹${fee.proposed_fee.toLocaleString('en-IN')}, Discount: ₹${fee.discount_amount.toLocaleString('en-IN')}, GST: ₹${fee.tax_gst_amount.toLocaleString('en-IN')})`,
      recorded_by: accountantUserId,
    });

    store.persist();
    return fee;
  }

  /**
   * Accountant Rejects Fee Proposal (requires mandatory reason)
   */
  public rejectFee(
    feeId: string,
    accountantUserId: string,
    reason: string
  ): StudentFee {
    if (!reason || !reason.trim()) {
      throw new Error('A rejection reason is mandatory.');
    }

    const fee = this.getStudentFeeById(feeId);
    if (!fee) throw new Error(`Fee with ID ${feeId} not found.`);

    if (fee.counsellor_id === accountantUserId || fee.submitted_by === accountantUserId) {
      throw new Error('Separation of duties violation: Fee creator cannot reject or approve their own proposal.');
    }

    const accountantUser = store.users.find((u) => u.id === accountantUserId);
    const accountantName = accountantUser?.full_name || 'Accountant Staff';
    const oldStatus = fee.approval_status;
    const now = new Date().toISOString();

    fee.approval_status = 'Rejected';
    fee.rejection_reason = reason;
    fee.is_payable = false;
    fee.updated_at = now;

    this.recordApprovalHistory({
      fee_id: fee.id,
      student_id: fee.student_id,
      action: 'Rejected',
      actor_id: accountantUserId,
      actor_name: accountantName,
      actor_role: accountantUser?.role || 'accountant',
      old_status: oldStatus,
      new_status: 'Rejected',
      amount_snapshot: fee.final_payable,
      discount_snapshot: fee.discount_amount,
      reason: reason,
      notes: `Rejected by ${accountantName}: ${reason}`,
    });

    store.persist();
    return fee;
  }

  /**
   * Accountant Requests Correction from Counsellor
   */
  public requestFeeCorrection(
    feeId: string,
    accountantUserId: string,
    reason: string,
    notes?: string
  ): StudentFee {
    if (!reason || !reason.trim()) {
      throw new Error('A correction reason is mandatory.');
    }

    const fee = this.getStudentFeeById(feeId);
    if (!fee) throw new Error(`Fee with ID ${feeId} not found.`);

    if (fee.counsellor_id === accountantUserId || fee.submitted_by === accountantUserId) {
      throw new Error('Separation of duties violation: Fee creator cannot request correction from themselves.');
    }

    const accountantUser = store.users.find((u) => u.id === accountantUserId);
    const accountantName = accountantUser?.full_name || 'Accountant Staff';
    const oldStatus = fee.approval_status;
    const now = new Date().toISOString();

    fee.approval_status = 'Correction Required';
    fee.correction_reason = reason;
    fee.correction_notes = notes;
    fee.is_payable = false;
    fee.updated_at = now;

    this.recordApprovalHistory({
      fee_id: fee.id,
      student_id: fee.student_id,
      action: 'Correction Requested',
      actor_id: accountantUserId,
      actor_name: accountantName,
      actor_role: accountantUser?.role || 'accountant',
      old_status: oldStatus,
      new_status: 'Correction Required',
      amount_snapshot: fee.final_payable,
      discount_snapshot: fee.discount_amount,
      reason: reason,
      notes: notes,
    });

    store.persist();
    return fee;
  }

  /**
   * Counsellor updates and resubmits a returned fee proposal
   */
  public updateAndResubmitFee(
    feeId: string,
    counsellorUserId: string,
    updates: {
      proposed_fee?: number;
      discount_amount?: number;
      discount_percentage?: number;
      discount_reason?: string;
      tax_gst_amount?: number;
      additional_charges?: number;
      counsellor_notes?: string;
      payment_plan?: 'Full Payment' | '2 Installments' | '3 Installments' | 'Custom';
      first_due_date?: string;
    }
  ): StudentFee {
    const fee = this.getStudentFeeById(feeId);
    if (!fee) throw new Error(`Fee with ID ${feeId} not found.`);

    if (fee.approval_status === 'Approved') {
      throw new Error('Cannot directly edit an approved fee. Please raise a Fee Revision Request.');
    }

    const proposed_fee = updates.proposed_fee !== undefined ? Number(updates.proposed_fee) : fee.proposed_fee;
    let discount_amount = updates.discount_amount !== undefined ? Number(updates.discount_amount) : fee.discount_amount;
    let discount_percentage = updates.discount_percentage !== undefined ? Number(updates.discount_percentage) : fee.discount_percentage;

    if (updates.discount_amount !== undefined && updates.discount_percentage === undefined && proposed_fee > 0) {
      discount_percentage = Number(((discount_amount / proposed_fee) * 100).toFixed(2));
    } else if (updates.discount_percentage !== undefined && updates.discount_amount === undefined && proposed_fee > 0) {
      discount_amount = Number(((proposed_fee * discount_percentage) / 100).toFixed(2));
    }

    const netFee = Math.max(0, proposed_fee - discount_amount);
    const tax_gst_amount =
      updates.tax_gst_amount !== undefined
        ? Number(updates.tax_gst_amount)
        : Number((netFee * 0.18).toFixed(2));
    const additional_charges =
      updates.additional_charges !== undefined
        ? Number(updates.additional_charges)
        : fee.additional_charges;
    const final_payable = netFee + tax_gst_amount + additional_charges;

    const counsellorUser = store.users.find((u) => u.id === counsellorUserId);
    const counsellorName = counsellorUser?.full_name || fee.counsellor_name;
    const now = new Date().toISOString();

    fee.proposed_fee = proposed_fee;
    fee.discount_amount = discount_amount;
    fee.discount_percentage = discount_percentage;
    if (updates.discount_reason) fee.discount_reason = updates.discount_reason;
    fee.tax_gst_amount = tax_gst_amount;
    fee.additional_charges = additional_charges;
    fee.final_payable = final_payable;
    fee.outstanding_amount = final_payable - fee.paid_amount;
    if (updates.payment_plan) fee.payment_plan = updates.payment_plan;
    if (updates.first_due_date) fee.first_due_date = updates.first_due_date;
    if (updates.counsellor_notes) fee.counsellor_notes = updates.counsellor_notes;

    fee.approval_status = 'Pending Accountant Approval';
    fee.submitted_by = counsellorUserId;
    fee.submitted_by_name = counsellorName;
    fee.submitted_at = now;
    fee.updated_at = now;

    this.recordApprovalHistory({
      fee_id: fee.id,
      student_id: fee.student_id,
      action: 'Submitted',
      actor_id: counsellorUserId,
      actor_name: counsellorName,
      actor_role: counsellorUser?.role || 'counsellor',
      old_status: 'Correction Required',
      new_status: 'Pending Accountant Approval',
      amount_snapshot: final_payable,
      discount_snapshot: discount_amount,
      notes: `Resubmitted after corrections by ${counsellorName}`,
    });

    store.persist();
    return fee;
  }

  /**
   * Request a revision on an already Approved Fee
   */
  public createFeeRevisionRequest(
    feeId: string,
    requestedByUserId: string,
    revisionType: FeeRevisionRequest['revision_type'],
    justification: string,
    proposedChanges: Partial<StudentFee>
  ): FeeRevisionRequest {
    const fee = this.getStudentFeeById(feeId);
    if (!fee) throw new Error(`Fee with ID ${feeId} not found.`);

    if (fee.approval_status !== 'Approved') {
      throw new Error('Revisions can only be requested on already approved fees.');
    }

    const user = store.users.find((u) => u.id === requestedByUserId);
    const userName = user?.full_name || 'Staff User';

    const revision: FeeRevisionRequest = {
      id: `rev-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      original_fee_id: fee.id,
      student_id: fee.student_id,
      student_name: fee.student_name,
      revision_type: revisionType,
      requested_by: requestedByUserId,
      requested_by_name: userName,
      requested_at: new Date().toISOString(),
      justification,
      proposed_changes: proposedChanges,
      status: 'Pending Review',
      created_at: new Date().toISOString(),
    };

    if (!store.feeRevisionRequests) store.feeRevisionRequests = [];
    store.feeRevisionRequests.unshift(revision);
    store.persist();
    return revision;
  }

  /**
   * Accountant Approves a Fee Revision
   */
  public approveFeeRevision(
    revisionId: string,
    accountantUserId: string,
    reviewNotes?: string
  ): { originalFee: StudentFee; newFee: StudentFee; revision: FeeRevisionRequest } {
    const revision = (store.feeRevisionRequests || []).find((r) => r.id === revisionId);
    if (!revision) throw new Error(`Revision request ${revisionId} not found.`);

    if (revision.requested_by === accountantUserId) {
      throw new Error('Separation of duties violation: Submitter cannot approve their own revision request.');
    }

    const originalFee = this.getStudentFeeById(revision.original_fee_id);
    if (!originalFee) throw new Error(`Original fee ${revision.original_fee_id} not found.`);

    const accountantUser = store.users.find((u) => u.id === accountantUserId);
    const accountantName = accountantUser?.full_name || 'Accountant';
    const now = new Date().toISOString();

    // Mark original fee as Superseded
    originalFee.approval_status = 'Superseded';
    originalFee.is_payable = false;
    originalFee.updated_at = now;

    // Create new version fee
    const newVersionFee: StudentFee = {
      ...originalFee,
      ...revision.proposed_changes,
      id: `fee-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      version: originalFee.version + 1,
      parent_fee_id: originalFee.id,
      approval_status: 'Approved',
      approved_by: accountantUserId,
      approved_by_name: accountantName,
      approved_at: now,
      is_payable: true,
      created_at: now,
      updated_at: now,
    };

    if (!store.studentFees) store.studentFees = [];
    store.studentFees.unshift(newVersionFee);

    revision.status = 'Approved';
    revision.reviewed_by = accountantUserId;
    revision.reviewed_by_name = accountantName;
    revision.reviewed_at = now;
    revision.review_notes = reviewNotes;

    // Ledger adjustment entry
    const delta = newVersionFee.final_payable - originalFee.final_payable;
    if (delta !== 0) {
      this.recordLedgerEntry({
        student_id: originalFee.student_id,
        entry_date: now.split('T')[0],
        entry_type: 'Fee Adjustment',
        fee_category: originalFee.fee_category,
        reference_type: originalFee.reference_type,
        reference_id: newVersionFee.id,
        debit: delta > 0 ? delta : 0,
        credit: delta < 0 ? Math.abs(delta) : 0,
        description: `Fee Revision ${revision.revision_type}: adjusted by ₹${Math.abs(delta).toLocaleString('en-IN')}`,
        recorded_by: accountantUserId,
      });
    }

    store.persist();
    return { originalFee, newFee: newVersionFee, revision };
  }

  /**
   * Record Fee Payment
   * Strict Rule: Non-approved fees CANNOT receive payments!
   * Non-accountants create payments with 'Pending Verification'
   * Accountants can record direct verified payments.
   */
  public recordPayment(
    input: {
      fee_id: string;
      amount_paid: number;
      payment_mode: PaymentMethod;
      payment_date?: string;
      transaction_reference?: string;
      bank_upi_reference?: string;
      payment_proof_url?: string;
      notes?: string;
      installment_id?: string;
    },
    recorderUserId: string,
    recorderRole = 'counsellor'
  ): StudentPaymentRecord {
    const fee = this.getStudentFeeById(input.fee_id);
    if (!fee) throw new Error(`Fee with ID ${input.fee_id} not found.`);

    if (!fee.is_payable || fee.approval_status !== 'Approved') {
      throw new Error(
        `Cannot record payment: This fee is in status "${fee.approval_status}" and is not approved by Finance.`
      );
    }

    const amountPaid = Number(input.amount_paid);
    if (isNaN(amountPaid) || amountPaid <= 0) {
      throw new Error('Payment amount must be greater than zero.');
    }

    const recorderUser = store.users.find((u) => u.id === recorderUserId);
    const recorderName = recorderUser?.full_name || 'Staff User';
    const now = new Date().toISOString();
    const paymentDate = input.payment_date || now.split('T')[0];

    // Determine verification status based on role and settings
    const isAccountant = recorderRole === 'accountant' || recorderRole === 'super_admin';
    const verificationStatus: PaymentVerificationStatus = isAccountant
      ? 'Verified'
      : 'Pending Verification';

    const paymentId = `spr-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

    const paymentRecord: StudentPaymentRecord = {
      id: paymentId,
      fee_id: fee.id,
      installment_id: input.installment_id,
      student_id: fee.student_id,
      student_name: fee.student_name,
      admission_number: fee.admission_number,
      fee_category: fee.fee_category,
      amount_paid: amountPaid,
      payment_date: paymentDate,
      payment_mode: input.payment_mode,
      transaction_reference: input.transaction_reference,
      bank_upi_reference: input.bank_upi_reference,
      payment_proof_url: input.payment_proof_url,
      notes: input.notes,
      recorded_by: recorderUserId,
      recorded_by_name: recorderName,
      recorded_by_role: recorderRole,
      verification_status: verificationStatus,
      verified_by: isAccountant ? recorderUserId : undefined,
      verified_by_name: isAccountant ? recorderName : undefined,
      verified_at: isAccountant ? now : undefined,
      created_at: now,
    };

    if (!store.studentPayments) store.studentPayments = [];
    store.studentPayments.unshift(paymentRecord);

    // If accountant recorded directly, complete the financial clearing & receipt generation
    if (isAccountant) {
      this.finalizeVerifiedPayment(paymentRecord, fee, recorderUserId, recorderName);
    }

    store.persist();
    return paymentRecord;
  }

  /**
   * Accountant Verifies a Pending Payment
   * Strict Rule: Separation of duties check
   */
  public verifyPayment(
    paymentId: string,
    accountantUserId: string,
    verificationNotes?: string
  ): StudentPaymentRecord {
    const payment = (store.studentPayments || []).find((p) => p.id === paymentId);
    if (!payment) throw new Error(`Payment with ID ${paymentId} not found.`);

    if (payment.verification_status === 'Verified') {
      throw new Error('This payment has already been verified.');
    }

    // Separation of duties: If recorded by a counsellor/staff who happens to be this user, enforce check
    if (payment.recorded_by === accountantUserId && payment.recorded_by_role !== 'accountant') {
      throw new Error('Separation of duties violation: Payment recorder cannot verify their own payment entry.');
    }

    const accountantUser = store.users.find((u) => u.id === accountantUserId);
    if (
      accountantUser &&
      accountantUser.role !== 'accountant' &&
      accountantUser.role !== 'super_admin'
    ) {
      throw new Error('Unauthorized: Only an Accountant can verify student payments.');
    }

    const fee = this.getStudentFeeById(payment.fee_id);
    if (!fee) throw new Error(`Associated fee ${payment.fee_id} not found.`);

    const accountantName = accountantUser?.full_name || 'Accountant';
    const now = new Date().toISOString();

    payment.verification_status = 'Verified';
    payment.verified_by = accountantUserId;
    payment.verified_by_name = accountantName;
    payment.verified_at = now;
    payment.verification_notes = verificationNotes;

    this.finalizeVerifiedPayment(payment, fee, accountantUserId, accountantName);

    store.persist();
    return payment;
  }

  /**
   * Accountant Rejects a Payment Entry
   */
  public rejectPayment(
    paymentId: string,
    accountantUserId: string,
    rejectionReason: string
  ): StudentPaymentRecord {
    if (!rejectionReason || !rejectionReason.trim()) {
      throw new Error('A rejection reason is mandatory.');
    }

    const payment = (store.studentPayments || []).find((p) => p.id === paymentId);
    if (!payment) throw new Error(`Payment with ID ${paymentId} not found.`);

    if (payment.verification_status === 'Verified') {
      throw new Error('Cannot reject an already verified payment. Please process a refund or adjustment note.');
    }

    const accountantUser = store.users.find((u) => u.id === accountantUserId);
    const accountantName = accountantUser?.full_name || 'Accountant';

    payment.verification_status = 'Rejected';
    payment.verification_notes = `Rejected by ${accountantName}: ${rejectionReason}`;

    store.persist();
    return payment;
  }

  /**
   * Finalize a verified payment: update fee paid/outstanding, ledger, and issue GST receipt
   */
  private finalizeVerifiedPayment(
    payment: StudentPaymentRecord,
    fee: StudentFee,
    verifierUserId: string,
    verifierName: string
  ): void {
    const now = new Date().toISOString();

    // 1. Update StudentFee balances
    fee.paid_amount = Number((fee.paid_amount + payment.amount_paid).toFixed(2));
    fee.outstanding_amount = Math.max(0, Number((fee.final_payable - fee.paid_amount).toFixed(2)));
    fee.updated_at = now;

    // 2. Generate Official Receipt
    const receiptNumber = `REC-${new Date().getFullYear()}-${String(
      (store.receipts?.length || 0) + 1
    ).padStart(4, '0')}`;
    payment.receipt_number = receiptNumber;

    const student = store.students.find((s) => s.id === fee.student_id);
    const studentLocation =
      student?.state_code || student?.state || student?.address || 'Telangana (36)';

    const gstBreakdown = calculateGstBreakdown(payment.amount_paid, studentLocation, {
      customDocNumber: receiptNumber,
      customDocDate: payment.payment_date,
      instituteGstin: store.settings?.gst_number || '36AAACN1234F1Z8',
      instituteStateCode: '36',
    });

    const receipt = {
      id: `rcpt-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      receipt_number: receiptNumber,
      payment_id: payment.id,
      student_id: fee.student_id,
      student_name: fee.student_name,
      admission_number: fee.admission_number,
      course_name: fee.course_name || fee.sap_module || fee.fee_category,
      payment_amount: payment.amount_paid,
      payment_mode: payment.payment_mode,
      transaction_reference: payment.transaction_reference || payment.bank_upi_reference || 'N/A',
      payment_date: payment.payment_date,
      remaining_balance: fee.outstanding_amount,
      authorized_by: verifierName,
      institute_name: store.settings?.institute_name || 'Next-Gen ERP Solutions',
      institute_address:
        store.settings?.address || 'Plot 42, Silicon Valley Towers, Hitec City, Hyderabad 500081',
      institute_phone: store.settings?.phone || '+91 98765 43210',
      institute_gst: store.settings?.gst_number || '36AAACN1234F1Z8',
      supply_type: gstBreakdown.supply_type,
      place_of_supply: gstBreakdown.place_of_supply,
      place_of_supply_code: gstBreakdown.place_of_supply_code,
      sac_code: gstBreakdown.sac_code,
      taxable_amount: gstBreakdown.taxable_amount,
      cgst_rate: gstBreakdown.cgst_rate,
      cgst_amount: gstBreakdown.cgst_amount,
      sgst_rate: gstBreakdown.sgst_rate,
      sgst_amount: gstBreakdown.sgst_amount,
      igst_rate: gstBreakdown.igst_rate,
      igst_amount: gstBreakdown.igst_amount,
      total_tax: gstBreakdown.total_tax,
      is_reverse_charge: false,
      irn: gstBreakdown.irn,
      ack_no: gstBreakdown.ack_no,
      ack_date: gstBreakdown.ack_date,
      created_at: now,
    };

    if (!store.receipts) store.receipts = [];
    store.receipts.push(receipt);

    // 3. Post to Student Financial Ledger
    this.recordLedgerEntry({
      student_id: fee.student_id,
      entry_date: payment.payment_date,
      entry_type: 'Payment Verified',
      fee_category: fee.fee_category,
      reference_type: fee.reference_type,
      reference_id: payment.id,
      debit: 0,
      credit: payment.amount_paid,
      description: `Verified ${payment.payment_mode} payment (${receiptNumber}) for ${fee.fee_category}`,
      recorded_by: verifierUserId,
      receipt_id: receipt.id,
    });
  }

  /**
   * Process Student Refund Request
   */
  public requestRefund(input: {
    student_id: string;
    fee_id: string;
    payment_id: string;
    refund_amount: number;
    refund_reason: string;
    requested_by: string;
  }): StudentRefundRequest {
    const student = store.students.find((s) => s.id === input.student_id);
    if (!student) throw new Error('Student not found.');

    const user = store.users.find((u) => u.id === input.requested_by);
    const now = new Date().toISOString();

    const refund: StudentRefundRequest = {
      id: `ref-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      student_id: student.id,
      student_name: student.full_name,
      fee_id: input.fee_id,
      payment_id: input.payment_id,
      refund_amount: input.refund_amount,
      refund_reason: input.refund_reason,
      requested_by: input.requested_by,
      requested_by_name: user?.full_name || 'Staff',
      requested_at: now,
      status: 'Requested',
      created_at: now,
    };

    if (!store.studentRefunds) store.studentRefunds = [];
    store.studentRefunds.unshift(refund);
    store.persist();
    return refund;
  }

  /**
   * Approve & Process Student Refund
   */
  public processRefund(
    refundId: string,
    accountantUserId: string,
    transactionReference: string
  ): StudentRefundRequest {
    const refund = (store.studentRefunds || []).find((r) => r.id === refundId);
    if (!refund) throw new Error(`Refund ${refundId} not found.`);

    if (refund.requested_by === accountantUserId) {
      throw new Error('Separation of duties violation: Submitter cannot approve their own refund request.');
    }

    const user = store.users.find((u) => u.id === accountantUserId);
    const now = new Date().toISOString();

    refund.status = 'Processed';
    refund.approved_by = accountantUserId;
    refund.approved_by_name = user?.full_name || 'Accountant';
    refund.approved_at = now;
    refund.processed_by = accountantUserId;
    refund.processed_by_name = user?.full_name || 'Accountant';
    refund.processed_at = now;
    refund.transaction_reference = transactionReference;

    // Post refund to financial ledger
    this.recordLedgerEntry({
      student_id: refund.student_id,
      entry_date: now.split('T')[0],
      entry_type: 'Refund Processed',
      fee_category: 'Refund',
      reference_type: 'General',
      reference_id: refund.id,
      debit: refund.refund_amount,
      credit: 0,
      description: `Refund processed: ${refund.refund_reason} (Txn: ${transactionReference})`,
      recorded_by: accountantUserId,
    });

    store.persist();
    return refund;
  }

  /**
   * Get Student Financial Summary & Clearance
   */
  public getStudentFinancialSummary(studentId: string): {
    student_id: string;
    student_name: string;
    total_approved_fees: number;
    total_paid_verified: number;
    total_pending_verification: number;
    outstanding_balance: number;
    status: StudentFinancialStatus;
    fees: StudentFee[];
    payments: StudentPaymentRecord[];
    ledger_entries: StudentFinancialLedgerEntry[];
    is_cleared: boolean;
  } {
    const student = store.students.find((s) => s.id === studentId);
    const fees = (store.studentFees || []).filter((f) => f.student_id === studentId);
    const payments = (store.studentPayments || []).filter((p) => p.student_id === studentId);
    const ledger = this.getStudentLedgerEntries(studentId);

    const approvedFees = fees.filter((f) => f.approval_status === 'Approved');
    const totalApprovedFees = approvedFees.reduce((acc, curr) => acc + curr.final_payable, 0);

    const verifiedPayments = payments.filter((p) => p.verification_status === 'Verified');
    const totalPaidVerified = verifiedPayments.reduce((acc, curr) => acc + curr.amount_paid, 0);

    const pendingPayments = payments.filter(
      (p) => p.verification_status === 'Pending Verification'
    );
    const totalPendingVerification = pendingPayments.reduce(
      (acc, curr) => acc + curr.amount_paid,
      0
    );

    const outstandingBalance = Math.max(0, totalApprovedFees - totalPaidVerified);

    let status: StudentFinancialStatus = 'No Fee Created';
    if (fees.length === 0) {
      status = 'No Fee Created';
    } else if (approvedFees.length === 0 && fees.some((f) => f.approval_status === 'Pending Accountant Approval')) {
      status = 'Approval Pending';
    } else if (totalPendingVerification > 0 && outstandingBalance <= totalPendingVerification) {
      status = 'Payment Verification Pending';
    } else if (outstandingBalance === 0 && totalApprovedFees > 0) {
      status = 'Financially Cleared';
    } else if (totalPaidVerified > 0) {
      status = 'Partially Paid';
    } else if (approvedFees.length > 0) {
      status = 'Payment Pending';
    }

    const isCleared = outstandingBalance === 0 && totalApprovedFees > 0;

    return {
      student_id: studentId,
      student_name: student?.full_name || 'Student',
      total_approved_fees: totalApprovedFees,
      total_paid_verified: totalPaidVerified,
      total_pending_verification: totalPendingVerification,
      outstanding_balance: outstandingBalance,
      status,
      fees,
      payments,
      ledger_entries: ledger,
      is_cleared: isCleared,
    };
  }

  /**
   * Universal Financial Clearance Gate for Placement, Certificates, Exams, etc.
   */
  public checkFinancialClearance(
    studentId: string,
    module?: 'course_access' | 'placement_eligibility' | 'certificate_generation' | 'exam_access' | 'project_access' | 'batch_transfer'
  ): {
    is_cleared: boolean;
    outstanding_balance: number;
    total_approved_fees: number;
    total_paid_verified: number;
    reasons: string[];
  } {
    const summary = this.getStudentFinancialSummary(studentId);
    const settings = store.financeSettings;

    const reasons: string[] = [];

    // Check if clearance rule is enabled for this module
    const isRuleActive =
      !module || !settings?.clearance_rules || settings.clearance_rules[module] !== false;

    if (summary.total_approved_fees === 0) {
      reasons.push('No approved fee plan has been configured by Finance.');
    } else if (summary.outstanding_balance > 0) {
      reasons.push(
        `Outstanding balance of ₹${summary.outstanding_balance.toLocaleString('en-IN')} pending settlement.`
      );
    }

    if (summary.total_pending_verification > 0) {
      reasons.push(
        `Payment of ₹${summary.total_pending_verification.toLocaleString('en-IN')} is awaiting Accountant verification.`
      );
    }

    const isCleared = isRuleActive ? summary.outstanding_balance === 0 && summary.total_approved_fees > 0 : true;

    return {
      is_cleared: isCleared,
      outstanding_balance: summary.outstanding_balance,
      total_approved_fees: summary.total_approved_fees,
      total_paid_verified: summary.total_paid_verified,
      reasons,
    };
  }

  /**
   * Get Student Financial Ledger with computed running balance
   */
  public getStudentLedgerEntries(studentId: string): StudentFinancialLedgerEntry[] {
    const entries = [...(store.studentFinancialLedgers || [])]
      .filter((e) => e.student_id === studentId)
      .sort((a, b) => new Date(a.entry_date).getTime() - new Date(b.entry_date).getTime());

    let runningBalance = 0;
    return entries.map((e) => {
      runningBalance += e.debit - e.credit;
      return {
        ...e,
        running_balance: runningBalance,
      };
    });
  }

  /**
   * Internal Helper: Append to Student Financial Ledger
   */
  private recordLedgerEntry(entry: {
    student_id: string;
    entry_date: string;
    entry_type: StudentFinancialLedgerEntry['entry_type'];
    fee_category: string;
    reference_type: string;
    reference_id: string;
    debit: number;
    credit: number;
    description: string;
    recorded_by: string;
    receipt_id?: string;
  }): StudentFinancialLedgerEntry {
    const id = `sfl-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const newEntry: StudentFinancialLedgerEntry = {
      id,
      ...entry,
      running_balance: 0, // Computed dynamically in getStudentLedgerEntries
      created_at: new Date().toISOString(),
    };

    if (!store.studentFinancialLedgers) store.studentFinancialLedgers = [];
    store.studentFinancialLedgers.push(newEntry);
    return newEntry;
  }

  /**
   * Internal Helper: Append to Fee Approval History
   */
  private recordApprovalHistory(history: {
    fee_id: string;
    student_id: string;
    action: FeeApprovalHistory['action'];
    actor_id: string;
    actor_name: string;
    actor_role: string;
    old_status?: FeeApprovalStatus;
    new_status: FeeApprovalStatus;
    amount_snapshot: number;
    discount_snapshot: number;
    reason?: string;
    notes?: string;
  }): void {
    const id = `fah-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const historyItem: FeeApprovalHistory = {
      id,
      ...history,
      timestamp: new Date().toISOString(),
    };

    if (!store.feeApprovalHistories) store.feeApprovalHistories = [];
    store.feeApprovalHistories.push(historyItem);
  }
}

export const feeWorkflowService = new FeeWorkflowService();
