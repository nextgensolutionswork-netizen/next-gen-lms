import { describe, it, expect, beforeEach } from 'vitest';
import { validateEmailAddress } from '@/lib/utils/email-validation';
import {
  getAuthorizedBankAccounts,
  findBankAccountByHolder,
  maskSensitiveAccountNumber,
} from '@/lib/utils/bank-autofill';
import { store } from '@/lib/services/data-store';
import { createClassSession } from '@/lib/services/academics-service';
import { adjustDiscontinuedStudentFee } from '@/lib/services/finance-service';
import { feeWorkflowService } from '@/lib/services/fee-workflow-service';
import { generateReceiptPdfBuffer } from '@/lib/services/pdf-service';
import { inflateSync } from 'node:zlib';
import type { Receipt, StudentFeeAccount } from '@/types';

function extractPdfText(buffer: Buffer): string {
  let text = '';
  for (const match of buffer.toString('latin1').matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    let stream: string;
    try {
      stream = inflateSync(Buffer.from(match[1], 'latin1')).toString('latin1');
    } catch {
      continue;
    }
    for (const token of stream.matchAll(/<([a-f0-9]+)>/gi)) {
      text += Buffer.from(token[1], 'hex').toString('latin1');
    }
  }
  return text;
}

describe('Next-Gen ERP: Six Core Enhancements Test Suite', () => {
  // =========================================================================
  // ENHANCEMENT 1: Email Validation
  // =========================================================================
  describe('1. Email Validation (Frontend & Backend)', () => {
    it('accepts valid RFC-compliant emails across mainstream providers and institutions', () => {
      const validEmails = [
        'student@gmail.com',
        'counsellor.support@outlook.com',
        'accountant_finance@yahoo.co.in',
        'admin.corp@institution.edu',
        'firstname.lastname@my-company.org',
        'user+tag@domain.co.uk',
      ];

      for (const email of validEmails) {
        const result = validateEmailAddress(email, 'Email');
        expect(result.isValid, `Failed for valid email: ${email}`).toBe(true);
        expect(result.error).toBeUndefined();
      }
    });

    it('rejects improperly formatted email addresses', () => {
      const invalidEmails = [
        'plainaddress',
        '@missingusername.com',
        'username@.com',
        'username@domain..com',
        'username@domain,com',
        'user space@domain.com',
        'user@domain space.com',
        'two@@at.com',
        'user@nodot',
        '.leadingdot@domain.com',
        'trailingdot.@domain.com',
      ];

      for (const email of invalidEmails) {
        const result = validateEmailAddress(email, 'Contact Email');
        expect(result.isValid, `Should have failed for invalid email: ${email}`).toBe(false);
        expect(result.error).toBeTruthy();
      }
    });

    it('honors the required flag when validating empty or whitespace email', () => {
      const optionalEmpty = validateEmailAddress('', 'Email', false);
      expect(optionalEmpty.isValid).toBe(true);

      const requiredEmpty = validateEmailAddress('', 'Email', true);
      expect(requiredEmpty.isValid).toBe(false);
      expect(requiredEmpty.error).toMatch(/Email is required/);

      const requiredWhitespace = validateEmailAddress('   ', 'Student Email', true);
      expect(requiredWhitespace.isValid).toBe(false);
      expect(requiredWhitespace.error).toMatch(/Student Email is required/);
    });
  });

  // =========================================================================
  // ENHANCEMENT 2: Bank Account Autofill & Role-based Masking
  // =========================================================================
  describe('2. Bank Account Autofill & Role-Based Masking', () => {
    beforeEach(() => {
      // Ensure test authorized bank accounts in system settings
      store.settings.authorized_bank_accounts = [
        {
          id: 'bank-01',
          account_holder_name: 'Dr. Rajesh Sharma (Director)',
          bank_name: 'HDFC Bank',
          account_number: '50200012345678',
          ifsc_code: 'HDFC0001234',
          branch: 'Koramangala, Bengaluru',
          upi_id: 'director@hdfcbank',
          is_active: true,
        },
        {
          id: 'bank-02',
          account_holder_name: 'Next-Gen Educational Trust (Operating)',
          bank_name: 'State Bank of India',
          account_number: '312345678901',
          ifsc_code: 'SBIN0004567',
          branch: 'MG Road, Bengaluru',
          upi_id: 'nextgentrust@sbi',
          is_active: true,
        },
      ];
    });

    it('returns unmasked account numbers to authorized financial roles', () => {
      const accountsForAdmin = getAuthorizedBankAccounts('super_admin');
      expect(accountsForAdmin.length).toBeGreaterThanOrEqual(2);
      expect(accountsForAdmin[0].account_number).toBe('50200012345678');

      const accountsForAccountant = getAuthorizedBankAccounts('accountant');
      expect(accountsForAccountant[0].account_number).toBe('50200012345678');
    });

    it('masks sensitive account numbers for non-finance roles such as counsellors', () => {
      const accountsForCounsellor = getAuthorizedBankAccounts('counsellor');
      expect(accountsForCounsellor.length).toBeGreaterThanOrEqual(2);
      // Number must be masked with only last 4 digits visible
      expect(accountsForCounsellor[0].account_number).toBe('•••• •••• 5678');
      expect(accountsForCounsellor[0].account_number).not.toContain('5020001234');
    });

    it('autofills corresponding bank details accurately by holder name', () => {
      const found = findBankAccountByHolder('Dr. Rajesh Sharma (Director)', 'admin');
      expect(found).toBeDefined();
      expect(found?.bank_name).toBe('HDFC Bank');
      expect(found?.ifsc_code).toBe('HDFC0001234');
      expect(found?.upi_id).toBe('director@hdfcbank');
    });

    it('correctly masks account numbers of different lengths', () => {
      expect(maskSensitiveAccountNumber('123456789012')).toBe('•••• •••• 9012');
      expect(maskSensitiveAccountNumber('9876')).toBe('9876');
      expect(maskSensitiveAccountNumber('')).toBe('—');
    });
  });

  // =========================================================================
  // ENHANCEMENT 3: Remove Duplicate Name Restrictions
  // =========================================================================
  describe('3. Remove Duplicate Name Restrictions', () => {
    it('allows multiple students with identical full names to coexist with unique IDs', () => {
      const uniqueSuffix = Date.now();
      const student1 = {
        id: `student-dup-01-${uniqueSuffix}`,
        student_code: `STU-2026-901-${uniqueSuffix}`,
        name: 'Rahul Sharma',
        email: `rahul.sharma1.${uniqueSuffix}@example.com`,
        phone: '+919876543210',
        course_id: 'crs-1',
        course_name: 'Full Stack Development',
        enrollment_date: '2026-01-10',
        status: 'Active' as const,
      };
      const student2 = {
        id: `student-dup-02-${uniqueSuffix}`,
        student_code: `STU-2026-902-${uniqueSuffix}`,
        name: 'Rahul Sharma', // identical full name
        email: `rahul.sharma2.${uniqueSuffix}@example.com`,
        phone: '+919876543211',
        course_id: 'crs-2',
        course_name: 'Data Science & AI',
        enrollment_date: '2026-02-15',
        status: 'Active' as const,
      };

      store.students.push(student1 as any, student2 as any);

      const matches = store.students.filter((s) => (s as any).name === 'Rahul Sharma' || s.full_name === 'Rahul Sharma');
      expect(matches.length).toBeGreaterThanOrEqual(2);
      const s1 = matches.find((s) => s.id === student1.id)!;
      const s2 = matches.find((s) => s.id === student2.id)!;
      expect(s1.id).not.toBe(s2.id);
      expect(s1.student_code).not.toBe(s2.student_code);
    });

    it('disambiguates faculty schedule conflicts by trainer_id instead of name', async () => {
      const idA = `trainer-a-${Date.now()}`;
      const idB = `trainer-b-${Date.now()}`;
      const trainerA = {
        id: idA,
        name: 'Priya Singh',
        full_name: 'Priya Singh',
        role: 'trainer' as const,
        email: `priya.singh1.${Date.now()}@example.com`,
        is_active: true,
      };
      const trainerB = {
        id: idB,
        name: 'Priya Singh', // same full name!
        full_name: 'Priya Singh',
        role: 'trainer' as const,
        email: `priya.singh2.${Date.now()}@example.com`,
        is_active: true,
      };

      store.users.push(trainerA as any, trainerB as any);

      // Add a class session for trainerA on 2026-12-01 from 10:00 to 12:00
      store.classSessions.push({
        id: `sess-test-${Date.now()}`,
        batch_id: 'batch-01',
        topic: 'SAP FI Ledger Setup',
        session_date: '2026-12-01',
        start_time: '10:00',
        end_time: '12:00',
        trainer_id: idA,
        trainer_name: 'Priya Singh',
        classroom: 'Lab 1',
        status: 'Scheduled',
        mode: 'offline',
      } as any);

      // Attempting to schedule trainerA at the same time throws a conflict
      await expect(
        createClassSession({
          batch_id: 'batch-02',
          topic: 'SAP FI Month End',
          session_date: '2026-12-01',
          start_time: '10:30',
          end_time: '11:30',
          trainer_id: idA, // Same trainer A
          classroom: 'Lab 2',
          status: 'Scheduled',
          mode: 'Classroom',
        })
      ).rejects.toThrow(/Faculty conflict/);

      // But scheduling trainerB (different trainer_id, though identical name Priya Singh)
      // in a different classroom MUST NOT trigger a conflict!
      const sessionB = await createClassSession({
        batch_id: 'batch-03',
        topic: 'Data Science Python',
        session_date: '2026-12-01',
        start_time: '10:30',
        end_time: '11:30',
        trainer_id: idB, // Different trainer B
        classroom: 'Lab 3',
        status: 'Scheduled',
        mode: 'Classroom',
      });

      expect(sessionB).toBeDefined();
      expect(sessionB.trainer_id).toBe(idB);
    });
  });

  // =========================================================================
  // ENHANCEMENT 4: Discontinued Student Outstanding Invoice Clearance
  // =========================================================================
  describe('4. Discontinued Student Outstanding Invoice Clearance', () => {
    it('writes off outstanding balance cleanly while preserving historical payments', () => {
      const accountant = store.users.find((u) => u.role === 'accountant' || u.role === 'super_admin')!;
      const uid = Date.now();
      const studentId = `stu-disc-test-${uid}`;
      const feeAccountId = `fa-disc-test-${uid}`;

      const feeAccount: StudentFeeAccount = {
        id: feeAccountId,
        student_id: studentId,
        admission_id: `adm-disc-test-${uid}`,
        course_id: 'crs-sap-mm',
        original_fee: 60000,
        discount: 0,
        net_payable: 60000,
        paid_amount: 20000,
        outstanding_amount: 40000,
        payment_plan: 'Installments',
        status: 'Partially Paid',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      };

      store.feeAccounts.push(feeAccount);

      // Perform discontinuation adjustment
      const result = adjustDiscontinuedStudentFee({
        fee_account_id: feeAccountId,
        reason: 'Student relocated overseas and discontinued further coursework',
        approved_by_user_id: accountant.id,
        adjusted_amount: 40000,
      });

      expect(result.feeAccount.outstanding_amount).toBe(0);
      expect(result.feeAccount.status).toBe('Discontinued / Adjusted');
      expect(result.feeAccount.discontinuation_record).toBeDefined();
      expect(result.feeAccount.discontinuation_record?.adjusted_amount).toBe(40000);
      expect(result.feeAccount.discontinuation_record?.approved_by).toBe(accountant.id);
      expect(result.feeAccount.discontinuation_record?.reason).toContain('relocated overseas');

      // Verify that total collected / paid_amount was preserved and not altered
      expect(result.feeAccount.paid_amount).toBe(20000);

      // Verify ledger entry was created for audit
      expect(result.ledgerEntry).toBeDefined();
      expect(result.ledgerEntry.credit).toBe(40000);
      expect(result.ledgerEntry.entry_type).toBe('Fee Adjustment');
    });
  });

  // =========================================================================
  // ENHANCEMENT 5: Receipt Improvements (PDF & Compliance Details)
  // =========================================================================
  describe('5. Receipt Improvements (Logo, Place of Supply, Due Date, Terms)', () => {
    it('generates a PDF buffer containing Place of Supply, Terms & Conditions, and Due Date', async () => {
      const receipt: Receipt = {
        id: `rec-test-enhancement-5-${Date.now()}`,
        receipt_number: `REC-2026-${Math.floor(1000 + Math.random() * 9000)}`,
        payment_id: `pay-test-9999-${Date.now()}`,
        student_id: 'stu-999',
        student_name: 'Ananya Deshmukh',
        student_email: 'ananya@example.com',
        admission_number: 'ADM-2026-999',
        course_name: 'Executive MBA & Analytics',
        payment_amount: 35000,
        original_amount: 35000,
        reversed_amount: 0,
        payment_mode: 'UPI',
        transaction_reference: 'UPI/9988776655',
        remaining_balance: 15000, // Remaining balance > 0 => Due Date must appear
        due_date: '2026-12-15',
        place_of_supply: 'Karnataka (29)',
        terms_and_conditions: 'Fee payments are non-refundable. Late fee applies after installment due date.',
        status: 'Valid',
        payment_date: '2026-11-14',
        authorized_by: 'Finance Controller',
        institute_name: 'Next-Gen Institute of Technology',
        institute_address: 'Tech Park, Whitefield, Bengaluru',
        institute_phone: '+91 80 1234 5678',
        institute_gst: '36AAACN1234F1Z8',
        created_at: '2026-11-14T10:00:00Z',
      };

      const buffer = await generateReceiptPdfBuffer(receipt);
      expect(buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');

      const text = extractPdfText(buffer);
      // Place of Supply
      expect(text).toContain('Place of supply: Karnataka (29)');

      // Due Date for remaining installment
      expect(text).toContain('Remaining fee due date: 15 Dec 2026');

      // Terms & Conditions
      expect(text).toContain('TERMS & CONDITIONS:');
      expect(text).toContain('Fee payments are non-refundable');

      // Branding
      expect(text).toContain('ERP');
      expect(text).toContain('OFFICIAL FEE RECEIPT');
    });
  });

  // =========================================================================
  // ENHANCEMENT 6: Void Receipt — Amount to Reverse & Partial Reversals
  // =========================================================================
  describe('6. Void Receipt — Amount to Reverse & Partial Reversals', () => {
    let accountantUser: any;

    beforeEach(() => {
      accountantUser = store.users.find((u) => u.role === 'accountant' || u.role === 'super_admin')!;
    });

    it('processes a partial reversal with exact amount, issues Credit Note, and marks as Partially Reversed', () => {
      const uid = `p1-${Date.now()}`;
      const testReceipt: Receipt = {
        id: `rec-${uid}`,
        receipt_number: `REC-${uid}`,
        payment_id: `pay-${uid}`,
        student_id: `stu-${uid}`,
        student_name: 'Vikas Rao',
        admission_number: 'ADM-2026-555',
        course_name: 'SAP S/4HANA Finance',
        payment_amount: 30000,
        original_amount: 30000,
        reversed_amount: 0,
        payment_mode: 'Cheque',
        remaining_balance: 10000,
        payment_date: '2026-11-01',
        status: 'Valid',
        authorized_by: 'Chief Accountant',
        institute_name: 'Next-Gen Institute of Technology',
        institute_address: 'Tech Park, Whitefield, Bengaluru',
        institute_phone: '+91 80 1234 5678',
        institute_gst: '36AAACN1234F1Z8',
        created_at: '2026-11-01T10:00:00Z',
      };
      store.receipts.push(testReceipt);

      store.feeAccounts.push({
        id: `fa-${uid}`,
        student_id: testReceipt.student_id,
        admission_id: testReceipt.admission_number,
        course_id: 'crs-sap',
        original_fee: 40000,
        discount: 0,
        net_payable: 40000,
        paid_amount: 30000,
        outstanding_amount: 10000,
        payment_plan: 'Full',
        status: 'Partially Paid',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      });

      const partialResult = feeWorkflowService.voidReceipt(
        testReceipt.id,
        accountantUser.id,
        'Cheque Bounced / Dishonoured: Partial cheque returned by bank',
        10000 // partial reversal of 10,000 out of 30,000
      );

      expect(partialResult.creditNoteNumber).toMatch(/^CN-/);
      expect(partialResult.receipt.status).toBe('Partially Reversed');
      expect(partialResult.receipt.reversed_amount).toBe(10000);
      expect(partialResult.receipt.reversals?.length).toBe(1);
      expect(partialResult.receipt.reversals?.[0].amount).toBe(10000);

      // Student remaining balance increased by 10,000 (from 10,000 to 20,000)
      const studentAcc = store.feeAccounts.find((a) => a.student_id === testReceipt.student_id);
      expect(studentAcc?.outstanding_amount).toBe(20000);
      expect(studentAcc?.paid_amount).toBe(20000);
    });

    it('rejects an attempted reversal exceeding the remaining reversible balance', () => {
      const uid = `p2-${Date.now()}`;
      const testReceipt: Receipt = {
        id: `rec-${uid}`,
        receipt_number: `REC-${uid}`,
        payment_id: `pay-${uid}`,
        student_id: `stu-${uid}`,
        student_name: 'Vikas Rao',
        admission_number: 'ADM-2026-555',
        course_name: 'SAP S/4HANA Finance',
        payment_amount: 30000,
        original_amount: 30000,
        reversed_amount: 0,
        payment_mode: 'Cheque',
        remaining_balance: 10000,
        payment_date: '2026-11-01',
        status: 'Valid',
        authorized_by: 'Chief Accountant',
        institute_name: 'Next-Gen Institute of Technology',
        institute_address: 'Tech Park, Whitefield, Bengaluru',
        institute_phone: '+91 80 1234 5678',
        institute_gst: '36AAACN1234F1Z8',
        created_at: '2026-11-01T10:00:00Z',
      };
      store.receipts.push(testReceipt);

      // Attempting to reverse 35,000 when original receipt amount is 30,000
      expect(() => {
        feeWorkflowService.voidReceipt(
          testReceipt.id,
          accountantUser.id,
          'Excess reversal test',
          35000
        );
      }).toThrow(/cannot exceed remaining reversible balance/);
    });

    it('fully voids the receipt when all remaining balance is reversed', () => {
      const uid = `p3-${Date.now()}`;
      const testReceipt: Receipt = {
        id: `rec-${uid}`,
        receipt_number: `REC-${uid}`,
        payment_id: `pay-${uid}`,
        student_id: `stu-${uid}`,
        student_name: 'Vikas Rao',
        admission_number: 'ADM-2026-555',
        course_name: 'SAP S/4HANA Finance',
        payment_amount: 30000,
        original_amount: 30000,
        reversed_amount: 0,
        payment_mode: 'Cheque',
        remaining_balance: 10000,
        payment_date: '2026-11-01',
        status: 'Valid',
        authorized_by: 'Chief Accountant',
        institute_name: 'Next-Gen Institute of Technology',
        institute_address: 'Tech Park, Whitefield, Bengaluru',
        institute_phone: '+91 80 1234 5678',
        institute_gst: '36AAACN1234F1Z8',
        created_at: '2026-11-01T10:00:00Z',
      };
      store.receipts.push(testReceipt);

      // First reverse 12,000
      const firstResult = feeWorkflowService.voidReceipt(
        testReceipt.id,
        accountantUser.id,
        'First partial reversal',
        12000
      );
      expect(firstResult.receipt.status).toBe('Partially Reversed');
      expect(testReceipt.status).toBe('Partially Reversed');

      // Now reverse remaining 18,000
      const fullResult = feeWorkflowService.voidReceipt(
        testReceipt.id,
        accountantUser.id,
        'Second full reversal',
        18000
      );

      expect(fullResult.receipt.status).toBe('Void');
      expect(fullResult.receipt.reversed_amount).toBe(30000);
      expect(fullResult.receipt.reversals?.length).toBe(2);
    });
  });
});
