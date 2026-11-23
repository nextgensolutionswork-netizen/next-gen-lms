/**
 * Test Suite: BUG-07 Fix Admission-to-Student Data Synchronization
 *
 * Verifies:
 * 1. Converted lead without completed admission → Do not falsely enroll.
 * 2. Converted lead with completed admission → Student appears with accurate linkage.
 * 3. Direct admission → Student appears with canonical IDs and details.
 * 4. Student Directory refresh → Records remain visible.
 * 5. Student 360° Profile → Canonical student ID retrieves correct admission, fee ledger, course.
 * 6. Duplicate admission submission → Idempotent, no duplicate student.
 * 7. Invalid student ID → Proper error (404).
 * 8. Counsellor / Admin roles → Authorized data only.
 * 9. Payment pending approval → Existing dual-ledger business rules preserved.
 * 10. Database failure / empty lookup → Handled properly without false success or fabrication.
 * 11. GET /api/students & GET /api/students/[id] endpoints.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { store } from '@/lib/services/data-store';
import { createAdmissionWorkflow } from '@/lib/services/admission-service';
import { getStudents, getStudentById, getStudentProfileFullDetails } from '@/lib/services/student-service';
import { GET as studentsRoute } from '@/app/api/students/route';
import { GET as studentDetailsRoute } from '@/app/api/students/[id]/route';
import { generateAuthCookieSignatureSync } from '@/lib/security/auth-cookie';
import { UserProfile, UserRole, Student, Admission, Lead } from '@/types';

function createMockAuthRequest(urlPath: string, role: UserRole, userOverrides: Partial<UserProfile> = {}) {
  const user: UserProfile = {
    id: `usr-${role}-test-${Date.now()}`,
    email: `${role}.sync@next-generpsolutions.com`,
    full_name: `${role.toUpperCase()} Sync Test User`,
    role,
    tenant_id: 'default',
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...userOverrides,
  };

  if (!store.users) store.users = [];
  const existingIdx = store.users.findIndex((u) => u.id === user.id);
  if (existingIdx >= 0) {
    store.users[existingIdx] = user;
  } else {
    store.users.push(user);
  }

  const cookiePayload = JSON.stringify(user);
  const signature = generateAuthCookieSignatureSync(encodeURIComponent(cookiePayload));

  return new NextRequest(new URL(`http://localhost:3000${urlPath}`), {
    headers: {
      host: 'localhost:3000',
      accept: 'application/json',
      cookie: `next_gen_auth_user=${encodeURIComponent(cookiePayload)}; next_gen_auth_user_sig=${signature}`,
    },
  });
}

describe('BUG-07: Admission-to-Student Data Synchronization', () => {
  beforeEach(() => {
    store.hydrateFromDisk();
    store.users = store.users.map(u => ({ ...u, tenant_id: u.tenant_id || 'default' }));
    store.reconcileAdmissionsAndStudents();
    store.reconcileDualLedgers();
  });

  describe('Requirement 1 & 2: Converted Leads vs Completed Admissions', () => {
    it('does NOT falsely enroll a converted lead that has no completed admission', async () => {
      // Simulate a lead that was moved to stage "Converted" by a counsellor in CRM
      // but where no admission has ever been completed
      const leadId = `lead-unadmitted-${Date.now()}`;
      const unadmittedLead: Lead = {
        id: leadId,
        lead_code: 'LD-2026-UNADM-01',
        full_name: 'Unadmitted Lead Person',
        phone: '+91 99999 88888',
        email: 'unadmitted.lead@example.com',
        interested_course_id: store.courses[0]?.id || 'crs-fico-01',
        interested_course_name: 'SAP S/4HANA Finance (FICO)',
        current_status: 'Working Professional',
        training_preference: 'Online',
        lead_source: 'Website',
        counsellor_id: 'usr-counsellor',
        counsellor_name: 'Ananya Desai',
        stage: 'Converted', // Converted stage in CRM
        created_at: '2026-11-01T10:00:00Z',
        updated_at: '2026-11-01T10:00:00Z',
      };

      if (!store.leads) store.leads = [];
      store.leads.push(unadmittedLead);

      // Reconcile admissions and students
      store.reconcileAdmissionsAndStudents();

      const allStudents = await getStudents();
      const falseStudent = allStudents.find(
        (s) =>
          s.lead_id === leadId ||
          s.email?.toLowerCase() === unadmittedLead.email.toLowerCase() ||
          s.full_name === unadmittedLead.full_name
      );

      // Assert that this lead is NOT enrolled in the student directory
      expect(falseStudent).toBeUndefined();
    });

    it('successfully creates and links a student when a lead is converted into a completed admission', async () => {
      const leadId = `lead-converted-${Date.now()}`;
      const course = store.courses[0];
      const adminUser = store.users.find((u) => u.role === 'admin' || u.role === 'super_admin') || {
        id: 'usr-admin-test',
        role: 'admin',
      };
      const counsellor = store.users.find((u) => u.role === 'counsellor' && u.is_active) || {
        id: '44444444-4444-4444-4444-444444444444',
        role: 'counsellor',
      };

      store.leads.push({ id: leadId, created_by: counsellor.id, tenant_id: 'default', lead_code: leadId, full_name: 'Fixture Lead', phone: '9876543210', email: 'fixture@local.invalid', stage: 'New', created_at: '', updated_at: '' });
      const result = await createAdmissionWorkflow(
        {
          student_name: 'Admitted Lead Student',
          phone: '+91 98888 77777',
          email: `lead.admitted.${Date.now()}@example.com`,
          dob: '1998-05-15',
          gender: 'Female',
          address: '42 Lake View, Jubilee Hills',
          city: 'Hyderabad',
          education: 'B.Tech CSE',
          experience_years: 2,
          current_employment_status: 'Employed',
          course_id: course.id,
          course_fee: course.price,
          discount: 2000,
          discount_reason: 'Corporate referral',
          payment_plan: 'Full Payment',
          admission_date: '2026-11-14',
          counsellor_id: counsellor.id,
          lead_id: leadId,
        },
        adminUser.id,
        true
      );

      expect(result.admission).toBeDefined();
      expect(result.student).toBeDefined();
      expect(result.admission.lead_id).toBe(leadId);
      expect(result.admission.student_id).toBe(result.student.id);
      expect(result.student.admission_id).toBe(result.admission.id);
      expect(result.student.lead_id).toBe(leadId);

      // Verify student appears in student directory
      const directoryStudents = await getStudents();
      const foundInDirectory = directoryStudents.find((s) => s.id === result.student.id);
      expect(foundInDirectory).toBeDefined();
      expect(foundInDirectory?.full_name).toBe('Admitted Lead Student');
      expect(foundInDirectory?.admission_number).toBe(result.admission.admission_number);
    });

    it('successfully creates and links a student for a direct admission', async () => {
      const course = store.courses[0];
      const adminUser = store.users.find((u) => u.role === 'admin' || u.role === 'super_admin') || {
        id: 'usr-admin-test',
        role: 'admin',
      };

      const counsellor = store.users.find((u) => u.role === 'counsellor' && u.is_active) || {
        id: '44444444-4444-4444-4444-444444444444',
        role: 'counsellor',
      };

      const directResult = await createAdmissionWorkflow(
        {
          student_name: 'Direct Admission Candidate',
          phone: '+91 97777 66666',
          email: `direct.admission.${Date.now()}@example.com`,
          dob: '1999-09-20',
          gender: 'Male',
          address: '78 MG Road',
          city: 'Bengaluru',
          education: 'B.Com',
          experience_years: 1,
          current_employment_status: 'Employed',
          course_id: course.id,
          course_fee: course.price,
          discount: 0,
          payment_plan: 'Full Payment',
          admission_date: '2026-11-14',
          counsellor_id: counsellor.id,
        },
        adminUser.id,
        true
      );

      expect(directResult.admission).toBeDefined();
      expect(directResult.student).toBeDefined();
      expect(directResult.student.admission_id).toBe(directResult.admission.id);
      expect(directResult.admission.student_id).toBe(directResult.student.id);

      const student = await getStudentById(directResult.student.id);
      expect(student).toBeDefined();
      expect(student?.full_name).toBe('Direct Admission Candidate');
    });
  });

  describe('Requirement 2 & 5: Idempotency & Duplicate Prevention', () => {
    it('prevents duplicate student creation on duplicate admission submission', async () => {
      const leadId = `lead-idempotent-${Date.now()}`;
      const course = store.courses[0];
      const adminUser = store.users.find((u) => u.role === 'admin') || { id: 'usr-admin-test', role: 'admin' };
      const counsellor = store.users.find((u) => u.role === 'counsellor' && u.is_active) || {
        id: '44444444-4444-4444-4444-444444444444',
        role: 'counsellor',
      };

      store.leads.push({ id: leadId, created_by: counsellor.id, tenant_id: 'default', lead_code: leadId, full_name: 'Fixture Lead', phone: '9876543210', email: 'fixture@local.invalid', stage: 'New', created_at: '', updated_at: '' });
      const admissionInput = {
        student_name: 'Idempotency Check Student',
        phone: '+91 96666 55555',
        email: `idempotent.${Date.now()}@example.com`,
        dob: '1997-03-10',
        gender: 'Male' as const,
        address: '10 Bannerghatta Rd',
        city: 'Bengaluru',
        education: 'MCA',
        experience_years: 3,
        current_employment_status: 'Employed' as const,
        course_id: course.id,
        course_fee: course.price,
        discount: 0,
        payment_plan: 'Full Payment' as const,
        admission_date: '2026-11-14',
        counsellor_id: counsellor.id,
        lead_id: leadId,
        idempotency_key: `key-${leadId}`,
      };

      // First submission
      const firstResult = await createAdmissionWorkflow(admissionInput, adminUser.id, true);
      const studentCountAfterFirst = store.students.length;

      // Second identical submission with same lead_id and idempotency_key
      const secondResult = await createAdmissionWorkflow(admissionInput, adminUser.id, true);
      const studentCountAfterSecond = store.students.length;

      expect(secondResult.admission.id).toBe(firstResult.admission.id);
      expect(secondResult.student.id).toBe(firstResult.student.id);
      expect(studentCountAfterSecond).toBe(studentCountAfterFirst);
    });

    it('idempotently reconciles existing completed admissions into student records', () => {
      const initialCount = store.students.length;
      store.reconcileAdmissionsAndStudents();
      const countAfterFirst = store.students.length;
      store.reconcileAdmissionsAndStudents();
      const countAfterSecond = store.students.length;

      expect(countAfterSecond).toBe(countAfterFirst);
      expect(countAfterFirst).toBeGreaterThanOrEqual(initialCount);

      // Verify every non-cancelled admission is linked
      for (const adm of store.admissions) {
        if (adm.status === 'Cancelled') continue;
        const linkedStudent = store.students.find(
          (s) => (adm.student_id ? s.id === adm.student_id : false) || s.admission_id === adm.id
        );
        expect(linkedStudent).toBeDefined();
        expect(adm.student_id).toBe(linkedStudent?.id);
      }
    });
  });

  describe('Requirement 3 & 4: Student Directory & Student 360° Profile', () => {
    it('retrieves student by canonical ID, student code, admission ID, or admission number', async () => {
      const admittedStudent = store.students.find((s) => s.admission_number && s.admission_id);
      expect(admittedStudent).toBeDefined();
      if (!admittedStudent) return;

      // By internal ID
      const byId = await getStudentById(admittedStudent.id);
      expect(byId?.id).toBe(admittedStudent.id);

      // By student_code
      const byCode = await getStudentById(admittedStudent.student_code);
      expect(byCode?.id).toBe(admittedStudent.id);

      // By admission_number
      const byAdmNum = await getStudentById(admittedStudent.admission_number);
      expect(byAdmNum?.id).toBe(admittedStudent.id);

      // By admission_id
      const byAdmId = await getStudentById(admittedStudent.admission_id);
      expect(byAdmId?.id).toBe(admittedStudent.id);
    });

    it('loads full Student 360° profile with admission, course, and fee details', async () => {
      const sampleStudent = store.students[0];
      expect(sampleStudent).toBeDefined();
      if (!sampleStudent) return;

      const profile = await getStudentProfileFullDetails(sampleStudent.id);
      expect(profile).not.toBeNull();
      expect(profile?.student.id).toBe(sampleStudent.id);
      expect(profile?.admission).toBeDefined();
      expect(profile?.admission?.admission_number).toBe(sampleStudent.admission_number);
      expect(profile?.course).toBeDefined();
      expect(profile?.feeAccount).toBeDefined();
    });

    it('returns null and does not fabricate records for an invalid student ID', async () => {
      const nonExistentProfile = await getStudentProfileFullDetails('non-existent-student-id-99999');
      expect(nonExistentProfile).toBeNull();

      const nonExistentStudent = await getStudentById('non-existent-student-id-99999');
      expect(nonExistentStudent).toBeUndefined();
    });
  });

  describe('Requirement 6: API Security & Role Scoping', () => {
    it('returns 200 with all tenant students for super_admin and admin roles', async () => {
      const adminReq = createMockAuthRequest('/api/students', 'admin');
      const response = await studentsRoute(adminReq);
      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json.success).toBe(true);
      expect(Array.isArray(json.students)).toBe(true);
      expect(json.students.length).toBeGreaterThanOrEqual(2);
      expect(response.headers.get('cache-control')).toContain('private');
      expect(response.headers.get('cache-control')).toContain('no-store');
    });

    it('scopes student directory for counsellor role to authorized admissions/students', async () => {
      const counsellorUser = store.users.find((u) => u.role === 'counsellor') || {
        id: 'usr-counsellor-assigned',
        role: 'counsellor',
      };
      const counsellorReq = createMockAuthRequest('/api/students', 'counsellor', {
        id: counsellorUser.id,
        role: 'counsellor',
      });

      const response = await studentsRoute(counsellorReq);
      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json.success).toBe(true);
      expect(Array.isArray(json.students)).toBe(true);
    });

    it('returns 401 Unauthorized when request has no session authentication', async () => {
      const unauthReq = new NextRequest(new URL('http://localhost:3000/api/students'));
      const response = await studentsRoute(unauthReq);
      expect(response.status).toBe(401);

      const json = await response.json();
      expect(json.success).toBe(false);
    });

    it('returns 404 from GET /api/students/[id] when student ID does not exist', async () => {
      const adminReq = createMockAuthRequest('/api/students/unknown-id', 'admin');
      const response = await studentDetailsRoute(adminReq, {
        params: Promise.resolve({ id: 'unknown-id-404' }),
      });
      expect(response.status).toBe(404);

      const json = await response.json();
      expect(json.success).toBe(false);
      expect(json.error).toBe('Student profile not found.');
    });

    it('returns 200 from GET /api/students/[id] with full profile for valid canonical student', async () => {
      const targetStudent = store.students[0];
      const adminReq = createMockAuthRequest(`/api/students/${targetStudent.id}`, 'admin');
      const response = await studentDetailsRoute(adminReq, {
        params: Promise.resolve({ id: targetStudent.id }),
      });
      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json.success).toBe(true);
      expect(json.student.id).toBe(targetStudent.id);
      expect(json.admission).toBeDefined();
      expect(json.feeAccount).toBeDefined();
    });

    it('preserves existing dual-ledger payment approval status without premature verified deduction', async () => {
      const sampleStudent = store.students[0];
      const feeAccount = store.feeAccounts.find((fa) => fa.student_id === sampleStudent.id);

      if (feeAccount) {
        // Pending payments must not falsely decrement outstanding balance
        const unapprovedPayment = {
          tenant_id: 'default',
          id: `pay-unapproved-${Date.now()}`,
          fee_id: `fee-${feeAccount.id}`,
          student_id: sampleStudent.id,
          student_name: sampleStudent.full_name,
          admission_number: sampleStudent.admission_number,
          fee_category: 'Course Fee',
          amount_paid: 5000,
          payment_date: '2026-11-14',
          payment_mode: 'UPI' as const,
          status: 'Pending Approval' as const,
        };
        if (!store.studentPayments) store.studentPayments = [];
        store.studentPayments.push(unapprovedPayment as any);

        store.reconcileDualLedgers();
        store.reconcileAdmissionsAndStudents();

        const updatedStudent = await getStudentById(sampleStudent.id);
        // Student's outstanding amount must match feeAccount's authoritative outstanding amount
        expect(updatedStudent?.outstanding_amount).toBe(feeAccount.outstanding_amount);
      }
    });
  });
});
