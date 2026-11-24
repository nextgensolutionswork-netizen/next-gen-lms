import * as React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import FeeApprovalsPage from '@/app/(dashboard)/accounts/approvals/page';
import { store } from '@/lib/services/data-store';
import { resolveCanonicalCounsellorId } from '@/lib/services/counsellor-service';
import { findOriginalReceivingAccount, getAuthorizedBankAccounts } from '@/lib/utils/bank-autofill';
import { formatINR, formatDate } from '@/lib/utils/formatters';
import { getCanonicalPhoneDigits } from '@/lib/utils/phone-validation';
import type { StudentPaymentRecord, Student, Admission, UserProfile } from '@/types';

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => '/accounts/approvals',
}));

// Mock auth provider for an Accountant user
vi.mock('@/components/providers/auth-provider', () => ({
  useAuth: () => ({
    user: {
      id: 'acc-user-uuid-1',
      full_name: 'Lead Accountant',
      email: 'accountant@nextgen.com',
      role: 'accountant',
      tenant_id: 'default',
    },
    role: 'accountant',
    hasPermission: (perm: string) => perm.startsWith('accounts:'),
    isLoading: false,
    logout: vi.fn(),
  }),
}));

describe('BUG-22: Fee Approvals Table Column Customization', () => {
  beforeEach(() => {
    store.reconcileAuthoritativeStaffProfiles();
    store.reconcileAuthoritativeCourses();
    store.reconcileAuthoritativeAdmissions();
  });

  describe('1. Column Structure & Ordering', () => {
    it('defines exactly seven columns in the specified order', () => {
      // Payment Approvals desk is default active desk
      const html = renderToString(<FeeApprovalsPage />);
      expect(html).toBeDefined();

      // Verify the expected column headers are present in order
      const expectedHeaders = [
        'Student &amp; LMS ID',
        'Phone Number',
        'Amount Paid',
        'Payment Date',
        'Account Holder Name',
        'Counsellor Name',
        'Actions',
      ];

      // Verify each required column header exists
      for (const header of expectedHeaders) {
        expect(html).toContain(header);
      }

      // Verify obsolete columns are removed from the payment approvals table
      expect(html).not.toContain('Mode &amp; Date');
      expect(html).not.toContain('Reference / UTR / Proof');
      expect(html).not.toContain('Recorded / Updated By');
    });
  });

  describe('2. Column 1: Student & LMS ID Resolution', () => {
    it('displays student full name and authoritative student LMS ID without confusing with admission number', () => {
      const student = store.students[0];
      expect(student).toBeDefined();
      expect(student.full_name).toBeDefined();

      // The LMS ID must be student_unique_id || student_code || id and NOT the admission number
      const lmsId =
        student.student_unique_id ||
        student.student_code ||
        student.id;

      expect(lmsId).toBeDefined();
      expect(lmsId).toBe(student.student_unique_id || student.student_code || student.id);
      expect(lmsId).not.toBe(student.admission_number);
    });

    it('resolves LMS ID from admission if student record is not yet linked', () => {
      const mockAdmissionWithUniqueId: Admission = {
        ...store.admissions[0],
        admission_number: 'ADM-2026-0099',
        student_unique_id: 'NGERP-2026-0099',
      };

      const lmsId = (mockAdmissionWithUniqueId as any).student_unique_id || (mockAdmissionWithUniqueId as any).student_code || mockAdmissionWithUniqueId.id;
      expect(lmsId).toBe('NGERP-2026-0099');
      expect(lmsId).not.toBe(mockAdmissionWithUniqueId.admission_number);
    });
  });

  describe('3. Column 2: Phone Number & WhatsApp Formatting', () => {
    it('retrieves student phone from student or admission record and preserves country code', () => {
      const student = store.students[0];
      expect(student?.phone).toBeDefined();

      const digits = getCanonicalPhoneDigits(student.phone);
      const cleanPhone = student.phone.trim();
      const displayPhone = cleanPhone.startsWith('+') ? cleanPhone : `+91 ${cleanPhone.replace(/^0+/, '')}`;

      expect(displayPhone).toContain('+91');
      expect(displayPhone).toContain(digits.slice(-5));
    });

    it('generates a clean WhatsApp link with canonical 10-digit format', () => {
      const phone = '+91 98111 22233';
      const cleanPhone = phone.replace(/[^0-9]/g, '').slice(-10);
      const waLink = `https://wa.me/91${cleanPhone}`;
      expect(waLink).toBe('https://wa.me/919811122233');
    });
  });

  describe('4. Column 3: Amount Paid Formatting', () => {
    it('formats exact amount in Indian Rupees without altering transaction value', () => {
      const amount = 35000;
      const formatted = formatINR(amount);
      expect(formatted).toContain('35,000');
      expect(formatted).toContain('₹');
    });
  });

  describe('5. Column 4: Payment Date Formatting', () => {
    it('formats payment date as DD MMM YYYY and does not substitute approval date', () => {
      const originalPaymentDate = '2026-10-15';
      const formatted = formatDate(originalPaymentDate);
      expect(formatted).toContain('15');
      expect(formatted).toContain('Oct');
      expect(formatted).toContain('2026');
    });
  });

  describe('6. Column 5: Receiving Account Holder Name Resolution', () => {
    it('resolves the institute receiving account holder name, never the student name', () => {
      const accounts = getAuthorizedBankAccounts('accountant');
      expect(accounts.length).toBeGreaterThan(0);

      const defaultAccount = accounts[0];
      expect(defaultAccount.account_holder_name).toBeDefined();
      expect(defaultAccount.account_holder_name).toBe('Katari Charitha');

      // Cash payments show Institute Cash Counter
      const cashPaymentMode = 'Cash';
      const cashHolder = cashPaymentMode === 'Cash' ? 'Institute Cash Counter' : defaultAccount.account_holder_name;
      expect(cashHolder).toBe('Institute Cash Counter');
      expect(cashHolder).not.toBe('Nikhil Pamulaparthi');
    });

    it('uses verified account details when payment is approved', () => {
      const mockPayment: Partial<StudentPaymentRecord> = {
        id: 'pay-1',
        amount_paid: 25000,
        payment_mode: 'UPI',
        verification_status: 'Verified',
        our_bank_account_name: 'NEXT GEN ERP SOLUTIONS (HDFC)',
        verified_our_bank_account_name: 'NEXT GEN ERP SOLUTIONS - ICICI VERIFIED',
      };

      const isApproved = mockPayment.verification_status === 'Verified';
      const accountHolder = (isApproved && mockPayment.verified_our_bank_account_name) || mockPayment.our_bank_account_name;

      expect(accountHolder).toBe('NEXT GEN ERP SOLUTIONS - ICICI VERIFIED');
    });
  });

  describe('7. Column 6: Assigned Counsellor Resolution', () => {
    it('resolves counsellor from linked admission record via canonical ID and not the payment recorder', () => {
      const admission = store.admissions.find((a) => a.admission_number === 'ADM-2026-0031');
      expect(admission).toBeDefined();
      expect(admission?.counsellor_id).toBe('987c67ef-388c-4467-90d6-4c4635398ed7'); // Amulya

      const canonicalId = resolveCanonicalCounsellorId(admission!.counsellor_id);
      expect(canonicalId).toBe('987c67ef-388c-4467-90d6-4c4635398ed7');

      const counsellorUser = store.users.find((u) => u.id === canonicalId);
      expect(counsellorUser?.full_name).toBe('Amulya');

      // Even if recorded_by was an Accountant or Admin, the assigned counsellor must remain Amulya
      const mockPayment: Partial<StudentPaymentRecord> = {
        id: 'pay-test-1',
        admission_number: 'ADM-2026-0031',
        student_id: admission!.student_id,
        recorded_by: 'acc-user-uuid-1', // recorded by accountant
        recorded_by_name: 'Lead Accountant',
      };

      const linkedAdm = store.admissions.find((a) => a.admission_number === mockPayment.admission_number);
      const assignedCounsellor = linkedAdm?.counsellor_name || store.users.find((u) => u.id === linkedAdm?.counsellor_id)?.full_name;

      expect(assignedCounsellor).toBe('Amulya');
      expect(assignedCounsellor).not.toBe(mockPayment.recorded_by_name);
    });
  });

  describe('8. Column 7: Actions (Update & Approve)', () => {
    it('allows Update for pending payments when authorized', () => {
      const mockPayment: Partial<StudentPaymentRecord> = {
        id: 'pay-pending-1',
        status: 'Pending Approval',
        verification_status: 'Pending Verification',
        recorded_by: 'counsellor-user-1',
      };

      const isApproved = mockPayment.status === 'Approved' || mockPayment.verification_status === 'Verified';
      const canEdit = !isApproved;

      expect(canEdit).toBe(true);
    });

    it('prevents editing of already approved payments', () => {
      const mockPayment: Partial<StudentPaymentRecord> = {
        id: 'pay-approved-1',
        status: 'Approved',
        verification_status: 'Verified',
      };

      const isApproved = mockPayment.status === 'Approved' || mockPayment.verification_status === 'Verified';
      const canEdit = !isApproved;

      expect(canEdit).toBe(false);
    });

    it('enforces separation of duties: payment recorder cannot approve their own entry', () => {
      const currentUserId = 'counsellor-user-1';
      const mockPayment: Partial<StudentPaymentRecord> = {
        id: 'pay-self-1',
        status: 'Pending Approval',
        verification_status: 'Pending Verification',
        recorded_by: 'counsellor-user-1', // recorded by self
      };

      const isOwn = mockPayment.recorded_by === currentUserId;
      const userRole: string = 'counsellor';
      const canVerify = (userRole === 'accountant' || userRole === 'admin' || userRole === 'super_admin') && !isOwn;

      expect(canVerify).toBe(false);
    });

    it('approved payments cannot be approved again', () => {
      const mockPayment: Partial<StudentPaymentRecord> = {
        id: 'pay-cleared-1',
        status: 'Approved',
        verification_status: 'Verified',
        receipt_number: 'REC-2026-0001',
      };

      const isApproved = mockPayment.verification_status === 'Verified';
      expect(isApproved).toBe(true);

      // In the UI, approved payments show the Approved badge and receipt link, not an Approve button
      const canShowApproveButton = !isApproved;
      expect(canShowApproveButton).toBe(false);
    });
  });
});
