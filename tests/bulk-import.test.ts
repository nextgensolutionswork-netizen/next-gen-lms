import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import {
  parseCSV,
  detectDelimiter,
  previewBulkImport,
  executeBulkImport,
  generateCsvTemplate,
} from '@/lib/services/bulk-import-service';
import { store } from '@/lib/services/data-store';
import { POST as previewRoute } from '@/app/api/bulk-import/preview/route';
import { POST as executeRoute } from '@/app/api/bulk-import/execute/route';
import { GET as templateRoute } from '@/app/api/bulk-import/template/route';

describe('12. Excel / CSV Bulk Data Imports & CI/CD Pipeline Tests', () => {
  beforeEach(() => {
    // Reset test student and lead counters if needed
  });

  // ==========================================
  // 1. CSV PARSING & DELIMITER TESTS
  // ==========================================
  describe('CSV Parsing Engine', () => {
    it('detects comma, tab, and semicolon delimiters automatically', () => {
      expect(detectDelimiter('name,email,phone')).toBe(',');
      expect(detectDelimiter('name\temail\tphone')).toBe('\t');
      expect(detectDelimiter('name;email;phone')).toBe(';');
    });

    it('parses standard comma-separated CSV with headers', () => {
      const csv = `full_name,email,phone\nRahul Sharma,rahul@example.com,+91 98765 12345\nPriya Verma,priya@example.com,+91 98765 67890`;
      const result = parseCSV(csv);

      expect(result.headers).toEqual(['full_name', 'email', 'phone']);
      expect(result.rows.length).toBe(2);
      expect(result.rows[0].data.full_name).toBe('Rahul Sharma');
      expect(result.rows[0].data.email).toBe('rahul@example.com');
      expect(result.rows[1].data.full_name).toBe('Priya Verma');
    });

    it('handles quoted fields with commas and embedded linebreaks', () => {
      const csv = `full_name,address,notes\n"Sharma, Rajesh","Plot 42, Hitec City\nHyderabad, Telangana","Enrolled via VIP counsellor"`;
      const result = parseCSV(csv);

      expect(result.rows.length).toBe(1);
      expect(result.rows[0].data.full_name).toBe('Sharma, Rajesh');
      expect(result.rows[0].data.address).toContain('Plot 42, Hitec City');
      expect(result.rows[0].data.notes).toBe('Enrolled via VIP counsellor');
    });

    it('strips UTF-8 BOM marker gracefully', () => {
      const csvWithBom = `\uFEFFfull_name,email,phone\nAnita Desai,anita@example.com,+91 98111 00000`;
      const result = parseCSV(csvWithBom);

      expect(result.normalizedHeaders[0]).toBe('full_name');
      expect(result.rows.length).toBe(1);
      expect(result.rows[0].data.full_name).toBe('Anita Desai');
    });
  });

  // ==========================================
  // 2. DRY-RUN PREVIEW & VALIDATION TESTS
  // ==========================================
  describe('Dry-Run Preview & Validation Engine', () => {
    it('validates correct student rows and calculates preview statistics', () => {
      const csv = [
        'full_name,email,phone,course_code,course_fee,paid_amount',
        'Vijay Kumar,vijay.kumar@test.com,+91 98765 43210,crs-fico-01,40000,20000',
        'Kavita Iyer,kavita.iyer@test.com,+91 98765 43211,crs-mm-01,40000,40000',
      ].join('\n');

      const preview = previewBulkImport('students', csv);
      expect(preview.totalRows).toBe(2);
      expect(preview.validRowsCount).toBe(2);
      expect(preview.errorRowsCount).toBe(0);
      expect(preview.errors.filter((e) => e.severity === 'error').length).toBe(0);
    });

    it('detects invalid email, invalid phone, and missing required fields in student rows', () => {
      const badCsv = [
        'full_name,email,phone,course_code',
        ',bad-email-format,123,crs-fico-01', // row 2: missing name, bad email, phone < 10 digits
        'Valid Student,valid@test.com,+91 98765 99999,crs-fico-01', // row 3: valid
      ].join('\n');

      const preview = previewBulkImport('students', badCsv);
      expect(preview.totalRows).toBe(2);
      expect(preview.validRowsCount).toBe(1);
      expect(preview.errorRowsCount).toBe(1);

      const row2Errors = preview.errors.filter((e) => e.rowNumber === 2 && e.severity === 'error');
      expect(row2Errors.some((e) => e.field === 'full_name')).toBe(true);
      expect(row2Errors.some((e) => e.field === 'email')).toBe(true);
      expect(row2Errors.some((e) => e.field === 'phone')).toBe(true);
    });

    it('detects duplicate emails within the same uploaded file', () => {
      const dupCsv = [
        'full_name,email,phone,course_code',
        'Student One,duplicate@test.com,+91 98765 00001,crs-fico-01',
        'Student Two,duplicate@test.com,+91 98765 00002,crs-fico-01',
      ].join('\n');

      const preview = previewBulkImport('students', dupCsv);
      expect(preview.errorRowsCount).toBe(1);
      const dupError = preview.errors.find((e) => e.field === 'email' && e.message.includes('Duplicate email'));
      expect(dupError).toBeDefined();
    });

    it('previews CRM leads import and enforces contact requirements', () => {
      const leadsCsv = [
        'full_name,email,phone,lead_source,stage',
        'Rohan Lead,rohan.lead@test.com,+91 98888 12345,Google Ads,New',
        'Incomplete Lead,,,Meta Ads,New', // missing email and phone
      ].join('\n');

      const preview = previewBulkImport('leads', leadsCsv);
      expect(preview.totalRows).toBe(2);
      expect(preview.validRowsCount).toBe(1);
      expect(preview.errorRowsCount).toBe(1);
      expect(preview.errors.some((e) => e.field === 'contact')).toBe(true);
    });

    it('previews attendance register import and matches student codes', () => {
      const validStudent = store.students[0];
      const attendanceCsv = [
        'student_code,attendance_date,status,duration_minutes',
        `${validStudent.student_code},2026-03-02,Present,120`,
        `NON_EXISTENT_STU,2026-03-02,Present,120`,
      ].join('\n');

      const preview = previewBulkImport('attendance', attendanceCsv);
      expect(preview.totalRows).toBe(2);
      expect(preview.validRowsCount).toBe(1);
      expect(preview.errorRowsCount).toBe(1);
      expect(preview.errors.some((e) => e.message.includes('Student not found'))).toBe(true);
    });

    it('returns error when file is empty', () => {
      const preview = previewBulkImport('students', '   ');
      expect(preview.totalRows).toBe(0);
      expect(preview.errors.length).toBeGreaterThan(0);
    });
  });

  // ==========================================
  // 3. EXECUTION & COMMIT TESTS
  // ==========================================
  describe('Execution & Atomic Commit Engine', () => {
    it('aborts commit when errors exist and skipInvalidRows is false', async () => {
      const badCsv = [
        'full_name,email,phone,course_code',
        ',invalid-email,999,crs-fico-01',
      ].join('\n');

      const result = await executeBulkImport('students', badCsv, 'usr-admin', 'Admin', {
        skipInvalidRows: false,
      });

      expect(result.success).toBe(false);
      expect(result.importedCount).toBe(0);
    });

    it('successfully commits valid student rows, creates admission & fee ledger, and writes audit log', async () => {
      const initialStudentCount = store.students.length;
      const initialAdmissionCount = store.admissions.length;

      const validCsv = [
        'full_name,email,phone,course_code,course_fee,paid_amount,address,city',
        'Deepak Varma,deepak.varma@test-bulk.com,+91 98765 88990,crs-fico-01,40000,20000,Madhapur,Hyderabad',
      ].join('\n');

      const result = await executeBulkImport('students', validCsv, 'usr-admin', 'Admin', {
        skipInvalidRows: true,
      });

      expect(result.success).toBe(true);
      expect(result.importedCount).toBe(1);
      expect(store.students.length).toBe(initialStudentCount + 1);
      expect(store.admissions.length).toBe(initialAdmissionCount + 1);

      // Verify created student profile
      const newStudent = store.students.find((s) => s.email === 'deepak.varma@test-bulk.com');
      expect(newStudent).toBeDefined();
      expect(newStudent?.full_name).toBe('Deepak Varma');
      expect(newStudent?.total_fee).toBe(40000);
      expect(newStudent?.paid_amount).toBe(20000);

      // Verify corresponding user account
      const newUser = store.users.find((u) => u.email === 'deepak.varma@test-bulk.com');
      expect(newUser).toBeDefined();
      expect(newUser?.role).toBe('student');

      // Verify audit log
      expect(result.auditLogId).toBeDefined();
      const auditLog = store.auditLogs.find((a) => a.id === result.auditLogId);
      expect(auditLog?.action).toBe('BULK_DATA_IMPORTED');
    });

    it('successfully commits CRM leads and generates sequential lead codes', async () => {
      const initialLeadCount = store.leads.length;

      const leadsCsv = [
        'full_name,email,phone,lead_source,stage,experience_years,notes',
        'Sunil Gavaskar,sunil.g@bulk-lead.com,+91 97777 11111,Meta Ads,Interested,4,Wants evening batch',
      ].join('\n');

      const result = await executeBulkImport('leads', leadsCsv, 'usr-admin', 'Admin');

      expect(result.success).toBe(true);
      expect(result.importedCount).toBe(1);
      expect(store.leads.length).toBe(initialLeadCount + 1);

      const newLead = store.leads.find((l) => l.email === 'sunil.g@bulk-lead.com');
      expect(newLead).toBeDefined();
      expect(newLead?.lead_code).toContain('LD-2026-');
      expect(newLead?.stage).toBe('Interested');
    });

    it('commits attendance records and updates student attendance percentage atomically', async () => {
      const student = store.students[0];
      const attendanceCsv = [
        'student_code,attendance_date,status,duration_minutes,notes',
        `${student.student_code},2026-03-05,Present,120,Bulk import automated test`,
      ].join('\n');

      const result = await executeBulkImport('attendance', attendanceCsv, 'usr-admin', 'Admin');

      expect(result.success).toBe(true);
      expect(result.importedCount).toBe(1);

      const record = store.attendanceRecords.find(
        (a) => a.student_id === student.id && a.attendance_date === '2026-03-05'
      );
      expect(record).toBeDefined();
      expect(record?.status).toBe('Present');
      expect(typeof student.attendance_percentage).toBe('number');
    });
  });

  // ==========================================
  // 4. TEMPLATE GENERATOR TESTS
  // ==========================================
  describe('Sample CSV Template Generator', () => {
    it('generates valid downloadable templates for students, leads, and attendance', () => {
      const studentTpl = generateCsvTemplate('students');
      expect(studentTpl).toContain('full_name,email,phone,course_code');

      const leadsTpl = generateCsvTemplate('leads');
      expect(leadsTpl).toContain('full_name,email,phone,course_code,lead_source');

      const attTpl = generateCsvTemplate('attendance');
      expect(attTpl).toContain('student_code,attendance_date,status');
    });
  });

  // ==========================================
  // 5. API ROUTE HANDLERS
  // ==========================================
  describe('Bulk Import API Routes', () => {
    it('POST /api/bulk-import/preview returns validation preview', async () => {
      const csv = 'full_name,email,phone,course_code\nTest Person,test.p@domain.com,+91 99999 12345,crs-fico-01';
      const req = new NextRequest('http://localhost:3000/api/bulk-import/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityType: 'students', csvContent: csv }),
      });

      const res = await previewRoute(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.totalRows).toBe(1);
      expect(json.data.validRowsCount).toBe(1);
    });

    it('POST /api/bulk-import/execute commits data via API', async () => {
      const csv = 'full_name,email,phone,lead_source,stage\nAPI Lead,api.lead@domain.com,+91 99999 54321,Website,New';
      const req = new NextRequest('http://localhost:3000/api/bulk-import/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityType: 'leads', csvContent: csv }),
      });

      const res = await executeRoute(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.importedCount).toBe(1);
    });

    it('GET /api/bulk-import/template returns attachment CSV', async () => {
      const req = new NextRequest('http://localhost:3000/api/bulk-import/template?entity=students');
      const res = await templateRoute(req);

      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/csv');
      expect(res.headers.get('content-disposition')).toContain('students_bulk_import_template.csv');

      const body = await res.text();
      expect(body).toContain('full_name,email,phone');
    });
  });
});
