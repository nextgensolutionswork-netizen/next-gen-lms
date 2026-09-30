import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import fs from 'fs';
import path from 'path';
import {
  persistentStorage,
  InstituteDataSnapshot,
} from '@/lib/services/persistent-storage-adapter';
import { store } from '@/lib/services/data-store';
import {
  admissionsRepo,
  studentsRepo,
  attendanceRepo,
  financeRepo,
  crmRepo,
} from '@/lib/supabase/repository';
import {
  checkDatabaseHealth,
  syncLocalToPostgres,
  syncPostgresToLocal,
} from '@/lib/supabase/sync-service';
import { GET as healthRoute } from '@/app/api/database/health/route';
import { POST as syncRoute } from '@/app/api/database/sync/route';
import { GET as backupGetRoute, POST as backupPostRoute } from '@/app/api/database/backup/route';
import { Admission, Payment, Receipt, Lead, AttendanceRecord } from '@/types';

describe('13. Data Persistence & Database Layer Tests', () => {
  const testStorageDir = path.join(process.cwd(), 'data');
  const testStorageFile = path.join(testStorageDir, 'institute_store.json');

  beforeEach(() => {
    // Ensure test student exists
    if (!store.students[0]) {
      store.hydrateFromDisk();
    }
  });

  // ==========================================
  // 1. FILE-BACKED PERSISTENCE ADAPTER TESTS
  // ==========================================
  describe('PersistentStorageAdapter (Filesystem Persistence)', () => {
    it('saves snapshot to disk atomically and re-reads it accurately', () => {
      const isSaved = persistentStorage.saveState(store);
      expect(isSaved).toBe(true);

      expect(fs.existsSync(testStorageFile)).toBe(true);

      const loadedState = persistentStorage.loadState();
      expect(loadedState).toBeDefined();
      expect(loadedState?.version).toBe('1.0.0');
      expect(Array.isArray(loadedState?.students)).toBe(true);
      expect(loadedState?.students?.length).toBe(store.students.length);
    });

    it('creates timestamped backup snapshot in data/backups/', () => {
      const backup = persistentStorage.createBackup(store);
      expect(backup.success).toBe(true);
      expect(backup.filename).toBeDefined();
      expect(backup.backupPath).toBeDefined();
      expect(fs.existsSync(backup.backupPath!)).toBe(true);

      const content = fs.readFileSync(backup.backupPath!, 'utf-8');
      const parsed = JSON.parse(content);
      expect(parsed.students).toBeDefined();

      // Clean up test backup file
      if (fs.existsSync(backup.backupPath!)) {
        fs.unlinkSync(backup.backupPath!);
      }
    });

    it('hydrates store from persistent disk storage', () => {
      // Modify store in-memory
      const originalCount = store.students.length;
      store.persistSync();

      const hydrated = store.hydrateFromDisk();
      expect(hydrated).toBe(true);
      expect(store.students.length).toBe(originalCount);
    });
  });

  // ==========================================
  // 2. SUPABASE POSTGRES REPOSITORY LAYER
  // ==========================================
  describe('Supabase Postgres Repository Layer', () => {
    it('admissionsRepo creates and persists an admission record', async () => {
      const newAdm: Admission = {
        id: `adm-test-${Date.now()}`,
        admission_number: `ADM-2026-TEST-${Date.now()}`,
        student_name: 'Database Persistence Test Student',
        phone: '+91 99999 88888',
        email: `persistence.test.${Date.now()}@example.com`,
        dob: '2000-01-01',
        gender: 'Male',
        address: 'Hitec City, Hyderabad',
        city: 'Hyderabad',
        education: 'B.Tech',
        experience_years: 2,
        current_employment_status: 'Employed',
        course_id: 'crs-fico-01',
        course_name: 'SAP S/4HANA Finance (FICO)',
        training_mode: 'Online',
        admission_date: new Date().toISOString().slice(0, 10),
        course_fee: 40000,
        discount: 0,
        net_payable: 40000,
        payment_plan: 'Full Payment',
        status: 'Active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const created = await admissionsRepo.create(newAdm);
      expect(created.id).toBe(newAdm.id);

      const found = await admissionsRepo.getById(newAdm.id);
      expect(found).toBeDefined();
      expect(found?.student_name).toBe(newAdm.student_name);
    });

    it('studentsRepo updates attendance percentage and persists changes', async () => {
      const student = store.students[0];
      const newPercentage = 87;

      await studentsRepo.updateAttendance(student.id, newPercentage);

      const updated = await studentsRepo.getById(student.id);
      expect(updated?.attendance_percentage).toBe(newPercentage);
    });

    it('attendanceRepo upserts session records idempotently', async () => {
      const student = store.students[0];
      const session = store.classSessions[0];

      const record: AttendanceRecord = {
        id: `att-repo-test-${Date.now()}`,
        student_id: student.id,
        session_id: session.id,
        batch_id: session.batch_id,
        attendance_date: session.session_date,
        status: 'Present',
        source: 'Manual',
        duration_minutes: 90,
        marked_by: 'usr-admin',
        marked_at: new Date().toISOString(),
      };

      const saved = await attendanceRepo.upsert(record);
      expect(saved.id).toBe(record.id);

      const records = await attendanceRepo.getRecords(session.batch_id, session.session_date);
      expect(records.some((r) => r.id === record.id)).toBe(true);
    });

    it('financeRepo records fee payment and generates receipt', async () => {
      const student = store.students[0];
      const feeAccount = store.feeAccounts[0];

      const receiptNumber = `REC-2026-TEST-${Date.now()}`;
      const payment: Payment = {
        id: `pay-repo-test-${Date.now()}`,
        receipt_number: receiptNumber,
        student_id: student.id,
        course_id: feeAccount.course_id,
        fee_account_id: feeAccount.id,
        amount: 5000,
        payment_date: new Date().toISOString().slice(0, 10),
        payment_mode: 'UPI',
        status: 'Success',
        collected_by: 'usr-admin',
        created_at: new Date().toISOString(),
      };

      const receipt: Receipt = {
        id: `rcpt-repo-test-${Date.now()}`,
        receipt_number: receiptNumber,
        payment_id: payment.id,
        student_id: student.id,
        student_name: student.full_name,
        admission_number: student.admission_number,
        course_name: 'SAP S/4HANA Finance (FICO)',
        payment_amount: 5000,
        payment_mode: 'UPI',
        payment_date: payment.payment_date,
        remaining_balance: 10000,
        authorized_by: 'Finance Department',
        institute_name: 'Next-Gen ERP Solutions',
        institute_address: 'Plot 42, Silicon Valley Towers, Hyderabad',
        institute_phone: '+91 98765 43210',
        institute_gst: '36AAACN1234F1Z8',
        created_at: new Date().toISOString(),
      };

      const result = await financeRepo.recordPayment(payment, receipt);
      expect(result.payment.id).toBe(payment.id);
      expect(result.receipt.id).toBe(receipt.id);

      const allPayments = await financeRepo.getPayments();
      expect(allPayments.some((p) => p.id === payment.id)).toBe(true);
    });

    it('crmRepo creates and retrieves leads', async () => {
      const newLead: Lead = {
        id: `lead-repo-test-${Date.now()}`,
        lead_code: `LD-2026-TEST-${Date.now()}`,
        full_name: 'Postgres Lead Test',
        phone: '+91 98888 77777',
        email: `lead.pg.${Date.now()}@example.com`,
        interested_course_id: 'crs-fico-01',
        current_status: 'Professional',
        experience_years: 3,
        training_preference: 'Hybrid',
        lead_source: 'Website',
        stage: 'New',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const created = await crmRepo.createLead(newLead);
      expect(created.id).toBe(newLead.id);

      const allLeads = await crmRepo.getLeads();
      expect(allLeads.some((l) => l.id === newLead.id)).toBe(true);
    });
  });

  // ==========================================
  // 3. DATABASE HEALTH & SYNCHRONIZATION
  // ==========================================
  describe('Database Health & Synchronization Engine', () => {
    it('checks database health and reports table counts and latency', async () => {
      const health = await checkDatabaseHealth();
      expect(health).toBeDefined();
      expect(health.status).toMatch(/connected|simulated_local/);
      expect(health.latencyMs).toBeGreaterThanOrEqual(0);
      expect(health.totalRecords).toBeGreaterThan(0);
      expect(health.tables.students).toBeGreaterThan(0);
    });

    it('syncLocalToPostgres completes without errors', async () => {
      const result = await syncLocalToPostgres();
      expect(result.success).toBe(true);
      expect(result.direction).toBe('push');
      expect(result.errors.length).toBe(0);
    });

    it('syncPostgresToLocal completes without errors', async () => {
      const result = await syncPostgresToLocal();
      expect(result.success).toBe(true);
      expect(result.direction).toBe('pull');
      expect(result.errors.length).toBe(0);
    });
  });

  // ==========================================
  // 4. DATABASE API ROUTES
  // ==========================================
  describe('Database API Routes', () => {
    it('GET /api/database/health returns health report with 200 OK', async () => {
      const res = await healthRoute();
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.health.totalRecords).toBeGreaterThan(0);
    });

    it('POST /api/database/sync handles push and pull synchronizations', async () => {
      // Test push
      const pushReq = new NextRequest('http://localhost:3000/api/database/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ direction: 'push' }),
      });

      const pushRes = await syncRoute(pushReq);
      expect(pushRes.status).toBe(200);
      const pushJson = await pushRes.json();
      expect(pushJson.success).toBe(true);
      expect(pushJson.data.direction).toBe('push');

      // Test pull
      const pullReq = new NextRequest('http://localhost:3000/api/database/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ direction: 'pull' }),
      });

      const pullRes = await syncRoute(pullReq);
      expect(pullRes.status).toBe(200);
      const pullJson = await pullRes.json();
      expect(pullJson.success).toBe(true);
      expect(pullJson.data.direction).toBe('pull');
    });

    it('GET /api/database/backup returns JSON database snapshot', async () => {
      const res = await backupGetRoute();
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('application/json');
      expect(res.headers.get('content-disposition')).toContain('lms_database_backup_');

      const body = await res.text();
      const parsed = JSON.parse(body);
      expect(parsed.version).toBe('1.0.0');
      expect(parsed.store).toBeDefined();
    });

    it('POST /api/database/backup creates snapshot file on disk', async () => {
      const req = new NextRequest('http://localhost:3000/api/database/backup', {
        method: 'POST',
      });
      const res = await backupPostRoute(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.filename).toBeDefined();

      // Clean up created snapshot
      if (json.backupPath && fs.existsSync(json.backupPath)) {
        fs.unlinkSync(json.backupPath);
      }
    });
  });
});
