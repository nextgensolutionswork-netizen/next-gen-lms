import { describe, it, expect, beforeEach } from 'vitest';
import { ROLE_PERMISSIONS, hasPermission, canAccessCourse } from '@/lib/auth/rbac';
import { UserProfile } from '@/types';
import { store } from '@/lib/services/data-store';
import { createAdmissionWorkflow } from '@/lib/services/admission-service';
import { recordPaymentAtomic } from '@/lib/services/finance-service';
import { markAttendance } from '@/lib/services/academics-service';
import { verifyAndGenerateCertificate } from '@/lib/services/certificate-service';

describe('1. RBAC & Permission Tests', () => {
  const superAdminUser: UserProfile = {
    id: 'u-sa',
    email: 'sa@test.com',
    full_name: 'Super Admin',
    role: 'super_admin',
    is_active: true,
    created_at: '',
    updated_at: '',
  };

  const accountantUser: UserProfile = {
    id: 'u-acc',
    email: 'acc@test.com',
    full_name: 'Accountant',
    role: 'accountant',
    is_active: true,
    created_at: '',
    updated_at: '',
  };

  const trainerUser: UserProfile = {
    id: 'u-tr',
    email: 'tr@test.com',
    full_name: 'Trainer FICO',
    role: 'trainer',
    is_active: true,
    assigned_course_ids: ['crs-fico-01'],
    created_at: '',
    updated_at: '',
  };

  const trainerWithoutCourses: UserProfile = {
    id: 'u-tr-empty',
    email: 'tr2@test.com',
    full_name: 'Trainer Unassigned',
    role: 'trainer',
    is_active: true,
    assigned_course_ids: [],
    created_at: '',
    updated_at: '',
  };

  it('Super Admin has access to all permissions', () => {
    expect(hasPermission(superAdminUser, 'all:manage')).toBe(true);
    expect(hasPermission(superAdminUser, 'settings:manage')).toBe(true);
    expect(hasPermission(superAdminUser, 'audit:read')).toBe(true);
  });

  it('Accountant has payment & receipt permissions but NOT academic course modification', () => {
    expect(hasPermission(accountantUser, 'payments:create')).toBe(true);
    expect(hasPermission(accountantUser, 'receipts:create')).toBe(true);
    expect(hasPermission(accountantUser, 'courses:publish')).toBe(false);
    expect(hasPermission(accountantUser, 'all:manage')).toBe(false);
  });

  it('Default Deny: Inactive user gets zero permissions', () => {
    const inactiveUser = { ...superAdminUser, is_active: false };
    expect(hasPermission(inactiveUser, 'all:manage')).toBe(false);
    expect(hasPermission(null, 'students:read')).toBe(false);
  });

  it('Course Scoping: Trainer only has access to explicitly assigned courses', () => {
    expect(canAccessCourse(trainerUser, 'crs-fico-01')).toBe(true);
    expect(canAccessCourse(trainerUser, 'crs-mm-01')).toBe(false);
  });

  it('Course Scoping: Trainer with NO assigned courses sees ZERO courses (never falls back)', () => {
    expect(canAccessCourse(trainerWithoutCourses, 'crs-fico-01')).toBe(false);
    expect(canAccessCourse(trainerWithoutCourses, 'crs-mm-01')).toBe(false);
  });

  it('Accountant is strictly prohibited from accessing confidential academic courses', () => {
    expect(canAccessCourse(accountantUser, 'crs-fico-01')).toBe(false);
  });
});

describe('2. Admissions & Automated Student Lifecycle Workflow', () => {
  it('Creates student profile, fee ledger, and installment schedule automatically upon admission', async () => {
    const uniqueEmail = `test.student.${Date.now()}@example.com`;
    const result = await createAdmissionWorkflow(
      {
        student_name: 'Rajesh Test',
        phone: '+91 99999 88888',
        email: uniqueEmail,
        dob: '2000-01-01',
        gender: 'Male',
        address: 'Madhapur',
        city: 'Hyderabad',
        education: 'B.Tech',
        experience_years: 1,
        current_employment_status: 'Employed',
        course_id: 'crs-fico-01',
        training_mode: 'Hybrid',
        admission_date: '2026-03-01',
        course_fee: 45000,
        discount: 5000,
        discount_reason: 'Merit',
        payment_plan: '2 Installments',
      },
      'usr-admin'
    );

    // Verify admission
    expect(result.admission.student_name).toBe('Rajesh Test');
    expect(result.admission.net_payable).toBe(40000);
    expect(result.admission.admission_number).toContain('ADM-');

    // Verify student account
    expect(result.student.full_name).toBe('Rajesh Test');
    expect(result.student.email).toBe(uniqueEmail);
    expect(result.student.total_fee).toBe(40000);
    expect(result.student.outstanding_amount).toBe(40000);

    // Verify fee account & installments
    expect(result.feeAccount.net_payable).toBe(40000);
    const insts = store.installments.filter((i) => i.fee_account_id === result.feeAccount.id);
    expect(insts.length).toBe(2);
    expect(insts[0].amount).toBe(20000);
    expect(insts[1].amount).toBe(20000);
  });
});

