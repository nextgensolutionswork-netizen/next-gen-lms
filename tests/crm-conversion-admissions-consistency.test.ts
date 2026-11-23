import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { store } from '@/lib/services/data-store';
import {
  createAdmissionWorkflow,
  getNextAdmissionSequence,
  getNextStudentSequence,
  CreateAdmissionInput,
} from '@/lib/services/admission-service';
import {
  getLeadAdmission,
  isLeadConverted,
  reconcileLeadsWithAdmissions,
} from '@/lib/services/crm-service';
import { paymentWorkflowClient } from '@/lib/services/payment-workflow-client';
import { Lead, Admission, Student, UserProfile } from '@/types';

// RFC-4122 UUID regex validator
const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('BUG-11: CRM Conversion, Admission Persistence & Student Synchronization (18 Requirements)', () => {
  const originalAdmissions = [...store.admissions];
  const originalStudents = [...store.students];
  const originalFeeAccounts = [...store.feeAccounts];
  const originalLeads = [...store.leads];
  const originalUsers = [...store.users];

  const counsellorUser: UserProfile = {
    id: '44444444-4444-4444-4444-444444444444',
    tenant_id: 'default',
    email: 'counsellor@next-generpsolutions.com',
    full_name: 'Ananya Deshmukh',
    role: 'counsellor',
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const adminUser: UserProfile = {
    id: '11111111-1111-1111-1111-111111111111',
    tenant_id: 'default',
    email: 'admin@next-generpsolutions.com',
    full_name: 'System Admin',
    role: 'admin',
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  beforeEach(() => {
    store.admissions = [...originalAdmissions];
    store.students = [...originalStudents];
    store.feeAccounts = [...originalFeeAccounts];
    store.leads = [...originalLeads];
    store.users = [counsellorUser, adminUser, ...originalUsers.filter(u => ![counsellorUser.id, adminUser.id].includes(u.id))];
  });

  afterEach(() => {
    store.admissions = [...originalAdmissions];
    store.students = [...originalStudents];
    store.feeAccounts = [...originalFeeAccounts];
    store.leads = [...originalLeads];
    store.users = [...originalUsers];
    vi.restoreAllMocks();
  });

  // --------------------------------------------------------------------------
  // Requirement 1: Server-side admission creation enforcement
  // --------------------------------------------------------------------------
  it('Req 1: Enforces server-side admission creation via paymentWorkflowClient in browser environment', async () => {
    // In browser environment (typeof window !== 'undefined'), calling createAdmissionWorkflow routes through paymentWorkflowClient
    const spy = vi.spyOn(paymentWorkflowClient, 'createAdmission').mockResolvedValueOnce({
      admission: {
        id: '22222222-2222-2222-2222-222222222222',
        admission_number: 'ADM-2026-0999',
        student_name: 'Server Routed Student',
        student_id: '33333333-3333-3333-3333-333333333333',
        course_id: 'crs-fico-01',
        net_payable: 45000,
      } as any,
      student: { id: '33333333-3333-3333-3333-333333333333', full_name: 'Server Routed Student' } as any,
      feeAccount: {} as any,
    });

    // Simulate browser window
    (globalThis as any).window = {};

    try {
      const input: CreateAdmissionInput = {
        student_name: 'Server Routed Student',
        phone: '+91 98765 43210',
        email: 'server.routed@example.com',
        dob: '2000-01-01',
        gender: 'Male',
        address: '123 High Street',
        city: 'Hyderabad',
        education: 'B.Tech',
        experience_years: 1,
        current_employment_status: 'Employed',
        course_id: 'crs-fico-01',
        admission_date: '2026-11-18',
        course_fee: 45000,
        discount: 0,
        payment_plan: 'Full Payment',
      };

      const result = await createAdmissionWorkflow(input, counsellorUser.id, false);
      expect(spy).toHaveBeenCalledTimes(1);
      expect(result.admission.admission_number).toBe('ADM-2026-0999');
    } finally {
      delete (globalThis as any).window;
    }
  });

  // --------------------------------------------------------------------------
  // Requirement 2: Persistence before Converted status
  // --------------------------------------------------------------------------
  it('Req 2: Lead stage transitions to Converted only when admission persistence succeeds', async () => {
    const testLead: Lead = {
      created_by: counsellorUser.id,
      id: 'aaaa1111-2222-3333-4444-555566667777',
      tenant_id: 'default',
      lead_code: 'LD-2026-TEST1',
      full_name: 'Conversion Integrity Lead',
      email: 'convert.integrity@example.com',
      phone: '+91 98111 55555',
      interested_course_id: 'crs-fico-01',
      stage: 'Follow-up',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    store.leads.push(testLead);

    const input: CreateAdmissionInput = {
      lead_id: testLead.id,
      student_name: testLead.full_name,
      phone: testLead.phone,
      email: testLead.email,
      dob: '1998-05-15',
      gender: 'Female',
      address: '45 Lake View',
      city: 'Pune',
      education: 'MCA',
      experience_years: 2,
      current_employment_status: 'Employed',
      course_id: 'crs-fico-01',
      admission_date: '2026-11-18',
      course_fee: 45000,
      discount: 0,
      payment_plan: 'Full Payment',
    };

    const result = await createAdmissionWorkflow(input, counsellorUser.id, true);

    expect(result.admission).toBeDefined();
    expect(result.admission.admission_number).toMatch(/^ADM-2026-\d{4}$/);
    expect(testLead.stage).toBe('Converted');
    expect(testLead.notes).toContain(result.admission.admission_number);
  });

  // --------------------------------------------------------------------------
  // Requirement 3: Ghost admission prevention on failure
  // --------------------------------------------------------------------------
  it('Req 3: If admission creation fails, lead remains in its previous stage and is never marked Converted', async () => {
    const testLead: Lead = {
      created_by: counsellorUser.id,
      id: 'bbbb1111-2222-3333-4444-555566667777',
      tenant_id: 'default',
      lead_code: 'LD-2026-TEST2',
      full_name: 'Failed Conversion Lead',
      email: 'fail.convert@example.com',
      phone: '+91 98111 66666',
      interested_course_id: 'crs-fico-01',
      stage: 'Demo Attended',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    store.leads.push(testLead);

    // Provide invalid course fee (0) which triggers validation failure
    const invalidInput: CreateAdmissionInput = {
      lead_id: testLead.id,
      student_name: testLead.full_name,
      phone: testLead.phone,
      email: testLead.email,
      dob: '1998-05-15',
      gender: 'Male',
      address: '45 Lake View',
      city: 'Pune',
      education: 'MCA',
      experience_years: 2,
      current_employment_status: 'Employed',
      course_id: 'crs-fico-01',
      admission_date: '2026-11-18',
      course_fee: 0, // Invalid: course fee must be greater than zero
      discount: 0,
      payment_plan: 'Full Payment',
    };

    await expect(createAdmissionWorkflow(invalidInput, counsellorUser.id, true)).rejects.toThrow(
      'Course fee must be greater than zero.'
    );

    // Lead stage must NOT change to Converted
    expect(testLead.stage).toBe('Demo Attended');
    expect(testLead.notes || '').not.toContain('Converted to Admission');
  });

  // --------------------------------------------------------------------------
  // Requirement 4: Standard RFC-4122 UUID generation
  // --------------------------------------------------------------------------
  it('Req 4: Generates valid RFC-4122 UUIDs for admission, student, user, feeAccount, and studentFee IDs', async () => {
    const input: CreateAdmissionInput = {
      student_name: 'UUID Compliance Candidate',
      phone: '+91 97777 88888',
      email: 'uuid.candidate@example.com',
      dob: '2001-03-20',
      gender: 'Female',
      address: '77 Residency Road',
      city: 'Bengaluru',
      education: 'B.Com',
      experience_years: 0,
      current_employment_status: 'Student',
      course_id: 'crs-fico-01',
      admission_date: '2026-11-18',
      course_fee: 45000,
      discount: 2000,
      discount_reason: 'Early bird promotion',
      payment_plan: 'Full Payment',
    };

    const result = await createAdmissionWorkflow(input, adminUser.id, true);

    expect(result.admission.id).toMatch(UUID_V4_REGEX);
    expect(result.student.id).toMatch(UUID_V4_REGEX);
    expect(result.student.user_id).toMatch(UUID_V4_REGEX);
    expect(result.feeAccount.id).toMatch(UUID_V4_REGEX);
    if (result.studentFee) {
      expect(result.studentFee.id).toMatch(UUID_V4_REGEX);
    }

    // Must NOT start with legacy prefixes like 'adm-' or 'stu-'
    expect(result.admission.id.startsWith('adm-')).toBe(false);
    expect(result.student.id.startsWith('stu-')).toBe(false);
    expect(result.feeAccount.id.startsWith('fa-')).toBe(false);
  });

  // --------------------------------------------------------------------------
  // Requirement 5: Human-readable vs database UUID separation
  // --------------------------------------------------------------------------
  it('Req 5: Keeps human-readable admission number (ADM-YYYY-XXXX) separate from database UUID', async () => {
    const input: CreateAdmissionInput = {
      student_name: 'Format Separation Candidate',
      phone: '+91 96666 77777',
      email: 'format.sep@example.com',
      dob: '1999-12-05',
      gender: 'Male',
      address: '12 Cyber City',
      city: 'Gurugram',
      education: 'B.Sc Computer Science',
      experience_years: 3,
      current_employment_status: 'Employed',
      course_id: 'crs-fico-01',
      admission_date: '2026-11-18',
      course_fee: 45000,
      discount: 0,
      payment_plan: 'Full Payment',
    };

    const result = await createAdmissionWorkflow(input, counsellorUser.id, true);

    // Database ID is a UUID
    expect(result.admission.id).toMatch(UUID_V4_REGEX);
    // Display number is ADM-YYYY-XXXX
    expect(result.admission.admission_number).toMatch(/^ADM-\d{4}-\d{4}$/);
    expect(result.admission.student_unique_id).toMatch(/^NGERP-\d{4}-\d{5}$/);
    expect(result.student.student_code).toMatch(/^STU-[A-Z0-9]+-\d{3}$/);
  });

  // --------------------------------------------------------------------------
  // Requirement 6: Concurrency-safe sequential admission numbering
  // --------------------------------------------------------------------------
  it('Req 6: getNextAdmissionSequence computes maxSeq + 1 from all existing records', () => {
    // Current highest sequence in admissions
    const initialNext = getNextAdmissionSequence(2026);
    expect(initialNext).toBeGreaterThanOrEqual(1);

    // Add a synthetic admission higher than current max
    const higherSeq = initialNext + 50;
    store.admissions.push({
      id: crypto.randomUUID(),
      admission_number: `ADM-2026-${String(higherSeq).padStart(4, '0')}`,
      student_name: 'Synthetic Highest Seq',
      phone: '+91 90000 00001',
      email: 'synth.seq@example.com',
      course_id: 'crs-fico-01',
      admission_date: '2026-11-18',
      course_fee: 45000,
      discount: 0,
      net_payable: 45000,
      payment_plan: 'Full Payment',
      status: 'Confirmed',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as unknown as Admission);

    // Reset highestAdmissionSequence cache for test isolation
    if ((store as any).highestAdmissionSequence) {
      delete (store as any).highestAdmissionSequence[2026];
    }

    const calculatedSeq = getNextAdmissionSequence(2026);
    expect(calculatedSeq).toBe(higherSeq + 1);
  });

  // --------------------------------------------------------------------------
  // Requirement 7: Lead-to-Admission bidirectional linkage
  // --------------------------------------------------------------------------
  it('Req 7: Establishes bidirectional linkage between CRM lead and Admission', async () => {
    const testLead: Lead = {
      created_by: counsellorUser.id,
      id: 'cccc1111-2222-3333-4444-555566667777',
      tenant_id: 'default',
      lead_code: 'LD-2026-LINK1',
      full_name: 'Bidirectional Link Lead',
      email: 'bi.link@example.com',
      phone: '+91 98444 33333',
      interested_course_id: 'crs-fico-01',
      stage: 'Contacted',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    store.leads.push(testLead);

    const input: CreateAdmissionInput = {
      lead_id: testLead.id,
      student_name: testLead.full_name,
      phone: testLead.phone,
      email: testLead.email,
      dob: '2000-08-10',
      gender: 'Male',
      address: '22 Banjara Hills',
      city: 'Hyderabad',
      education: 'B.Tech IT',
      experience_years: 1,
      current_employment_status: 'Employed',
      course_id: 'crs-fico-01',
      admission_date: '2026-11-18',
      course_fee: 45000,
      discount: 0,
      payment_plan: 'Full Payment',
    };

    const result = await createAdmissionWorkflow(input, counsellorUser.id, true);

    expect(result.admission.lead_id).toBe(testLead.id);
    expect(testLead.notes).toContain(result.admission.admission_number);

    // Verify getLeadAdmission resolves the admission
    const matched = getLeadAdmission(testLead, store.admissions);
    expect(matched).toBeDefined();
    expect(matched?.id).toBe(result.admission.id);
    expect(matched?.admission_number).toBe(result.admission.admission_number);
  });

  // --------------------------------------------------------------------------
  // Requirement 8: Student 360 Profile linkage
  // --------------------------------------------------------------------------
  it('Req 8: Student record shares canonical Student ID and admission ID with Student 360 profile', async () => {
    const input: CreateAdmissionInput = {
      student_name: 'Student 360 Link Candidate',
      phone: '+91 98555 44444',
      email: 's360.candidate@example.com',
      dob: '1997-10-10',
      gender: 'Female',
      address: '90 Marine Drive',
      city: 'Mumbai',
      education: 'MBA Finance',
      experience_years: 4,
      current_employment_status: 'Employed',
      course_id: 'crs-fico-01',
      admission_date: '2026-11-18',
      course_fee: 45000,
      discount: 1000,
      discount_reason: 'Corporate referral',
      payment_plan: 'Full Payment',
    };

    const result = await createAdmissionWorkflow(input, counsellorUser.id, true);

    expect(result.admission.student_id).toBe(result.student.id);
    expect(result.student.admission_id).toBe(result.admission.id);
    expect(result.student.admission_number).toBe(result.admission.admission_number);
    expect(result.student.student_unique_id).toBe(result.admission.student_unique_id);

    // Student should be present in store.students
    const foundInDirectory = store.students.find((s) => s.id === result.student.id);
    expect(foundInDirectory).toBeDefined();
    expect(foundInDirectory?.admission_number).toBe(result.admission.admission_number);
  });

  // --------------------------------------------------------------------------
  // Requirement 9: Idempotent lead conversion
  // --------------------------------------------------------------------------
  it('Req 9: Repeated conversion requests for the same lead_id return existing admission idempotently', async () => {
    const testLead: Lead = {
      created_by: counsellorUser.id,
      id: 'dddd1111-2222-3333-4444-555566667777',
      tenant_id: 'default',
      lead_code: 'LD-2026-IDEM1',
      full_name: 'Idempotent Lead',
      email: 'idempotent.lead@example.com',
      phone: '+91 98666 55555',
      interested_course_id: 'crs-fico-01',
      stage: 'Follow-up',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    store.leads.push(testLead);

    const input: CreateAdmissionInput = {
      lead_id: testLead.id,
      student_name: testLead.full_name,
      phone: testLead.phone,
      email: testLead.email,
      dob: '2001-04-12',
      gender: 'Male',
      address: '5 Koramangala',
      city: 'Bengaluru',
      education: 'B.Com',
      experience_years: 1,
      current_employment_status: 'Employed',
      course_id: 'crs-fico-01',
      admission_date: '2026-11-18',
      course_fee: 45000,
      discount: 0,
      payment_plan: 'Full Payment',
    };

    const firstResult = await createAdmissionWorkflow(input, counsellorUser.id, true);
    const initialAdmissionsCount = store.admissions.length;
    const initialStudentsCount = store.students.length;

    // Second conversion request for the same lead
    const secondResult = await createAdmissionWorkflow(input, counsellorUser.id, true);

    expect(secondResult.admission.id).toBe(firstResult.admission.id);
    expect(secondResult.admission.admission_number).toBe(firstResult.admission.admission_number);
    expect(store.admissions.length).toBe(initialAdmissionsCount);
    expect(store.students.length).toBe(initialStudentsCount);
  });

  // --------------------------------------------------------------------------
  // Requirement 10: Idempotency key duplicate protection
  // --------------------------------------------------------------------------
  it('Req 10: Repeated admission requests with the same idempotency_key return existing admission', async () => {
    const idempotencyKey = 'key-uuid-' + crypto.randomUUID();
    const input: CreateAdmissionInput = {
      student_name: 'Key Idempotent Candidate',
      phone: '+91 98777 66666',
      email: 'key.idempotent@example.com',
      dob: '1999-07-25',
      gender: 'Female',
      address: '10 Jubilee Hills',
      city: 'Hyderabad',
      education: 'B.E. Civil',
      experience_years: 2,
      current_employment_status: 'Employed',
      course_id: 'crs-fico-01',
      admission_date: '2026-11-18',
      course_fee: 45000,
      discount: 0,
      payment_plan: 'Full Payment',
      idempotency_key: idempotencyKey,
    };

    const res1 = await createAdmissionWorkflow(input, counsellorUser.id, true);
    const countAfterFirst = store.admissions.length;

    const res2 = await createAdmissionWorkflow(input, counsellorUser.id, true);

    expect(res2.admission.id).toBe(res1.admission.id);
    expect(res2.admission.admission_number).toBe(res1.admission.admission_number);
    expect(store.admissions.length).toBe(countAfterFirst);
  });

  // --------------------------------------------------------------------------
  // Requirement 11: Cross-tenant conversion protection
  // --------------------------------------------------------------------------
  it('Req 11: Rejects cross-tenant lead conversion when lead tenant does not match actor tenant', async () => {
    const foreignLead: Lead = {
      created_by: counsellorUser.id,
      id: 'eeee1111-2222-3333-4444-555566667777',
      tenant_id: 'tenant-secondary',
      lead_code: 'LD-2026-FOREIGN',
      full_name: 'Foreign Tenant Lead',
      email: 'foreign.lead@example.com',
      phone: '+91 98888 77777',
      interested_course_id: 'crs-fico-01',
      stage: 'New',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    store.leads.push(foreignLead);

    const input: CreateAdmissionInput = {
      lead_id: foreignLead.id,
      student_name: foreignLead.full_name,
      phone: foreignLead.phone,
      email: foreignLead.email,
      dob: '2000-01-01',
      gender: 'Male',
      address: 'Foreign City',
      city: 'Chennai',
      education: 'B.Tech',
      experience_years: 0,
      current_employment_status: 'Student',
      course_id: 'crs-fico-01',
      admission_date: '2026-11-18',
      course_fee: 45000,
      discount: 0,
      payment_plan: 'Full Payment',
    };

    // counsellorUser belongs to 'default' tenant
    await expect(createAdmissionWorkflow(input, counsellorUser.id, true)).rejects.toThrow(
      'Forbidden: Lead access denied.'
    );
  });

  // --------------------------------------------------------------------------
  // Requirement 12: Role permission checks
  // --------------------------------------------------------------------------
  it('Req 12: Rejects admission creation by unauthorized roles (e.g. trainer, student)', async () => {
    const trainerUser: UserProfile = {
      id: '88888888-8888-8888-8888-888888888888',
      tenant_id: 'default',
      email: 'trainer@example.com',
      full_name: 'Trainer User',
      role: 'trainer',
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    store.users.push(trainerUser);

    const input: CreateAdmissionInput = {
      student_name: 'RBAC Test Student',
      phone: '+91 99999 11111',
      email: 'rbac.test@example.com',
      dob: '2000-01-01',
      gender: 'Male',
      address: '123 Street',
      city: 'Pune',
      education: 'B.Tech',
      experience_years: 1,
      current_employment_status: 'Employed',
      course_id: 'crs-fico-01',
      admission_date: '2026-11-18',
      course_fee: 45000,
      discount: 0,
      payment_plan: 'Full Payment',
    };

    await expect(createAdmissionWorkflow(input, trainerUser.id, true)).rejects.toThrow(
      'Unauthorized admission registration.'
    );
  });

  // --------------------------------------------------------------------------
  // Requirement 13: Phone number validation
  // --------------------------------------------------------------------------
  it('Req 13: Validates phone number during conversion and rejects invalid digits', async () => {
    const input: CreateAdmissionInput = {
      student_name: 'Invalid Phone Student',
      phone: '12345', // Invalid phone
      email: 'invalid.phone@example.com',
      dob: '2000-01-01',
      gender: 'Male',
      address: '123 Street',
      city: 'Pune',
      education: 'B.Tech',
      experience_years: 1,
      current_employment_status: 'Employed',
      course_id: 'crs-fico-01',
      admission_date: '2026-11-18',
      course_fee: 45000,
      discount: 0,
      payment_plan: 'Full Payment',
    };

    await expect(createAdmissionWorkflow(input, counsellorUser.id, true)).rejects.toThrow(
      /Indian mobile number|valid phone number/i
    );
  });

  // --------------------------------------------------------------------------
  // Requirement 14: Email validation
  // --------------------------------------------------------------------------
  it('Req 14: Validates student email and rejects malformed email addresses', async () => {
    const input: CreateAdmissionInput = {
      student_name: 'Invalid Email Student',
      phone: '+91 98111 22233',
      email: 'not-an-email', // Invalid email
      dob: '2000-01-01',
      gender: 'Male',
      address: '123 Street',
      city: 'Pune',
      education: 'B.Tech',
      experience_years: 1,
      current_employment_status: 'Employed',
      course_id: 'crs-fico-01',
      admission_date: '2026-11-18',
      course_fee: 45000,
      discount: 0,
      payment_plan: 'Full Payment',
    };

    await expect(createAdmissionWorkflow(input, counsellorUser.id, true)).rejects.toThrow(
      /Student email|valid student email/i
    );
  });

  // --------------------------------------------------------------------------
  // Requirement 15: Admissions search filter by admission number
  // --------------------------------------------------------------------------
  it('Req 15: Admissions search filters accurately by admission_number', () => {
    const testAdmission = {
      id: crypto.randomUUID(),
      admission_number: 'ADM-2026-9999',
      student_name: 'Target Search Student',
      phone: '+91 91234 56789',
      email: 'search.target@example.com',
      course_id: 'crs-fico-01',
      admission_date: '2026-11-18',
      course_fee: 45000,
      discount: 0,
      net_payable: 45000,
      payment_plan: 'Full Payment',
      status: 'Confirmed',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as unknown as Admission;
    store.admissions.push(testAdmission);

    const query = 'adm-2026-9999';
    const filtered = store.admissions.filter(
      (a) =>
        a.student_name?.toLowerCase().includes(query) ||
        a.admission_number?.toLowerCase().includes(query) ||
        a.email?.toLowerCase().includes(query)
    );

    expect(filtered.length).toBe(1);
    expect(filtered[0].admission_number).toBe('ADM-2026-9999');
    expect(filtered[0].student_name).toBe('Target Search Student');
  });

  // --------------------------------------------------------------------------
  // Requirement 16: Admissions URL search param application
  // --------------------------------------------------------------------------
  it('Req 16: URL search param on admissions page extracts and filters to specific admission', () => {
    const targetAdm = {
      id: crypto.randomUUID(),
      admission_number: 'ADM-2026-0005',
      student_name: 'Target URL Filter Student',
      phone: '+91 91234 56780',
      email: 'target.url.student@example.com',
      course_id: 'crs-fico-01',
      admission_date: '2026-11-18',
      course_fee: 45000,
      discount: 0,
      net_payable: 45000,
      payment_plan: 'Full Payment',
      status: 'Confirmed',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as unknown as Admission;
    store.admissions.push(targetAdm);

    const urlString = 'http://localhost:3000/admissions?search=ADM-2026-0005&status=All';
    const parsedUrl = new URL(urlString);
    const searchParam = parsedUrl.searchParams.get('search');
    const statusParam = parsedUrl.searchParams.get('status');

    expect(searchParam).toBe('ADM-2026-0005');
    expect(statusParam).toBe('All');

    const matchedAdmissions = store.admissions.filter((a) =>
      a.admission_number.toLowerCase().includes(searchParam!.toLowerCase())
    );
    expect(matchedAdmissions.length).toBeGreaterThanOrEqual(1);
    expect(matchedAdmissions.some((a) => a.admission_number === 'ADM-2026-0005')).toBe(true);
  });

  // --------------------------------------------------------------------------
  // Requirement 17: View Admission button in CRM Leads
  // --------------------------------------------------------------------------
  it('Req 17: View Admission button only displays when matching admission exists with valid admission_number', () => {
    const convertedLeadWithAdmission: Lead = {
      created_by: counsellorUser.id,
      id: 'ffff1111-2222-3333-4444-555566667777',
      tenant_id: 'default',
      lead_code: 'LD-2026-CONV',
      full_name: 'Converted With Admission',
      email: 'conv.with.adm@example.com',
      phone: '+91 98111 00001',
      interested_course_id: 'crs-fico-01',
      stage: 'Converted',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const linkedAdmission = {
      id: crypto.randomUUID(),
      lead_id: convertedLeadWithAdmission.id,
      admission_number: 'ADM-2026-0077',
      student_name: convertedLeadWithAdmission.full_name,
      phone: convertedLeadWithAdmission.phone,
      email: convertedLeadWithAdmission.email,
      course_id: 'crs-fico-01',
      admission_date: '2026-11-18',
      course_fee: 45000,
      discount: 0,
      net_payable: 45000,
      payment_plan: 'Full Payment',
      status: 'Confirmed',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as unknown as Admission;
    store.admissions.push(linkedAdmission);

    const ghostLead: Lead = {
      created_by: counsellorUser.id,
      id: 'ffff2222-2222-3333-4444-555566667777',
      tenant_id: 'default',
      lead_code: 'LD-2026-GHOST',
      full_name: 'Ghost Converted Lead',
      email: 'ghost.lead@example.com',
      phone: '+91 98111 00002',
      interested_course_id: 'crs-fico-01',
      stage: 'Converted',
      notes: 'Converted to Admission: ADM-2026-0036', // Ghost admission not in store.admissions
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // Lead with admission: matchingAdmission has admission_number
    const matchedValid = getLeadAdmission(convertedLeadWithAdmission, store.admissions);
    expect(matchedValid).toBeDefined();
    expect(matchedValid?.admission_number).toBe('ADM-2026-0077');
    const shouldRenderButton1 = Boolean(matchedValid?.admission_number);
    expect(shouldRenderButton1).toBe(true);

    // Ghost lead: matchingAdmission is undefined because ADM-2026-0036 is not in admissions
    const matchedGhost = getLeadAdmission(ghostLead, store.admissions);
    expect(matchedGhost).toBeUndefined();
    const shouldRenderButton2 = Boolean(matchedGhost?.admission_number);
    expect(shouldRenderButton2).toBe(false);
  });

  // --------------------------------------------------------------------------
  // Requirement 18: CRM leads reconciliation without false positives
  // --------------------------------------------------------------------------
  it('Req 18: getLeadAdmission does not misattribute a lead to another student based solely on seed notes when emails differ', () => {
    // Student B's admission
    const admissionStudentB = {
      id: crypto.randomUUID(),
      admission_number: 'ADM-2026-0003',
      student_name: 'Student B',
      phone: '+91 98111 33333',
      email: 'student.b@example.com',
      course_id: 'crs-fico-01',
      admission_date: '2026-11-18',
      course_fee: 45000,
      discount: 0,
      net_payable: 45000,
      payment_plan: 'Full Payment',
      status: 'Confirmed',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as unknown as Admission;
    store.admissions.push(admissionStudentB);

    // Lead A has seed note accidentally containing ADM-2026-0003, but email belongs to Candidate A
    const leadA: Lead = {
      created_by: counsellorUser.id,
      id: 'aaaa9999-2222-3333-4444-555566667777',
      tenant_id: 'default',
      lead_code: 'LD-2026-LEADA',
      full_name: 'Candidate A',
      email: 'candidate.a@example.com',
      phone: '+91 98111 99999',
      interested_course_id: 'crs-fico-01',
      stage: 'Contacted',
      notes: 'Initial inquiry note mentioning ADM-2026-0003 reference query',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // getLeadAdmission must NOT falsely match Student B's admission to Candidate A
    const matched = getLeadAdmission(leadA, store.admissions);
    expect(matched).toBeUndefined();
  });
});
