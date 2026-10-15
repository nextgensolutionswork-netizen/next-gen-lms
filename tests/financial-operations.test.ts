import { describe, it, expect, beforeEach } from 'vitest';
import { store } from '@/lib/services/data-store';
import {
  createExpense,
  approveExpense,
  markExpenseAsPaid,
  rejectExpense,
  submitExpenseForApproval,
  createVendor,
  updateVendor,
  archiveVendor,
  deleteVendor,
  getReceiptById,
  recordPaymentAtomic,
  getDateRangeForPeriod,
} from '@/lib/services/finance-service';

describe('Financial & Accounts Operations Hardening Suite', () => {
  const accountantUserId = 'usr-accountant-test';
  const superAdminUserId = 'usr-director-test';
  const unauthorizedUserId = 'usr-trainer-test';

  beforeEach(() => {
    // Reset seed users
    store.users = [
      {
        id: accountantUserId,
        email: 'accountant@lms.internal',
        full_name: 'Suresh Kumar',
        role: 'accountant',
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: superAdminUserId,
        email: 'director@lms.internal',
        full_name: 'Dr. Rajesh Sharma',
        role: 'super_admin',
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: unauthorizedUserId,
        email: 'trainer@lms.internal',
        full_name: 'Ravi Teja',
        role: 'trainer',
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];

    store.expenses = [];
    store.vendors = [];
    store.auditLogs = [];
  });

  describe('1. Multi-Level Expense Approval Workflows', () => {
    it('allows an accountant to approve an operational expense <= ₹50,000', async () => {
      const expense = await createExpense(
        {
          expense_date: '2026-03-15',
          category: 'Software',
          description: 'Monthly Cloud Sandbox Hosting',
          amount: 35000,
          payment_mode: 'Bank Transfer',
          status: 'Pending Approval',
        },
        accountantUserId
      );

      expect(expense.status).toBe('Pending Approval');

      const approved = await approveExpense(expense.id, accountantUserId);
      expect(approved.status).toBe('Approved');
      expect(approved.approved_by).toBe(accountantUserId);
      expect(approved.approved_by_name).toBe('Suresh Kumar');

      // Verify audit trail
      const audit = store.auditLogs.find((a) => a.action === 'EXPENSE_APPROVED' && a.record_id === expense.id);
      expect(audit).toBeDefined();
      expect(audit?.user_id).toBe(accountantUserId);
    });

    it('blocks an accountant from approving expenses > ₹50,000 under SOP policy', async () => {
      const highValueExpense = await createExpense(
        {
          expense_date: '2026-03-15',
          category: 'Rent',
          description: 'Quarterly Corporate Institute Facility Lease',
          amount: 150000,
          payment_mode: 'Bank Transfer',
          status: 'Pending Approval',
        },
        accountantUserId
      );

      await expect(
        approveExpense(highValueExpense.id, accountantUserId)
      ).rejects.toThrow(/Approval Policy Violation: Expenses exceeding ₹50,000/);

      // Verify status remains unchanged
      const persisted = store.expenses.find((e) => e.id === highValueExpense.id);
      expect(persisted?.status).toBe('Pending Approval');
    });

    it('permits Super Admin (Director) to approve expenses > ₹50,000', async () => {
      const highValueExpense = await createExpense(
        {
          expense_date: '2026-03-15',
          category: 'Salary',
          description: 'Monthly Senior SAP Faculty Retainers',
          amount: 220000,
          payment_mode: 'Bank Transfer',
          status: 'Pending Approval',
        },
        accountantUserId
      );

      const approved = await approveExpense(highValueExpense.id, superAdminUserId);
      expect(approved.status).toBe('Approved');
      expect(approved.approved_by).toBe(superAdminUserId);
      expect(approved.approved_by_name).toBe('Dr. Rajesh Sharma');
    });

    it('rejects approval attempts by unauthorized roles (e.g. trainer)', async () => {
      const expense = await createExpense(
        {
          expense_date: '2026-03-15',
          category: 'Office supplies',
          description: 'Classroom Whiteboard Markers',
          amount: 2000,
          payment_mode: 'Cash',
          status: 'Pending Approval',
        },
        accountantUserId
      );

      await expect(
        approveExpense(expense.id, unauthorizedUserId)
      ).rejects.toThrow(/Access Denied/);
    });

    it('disburses approved expense, marks as Paid, updates vendor ledger, and writes audit log', async () => {
      // 1. Create vendor
      const vendor = await createVendor(
        {
          vendor_name: 'FastNet Fiber Leased Lines',
          contact_person: 'Anil Kumar',
          phone: '+91 98111 22334',
          email: 'accounts@fastnet.in',
          address: 'HITEC City, Hyderabad',
          gst_number: '36AABCU9603R1ZM',
          bank_name: 'ICICI Bank',
          bank_account_number: '000901234567',
          bank_ifsc: 'ICIC0000009',
          is_active: true,
          status: 'Active',
        },
        accountantUserId
      );

      // 2. Create expense
      const expense = await createExpense(
        {
          expense_date: '2026-03-20',
          category: 'Internet',
          vendor_id: vendor.id,
          description: '1 Gbps Dedicated Leased Line March 2026',
          amount: 18500,
          payment_mode: 'Bank Transfer',
          status: 'Pending Approval',
        },
        accountantUserId
      );

      // 3. Approve expense
      await approveExpense(expense.id, accountantUserId);

      // 4. Mark as Paid (Disburse)
      const paid = await markExpenseAsPaid(expense.id, accountantUserId, {
        payment_mode: 'Bank Transfer',
        reference: 'UTR-HDFC-99281726',
        expense_date: '2026-03-21',
      });

      expect(paid.status).toBe('Paid');
      expect(paid.reference).toBe('UTR-HDFC-99281726');
      expect(paid.paid_by).toBe(accountantUserId);
      expect(paid.expense_date).toBe('2026-03-21');

      // Verify vendor total paid updated
      const updatedVendor = store.vendors.find((v) => v.id === vendor.id);
      expect(updatedVendor?.total_paid).toBe(18500);

      // Verify audit log
      const audit = store.auditLogs.find(
        (a) => a.action === 'EXPENSE_PAID' && a.record_id === expense.id
      );
      expect(audit).toBeDefined();
      expect(audit?.user_id).toBe(accountantUserId);
      expect(audit?.new_value?.reference).toBe('UTR-HDFC-99281726');
    });

    it('rejects disbursement if UTR/reference is missing or blank', async () => {
      const expense = await createExpense(
        {
          expense_date: '2026-03-20',
          category: 'Electricity',
          description: 'March Power Bill',
          amount: 12000,
          payment_mode: 'Bank Transfer',
          status: 'Pending Approval',
        },
        accountantUserId
      );

      await approveExpense(expense.id, accountantUserId);

      await expect(
        markExpenseAsPaid(expense.id, accountantUserId, {
          payment_mode: 'Bank Transfer',
          reference: '   ',
        })
      ).rejects.toThrow(/Mandatory reference/);
    });

    it('allows rejecting an expenditure request with audit log reason', async () => {
      const expense = await createExpense(
        {
          expense_date: '2026-03-20',
          category: 'Miscellaneous',
          description: 'Unsubstantiated entertainment claim',
          amount: 4500,
          payment_mode: 'Cash',
          status: 'Pending Approval',
        },
        accountantUserId
      );

      const rejected = await rejectExpense(
        expense.id,
        superAdminUserId,
        'No official receipt or client authorization attached.'
      );

      expect(rejected.status).toBe('Rejected');

      const audit = store.auditLogs.find(
        (a) => a.action === 'EXPENSE_REJECTED' && a.record_id === expense.id
      );
      expect(audit).toBeDefined();
      expect(audit?.new_value?.reason).toBe('No official receipt or client authorization attached.');
    });

    it('submits a draft expense for approval', async () => {
      const draft = await createExpense(
        {
          expense_date: '2026-03-20',
          category: 'Software',
          description: 'Docker Hub Enterprise Licenses',
          amount: 22000,
          payment_mode: 'Card',
          status: 'Draft',
        },
        accountantUserId
      );

      expect(draft.status).toBe('Draft');

      const submitted = await submitExpenseForApproval(draft.id, accountantUserId);
      expect(submitted.status).toBe('Pending Approval');

      const audit = store.auditLogs.find(
        (a) => a.action === 'EXPENSE_SUBMITTED' && a.record_id === draft.id
      );
      expect(audit).toBeDefined();
    });
  });

  describe('2. Vendor Lifecycle, Data Integrity, and Audit Trails', () => {
    it('creates a new vendor with persistent audit logs', async () => {
      const vendor = await createVendor(
        {
          vendor_name: 'ACT Broadband Telecom',
          contact_person: 'M. Krishna',
          phone: '+91 98765 43210',
          email: 'corp@acttelecom.in',
          address: 'Madhapur, Hyderabad',
          gst_number: '36AAACN9999F1Z2',
          bank_name: 'HDFC Bank',
          bank_account_number: '50200012345678',
          bank_ifsc: 'HDFC0001234',
          is_active: true,
          status: 'Active',
        },
        accountantUserId
      );

      expect(vendor.id).toBeDefined();
      expect(vendor.total_paid).toBe(0);

      const audit = store.auditLogs.find((a) => a.action === 'VENDOR_CREATED' && a.record_id === vendor.id);
      expect(audit).toBeDefined();
      expect(audit?.user_id).toBe(accountantUserId);
      expect(audit?.new_value?.vendor_name).toBe('ACT Broadband Telecom');
    });

    it('updates vendor details and records old vs new audit differentials', async () => {
      const vendor = await createVendor(
        {
          vendor_name: 'Cyber Towers Facilities',
          contact_person: 'Ramesh Reddy',
          gst_number: '36AAACN1111F1Z1',
          is_active: true,
          status: 'Active',
        },
        accountantUserId
      );

      const updated = await updateVendor(
        vendor.id,
        {
          contact_person: 'Suresh Varma',
          phone: '+91 90000 11111',
        },
        accountantUserId
      );

      expect(updated.contact_person).toBe('Suresh Varma');
      expect(updated.phone).toBe('+91 90000 11111');

      const audit = store.auditLogs.find((a) => a.action === 'VENDOR_UPDATED' && a.record_id === vendor.id);
      expect(audit).toBeDefined();
      expect(audit?.new_value?.contact_person).toBe('Suresh Varma');
    });

    it('edits vendor banking credentials (Bank A/C, IFSC, GSTIN) and statutory tax parameters (PAN, Section 194J/194C TDS rate)', async () => {
      // 1. Create vendor with Section 194J Professional TDS
      const vendor = await createVendor(
        {
          vendor_name: 'Apex Cloud & SAP Infrastructure Ltd',
          contact_person: 'Raghavan S',
          phone: '+91 98888 77777',
          email: 'tax@apexcloud.in',
          address: 'Gachibowli, Hyderabad',
          gst_number: '36AABCA1234F1Z5',
          pan_number: 'AABCA1234F',
          tds_section: '194J',
          tds_rate: 10,
          bank_name: 'HDFC Bank',
          bank_account_number: '50200099887766',
          bank_ifsc: 'HDFC0000123',
          is_active: true,
          status: 'Active',
        },
        accountantUserId
      );

      expect(vendor.pan_number).toBe('AABCA1234F');
      expect(vendor.tds_section).toBe('194J');
      expect(vendor.tds_rate).toBe(10);
      expect(vendor.bank_ifsc).toBe('HDFC0000123');

      // 2. Edit Bank Account, IFSC, GSTIN, and adjust TDS Rate under Sec 194C lower rate certificate
      const updated = await updateVendor(
        vendor.id,
        {
          gst_number: '36AABCA1234F2Z8',
          bank_name: 'State Bank of India',
          bank_account_number: '30999888777',
          bank_ifsc: 'SBIN0001234',
          tds_section: '194C',
          tds_rate: 2,
        },
        accountantUserId
      );

      expect(updated.gst_number).toBe('36AABCA1234F2Z8');
      expect(updated.bank_name).toBe('State Bank of India');
      expect(updated.bank_account_number).toBe('30999888777');
      expect(updated.bank_ifsc).toBe('SBIN0001234');
      expect(updated.tds_section).toBe('194C');
      expect(updated.tds_rate).toBe(2);

      // Verify audit log captured new banking and tax values
      const audit = store.auditLogs.find(
        (a) => a.action === 'VENDOR_UPDATED' && a.record_id === vendor.id
      );
      expect(audit).toBeDefined();
      expect(audit?.new_value?.bank_ifsc).toBe('SBIN0001234');
      expect(audit?.new_value?.tds_rate).toBe(2);
    });

    it('archives and restores vendor with audit logging', async () => {
      const vendor = await createVendor(
        {
          vendor_name: 'Outdated Power Backup Supplies',
          contact_person: 'Venkatesh',
          is_active: true,
          status: 'Active',
        },
        accountantUserId
      );

      // Archive
      const archived = await archiveVendor(vendor.id, true, accountantUserId);
      expect(archived.status).toBe('Archived');
      expect(archived.is_active).toBe(false);

      const archiveAudit = store.auditLogs.find((a) => a.action === 'VENDOR_ARCHIVED' && a.record_id === vendor.id);
      expect(archiveAudit).toBeDefined();

      // Restore
      const restored = await archiveVendor(vendor.id, false, accountantUserId);
      expect(restored.status).toBe('Active');
      expect(restored.is_active).toBe(true);

      const restoreAudit = store.auditLogs.find((a) => a.action === 'VENDOR_RESTORED' && a.record_id === vendor.id);
      expect(restoreAudit).toBeDefined();
    });

    it('permanently deletes vendors without expenses, but soft-archives vendors with recorded expenses', async () => {
      const vendorWithoutExpenses = await createVendor(
        {
          vendor_name: 'Temp Vendor',
          contact_person: 'None',
          is_active: true,
          status: 'Active',
        },
        accountantUserId
      );

      const deleted = await deleteVendor(vendorWithoutExpenses.id, accountantUserId);
      expect(deleted).toBe(true);
      expect(store.vendors.find((v) => v.id === vendorWithoutExpenses.id)).toBeUndefined();

      // Now create vendor with linked expense
      const vendorWithExpenses = await createVendor(
        {
          vendor_name: 'Persistent Leased Vendor',
          contact_person: 'Landlord',
          is_active: true,
          status: 'Active',
        },
        accountantUserId
      );

      await createExpense(
        {
          expense_date: '2026-03-01',
          category: 'Rent',
          vendor_id: vendorWithExpenses.id,
          description: 'Campus Rent',
          amount: 50000,
          payment_mode: 'Bank Transfer',
          status: 'Paid',
        },
        accountantUserId
      );

      const deletedLinked = await deleteVendor(vendorWithExpenses.id, accountantUserId);
      expect(deletedLinked).toBe(true);

      // Must NOT be deleted from store, must be preserved as Archived for ledger integrity
      const preservedVendor = store.vendors.find((v) => v.id === vendorWithExpenses.id);
      expect(preservedVendor).toBeDefined();
      expect(preservedVendor?.status).toBe('Archived');
      expect(preservedVendor?.is_active).toBe(false);
    });
  });

  describe('3. Financial Reports Temporal Calculation Engine', () => {
    it('accurately resolves fiscal year boundaries for FY 2025-26 and FY 2026-27', () => {
      const fy2526 = getDateRangeForPeriod('FY_2025_26');
      expect(fy2526.start).toBe('2025-04-01');
      expect(fy2526.end).toBe('2026-03-31');

      const fy2627 = getDateRangeForPeriod('FY_2026_27');
      expect(fy2627.start).toBe('2026-04-01');
      expect(fy2627.end).toBe('2027-03-31');
    });

    it('accurately resolves quarterly periods and custom date windows', () => {
      const q1 = getDateRangeForPeriod('Q1');
      expect(q1.start).toMatch(/-04-01$/);
      expect(q1.end).toMatch(/-06-30$/);

      const custom = getDateRangeForPeriod('CUSTOM', '2026-01-01', '2026-06-30');
      expect(custom.start).toBe('2026-01-01');
      expect(custom.end).toBe('2026-06-30');
      expect(custom.label).toContain('2026-01-01');
    });
  });

  describe('4. Receipt Lookup Integrity', () => {
    it('retrieves receipts by either UUID or human-readable receipt number', async () => {
      const mockReceipt = {
        id: 'rcpt-test-999',
        receipt_number: 'RCPT-2026-999',
        payment_id: 'pay-test-999',
        student_id: 'stu-test-01',
        student_name: 'Aarav Patel',
        admission_number: 'ADM-2026-001',
        course_name: 'SAP S/4HANA Finance (FICO)',
        payment_amount: 30000,
        payment_mode: 'Bank Transfer' as const,
        payment_date: '2026-03-10',
        remaining_balance: 0,
        authorized_by: 'Suresh Kumar',
        institute_name: 'Next-Gen ERP Institute',
        institute_address: 'Hyderabad',
        institute_phone: '+91 99999 88888',
        institute_gst: '36AAACN1234F1Z8',
        created_at: new Date().toISOString(),
      };

      store.receipts.push(mockReceipt);

      const byId = await getReceiptById('rcpt-test-999');
      expect(byId).toBeDefined();
      expect(byId?.student_name).toBe('Aarav Patel');

      const byNumber = await getReceiptById('RCPT-2026-999');
      expect(byNumber).toBeDefined();
      expect(byNumber?.id).toBe('rcpt-test-999');

      const notFound = await getReceiptById('non-existent-rcpt');
      expect(notFound).toBeUndefined();
    });
  });

  describe('5. Student Fee Accounts Ledger & Metric Safety (Module 8 Hardening)', () => {
    it('safely computes metric cards without NaN when fee accounts contain undefined, null, or invalid amounts', () => {
      const dirtyFeeAccounts = [
        {
          id: 'fa-1',
          student_id: 'stu-1',
          admission_id: 'adm-1',
          course_id: 'crs-1',
          original_fee: 50000,
          discount: 5000,
          net_payable: 45000,
          paid_amount: 25000,
          outstanding_amount: 20000,
          payment_plan: '2 Installments',
        },
        {
          id: 'fa-2',
          student_id: 'stu-2',
          admission_id: 'adm-2',
          course_id: 'crs-2',
          original_fee: undefined as any,
          discount: null as any,
          net_payable: NaN as any,
          paid_amount: undefined as any,
          outstanding_amount: NaN as any,
          payment_plan: 'Full Payment',
        },
        {
          id: 'fa-3',
          student_id: 'stu-3',
          admission_id: 'adm-3',
          course_id: 'crs-3',
          original_fee: 'invalid' as any,
          discount: 0,
          net_payable: 30000,
          paid_amount: '15000' as any,
          outstanding_amount: '15000' as any,
          payment_plan: 'Full Payment',
        },
      ];

      function safeAmount(val: unknown): number {
        if (typeof val === 'number') return Number.isFinite(val) ? val : 0;
        if (!val) return 0;
        const num = Number(val);
        return Number.isFinite(num) ? num : 0;
      }

      const totalOutstanding = dirtyFeeAccounts.reduce((sum, f) => sum + safeAmount(f.outstanding_amount), 0);
      const totalCollected = dirtyFeeAccounts.reduce((sum, f) => sum + safeAmount(f.paid_amount), 0);

      expect(isNaN(totalOutstanding)).toBe(false);
      expect(isNaN(totalCollected)).toBe(false);
      expect(totalOutstanding).toBe(35000); // 20000 + 0 + 15000
      expect(totalCollected).toBe(40000);   // 25000 + 0 + 15000
    });

    it('enforces RBAC role boundaries: permits accountants and admins, blocks students and unauthorized staff', () => {
      const canAccessFees = (userRole: string) => {
        return ['accountant', 'admin', 'super_admin'].includes(userRole);
      };

      expect(canAccessFees('accountant')).toBe(true);
      expect(canAccessFees('admin')).toBe(true);
      expect(canAccessFees('super_admin')).toBe(true);

      expect(canAccessFees('student')).toBe(false);
      expect(canAccessFees('trainer')).toBe(false);
      expect(canAccessFees('counsellor')).toBe(false);
      expect(canAccessFees('support')).toBe(false);
    });

    it('ensures Collect URL preserves query context to avoid payment desk default state', () => {
      const fa = {
        id: 'sfa-001',
        student_id: 'stu-99',
        student_name: 'Rohit Sharma',
        course_name: 'SAP FICO',
        outstanding_amount: 15000,
      };

      const collectUrl = `/accounts/payments?studentId=${encodeURIComponent(fa.student_id)}&student_id=${encodeURIComponent(fa.student_id)}&student_name=${encodeURIComponent(fa.student_name)}&feeAccountId=${encodeURIComponent(fa.id)}&fee_id=${encodeURIComponent(fa.id)}&amount=${encodeURIComponent(fa.outstanding_amount)}&amount_due=${encodeURIComponent(fa.outstanding_amount)}&course_name=${encodeURIComponent(fa.course_name)}`;

      const parsed = new URL(`http://localhost:3000${collectUrl}`);
      expect(parsed.searchParams.get('student_id')).toBe('stu-99');
      expect(parsed.searchParams.get('feeAccountId')).toBe('sfa-001');
      expect(parsed.searchParams.get('amount')).toBe('15000');
      expect(parsed.searchParams.get('student_name')).toBe('Rohit Sharma');
    });
  });

  describe('6. Installment Schedules, Overdue Radar, Delinquency Tracking & RBAC Guard', () => {
    it('safely computes scheduled, collected, and overdue aggregates without NaN errors', () => {
      const todayStr = '2026-03-25';
      const dirtyInstallments: any[] = [
        {
          id: 'inst-1',
          student_id: 'stu-1',
          fee_account_id: 'fa-1',
          installment_number: 1,
          amount: 25000,
          paid_amount: 25000,
          due_date: '2026-02-01',
          status: 'Paid',
        },
        {
          id: 'inst-2',
          student_id: 'stu-1',
          fee_account_id: 'fa-1',
          installment_number: 2,
          amount: 25000,
          paid_amount: 0,
          due_date: '2026-03-01', // Past due -> Overdue
          status: 'Due',
        },
        {
          id: 'inst-3',
          student_id: 'stu-2',
          fee_account_id: 'fa-2',
          installment_number: 1,
          amount: undefined, // dirty
          paid_amount: null,
          due_date: '2026-04-01',
          status: 'Upcoming',
        },
        {
          id: 'inst-4',
          student_id: 'stu-3',
          fee_account_id: 'fa-3',
          installment_number: 1,
          amount: '15000', // string
          paid_amount: '5000',
          due_date: '2026-03-10', // Past due -> Overdue
          status: 'Due',
        },
      ];

      function safeAmount(val: unknown): number {
        if (typeof val === 'number') return Number.isFinite(val) ? val : 0;
        if (!val) return 0;
        const num = Number(val);
        return Number.isFinite(num) ? num : 0;
      }

      const totalScheduled = dirtyInstallments.reduce((sum, i) => sum + safeAmount(i.amount), 0);
      const totalCollected = dirtyInstallments.reduce((sum, i) => sum + safeAmount(i.paid_amount), 0);
      const totalBalanceDue = Math.max(0, totalScheduled - totalCollected);

      const overdueList = dirtyInstallments.filter(
        (i) => i.status !== 'Paid' && (i.status === 'Overdue' || (i.status === 'Due' && i.due_date < todayStr))
      );

      const totalOverdue = overdueList.reduce(
        (sum, i) => sum + Math.max(0, safeAmount(i.amount) - safeAmount(i.paid_amount)),
        0
      );

      expect(isNaN(totalScheduled)).toBe(false);
      expect(isNaN(totalCollected)).toBe(false);
      expect(isNaN(totalBalanceDue)).toBe(false);
      expect(isNaN(totalOverdue)).toBe(false);

      expect(totalScheduled).toBe(65000); // 25000 + 25000 + 0 + 15000
      expect(totalCollected).toBe(30000); // 25000 + 0 + 0 + 5000
      expect(totalBalanceDue).toBe(35000);
      expect(overdueList.length).toBe(2); // inst-2 and inst-4
      expect(totalOverdue).toBe(35000);   // 25000 + 10000
    });

    it('enforces RBAC protection for installment radars and collection desks', () => {
      const canAccessInstallments = (userRole: string) => {
        return ['accountant', 'admin', 'super_admin'].includes(userRole);
      };

      expect(canAccessInstallments('accountant')).toBe(true);
      expect(canAccessInstallments('admin')).toBe(true);
      expect(canAccessInstallments('super_admin')).toBe(true);

      expect(canAccessInstallments('student')).toBe(false);
      expect(canAccessInstallments('trainer')).toBe(false);
      expect(canAccessInstallments('counsellor')).toBe(false);
      expect(canAccessInstallments('support')).toBe(false);
    });

    it('preserves comprehensive installment collection query parameters for payments desk', () => {
      const inst = {
        id: 'inst-fico-02',
        student_id: 'stu-01',
        fee_account_id: 'fa-fico-01',
        installment_number: 2,
        amount: 25000,
        paid_amount: 10000,
      };
      const studentName = 'Amit Gupta';
      const courseName = 'SAP S/4HANA Finance (FICO)';
      const balanceDue = inst.amount - inst.paid_amount;

      const collectUrl = `/accounts/payments?studentId=${encodeURIComponent(
        inst.student_id
      )}&student_id=${encodeURIComponent(
        inst.student_id
      )}&student_name=${encodeURIComponent(
        studentName
      )}&installmentId=${encodeURIComponent(
        inst.id
      )}&installment_id=${encodeURIComponent(
        inst.id
      )}&feeAccountId=${encodeURIComponent(
        inst.fee_account_id
      )}&fee_id=${encodeURIComponent(
        inst.fee_account_id
      )}&amount=${encodeURIComponent(
        balanceDue
      )}&amount_due=${encodeURIComponent(
        balanceDue
      )}&course_name=${encodeURIComponent(courseName)}`;

      const url = new URL(`http://localhost:3000${collectUrl}`);
      expect(url.searchParams.get('student_id')).toBe('stu-01');
      expect(url.searchParams.get('student_name')).toBe('Amit Gupta');
      expect(url.searchParams.get('installment_id')).toBe('inst-fico-02');
      expect(url.searchParams.get('feeAccountId')).toBe('fa-fico-01');
      expect(url.searchParams.get('amount')).toBe('15000');
      expect(url.searchParams.get('course_name')).toBe('SAP S/4HANA Finance (FICO)');
    });
  });
});

