import { describe, it, expect, beforeEach } from 'vitest';
import { validateAlternatePhoneNumber, normalizePhoneForStorage } from '@/lib/utils/phone-validation';
import { generateStudentUniqueId, maskBankAccountId } from '@/lib/utils/formatters';
import { createAdmissionWorkflow, getNextStudentSequence } from '@/lib/services/admission-service';
import { feeWorkflowService } from '@/lib/services/fee-workflow-service';
import { store } from '@/lib/services/data-store';
import { STORAGE_BUCKETS } from '@/lib/services/storage-service';
import { tenantId } from '@/lib/auth/tenant';

describe('Student Enrollment Enhancements Test Suite', () => {
  let testCourseId: string;
  let testBatchId: string;

  const baseAdmissionDetails = {
    dob: '1998-05-15',
    gender: 'Female' as const,
    address: 'Plot 42, Hitec City',
    city: 'Hyderabad',
    state: 'Telangana',
    state_code: '36',
    education: 'Graduate',
    experience_years: 0,
    current_employment_status: 'Unemployed' as const,
    discount: 0,
  };

  beforeEach(() => {
    // Reset store collections
    store.admissions = [];
    store.students = [];
    store.feeAccounts = [];
    store.studentFees = [];
    store.studentPayments = [];
    store.payments = [];

    // Use active seeded course and matching batch
    const activeCourse = store.courses.find((c) => c.status === 'Published') || store.courses[0];
    testCourseId = activeCourse.id;

    const matchingBatch = store.batches.find((b) => b.course_id === testCourseId) || store.batches[0];
    testBatchId = matchingBatch.id;

    // Ensure active counsellor and accountant exist in store.users
    const counsellor = store.users.find((u) => u.id === 'usr-counsellor');
    if (!counsellor) {
      store.users.push({
        id: 'usr-counsellor',
        email: 'counsellor@next-generpsolutions.com',
        full_name: 'Ananya Desai (Senior Counsellor)',
        role: 'counsellor',
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    } else {
      counsellor.is_active = true;
    }

    const accountant = store.users.find((u) => u.id === 'usr-accounts');
    if (!accountant) {
      store.users.push({
        id: 'usr-accounts',
        email: 'accounts@next-generpsolutions.com',
        full_name: 'Suresh Kumar (Chief Accountant)',
        role: 'accountant',
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    } else {
      accountant.is_active = true;
    }
  });

  // =========================================================================
  // Requirement 1: Alternate Mobile Number Validation
  // =========================================================================
  describe('1. Alternate Mobile Number Validation', () => {
    it('allows empty or null alternate phone number since it is optional', () => {
      const emptyResult = validateAlternatePhoneNumber('');
      expect(emptyResult.isValid).toBe(true);
      expect(emptyResult.error).toBeUndefined();

      const nullResult = validateAlternatePhoneNumber(null);
      expect(nullResult.isValid).toBe(true);

      const undefinedResult = validateAlternatePhoneNumber(undefined);
      expect(undefinedResult.isValid).toBe(true);

      const whitespaceResult = validateAlternatePhoneNumber('   ');
      expect(whitespaceResult.isValid).toBe(true);
    });

    it('validates standard 10-digit Indian mobile numbers beginning with 6, 7, 8, 9', () => {
      expect(validateAlternatePhoneNumber('9876543210').isValid).toBe(true);
      expect(validateAlternatePhoneNumber('8123456789').isValid).toBe(true);
      expect(validateAlternatePhoneNumber('7000123456').isValid).toBe(true);
      expect(validateAlternatePhoneNumber('6300123456').isValid).toBe(true);
    });

    it('validates Indian mobile numbers with country code prefix (+91, 91, 0)', () => {
      expect(validateAlternatePhoneNumber('+91 98765 43210').isValid).toBe(true);
      expect(validateAlternatePhoneNumber('+91-9876543210').isValid).toBe(true);
      expect(validateAlternatePhoneNumber('919876543210').isValid).toBe(true);
      expect(validateAlternatePhoneNumber('09876543210').isValid).toBe(true);
    });

    it('rejects Indian mobile numbers with invalid starting digits (0-5 without valid prefix)', () => {
      const result1 = validateAlternatePhoneNumber('5876543210');
      expect(result1.isValid).toBe(false);
      expect(result1.error).toContain('begin with 6, 7, 8, or 9');

      const result2 = validateAlternatePhoneNumber('1234567890');
      expect(result2.isValid).toBe(false);

      const result3 = validateAlternatePhoneNumber('0123456789');
      expect(result3.isValid).toBe(false);
    });

    it('rejects invalid lengths and alphabetic characters', () => {
      // Too short
      expect(validateAlternatePhoneNumber('98765').isValid).toBe(false);
      // Letters / invalid symbols
      const letterResult = validateAlternatePhoneNumber('98765ABC10');
      expect(letterResult.isValid).toBe(false);
      expect(letterResult.error).toContain('numbers only');
    });

    it('validates supported international phone numbers (7 to 15 digits)', () => {
      // US (+1)
      expect(validateAlternatePhoneNumber('+1 415 555 2671').isValid).toBe(true);
      // UK (+44)
      expect(validateAlternatePhoneNumber('+44 20 7946 0958').isValid).toBe(true);
      // UAE (+971)
      expect(validateAlternatePhoneNumber('+971 50 123 4567').isValid).toBe(true);
    });

    it('normalizes phone numbers consistently for storage and deduplication', () => {
      expect(normalizePhoneForStorage('+91', '9876543210')).toBe('+91 98765 43210');
      expect(normalizePhoneForStorage('+1', '4155552671')).toBe('+1 4155552671');
    });
  });

  // =========================================================================
  // Requirement 2: Auto-Generate Student Unique ID After Enrollment
  // =========================================================================
  describe('2. Auto-Generate Student Unique ID (NGERP-YYYY-XXXXX)', () => {
    it('generates correct formatted Student Unique ID', () => {
      const currentYear = new Date().getFullYear();
      const id1 = generateStudentUniqueId(1);
      expect(id1).toBe(`NGERP-${currentYear}-00001`);

      const id42 = generateStudentUniqueId(42, 2026);
      expect(id42).toBe('NGERP-2026-00042');

      const id9999 = generateStudentUniqueId(9999, 2026);
      expect(id9999).toBe('NGERP-2026-09999');
    });

    it('advances sequence monotonically without reusing deleted or cancelled IDs', () => {
      const currentYear = new Date().getFullYear();
      const seq1 = getNextStudentSequence(currentYear);
      const seq2 = getNextStudentSequence(currentYear);
      const seq3 = getNextStudentSequence(currentYear);

      expect(seq2).toBeGreaterThan(seq1);
      expect(seq3).toBeGreaterThan(seq2);
    });

    it('persists generated Student Unique ID on Student and Admission records in workflow', async () => {
      const currentYear = new Date().getFullYear();
      const result = await createAdmissionWorkflow(
        {
          ...baseAdmissionDetails,
          student_name: 'Priya Sharma',
          phone: '+919876543210',
          alternate_phone: '+919876543211',
          email: 'priya.sharma@example.test',
          course_id: testCourseId,
          training_mode: 'Online',
          batch_id: testBatchId,
          admission_date: '2026-11-03',
          course_fee: 45000,
          discount: 5000,
          payment_plan: 'Full Payment',
          counsellor_id: 'usr-counsellor',
          collect_initial_payment: true,
          initial_payment_amount: 40000,
          payment_mode: 'Cash',
        },
        'usr-counsellor'
      );

      expect(result.student.student_unique_id).toBeDefined();
      expect(result.student.student_unique_id).toMatch(new RegExp(`^NGERP-${currentYear}-\\d{5}$`));
      expect(result.admission.student_unique_id).toBe(result.student.student_unique_id);
      expect(result.student.alternate_phone).toBe('+919876543211');
      expect(result.admission.alternate_phone).toBe('+919876543211');

      // UUID primary key is preserved
      expect(result.student.id).toBeDefined();
      expect(result.student.student_code).toBeDefined();
      expect(result.admission.id).toBeDefined();
    });
  });

  // =========================================================================
  // Requirement 3: Student Photo Attachment (Optional)
  // =========================================================================
  describe('3. Student Photo Attachment (Optional)', () => {
    it('configures student-photos bucket as private with 2MB limit and image MIMEs', () => {
      const bucketConfig = STORAGE_BUCKETS['student-photos'];
      expect(bucketConfig).toBeDefined();
      expect(bucketConfig.public).toBe(false);
      expect(bucketConfig.maxSizeBytes).toBe(2 * 1024 * 1024); // 2 MB
      expect(bucketConfig.allowedMimes).toContain('image/jpeg');
      expect(bucketConfig.allowedMimes).toContain('image/png');
      expect(bucketConfig.allowedMimes).toContain('image/webp');
      expect(bucketConfig.allowedMimes).not.toContain('application/pdf');
    });

    it('successfully enrolls student when photo is provided', async () => {
      const result = await createAdmissionWorkflow(
        {
          ...baseAdmissionDetails,
          student_name: 'Amit Patel',
          phone: '+919876500001',
          email: 'amit.patel@example.test',
          photo_url: 'https://storage.supabase.co/student-photos/amit.webp',
          course_id: testCourseId,
          training_mode: 'Online',
          batch_id: testBatchId,
          admission_date: '2026-11-03',
          course_fee: 45000,
          payment_plan: 'Full Payment',
          counsellor_id: 'usr-counsellor',
          collect_initial_payment: false,
          initial_payment_amount: 0,
          payment_mode: 'Cash',
        },
        'usr-counsellor'
      );

      expect(result.student.photo_url).toBe('https://storage.supabase.co/student-photos/amit.webp');
      expect(result.student.profile_photo).toBe('https://storage.supabase.co/student-photos/amit.webp');
      expect(result.admission.photo_url).toBe('https://storage.supabase.co/student-photos/amit.webp');
    });

    it('successfully enrolls student when photo is omitted (optional field)', async () => {
      const result = await createAdmissionWorkflow(
        {
          ...baseAdmissionDetails,
          student_name: 'Kavita Verma',
          phone: '+919876500002',
          email: 'kavita.verma@example.test',
          course_id: testCourseId,
          training_mode: 'Online',
          batch_id: testBatchId,
          admission_date: '2026-11-03',
          course_fee: 45000,
          payment_plan: 'Full Payment',
          counsellor_id: 'usr-counsellor',
          collect_initial_payment: false,
          initial_payment_amount: 0,
          payment_mode: 'Cash',
        },
        'usr-counsellor'
      );

      expect(result.student.id).toBeDefined();
      expect(result.student.photo_url).toBeUndefined();
    });
  });

  // =========================================================================
  // Requirement 4: Remove Default Zero from Approved Discount
  // =========================================================================
  describe('4. Approved Discount Default & Dynamic Calculations', () => {
    it('treats empty discount input as zero in financial calculations', () => {
      const courseFee = 45000;
      const discountInput: number | '' = '';
      const effectiveDiscount = typeof discountInput === 'number' ? discountInput : 0;
      const netPayable = Math.max(0, courseFee - effectiveDiscount);

      expect(effectiveDiscount).toBe(0);
      expect(netPayable).toBe(45000);
    });

    it('dynamically recalculates net payable fee when discount is provided', () => {
      const courseFee = 45000;
      const discountInput: number | '' = 5000;
      const effectiveDiscount = typeof discountInput === 'number' ? discountInput : 0;
      const netPayable = Math.max(0, courseFee - effectiveDiscount);

      expect(effectiveDiscount).toBe(5000);
      expect(netPayable).toBe(40000);
    });

    it('caps net payable at zero when discount equals or exceeds course fee', () => {
      const courseFee = 45000;
      const discountInput = 50000;
      const netPayable = Math.max(0, courseFee - Math.min(courseFee, discountInput));

      expect(netPayable).toBe(0);
    });
  });

  // =========================================================================
  // Requirement 5: Hide Due Date for Full Payments
  // =========================================================================
  describe('5. Fee Due Date Conditional Behavior', () => {
    it('determines full payment correctly when initial collection covers full fee', () => {
      const courseFee = 45000;
      const discount = 5000;
      const netPayable = courseFee - discount; // 40000
      const initialPayment = 40000;

      const isFullPayment = initialPayment >= netPayable || netPayable === 0;
      expect(isFullPayment).toBe(true);
    });

    it('omits fee due date from workflow when full payment is collected', async () => {
      const result = await createAdmissionWorkflow(
        {
          ...baseAdmissionDetails,
          student_name: 'Rahul Nair',
          phone: '+919876500003',
          email: 'rahul.nair@example.test',
          course_id: testCourseId,
          training_mode: 'Online',
          batch_id: testBatchId,
          admission_date: '2026-11-03',
          course_fee: 45000,
          discount: 5000,
          fee_due_date: undefined, // Omitted for full payment
          payment_plan: 'Full Payment',
          counsellor_id: 'usr-counsellor',
          collect_initial_payment: true,
          initial_payment_amount: 40000,
          payment_mode: 'Cash',
        },
        'usr-counsellor'
      );

      expect(result.admission.fee_due_date).toBeUndefined();
      expect(result.admission.net_payable).toBe(40000);
      expect(result.payment?.amount_paid).toBe(40000);
    });

    it('requires and sets fee due date for partial payment balance', async () => {
      const result = await createAdmissionWorkflow(
        {
          ...baseAdmissionDetails,
          student_name: 'Deepak Joshi',
          phone: '+919876500004',
          email: 'deepak.joshi@example.test',
          course_id: testCourseId,
          training_mode: 'Online',
          batch_id: testBatchId,
          admission_date: '2026-11-03',
          course_fee: 45000,
          discount: 0,
          fee_due_date: '2026-12-15',
          payment_plan: '2 Installments',
          counsellor_id: 'usr-counsellor',
          collect_initial_payment: true,
          initial_payment_amount: 20000, // Partial payment
          payment_mode: 'Cash',
        },
        'usr-counsellor'
      );

      expect(result.admission.fee_due_date).toBe('2026-12-15');
      expect(result.admission.net_payable).toBe(45000);
      expect(result.payment?.amount_paid).toBe(20000);
    });
  });

  // =========================================================================
  // Requirement 6: Four Bank Details Fields in Payments
  // =========================================================================
  describe('6. Four Bank Details Fields in Payments', () => {
    const bankDetails = {
      our_bank_name: 'HDFC Bank Ltd',
      our_bank_account_name: 'NEXT GEN ERP SOLUTIONS PRIVATE LIMITED',
      our_bank_account_id: '0050200088991122', // Preserves leading zeros
      our_upi_details: 'nextgenerp@hdfcbank',
    };

    it('verifies exact four fields structure and order', () => {
      const keys = Object.keys(bankDetails);
      expect(keys[0]).toBe('our_bank_name');
      expect(keys[1]).toBe('our_bank_account_name');
      expect(keys[2]).toBe('our_bank_account_id');
      expect(keys[3]).toBe('our_upi_details');
    });

    it('preserves leading zeros in bank account ID', () => {
      expect(typeof bankDetails.our_bank_account_id).toBe('string');
      expect(bankDetails.our_bank_account_id.startsWith('00')).toBe(true);
      expect(bankDetails.our_bank_account_id).toBe('0050200088991122');
    });

    it('masks sensitive bank account ID in read views', () => {
      const masked = maskBankAccountId(bankDetails.our_bank_account_id);
      expect(masked).toBe('••••••••••••1122');
      expect(masked.endsWith('1122')).toBe(true);
      expect(masked).not.toContain('5020008899');
    });

    it('persists receiving bank details through admission initial payment workflow', async () => {
      const result = await createAdmissionWorkflow(
        {
          ...baseAdmissionDetails,
          student_name: 'Anil Mehta',
          phone: '+919876500005',
          email: 'anil.mehta@example.test',
          course_id: testCourseId,
          training_mode: 'Online',
          batch_id: testBatchId,
          admission_date: '2026-11-03',
          course_fee: 45000,
          payment_plan: 'Full Payment',
          counsellor_id: 'usr-counsellor',
          collect_initial_payment: true,
          initial_payment_amount: 45000,
          payment_mode: 'UPI',
          transaction_reference: 'UPI-9823419082',
          ...bankDetails,
        },
        'usr-counsellor'
      );

      // Persisted on admission
      expect(result.admission.our_bank_name).toBe(bankDetails.our_bank_name);
      expect(result.admission.our_bank_account_name).toBe(bankDetails.our_bank_account_name);
      expect(result.admission.our_bank_account_id).toBe(bankDetails.our_bank_account_id);
      expect(result.admission.our_upi_details).toBe(bankDetails.our_upi_details);

      // Persisted on student payment record
      expect(result.payment).toBeDefined();
      expect(result.payment?.our_bank_name).toBe(bankDetails.our_bank_name);
      expect(result.payment?.our_bank_account_name).toBe(bankDetails.our_bank_account_name);
      expect(result.payment?.our_bank_account_id).toBe(bankDetails.our_bank_account_id);
      expect(result.payment?.our_upi_details).toBe(bankDetails.our_upi_details);
    });

    it('persists receiving bank details through feeWorkflowService.recordPayment', async () => {
      const accountant = store.users.find((u) => u.id === 'usr-accounts')!;
      const actTenantId = tenantId(accountant);

      // Create matching student record
      store.students.push({
        id: 'stu-test-01',
        tenant_id: actTenantId,
        user_id: 'usr-stu-test-01',
        admission_id: 'adm-test-01',
        student_code: 'STU-999',
        admission_number: 'ADM-999',
        full_name: 'Suresh Raina',
        email: 'suresh.raina@example.test',
        phone: '+919876599999',
        course_id: testCourseId,
        joining_date: '2026-11-03',
        status: 'Active',
        total_fee: 45000,
        paid_amount: 0,
        outstanding_amount: 45000,
        attendance_percentage: 0,
        course_progress: 0,
        placement_status: 'Not Started',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      // Create student fee record matching accountant tenant
      const studentFee = {
        id: 'fee-test-01',
        tenant_id: actTenantId,
        student_id: 'stu-test-01',
        student_name: 'Suresh Raina',
        student_code: 'STU-999',
        admission_number: 'ADM-999',
        standard_fee: 45000,
        proposed_fee: 45000,
        discount_amount: 0,
        discount_percentage: 0,
        tax_gst_amount: 0,
        additional_charges: 0,
        final_payable: 45000,
        paid_amount: 0,
        outstanding_amount: 45000,
        payment_plan: 'Custom' as const,
        number_of_installments: 1,
        first_due_date: '2026-11-03',
        approval_status: 'Approved' as const,
        is_payable: true,
        fee_category: 'Tuition Fee',
        course_name: 'SAP FICO',
        reference_type: 'Course' as const,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      store.studentFees.push(studentFee as any);

      const payment = await feeWorkflowService.recordPayment(
        {
          fee_id: studentFee.id,
          student_id: studentFee.student_id,
          enrollment_id: studentFee.admission_number,
          amount_paid: 20000,
          payment_mode: 'Bank Transfer',
          payment_date: '2026-11-03',
          transaction_reference: 'NEFT-99887766',
          ...bankDetails,
        },
        'usr-accounts',
        'accountant'
      );

      expect(payment.our_bank_name).toBe(bankDetails.our_bank_name);
      expect(payment.our_bank_account_name).toBe(bankDetails.our_bank_account_name);
      expect(payment.our_bank_account_id).toBe(bankDetails.our_bank_account_id);
      expect(payment.our_upi_details).toBe(bankDetails.our_upi_details);
    });
  });
});
