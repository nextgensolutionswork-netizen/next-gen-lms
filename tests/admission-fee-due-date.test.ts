import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { store } from '@/lib/services/data-store';
import {
  createAdmissionWorkflow,
  validateFeeDueDate,
} from '@/lib/services/admission-service';
import {
  createLead,
  isLeadConverted,
  getLeadAdmission,
} from '@/lib/services/crm-service';
import { Course, Batch, UserProfile } from '@/types';

describe('Admission Fee Due Date Validation & Institute Business Rules', () => {
  const counsellorId = 'usr-counsellor-01';
  const adminId = 'usr-admin-01';

  let initialUsers: UserProfile[] = [];

  const testCourse: Course = {
    id: 'crs-sap-sd',
    course_name: 'SAP Sales and Distribution (SD)',
    course_code: 'SAP-SD-01',
    description: 'SAP SD Module Training',
    duration_weeks: 10,
    category: 'SAP Functional',
    price: 45000,
    status: 'Published',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const testBatch: Batch = {
    id: 'batch-sd-01',
    batch_name: 'SD Morning Cohort',
    batch_code: 'SD-2026-M1',
    course_id: testCourse.id,
    trainer_id: counsellorId,
    training_mode: 'Hybrid',
    current_enrolled: 2,
    maximum_capacity: 25,
    start_date: '2026-11-15',
    end_date: '2027-01-30',
    start_time: '10:00',
    end_time: '12:00',
    days: ['Mon', 'Wed', 'Fri'],
    status: 'Upcoming',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  beforeEach(() => {
    initialUsers = [...store.users];

    // Ensure test course and batch exist in store
    if (!store.courses.some((c) => c.id === testCourse.id)) {
      store.courses.unshift(testCourse);
    }
    if (!store.batches.some((b) => b.id === testBatch.id)) {
      store.batches.unshift({ ...testBatch, current_enrolled: 2 });
    }

    // Upsert required test users without deleting seed users
    const testUsers: UserProfile[] = [
      {
        id: counsellorId,
        email: 'counsellor@lms.internal',
        full_name: 'Ananya Desai',
        role: 'counsellor',
        is_active: true,
        status: 'Active',
        tenant_id: 'default',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: adminId,
        email: 'admin@lms.internal',
        full_name: 'Suresh Kumar',
        role: 'admin',
        is_active: true,
        status: 'Active',
        tenant_id: 'default',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];

    for (const u of testUsers) {
      const idx = store.users.findIndex((existing) => existing.id === u.id);
      if (idx >= 0) {
        store.users[idx] = u;
      } else {
        store.users.push(u);
      }
    }
  });

  afterEach(() => {
    store.users = [...initialUsers];
  });

  it('1. Full payment collected upfront: fee due date is optional when omitted', async () => {
    const validation = validateFeeDueDate({
      feeDueDate: undefined,
      admissionDate: '2026-11-02',
      netPayable: 45000,
      collectInitialPayment: true,
      initialPaymentAmount: 45000,
    });

    expect(validation.isValid).toBe(true);
    expect(validation.isRequired).toBe(false);
    expect(validation.error).toBeUndefined();

    // Admission creation should succeed without fee_due_date
    const result = await createAdmissionWorkflow(
      {
        student_name: 'Rajesh Sharma',
        email: 'rajesh.sharma@example.com',
        phone: '+91 9876543201',
        dob: '1998-04-12',
        gender: 'Male',
        address: '12 Banjara Hills',
        city: 'Hyderabad',
        education: 'B.Tech',
        experience_years: 2,
        current_employment_status: 'Employed',
        course_id: testCourse.id,
        batch_id: testBatch.id,
        admission_date: '2026-11-02',
        course_fee: 45000,
        discount: 0,
        payment_plan: 'Full Payment',
        counsellor_id: counsellorId,
        collect_initial_payment: true,
        initial_payment_amount: 45000,
        payment_mode: 'UPI',
        transaction_reference: 'UPI-TXN-998811',
      },
      counsellorId
    );

    expect(result.admission).toBeDefined();
    expect(result.payment).toBeDefined();
    expect(result.payment?.amount_paid).toBe(45000);
    expect(result.studentFee?.first_due_date).toBe('2026-11-02');
  });

  it('2. Full payment collected upfront with an optional valid due date: accepts and preserves due date', async () => {
    const validation = validateFeeDueDate({
      feeDueDate: '2026-11-20',
      admissionDate: '2026-11-02',
      netPayable: 45000,
      collectInitialPayment: true,
      initialPaymentAmount: 45000,
    });

    expect(validation.isValid).toBe(true);
    expect(validation.isRequired).toBe(false);

    const result = await createAdmissionWorkflow(
      {
        student_name: 'Sneha Patel',
        email: 'sneha.patel@example.com',
        phone: '+91 9876543202',
        dob: '1997-09-18',
        gender: 'Female',
        address: '56 Jubilee Hills',
        city: 'Hyderabad',
        education: 'MBA',
        experience_years: 3,
        current_employment_status: 'Employed',
        course_id: testCourse.id,
        batch_id: testBatch.id,
        admission_date: '2026-11-02',
        fee_due_date: '2026-11-20',
        course_fee: 45000,
        discount: 0,
        payment_plan: 'Full Payment',
        counsellor_id: counsellorId,
        collect_initial_payment: true,
        initial_payment_amount: 45000,
        payment_mode: 'Bank Transfer',
        transaction_reference: 'NEFT-554433',
      },
      counsellorId
    );

    expect(result.admission).toBeDefined();
    expect(result.studentFee?.first_due_date).toBe('2026-11-20');
  });

  it('3. Partial payment collected: fee due date is required and succeeds when valid', async () => {
    const validation = validateFeeDueDate({
      feeDueDate: '2026-11-25',
      admissionDate: '2026-11-02',
      netPayable: 45000,
      collectInitialPayment: true,
      initialPaymentAmount: 20000,
    });

    expect(validation.isValid).toBe(true);
    expect(validation.isRequired).toBe(true);

    const result = await createAdmissionWorkflow(
      {
        student_name: 'Amit Verma',
        email: 'amit.verma@example.com',
        phone: '+91 9876543203',
        dob: '1996-03-22',
        gender: 'Male',
        address: '77 Madhapur',
        city: 'Hyderabad',
        education: 'B.Com',
        experience_years: 1,
        current_employment_status: 'Employed',
        course_id: testCourse.id,
        batch_id: testBatch.id,
        admission_date: '2026-11-02',
        fee_due_date: '2026-11-25',
        course_fee: 45000,
        discount: 0,
        payment_plan: 'Full Payment',
        counsellor_id: counsellorId,
        collect_initial_payment: true,
        initial_payment_amount: 20000,
        payment_mode: 'Debit Card',
        transaction_reference: 'POS-CARD-1122',
      },
      counsellorId
    );

    expect(result.admission).toBeDefined();
    expect(result.payment?.amount_paid).toBe(20000);
    expect(result.studentFee?.first_due_date).toBe('2026-11-25');
  });

  it('4. Partial payment with missing due date: validation fails with clear field error', () => {
    const validation = validateFeeDueDate({
      feeDueDate: '',
      admissionDate: '2026-11-02',
      netPayable: 45000,
      collectInitialPayment: true,
      initialPaymentAmount: 20000,
    });

    expect(validation.isValid).toBe(false);
    expect(validation.isRequired).toBe(true);
    expect(validation.error).toBe('Fee due date is required for partial payment or pay later.');

    const validationUndefined = validateFeeDueDate({
      feeDueDate: undefined,
      admissionDate: '2026-11-02',
      netPayable: 45000,
      collectInitialPayment: true,
      initialPaymentAmount: 20000,
    });

    expect(validationUndefined.isValid).toBe(false);
    expect(validationUndefined.error).toBe('Fee due date is required for partial payment or pay later.');
  });

  it('5. Pay Later (uncollected upfront) with valid due date: succeeds', async () => {
    const validation = validateFeeDueDate({
      feeDueDate: '2026-11-30',
      admissionDate: '2026-11-02',
      netPayable: 45000,
      collectInitialPayment: false,
    });

    expect(validation.isValid).toBe(true);
    expect(validation.isRequired).toBe(true);

    const result = await createAdmissionWorkflow(
      {
        student_name: 'Pooja Reddy',
        email: 'pooja.reddy@example.com',
        phone: '+91 9876543204',
        dob: '1999-11-05',
        gender: 'Female',
        address: '88 Gachibowli',
        city: 'Hyderabad',
        education: 'B.Sc',
        experience_years: 0,
        current_employment_status: 'Student',
        course_id: testCourse.id,
        batch_id: testBatch.id,
        admission_date: '2026-11-02',
        fee_due_date: '2026-11-30',
        course_fee: 45000,
        discount: 0,
        payment_plan: 'Full Payment',
        counsellor_id: counsellorId,
        collect_initial_payment: false,
      },
      counsellorId
    );

    expect(result.admission).toBeDefined();
    expect(result.payment).toBeUndefined();
    expect(result.studentFee?.first_due_date).toBe('2026-11-30');
  });

  it('6. Pay Later with missing due date: validation fails with clear error', () => {
    const validation = validateFeeDueDate({
      feeDueDate: '',
      admissionDate: '2026-11-02',
      netPayable: 45000,
      collectInitialPayment: false,
    });

    expect(validation.isValid).toBe(false);
    expect(validation.isRequired).toBe(true);
    expect(validation.error).toBe('Fee due date is required for partial payment or pay later.');
  });

  it('7. Pay Later preset (collectInitialPayment === true but amount === 0): requires due date', () => {
    const validation = validateFeeDueDate({
      feeDueDate: '',
      admissionDate: '2026-11-02',
      netPayable: 45000,
      collectInitialPayment: true,
      initialPaymentAmount: 0,
    });

    expect(validation.isValid).toBe(false);
    expect(validation.isRequired).toBe(true);
    expect(validation.error).toBe('Fee due date is required for partial payment or pay later.');
  });

  it('8. Due date before admission date: validation fails and service rejects', async () => {
    const validation = validateFeeDueDate({
      feeDueDate: '2026-10-15',
      admissionDate: '2026-11-02',
      netPayable: 45000,
      collectInitialPayment: true,
      initialPaymentAmount: 45000,
    });

    expect(validation.isValid).toBe(false);
    expect(validation.error).toBe('Fee due date cannot be before the admission date.');

    await expect(
      createAdmissionWorkflow(
        {
          student_name: 'Invalid Date Student',
          email: 'invalid.date@example.com',
          phone: '+91 9876543205',
          dob: '1998-01-01',
          gender: 'Male',
          address: 'Kondapur',
          city: 'Hyderabad',
          education: 'MCA',
          experience_years: 1,
          current_employment_status: 'Employed',
          course_id: testCourse.id,
          admission_date: '2026-11-02',
          fee_due_date: '2026-10-15', // Past date before admission
          course_fee: 45000,
          discount: 0,
          payment_plan: 'Full Payment',
          counsellor_id: counsellorId,
        },
        counsellorId
      )
    ).rejects.toThrow('Fee due date cannot be before the admission date.');
  });

  it('9. Malformed date string: validation fails and service rejects', async () => {
    const validation = validateFeeDueDate({
      feeDueDate: '2026/11/02',
      admissionDate: '2026-11-02',
      netPayable: 45000,
      collectInitialPayment: true,
      initialPaymentAmount: 45000,
    });

    expect(validation.isValid).toBe(false);
    expect(validation.error).toBe('Please enter a valid fee due date.');

    await expect(
      createAdmissionWorkflow(
        {
          student_name: 'Malformed Date Student',
          email: 'malformed.date@example.com',
          phone: '+91 9876543206',
          dob: '1998-01-01',
          gender: 'Male',
          address: 'Kondapur',
          city: 'Hyderabad',
          education: 'MCA',
          experience_years: 1,
          current_employment_status: 'Employed',
          course_id: testCourse.id,
          admission_date: '2026-11-02',
          fee_due_date: 'invalid-string',
          course_fee: 45000,
          discount: 0,
          payment_plan: 'Full Payment',
          counsellor_id: counsellorId,
        },
        counsellorId
      )
    ).rejects.toThrow('Please enter a valid fee due date.');
  });

  it('10. Discount and net payable calculations remain correct with optional due date', async () => {
    const discountAmount = 5000;
    const netPayable = testCourse.price - discountAmount; // 40000

    const validation = validateFeeDueDate({
      feeDueDate: undefined,
      admissionDate: '2026-11-02',
      netPayable,
      collectInitialPayment: true,
      initialPaymentAmount: netPayable,
    });

    expect(validation.isValid).toBe(true);
    expect(validation.isRequired).toBe(false);

    const result = await createAdmissionWorkflow(
      {
        student_name: 'Discounted Student',
        email: 'discounted@example.com',
        phone: '+91 9876543207',
        dob: '1997-07-07',
        gender: 'Female',
        address: 'Hitec City',
        city: 'Hyderabad',
        education: 'B.Tech',
        experience_years: 2,
        current_employment_status: 'Employed',
        course_id: testCourse.id,
        admission_date: '2026-11-02',
        course_fee: testCourse.price,
        discount: discountAmount,
        discount_reason: 'Festive promotion',
        payment_plan: 'Full Payment',
        counsellor_id: counsellorId,
        collect_initial_payment: true,
        initial_payment_amount: netPayable,
        payment_mode: 'Credit Card',
        transaction_reference: 'CC-AUTH-8877',
      },
      counsellorId
    );

    expect(result.admission.course_fee).toBe(45000);
    expect(result.admission.discount).toBe(5000);
    expect(result.admission.net_payable).toBe(40000);
    expect(result.payment?.amount_paid).toBe(40000);
  });

  it('11. CRM lead conversion with full payment upfront and omitted due date updates lead correctly', async () => {
    const lead = await createLead({
      full_name: 'Kavita Das',
      email: 'kavita.das@example.com',
      phone: '+91 9876543208',
      interested_course_id: testCourse.id,
      stage: 'Interested',
      counsellor_id: counsellorId,
    });

    const result = await createAdmissionWorkflow(
      {
        student_name: lead.full_name,
        email: lead.email,
        phone: lead.phone,
        dob: '1998-02-14',
        gender: 'Female',
        address: 'Ameerpet',
        city: 'Hyderabad',
        education: 'B.Com',
        experience_years: 1,
        current_employment_status: 'Employed',
        course_id: testCourse.id,
        batch_id: testBatch.id,
        admission_date: '2026-11-02',
        course_fee: 45000,
        discount: 0,
        payment_plan: 'Full Payment',
        counsellor_id: counsellorId,
        lead_id: lead.id,
        collect_initial_payment: true,
        initial_payment_amount: 45000,
        payment_mode: 'UPI',
        transaction_reference: 'UPI-TXN-KAVITA-01',
      },
      counsellorId
    );

    expect(result.admission).toBeDefined();
    expect(result.admission.lead_id).toBe(lead.id);

    // Verify lead is marked Converted
    const updatedLead = store.leads.find((l) => l.id === lead.id);
    expect(updatedLead?.stage).toBe('Converted');
    expect(isLeadConverted(updatedLead!, store.admissions)).toBe(true);
    expect(getLeadAdmission(updatedLead!, store.admissions)?.id).toBe(result.admission.id);
  });
});
