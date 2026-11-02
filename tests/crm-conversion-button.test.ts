import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { store } from '@/lib/services/data-store';
import {
  createLead,
  getLeadAdmission,
  isLeadConverted,
  reconcileLeadsWithAdmissions,
  convertLeadToAdmission,
  getLeads,
} from '@/lib/services/crm-service';
import { createAdmissionWorkflow } from '@/lib/services/admission-service';
import { Course, Batch, UserProfile } from '@/types';

describe('CRM Conversion Button & Authoritative Admission Verification', () => {
  const counsellorId = 'usr-counsellor-01';
  const adminId = 'usr-admin-01';
  const otherTenantCounsellorId = 'usr-counsellor-tenant2';
  const studentUserId = 'usr-student-01';

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

  let initialUsers: UserProfile[] = [];

  beforeEach(() => {
    initialUsers = [...store.users];

    // Reset seed data
    if (!store.courses.some((c) => c.id === testCourse.id)) {
      store.courses.unshift(testCourse);
    }
    if (!store.batches.some((b) => b.id === testBatch.id)) {
      store.batches.unshift({ ...testBatch, current_enrolled: 2 });
    }
    store.leads = [];
    store.admissions = [];
    store.students = [];
    store.feeAccounts = [];
    store.studentFees = [];
    store.studentPayments = [];
    store.receipts = [];

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
      {
        id: otherTenantCounsellorId,
        email: 'counsellor2@tenant2.internal',
        full_name: 'Meera Rao',
        role: 'counsellor',
        is_active: true,
        status: 'Active',
        tenant_id: 'tenant-2',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: studentUserId,
        email: 'student@lms.internal',
        full_name: 'Test Student',
        role: 'student',
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

  it('1. New lead has isLeadConverted === false and is eligible for conversion', async () => {
    const lead = await createLead({
      full_name: 'Vikram Sharma',
      email: 'vikram.sharma@example.com',
      phone: '+91 9876543210',
      interested_course_id: testCourse.id,
      stage: 'New',
      counsellor_id: counsellorId,
    });

    expect(lead.stage).toBe('New');
    expect(isLeadConverted(lead, store.admissions)).toBe(false);
    expect(getLeadAdmission(lead, store.admissions)).toBeUndefined();
  });

  it('2. Successful conversion creates admission with lead_id, marks lead Converted, and records note', async () => {
    const lead = await createLead({
      full_name: 'Priya Patel',
      email: 'priya.patel@example.com',
      phone: '+91 9876543211',
      interested_course_id: testCourse.id,
      stage: 'Interested',
      counsellor_id: counsellorId,
    });

    const result = await createAdmissionWorkflow(
      {
        student_name: lead.full_name,
        email: lead.email,
        phone: lead.phone,
        dob: '1998-05-12',
        gender: 'Female',
        address: '123 Tech City',
        city: 'Hyderabad',
        education: 'B.Tech CSE',
        experience_years: 2,
        current_employment_status: 'Employed',
        course_id: testCourse.id,
        batch_id: testBatch.id,
        admission_date: '2026-11-02',
        course_fee: 45000,
        discount: 0,
        payment_plan: 'Full Payment',
        counsellor_id: counsellorId,
        lead_id: lead.id,
      },
      counsellorId
    );

    expect(result.admission).toBeDefined();
    expect(result.admission.lead_id).toBe(lead.id);

    // Verify lead state updated
    const updatedLead = store.leads.find((l) => l.id === lead.id);
    expect(updatedLead?.stage).toBe('Converted');
    expect(updatedLead?.notes).toContain(`Converted to Admission: ${result.admission.admission_number}`);

    // Verify authoritative checks
    expect(isLeadConverted(updatedLead!, store.admissions)).toBe(true);
    expect(getLeadAdmission(updatedLead!, store.admissions)?.id).toBe(result.admission.id);
  });

  it('3. Converted lead blocks re-conversion via convertLeadToAdmission helper', async () => {
    const lead = await createLead({
      full_name: 'Anil Gupta',
      email: 'anil.gupta@example.com',
      phone: '+91 9876543212',
      interested_course_id: testCourse.id,
      stage: 'New',
      counsellor_id: counsellorId,
    });

    // Mark as converted
    await createAdmissionWorkflow(
      {
        student_name: lead.full_name,
        email: lead.email,
        phone: lead.phone,
        dob: '1997-04-10',
        gender: 'Male',
        address: '456 Ring Road',
        city: 'Hyderabad',
        education: 'MBA',
        experience_years: 3,
        current_employment_status: 'Employed',
        course_id: testCourse.id,
        admission_date: '2026-11-02',
        course_fee: 45000,
        discount: 0,
        payment_plan: 'Full Payment',
        lead_id: lead.id,
      },
      counsellorId
    );

    // Attempting helper call should throw
    expect(() => convertLeadToAdmission(lead.id)).toThrow(/already been converted/);
  });

  it('4. Stale lead stage is authoritatively reconciled to Converted when an admission exists', async () => {
    const lead = await createLead({
      full_name: 'Sunita Reddy',
      email: 'sunita.reddy@example.com',
      phone: '+91 9876543213',
      interested_course_id: testCourse.id,
      stage: 'Interested',
      counsellor_id: counsellorId,
    });

    // Simulate an admission created in the system linking this lead
    const admissionNumber = 'ADM-2026-888';
    store.admissions.push({
      id: 'adm-manual-888',
      admission_number: admissionNumber,
      student_name: lead.full_name,
      email: lead.email,
      phone: lead.phone,
      dob: '1996-01-01',
      gender: 'Female',
      address: '789 Lake View',
      city: 'Hyderabad',
      education: 'B.Com',
      experience_years: 1,
      current_employment_status: 'Employed',
      course_id: testCourse.id,
      training_mode: 'Hybrid',
      admission_date: '2026-11-02',
      course_fee: 45000,
      discount: 0,
      net_payable: 45000,
      payment_plan: 'Full Payment',
      status: 'Confirmed',
      lead_id: lead.id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    // Even if lead.stage in memory is still 'Interested'
    expect(lead.stage).toBe('Interested');

    // Authoritative check must return true
    expect(isLeadConverted(lead, store.admissions)).toBe(true);

    // Reconcile function sets stage to Converted
    const reconciled = reconcileLeadsWithAdmissions([lead], store.admissions);
    expect(reconciled[0].stage).toBe('Converted');
    expect(reconciled[0].notes).toContain(`Converted to Admission: ${admissionNumber}`);

    // getLeads() returns reconciled list
    const fetchedLeads = await getLeads();
    const fetchedLead = fetchedLeads.find((l) => l.id === lead.id);
    expect(fetchedLead?.stage).toBe('Converted');
  });

  it('5. Failed conversion validation does not falsely mark lead as converted', async () => {
    const lead = await createLead({
      full_name: 'Rahul Varma',
      email: 'rahul.varma@example.com',
      phone: '+91 9876543214',
      interested_course_id: testCourse.id,
      stage: 'Demo Scheduled',
      counsellor_id: counsellorId,
    });

    // Attempting admission with invalid course fee
    await expect(
      createAdmissionWorkflow(
        {
          student_name: lead.full_name,
          email: lead.email,
          phone: lead.phone,
          dob: '1999-08-15',
          gender: 'Male',
          address: 'Gachibowli',
          city: 'Hyderabad',
          education: 'B.Sc',
          experience_years: 0,
          current_employment_status: 'Student',
          course_id: testCourse.id,
          admission_date: '2026-11-02',
          course_fee: -100, // Invalid fee
          discount: 0,
          payment_plan: 'Full Payment',
          lead_id: lead.id,
        },
        counsellorId
      )
    ).rejects.toThrow('Course fee must be greater than zero.');

    // Lead stage must remain unchanged
    const unchangedLead = store.leads.find((l) => l.id === lead.id);
    expect(unchangedLead?.stage).toBe('Demo Scheduled');
    expect(isLeadConverted(unchangedLead!, store.admissions)).toBe(false);
  });

  it('6. Double-click / retry idempotency: creating admission twice with same lead_id returns existing admission without duplicates', async () => {
    const lead = await createLead({
      full_name: 'Deepa Nair',
      email: 'deepa.nair@example.com',
      phone: '+91 9876543215',
      interested_course_id: testCourse.id,
      stage: 'Interested',
      counsellor_id: counsellorId,
    });

    const admissionInput = {
      student_name: lead.full_name,
      email: lead.email,
      phone: lead.phone,
      dob: '1995-12-10',
      gender: 'Female' as const,
      address: 'Kondapur',
      city: 'Hyderabad',
      education: 'MCA',
      experience_years: 4,
      current_employment_status: 'Employed' as const,
      course_id: testCourse.id,
      batch_id: testBatch.id,
      admission_date: '2026-11-02',
      course_fee: 45000,
      discount: 0,
      payment_plan: 'Full Payment' as const,
      counsellor_id: counsellorId,
      lead_id: lead.id,
    };

    // First call
    const result1 = await createAdmissionWorkflow(admissionInput, counsellorId);
    expect(result1.admission).toBeDefined();
    const admCountAfterFirst = store.admissions.length;
    const stuCountAfterFirst = store.students.length;

    // Second call with same lead_id (simulating double click or network retry)
    const result2 = await createAdmissionWorkflow(admissionInput, counsellorId);
    expect(result2.admission).toBeDefined();
    expect(result2.admission.id).toBe(result1.admission.id);
    expect(result2.admission.admission_number).toBe(result1.admission.admission_number);

    // No duplicate admission or student created
    expect(store.admissions.length).toBe(admCountAfterFirst);
    expect(store.students.length).toBe(stuCountAfterFirst);
  });

  it('7. Cross-tenant conversion is rejected', async () => {
    // Lead created by counsellor in default tenant
    const lead = await createLead({
      full_name: 'Cross Tenant Lead',
      email: 'cross.tenant@example.com',
      phone: '+91 9876543216',
      interested_course_id: testCourse.id,
      stage: 'New',
      counsellor_id: counsellorId,
    });

    // Counsellor from tenant-2 attempts to convert lead belonging to default tenant
    await expect(
      createAdmissionWorkflow(
        {
          student_name: lead.full_name,
          email: lead.email,
          phone: lead.phone,
          dob: '1998-01-01',
          gender: 'Male',
          address: 'Tenant 2 Location',
          city: 'Bengaluru',
          education: 'B.Tech',
          experience_years: 1,
          current_employment_status: 'Employed',
          course_id: testCourse.id,
          admission_date: '2026-11-02',
          course_fee: 45000,
          discount: 0,
          payment_plan: 'Full Payment',
          lead_id: lead.id,
        },
        otherTenantCounsellorId
      )
    ).rejects.toThrow(/Unauthorized cross-tenant conversion/);

    // Lead remains unconverted
    const unchangedLead = store.leads.find((l) => l.id === lead.id);
    expect(unchangedLead?.stage).toBe('New');
    expect(isLeadConverted(unchangedLead!, store.admissions)).toBe(false);
  });

  it('8. Super Admin and Counsellor can convert leads; unauthorized roles are rejected', async () => {
    const lead = await createLead({
      full_name: 'Auth Role Lead',
      email: 'auth.role@example.com',
      phone: '+91 9876543217',
      interested_course_id: testCourse.id,
      stage: 'New',
      counsellor_id: counsellorId,
    });

    // Student role attempts to perform admission conversion
    await expect(
      createAdmissionWorkflow(
        {
          student_name: lead.full_name,
          email: lead.email,
          phone: lead.phone,
          dob: '1998-01-01',
          gender: 'Male',
          address: 'Some Address',
          city: 'Hyderabad',
          education: 'B.Tech',
          experience_years: 1,
          current_employment_status: 'Employed',
          course_id: testCourse.id,
          admission_date: '2026-11-02',
          course_fee: 45000,
          discount: 0,
          payment_plan: 'Full Payment',
          lead_id: lead.id,
        },
        studentUserId
      )
    ).rejects.toThrow('Unauthorized admission registration.');

    // Admin can convert
    const result = await createAdmissionWorkflow(
      {
        student_name: lead.full_name,
        email: lead.email,
        phone: lead.phone,
        dob: '1998-01-01',
        gender: 'Male',
        address: 'Some Address',
        city: 'Hyderabad',
        education: 'B.Tech',
        experience_years: 1,
        current_employment_status: 'Employed',
        course_id: testCourse.id,
        admission_date: '2026-11-02',
        course_fee: 45000,
        discount: 0,
        payment_plan: 'Full Payment',
        lead_id: lead.id,
      },
      adminId
    );

    expect(result.admission).toBeDefined();
    expect(isLeadConverted(lead, store.admissions)).toBe(true);
  });
});