describe('3. Financial Operations & Atomic Payment Transactions', () => {
  it('Records payment, updates fee account, updates installment, and produces official receipt atomically', async () => {
    const student = store.students[0];
    const feeAccount = store.feeAccounts.find((f) => f.student_id === student.id)!;
    const initialOutstanding = feeAccount.outstanding_amount;
    const payAmount = 5000;
    const uniqueTxn = `TEST-TXN-${Date.now()}`;

    const res = await recordPaymentAtomic(
      {
        student_id: student.id,
        course_id: student.course_id,
        fee_account_id: feeAccount.id,
        amount: payAmount,
        payment_date: '2026-03-01',
        payment_mode: 'UPI',
        transaction_reference: uniqueTxn,
      },
      'usr-accounts'
    );

    // Verify payment record
    expect(res.payment.amount).toBe(payAmount);
    expect(res.payment.transaction_reference).toBe(uniqueTxn);
    expect(res.payment.receipt_number).toContain('REC-');

    // Verify fee account balance reduced
    expect(res.updatedFeeAccount.outstanding_amount).toBe(initialOutstanding - payAmount);
    expect(student.outstanding_amount).toBe(initialOutstanding - payAmount);

    // Verify receipt generated
    expect(res.receipt.payment_amount).toBe(payAmount);
    expect(res.receipt.remaining_balance).toBe(initialOutstanding - payAmount);
  });

  it('Detects and prevents duplicate payment transactions with the same transaction reference', async () => {
    const student = store.students[0];
    const feeAccount = store.feeAccounts.find((f) => f.student_id === student.id)!;
    const duplicateTxn = `DUP-TXN-REF-9999`;

    // First attempt
    await recordPaymentAtomic(
      {
        student_id: student.id,
        course_id: student.course_id,
        fee_account_id: feeAccount.id,
        amount: 1000,
        payment_date: '2026-03-01',
        payment_mode: 'UPI',
        transaction_reference: duplicateTxn,
      },
      'usr-accounts'
    );

    // Second attempt with exact same transaction reference must reject
    await expect(
      recordPaymentAtomic(
        {
          student_id: student.id,
          course_id: student.course_id,
          fee_account_id: feeAccount.id,
          amount: 1000,
          payment_date: '2026-03-01',
          payment_mode: 'UPI',
          transaction_reference: duplicateTxn,
        },
        'usr-accounts'
      )
    ).rejects.toThrow(/Duplicate transaction reference detected/);
  });
});

describe('4. Attendance & Academic Grading', () => {
  it('Marks attendance and updates overall percentage calculation', async () => {
    const student = store.students[0];
    const session = store.classSessions[0];

    const records = await markAttendance(
      session.id,
      [{ student_id: student.id, status: 'Present' }],
      'usr-trainer-fico'
    );

    expect(records.length).toBe(1);
    expect(records[0].status).toBe('Present');
    expect(student.attendance_percentage).toBeGreaterThan(0);
  });
});

describe('5. Certificate Criteria Verification', () => {
  it('Rejects certificate issuance if attendance or course completion benchmarks are not met', async () => {
    // Select student who does not have an issued certificate
    const lowStudent = store.students.find(
      (s) => !store.certificates.some((c) => c.student_id === s.id)
    )!;
    lowStudent.attendance_percentage = 60; // Below 80%

    const result = await verifyAndGenerateCertificate(lowStudent.id, lowStudent.course_id, 'usr-admin');
    expect(result.eligible).toBe(false);
    expect(result.reasons.length).toBeGreaterThan(0);
    expect(result.reasons[0]).toContain('Attendance is 60%, minimum 80% required');
  });
});
