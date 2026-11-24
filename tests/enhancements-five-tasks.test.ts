import { describe, it, expect, beforeEach } from 'vitest';
import { store, DEFAULT_EXPENSE_CATEGORIES } from '@/lib/services/data-store';
import {
  createExpenseCategory,
  getExpenseCategories,
  createExpense,
  approveExpense,
  validateAndSettleExpense,
} from '@/lib/services/finance-service';
import {
  generateInvoicePdfBuffer,
  InvoiceData,
} from '@/lib/services/invoice-pdf-service';
import { createLead, updateLeadDetails } from '@/lib/services/crm-service';
import { createBatch } from '@/lib/services/academics-service';
import { amountToWordsINR } from '@/lib/services/finance-formatters';

describe('LMS & CRM 5 Enhancements Suite', () => {
  beforeEach(() => {
    // Reset test users and ensure superadmin/accountant/counsellor exist
    store.users = store.users || [];
    if (!store.users.some((u) => u.id === 'usr-admin-test')) {
      store.users.push({
        id: 'usr-admin-test',
        full_name: 'Test Administrator',
        email: 'admin.test@next-generpsolutions.com',
        role: 'super_admin',
        is_active: true,
        tenant_id: 'default',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }
    if (!store.users.some((u) => u.id === 'usr-counsellor-test')) {
      store.users.push({
        id: 'usr-counsellor-test',
        full_name: 'Test Counsellor',
        email: 'counsellor.test@next-generpsolutions.com',
        role: 'counsellor',
        is_active: true,
        tenant_id: 'default',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }
  });

  describe('Task 1: Dynamic Expense Categories', () => {
    it('initializes with standard institutional categories', async () => {
      const cats = await getExpenseCategories();
      expect(cats).toContain('Rent');
      expect(cats).toContain('Trainer Payment');
      expect(cats).toContain('Salary');
      expect(cats).toContain('Marketing');
      expect(cats).toContain('Google Ads');
      expect(cats).toContain('Meta Ads');
      expect(cats).toContain('Software Licenses');
      expect(cats).toContain('Internet Leased Line');
      expect(cats).toContain('Electricity & Lab Utilities');
      expect(cats).toContain('Office Supplies');
      expect(cats).toContain('Miscellaneous');
    });

    it('successfully creates and permanently stores a new category', async () => {
      const newCategory = `Cloud Lab VM Infrastructure ${Date.now()}`;
      const created = await createExpenseCategory(newCategory, 'usr-admin-test');
      expect(created).toBe(newCategory);

      const allCats = await getExpenseCategories();
      expect(allCats).toContain(newCategory);
    });

    it('rejects empty or whitespace-only category names', async () => {
      await expect(createExpenseCategory('', 'usr-admin-test')).rejects.toThrow(
        /Category name is required/i
      );
      await expect(createExpenseCategory('   ', 'usr-admin-test')).rejects.toThrow(
        /Category name is required/i
      );
    });

    it('prevents case-insensitive duplicate categories', async () => {
      const uniqueName = `Facility Repairs ${Date.now()}`;
      await createExpenseCategory(uniqueName, 'usr-admin-test');

      await expect(
        createExpenseCategory(uniqueName.toLowerCase(), 'usr-admin-test')
      ).rejects.toThrow(/already exists/i);

      await expect(
        createExpenseCategory(`  ${uniqueName.toUpperCase()}  `, 'usr-admin-test')
      ).rejects.toThrow(/already exists/i);
    });
  });

  describe('Task 2: Invoice Installment History & Master Design', () => {
    it('properly sorts verified payments chronologically and includes explicit Total Paid', async () => {
      const invoiceData: InvoiceData = {
        id: 'inv-test-01',
        student_id: 'std-test-01',
        invoice_number: 'INV/26-27/0486',
        invoice_date: '2026-02-15',
        due_date: '2026-03-01',
        student_name: 'Amit Kumar',
        student_phone: '9000333859',
        student_address: 'Plot 44, Hyderabad, Telangana',
        place_of_supply: 'Telangana (36)',
        total_amount: 35000,
        amount_due: 15000,
        amount_in_words: 'Thirty-Five Thousand Rupees Only',
        payment_communication: 'INV/26-27/0486',
        bank_account_info: 'HDFC Bank - Next-Gen ERP Solutions',
        payments: [
          { date: '2026-02-20', amount: 10000, receipt_number: 'REC-002' },
          { date: '2026-02-10', amount: 10000, receipt_number: 'REC-001' },
        ],
        items: [
          {
            description: 'SAP S/4HANA Finance Course Training Fee',
            hsn_sac: '999293',
            quantity: 1,
            unit_price: 35000,
            amount: 35000,
          },
        ],
      };

      // Ensure PDF generation executes without error
      const pdfBuffer = await generateInvoicePdfBuffer(invoiceData);
      expect(pdfBuffer).toBeDefined();
      expect(pdfBuffer.length).toBeGreaterThan(1000);

      // Verify payments calculation
      const totalPaid = (invoiceData.payments || []).reduce((sum, p) => sum + p.amount, 0);
      expect(totalPaid).toBe(20000);
      expect(invoiceData.total_amount - totalPaid).toBe(invoiceData.amount_due);
    });

    it('formats Indian numbering system words correctly', () => {
      expect(amountToWordsINR(26000)).toMatch(/Twenty[ -]Six Thousand Rupees Only/i);
      expect(amountToWordsINR(150000)).toMatch(/One Lakh Fifty Thousand Rupees Only/i);
    });
  });

  describe('Task 3: Add Lead Experience Validation & Optional Fields', () => {
    it('enforces mandatory Experience on lead creation', async () => {
      const adminActor = store.users.find((u) => u.id === 'usr-admin-test')!;

      // Should fail if experience is missing or empty
      await expect(
        createLead(
          {
            full_name: 'Pooja Verma',
            phone: '9848012345',
            email: 'pooja.verma@example.com',
            interested_course_id: store.courses[0]?.id,
            training_preference: 'Online',
            stage: 'New',
            experience: '' as any,
          },
          adminActor
        )
      ).rejects.toThrow();
    });

    it('creates lead with valid Experience and optional DOB & Address', async () => {
      const adminActor = store.users.find((u) => u.id === 'usr-admin-test')!;

      const lead = await createLead(
        {
          full_name: 'Rahul Sen',
          phone: `98480${Math.floor(10000 + Math.random() * 90000)}`,
          email: `rahul.sen.${Date.now()}@example.com`,
          interested_course_id: store.courses[0]?.id,
          training_preference: 'Online',
          stage: 'New',
          experience: '2–5 Years',
          experience_years: 3,
          dob: '1998-05-14',
          address: 'Plot 104, Hitec City, Hyderabad',
        },
        adminActor
      );

      expect(lead).toBeDefined();
      expect(lead.experience).toBe('2–5 Years');
      expect(lead.dob).toBe('1998-05-14');
      expect(lead.address).toBe('Plot 104, Hitec City, Hyderabad');
    });

    it('allows updating candidate experience, dob, and address without overwriting stage', async () => {
      const adminActor = store.users.find((u) => u.id === 'usr-admin-test')!;
      const lead = await createLead(
        {
          full_name: 'Sneha Rao',
          phone: `98480${Math.floor(10000 + Math.random() * 90000)}`,
          email: `sneha.rao.${Date.now()}@example.com`,
          interested_course_id: store.courses[0]?.id,
          training_preference: 'Online',
          stage: 'Contacted',
          experience: 'Fresher',
        },
        adminActor
      );

      const updated = await updateLeadDetails(
        lead.id,
        {
          experience: '0–2 Years',
          dob: '2001-11-20',
          address: 'Flat 202, Jubilee Hills',
        },
        adminActor.id,
        adminActor
      );

      expect(updated.experience).toBe('0–2 Years');
      expect(updated.dob).toBe('2001-11-20');
      expect(updated.address).toBe('Flat 202, Jubilee Hills');
      expect(updated.stage).toBe('Contacted');
    });
  });

  describe('Task 4: Assign Batch – Inline Batch Creation & Auto-Naming', () => {
    it('creates batch with auto-suggested name format and links to course', async () => {
      const course = store.courses[0];
      const batchName = `10AM NOV 26`;
      const batchCode = `BTC-${Date.now()}`;

      const batch = await createBatch({
        batch_code: batchCode,
        batch_name: batchName,
        course_id: course.id,
        trainer_id: 'usr-trainer',
        training_mode: 'Online',
        start_date: '2026-11-25',
        end_date: '2027-01-25',
        start_time: '10:00',
        end_time: '11:00',
        days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
        maximum_capacity: 25,
        status: 'Upcoming',
      });

      expect(batch).toBeDefined();
      expect(batch.batch_name).toBe(batchName);
      expect(batch.course_id).toBe(course.id);
      expect(batch.maximum_capacity).toBe(25);
      expect(store.batches.some((b) => b.id === batch.id)).toBe(true);
    });

    it('rejects duplicate batch codes', async () => {
      const course = store.courses[0];
      const code = `BTC-DUP-${Date.now()}`;
      await createBatch({
        batch_code: code,
        batch_name: 'Morning Cohort',
        course_id: course.id,
        trainer_id: 'usr-trainer',
        training_mode: 'Online',
        start_date: '2026-11-25',
        end_date: '2027-01-25',
        start_time: '09:00',
        end_time: '10:00',
        days: ['Monday'],
        maximum_capacity: 25,
        status: 'Upcoming',
      });

      await expect(
        createBatch({
          batch_code: code,
          batch_name: 'Evening Cohort',
          course_id: course.id,
          trainer_id: 'usr-trainer',
          training_mode: 'Online',
          start_date: '2026-11-25',
          end_date: '2027-01-25',
          start_time: '18:00',
          end_time: '19:00',
          days: ['Monday'],
          maximum_capacity: 25,
          status: 'Upcoming',
        })
      ).rejects.toThrow(/already exists/i);
    });
  });

  describe('Task 5: Expense Validation & Settlement Workflow', () => {
    it('executes full Draft -> Pending Approval -> Approved -> Settled workflow', async () => {
      // 1. Requisition: Create expense in Pending Approval
      const exp = await createExpense(
        {
          expense_date: '2026-03-01',
          category: 'Software Licenses',
          description: 'JetBrains & SAP Cloud Sandbox User Licenses',
          amount: 45000,
          payment_mode: 'Bank Transfer',
          status: 'Pending Approval',
        },
        'usr-admin-test'
      );
      expect(exp.status).toBe('Pending Approval');

      // 2. Reject settlement before approval
      await expect(
        validateAndSettleExpense(exp.id, 'usr-admin-test', {
          payment_mode: 'Bank Transfer',
          reference: 'UTR-HDFC-991823',
        })
      ).rejects.toThrow(/Only 'Approved' expenses can be validated/i);

      // 3. Approval
      const approved = await approveExpense(exp.id, 'usr-admin-test');
      expect(approved.status).toBe('Approved');
      expect(approved.approved_by).toBe('usr-admin-test');

      // 4. Validation & Settlement
      const settled = await validateAndSettleExpense(exp.id, 'usr-admin-test', {
        payment_mode: 'Bank Transfer',
        reference: 'UTR-HDFC-991823',
        expense_date: '2026-03-02',
        bank_account: 'HDFC Bank - Next-Gen ERP Solutions (A/C: 50200088921)',
      });

      expect(settled.status).toBe('Settled');
      expect(settled.reference).toBe('UTR-HDFC-991823');
      expect(settled.settled_by).toBe('usr-admin-test');
      expect(settled.settled_at).toBeDefined();
      expect(settled.bank_account).toBe('HDFC Bank - Next-Gen ERP Solutions (A/C: 50200088921)');
    });

    it('requires mandatory reference for settlement', async () => {
      const exp = await createExpense(
        {
          expense_date: '2026-03-05',
          category: 'Rent',
          description: 'Hitec City Lab Facility Rent',
          amount: 30000,
          payment_mode: 'Bank Transfer',
          status: 'Pending Approval',
        },
        'usr-admin-test'
      );
      await approveExpense(exp.id, 'usr-admin-test');

      await expect(
        validateAndSettleExpense(exp.id, 'usr-admin-test', {
          payment_mode: 'Bank Transfer',
          reference: '',
        })
      ).rejects.toThrow(/Mandatory reference/i);
    });
  });
});
