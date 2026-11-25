import { describe, it, expect, beforeEach } from 'vitest';
import {
  findOriginalReceivingAccount,
  getAuthorizedBankAccounts,
  findBankAccountByHolder,
} from '@/lib/utils/bank-autofill';
import { unifyDualLedgerPayments } from '@/lib/utils/dashboard-metrics';
import { store } from '@/lib/services/data-store';
import { StudentPaymentRecord, Payment, Admission } from '@/types';

describe('P0 – Critical Financial Data Integrity: Bank Account Mapping in Fee Approval Workflow', () => {
  const authorizedBankAccounts = getAuthorizedBankAccounts('admin');

  it('1. Authoritative account resolution correctly matches E Anasuya (HDFC Bank XXXX9271)', () => {
    // Exactly replicating Ravuri Srinivas payment payload recorded by Radhika
    const paymentRecord: Partial<StudentPaymentRecord> = {
      id: 'spr-test-srinivas-01',
      student_name: 'Ravuri Srinivas',
      amount_paid: 14000,
      payment_mode: 'UPI',
      our_bank_profile_id: 'bank-acc-12',
      our_bank_name: 'HDFC Bank',
      our_bank_account_name: 'E Anasuya',
      our_bank_account_id: '•••• •••• 9271',
    };

    const resolved = findOriginalReceivingAccount(paymentRecord, authorizedBankAccounts);
    expect(resolved).toBeDefined();
    expect(resolved?.id).toBe('bank-acc-12');
    expect(resolved?.account_holder_name).toBe('E Anasuya');
    expect(resolved?.bank_name).toBe('HDFC Bank');
    expect(resolved?.account_number.slice(-4)).toBe('9271');

    // Must NEVER match Katari Charitha (bank-acc-01)
    expect(resolved?.id).not.toBe('bank-acc-01');
    expect(resolved?.account_holder_name).not.toBe('Katari Charitha');
  });

  it('2. Authoritative account resolution resolves E Anasuya even if only masked account number and holder are present', () => {
    const paymentRecordWithoutProfileId: Partial<StudentPaymentRecord> = {
      id: 'spr-test-legacy-srinivas',
      student_name: 'Ravuri Srinivas',
      amount_paid: 14000,
      payment_mode: 'UPI',
      our_bank_name: 'HDFC Bank',
      our_bank_account_name: 'E Anasuya',
      our_bank_account_id: '•••• •••• 9271',
    };

    const resolved = findOriginalReceivingAccount(paymentRecordWithoutProfileId, authorizedBankAccounts);
    expect(resolved).toBeDefined();
    expect(resolved?.account_holder_name).toBe('E Anasuya');
    expect(resolved?.bank_name).toBe('HDFC Bank');
    expect(resolved?.id).toBe('bank-acc-12');
  });

  it('3. Multiple HDFC accounts are distinguished without cross-contamination', () => {
    // Account 1: Katari Charitha (HDFC #4019)
    const charithaPayment: Partial<StudentPaymentRecord> = {
      id: 'spr-charitha',
      our_bank_profile_id: 'bank-acc-01',
      our_bank_name: 'HDFC Bank',
      our_bank_account_name: 'Katari Charitha',
      our_bank_account_id: '•••• •••• 4019',
      payment_mode: 'Bank Transfer',
    };

    // Account 2: E Anasuya (HDFC #9271)
    const anasuyaPayment: Partial<StudentPaymentRecord> = {
      id: 'spr-anasuya',
      our_bank_profile_id: 'bank-acc-12',
      our_bank_name: 'HDFC Bank',
      our_bank_account_name: 'E Anasuya',
      our_bank_account_id: '•••• •••• 9271',
      payment_mode: 'UPI',
    };

    const resCharitha = findOriginalReceivingAccount(charithaPayment, authorizedBankAccounts);
    const resAnasuya = findOriginalReceivingAccount(anasuyaPayment, authorizedBankAccounts);

    expect(resCharitha?.id).toBe('bank-acc-01');
    expect(resCharitha?.account_holder_name).toBe('Katari Charitha');

    expect(resAnasuya?.id).toBe('bank-acc-12');
    expect(resAnasuya?.account_holder_name).toBe('E Anasuya');

    expect(resCharitha?.id).not.toBe(resAnasuya?.id);
  });

  it('4. Returns undefined without silent fallback to default account when bank info is missing/invalid', () => {
    const invalidPayment: Partial<StudentPaymentRecord> = {
      id: 'spr-invalid-bank',
      student_name: 'Unknown Payment',
      amount_paid: 5000,
      payment_mode: 'Bank Transfer',
      our_bank_profile_id: 'non-existent-profile',
      our_bank_name: 'Random Bank',
      our_bank_account_name: 'Ghost Holder',
      our_bank_account_id: '0000000000',
    };

    const resolved = findOriginalReceivingAccount(invalidPayment, authorizedBankAccounts);
    // MUST NOT fall back to authorizedBankAccounts[0]
    expect(resolved).toBeUndefined();
  });

  it('5. Dual-ledger unification preserves bank details and verification details', () => {
    const legacyPayment: Payment = {
      id: 'pay-001',
      receipt_number: 'REC-001',
      student_id: 'stu-001',
      fee_account_id: 'fee-001',
      course_id: 'crs-001',
      amount: 14000,
      payment_date: '2026-11-25',
      payment_mode: 'UPI',
      collected_by: 'user-counsellor',
      created_at: '2026-11-25T10:00:00Z',
      our_bank_profile_id: 'bank-acc-12',
      our_bank_name: 'HDFC Bank',
      our_bank_account_name: 'E Anasuya',
      our_bank_account_id: '•••• •••• 9271',
    };

    const studentPayment: StudentPaymentRecord = {
      id: 'sp-001',
      fee_id: 'fee-001',
      student_id: 'stu-001',
      student_name: 'Ravuri Srinivas',
      admission_number: 'ADM-2026-0021',
      fee_category: 'Tuition Fee',
      amount_paid: 14000,
      payment_date: '2026-11-25',
      payment_mode: 'UPI',
      recorded_by: 'user-counsellor',
      recorded_by_name: 'Radhika',
      recorded_by_role: 'counsellor',
      verification_status: 'Verified',
      receipt_number: 'REC-001',
      our_bank_profile_id: 'bank-acc-12',
      our_bank_name: 'HDFC Bank',
      our_bank_account_name: 'E Anasuya',
      our_bank_account_id: '•••• •••• 9271',
      verified_bank_profile_id: 'bank-acc-12',
      verified_our_bank_name: 'HDFC Bank',
      verified_our_bank_account_name: 'E Anasuya',
      verified_our_bank_account_id: '•••• •••• 9271',
      created_at: '2026-11-25T10:00:00Z',
      updated_at: '2026-11-25T10:30:00Z',
    };

    const unified = unifyDualLedgerPayments([legacyPayment], [studentPayment]);
    expect(unified).toHaveLength(1);
    const rec = unified[0];
    expect(rec.our_bank_profile_id).toBe('bank-acc-12');
    expect(rec.our_bank_account_name).toBe('E Anasuya');
    expect(rec.our_bank_name).toBe('HDFC Bank');
    expect(rec.verified_our_bank_account_name).toBe('E Anasuya');
    expect(rec.verified_bank_profile_id).toBe('bank-acc-12');
  });

  it('6. store.reconcileDualLedgers() synchronizes receiving bank details between dual ledgers', () => {
    store.payments = [];
    store.studentPayments = [
      {
        id: 'sp-reconcile-test',
        fee_id: 'fee-rec-01',
        student_id: 'stu-rec-01',
        student_name: 'Ravuri Srinivas',
        admission_number: 'ADM-2026-0021',
        fee_category: 'Tuition Fee',
        amount_paid: 14000,
        payment_date: '2026-11-25',
        payment_mode: 'UPI',
        recorded_by: 'usr-radhika',
        recorded_by_name: 'Radhika',
        recorded_by_role: 'counsellor',
        verification_status: 'Verified',
        receipt_number: 'REC-REC-01',
        our_bank_profile_id: 'bank-acc-12',
        our_bank_name: 'HDFC Bank',
        our_bank_account_name: 'E Anasuya',
        our_bank_account_id: '•••• •••• 9271',
        created_at: '2026-11-25T10:00:00Z',
        updated_at: '2026-11-25T10:00:00Z',
      },
    ];

    store.reconcileDualLedgers();

    const matchedPayment = store.payments.find((p) => p.receipt_number === 'REC-REC-01');
    expect(matchedPayment).toBeDefined();
    expect(matchedPayment?.our_bank_profile_id).toBe('bank-acc-12');
    expect(matchedPayment?.our_bank_account_name).toBe('E Anasuya');
    expect(matchedPayment?.our_bank_name).toBe('HDFC Bank');
    expect(matchedPayment?.our_bank_account_id).toBe('•••• •••• 9271');
  });
});
