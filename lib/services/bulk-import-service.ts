import { store } from './data-store';
import {
  Student,
  Admission,
  StudentFeeAccount,
  Lead,
  LeadStage,
  AttendanceRecord,
  AttendanceStatus,
} from '@/types';
import { generateAdmissionNumber } from '@/lib/utils/formatters';
import { recordAuditLog } from './audit-service';
import { publishRealtimeEvent } from './realtime-service';
import { recalculateStudentAttendancePercentage } from './meeting-attendance-service';
import { isLiveSupabaseEnabled, getDb } from '@/lib/supabase/db';

export type BulkImportEntityType = 'students' | 'leads' | 'attendance';

export interface BulkImportRowError {
  rowNumber: number;
  field: string;
  message: string;
  value?: any;
  severity: 'error' | 'warning';
}

export interface BulkImportPreviewRow {
  rowNumber: number;
  data: Record<string, any>;
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export interface BulkImportPreviewResult {
  entityType: BulkImportEntityType;
  totalRows: number;
  validRowsCount: number;
  errorRowsCount: number;
  warningRowsCount: number;
  errors: BulkImportRowError[];
  sampleHeaders: string[];
  previewRows: BulkImportPreviewRow[];
}

export interface BulkImportExecutionResult {
  success: boolean;
  entityType: BulkImportEntityType;
  importedCount: number;
  skippedCount: number;
  totalProcessed: number;
  createdIds: string[];
  auditLogId?: string;
  errors: BulkImportRowError[];
}

// ==========================================
// 1. ROBUST CSV & DELIMITER PARSER
// ==========================================

/**
 * Detects delimiter (comma, tab, semicolon) based on first line
 */
export function detectDelimiter(firstLine: string): string {
  const commaCount = (firstLine.match(/,/g) || []).length;
  const tabCount = (firstLine.match(/\t/g) || []).length;
  const semiCount = (firstLine.match(/;/g) || []).length;

  if (tabCount > commaCount && tabCount > semiCount) return '\t';
  if (semiCount > commaCount && semiCount > tabCount) return ';';
  return ',';
}

/**
 * Normalizes header keys: e.g. "Full Name" -> "full_name", "Student Code" -> "student_code"
 */
export function normalizeHeaderKey(key: string): string {
  return key
    .replace(/^[\uFEFF\xA0]+/, '') // strip BOM and non-breaking space
    .trim()
    .toLowerCase()
    .replace(/[\s\-\/\.]+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
}

/**
 * RFC 4180 compliant CSV parser with quote escaping, multi-line cells, and BOM support
 */
export function parseCSV(rawText: string): {
  headers: string[];
  normalizedHeaders: string[];
  rows: { rowNumber: number; data: Record<string, string>; raw: string }[];
} {
  const cleanText = rawText.replace(/^\uFEFF/, '');
  const lines: string[] = [];
  let currentLine = '';
  let inQuotes = false;

  for (let i = 0; i < cleanText.length; i++) {
    const char = cleanText[i];
    const nextChar = cleanText[i + 1];

    if (char === '"') {
      currentLine += '"';
      if (inQuotes && nextChar === '"') {
        currentLine += '"';
        i++; // skip escaped quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if ((char === '\r' && nextChar === '\n') || char === '\n' || char === '\r') {
      if (inQuotes) {
        currentLine += '\n';
      } else {
        if (currentLine.trim().length > 0) {
          lines.push(currentLine);
        }
        currentLine = '';
        if (char === '\r' && nextChar === '\n') i++;
      }
    } else {
      currentLine += char;
    }
  }
  if (currentLine.trim().length > 0) {
    lines.push(currentLine);
  }

  if (lines.length === 0) {
    return { headers: [], normalizedHeaders: [], rows: [] };
  }

  const delimiter = detectDelimiter(lines[0]);

  const cleanCell = (str: string): string => {
    let trimmed = str.trim();
    if (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) {
      trimmed = trimmed.slice(1, -1).replace(/""/g, '"');
    }
    return trimmed;
  };

  // Helper to split a line by delimiter respecting quotes
  const parseLine = (line: string): string[] => {
    const cells: string[] = [];
    let cell = '';
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      const nextC = line[i + 1];
      if (c === '"') {
        cell += '"';
        if (inQ && nextC === '"') {
          cell += '"';
          i++;
        } else {
          inQ = !inQ;
        }
      } else if (c === delimiter && !inQ) {
        cells.push(cleanCell(cell));
        cell = '';
      } else {
        cell += c;
      }
    }
    cells.push(cleanCell(cell));
    return cells;
  };

  const rawHeaders = parseLine(lines[0]);
  const normalizedHeaders = rawHeaders.map(normalizeHeaderKey);

  const rows: { rowNumber: number; data: Record<string, string>; raw: string }[] = [];

  for (let r = 1; r < lines.length; r++) {
    const rawLine = lines[r];
    const cells = parseLine(rawLine);
    const rowData: Record<string, string> = {};

    for (let c = 0; c < normalizedHeaders.length; c++) {
      const key = normalizedHeaders[c];
      rowData[key] = cells[c] !== undefined ? cells[c] : '';
    }

    rows.push({
      rowNumber: r + 1, // 1-indexed, line 1 was header
      data: rowData,
      raw: rawLine,
    });
  }

  return {
    headers: rawHeaders,
    normalizedHeaders,
    rows,
  };
}

// ==========================================
// 2. VALIDATION ENGINES
// ==========================================

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export function isValidPhone(phone: string): boolean {
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 10 && digits.length <= 15;
}

/**
 * Validates students import rows
 */
export function validateStudentRows(
  rows: { rowNumber: number; data: Record<string, string> }[]
): {
  validCount: number;
  previewRows: BulkImportPreviewRow[];
  errors: BulkImportRowError[];
} {
  const previewRows: BulkImportPreviewRow[] = [];
  const errors: BulkImportRowError[] = [];
  const seenEmailsInFile = new Set<string>();

  for (const { rowNumber, data } of rows) {
    const rowErrors: string[] = [];
    const rowWarnings: string[] = [];

    const fullName = data.full_name || data.student_name || data.name || '';
    const email = (data.email || '').toLowerCase().trim();
    const phone = data.phone || data.mobile || '';
    const courseIdentifier = data.course_code || data.course_id || data.course_name || data.course || '';
    const batchIdentifier = data.batch_code || data.batch_id || data.batch_name || data.batch || '';
    const courseFeeRaw = data.course_fee || data.fee || data.total_fee || '40000';
    const paidAmountRaw = data.paid_amount || data.paid || '0';

    // 1. Full name validation
    if (!fullName || fullName.trim().length < 2) {
      const msg = 'Full name is required (minimum 2 characters)';
      rowErrors.push(msg);
      errors.push({ rowNumber, field: 'full_name', message: msg, severity: 'error' });
    }

    // 2. Email validation
    if (!email) {
      const msg = 'Email address is required';
      rowErrors.push(msg);
      errors.push({ rowNumber, field: 'email', message: msg, severity: 'error' });
    } else if (!isValidEmail(email)) {
      const msg = `Invalid email format: "${email}"`;
      rowErrors.push(msg);
      errors.push({ rowNumber, field: 'email', message: msg, value: email, severity: 'error' });
    } else {
      // Check duplicate within file
      if (seenEmailsInFile.has(email)) {
        const msg = `Duplicate email "${email}" found in multiple rows of this import file`;
        rowErrors.push(msg);
        errors.push({ rowNumber, field: 'email', message: msg, value: email, severity: 'error' });
      } else {
        seenEmailsInFile.add(email);
      }

      // Check duplicate in database
      const existingStudent = store.students.find((s) => s.email.toLowerCase() === email);
      if (existingStudent) {
        const msg = `Student with email "${email}" already exists (Code: ${existingStudent.student_code})`;
        rowWarnings.push(msg);
        errors.push({ rowNumber, field: 'email', message: msg, value: email, severity: 'warning' });
      }
    }

    // 3. Phone validation
    if (!phone) {
      const msg = 'Phone number is required';
      rowErrors.push(msg);
      errors.push({ rowNumber, field: 'phone', message: msg, severity: 'error' });
    } else if (!isValidPhone(phone)) {
      const msg = `Invalid phone number: "${phone}" (minimum 10 digits required)`;
      rowErrors.push(msg);
      errors.push({ rowNumber, field: 'phone', message: msg, value: phone, severity: 'error' });
    }

    // 4. Course validation
    const course = store.courses.find(
      (c) =>
        c.id.toLowerCase() === courseIdentifier.toLowerCase() ||
        c.course_code.toLowerCase() === courseIdentifier.toLowerCase() ||
        c.course_name.toLowerCase().includes(courseIdentifier.toLowerCase())
    ) || store.courses[0]; // fallback to default if not matched

    if (!courseIdentifier) {
      const msg = `Course not specified, defaulting to "${course?.course_name}"`;
      rowWarnings.push(msg);
      errors.push({ rowNumber, field: 'course_code', message: msg, severity: 'warning' });
    }

    // 5. Batch validation
    const batch = store.batches.find(
      (b) =>
        b.id.toLowerCase() === batchIdentifier.toLowerCase() ||
        b.batch_code.toLowerCase() === batchIdentifier.toLowerCase() ||
        b.batch_name.toLowerCase().includes(batchIdentifier.toLowerCase())
    ) || store.batches[0];

    // 6. Fee validation
    const feeNum = parseFloat(courseFeeRaw.replace(/[^0-9.]/g, '')) || 40000;
    const paidNum = parseFloat(paidAmountRaw.replace(/[^0-9.]/g, '')) || 0;
    if (paidNum > feeNum) {
      const msg = `Paid amount (₹${paidNum}) cannot exceed total course fee (₹${feeNum})`;
      rowErrors.push(msg);
      errors.push({ rowNumber, field: 'paid_amount', message: msg, severity: 'error' });
    }

    const isValid = rowErrors.length === 0;

    previewRows.push({
      rowNumber,
      data: {
        full_name: fullName,
        email,
        phone,
        course_id: course?.id,
        course_name: course?.course_name,
        batch_id: batch?.id,
        batch_name: batch?.batch_name,
        course_fee: feeNum,
        paid_amount: paidNum,
        address: data.address || data.city || 'Hyderabad, India',
        city: data.city || 'Hyderabad',
      },
      isValid,
      errors: rowErrors,
      warnings: rowWarnings,
    });
  }

  const validCount = previewRows.filter((r) => r.isValid).length;
  return { validCount, previewRows, errors };
}

/**
 * Validates leads import rows
 */
export function validateLeadRows(
  rows: { rowNumber: number; data: Record<string, string> }[]
): {
  validCount: number;
  previewRows: BulkImportPreviewRow[];
  errors: BulkImportRowError[];
} {
  const previewRows: BulkImportPreviewRow[] = [];
  const errors: BulkImportRowError[] = [];
  const seenEmails = new Set<string>();
  const seenPhones = new Set<string>();

  const validStages: LeadStage[] = [
    'New',
    'Contacted',
    'Follow-up',
    'Demo Scheduled',
    'Demo Attended',
    'Interested',
    'Not Interested',
    'Converted',
    'Lost',
  ];

  for (const { rowNumber, data } of rows) {
    const rowErrors: string[] = [];
    const rowWarnings: string[] = [];

    const fullName = data.full_name || data.lead_name || data.name || '';
    const email = (data.email || '').toLowerCase().trim();
    const phone = data.phone || data.mobile || '';
    const courseIdentifier = data.course_code || data.course_name || data.course || '';
    const leadSource = data.lead_source || data.source || 'Website Bulk Import';
    const stageInput = (data.stage || 'New') as LeadStage;
    const experienceRaw = data.experience_years || data.experience || '0';

    // 1. Full name validation
    if (!fullName || fullName.trim().length < 2) {
      const msg = 'Lead full name is required';
      rowErrors.push(msg);
      errors.push({ rowNumber, field: 'full_name', message: msg, severity: 'error' });
    }

    // 2. Email or Phone validation
    if (!email && !phone) {
      const msg = 'Either email or phone number is mandatory for lead capture';
      rowErrors.push(msg);
      errors.push({ rowNumber, field: 'contact', message: msg, severity: 'error' });
    }

    if (email) {
      if (!isValidEmail(email)) {
        const msg = `Invalid email format: "${email}"`;
        rowErrors.push(msg);
        errors.push({ rowNumber, field: 'email', message: msg, value: email, severity: 'error' });
      } else if (seenEmails.has(email)) {
        const msg = `Duplicate email "${email}" in import file`;
        rowWarnings.push(msg);
        errors.push({ rowNumber, field: 'email', message: msg, value: email, severity: 'warning' });
      } else {
        seenEmails.add(email);
        const existingLead = store.leads.find((l) => l.email.toLowerCase() === email);
        if (existingLead) {
          const msg = `Lead with email "${email}" already exists (Code: ${existingLead.lead_code})`;
          rowWarnings.push(msg);
          errors.push({ rowNumber, field: 'email', message: msg, value: email, severity: 'warning' });
        }
      }
    }

    if (phone) {
      if (!isValidPhone(phone)) {
        const msg = `Invalid phone number: "${phone}"`;
        rowErrors.push(msg);
        errors.push({ rowNumber, field: 'phone', message: msg, value: phone, severity: 'error' });
      } else if (seenPhones.has(phone)) {
        const msg = `Duplicate phone "${phone}" in import file`;
        rowWarnings.push(msg);
        errors.push({ rowNumber, field: 'phone', message: msg, value: phone, severity: 'warning' });
      } else {
        seenPhones.add(phone);
      }
    }

    // 3. Stage validation
    const matchedStage = validStages.find(
      (s) => s.toLowerCase() === stageInput.toLowerCase()
    ) || 'New';

    // 4. Course lookup
    const course = store.courses.find(
      (c) =>
        c.id.toLowerCase() === courseIdentifier.toLowerCase() ||
        c.course_code.toLowerCase() === courseIdentifier.toLowerCase() ||
        c.course_name.toLowerCase().includes(courseIdentifier.toLowerCase())
    ) || store.courses[0];

    const expYears = parseInt(experienceRaw, 10) || 0;
    const isValid = rowErrors.length === 0;

    previewRows.push({
      rowNumber,
      data: {
        full_name: fullName,
        email,
        phone,
        interested_course_id: course?.id,
        interested_course_name: course?.course_name,
        lead_source: leadSource,
        stage: matchedStage,
        experience_years: expYears,
        notes: data.notes || `Imported via Bulk CSV at ${new Date().toISOString()}`,
      },
      isValid,
      errors: rowErrors,
      warnings: rowWarnings,
    });
  }

  const validCount = previewRows.filter((r) => r.isValid).length;
  return { validCount, previewRows, errors };
}

/**
 * Validates attendance records import rows
 */
export function validateAttendanceRows(
  rows: { rowNumber: number; data: Record<string, string> }[]
): {
  validCount: number;
  previewRows: BulkImportPreviewRow[];
  errors: BulkImportRowError[];
} {
  const previewRows: BulkImportPreviewRow[] = [];
  const errors: BulkImportRowError[] = [];
  const validStatuses: AttendanceStatus[] = ['Present', 'Absent', 'Late', 'Excused'];

  for (const { rowNumber, data } of rows) {
    const rowErrors: string[] = [];
    const rowWarnings: string[] = [];

    const studentIdentifier = (
      data.student_code ||
      data.student_id ||
      data.email ||
      data.student_name ||
      ''
    ).trim();

    const attendanceDate = data.attendance_date || data.date || new Date().toISOString().slice(0, 10);
    const rawStatus = (data.status || 'Present').trim();
    const durationMinutes = parseInt(data.duration_minutes || data.duration || '60', 10);

    // 1. Student identification
    const student = store.students.find(
      (s) =>
        s.student_code.toLowerCase() === studentIdentifier.toLowerCase() ||
        s.id.toLowerCase() === studentIdentifier.toLowerCase() ||
        s.email.toLowerCase() === studentIdentifier.toLowerCase() ||
        s.full_name.toLowerCase() === studentIdentifier.toLowerCase()
    );

    if (!studentIdentifier) {
      const msg = 'Student identifier (student_code or email) is required';
      rowErrors.push(msg);
      errors.push({ rowNumber, field: 'student_code', message: msg, severity: 'error' });
    } else if (!student) {
      const msg = `Student not found matching: "${studentIdentifier}"`;
      rowErrors.push(msg);
      errors.push({ rowNumber, field: 'student_code', message: msg, value: studentIdentifier, severity: 'error' });
    }

    // 2. Status validation
    const matchedStatus = validStatuses.find(
      (s) => s.toLowerCase() === rawStatus.toLowerCase()
    );

    if (!matchedStatus) {
      const msg = `Invalid status "${rawStatus}". Must be Present, Absent, Late, or Excused`;
      rowErrors.push(msg);
      errors.push({ rowNumber, field: 'status', message: msg, value: rawStatus, severity: 'error' });
    }

    // 3. Date validation
    if (isNaN(new Date(attendanceDate).getTime())) {
      const msg = `Invalid attendance date: "${attendanceDate}"`;
      rowErrors.push(msg);
      errors.push({ rowNumber, field: 'attendance_date', message: msg, value: attendanceDate, severity: 'error' });
    }

    // Session lookup or default session
    const session =
      store.classSessions.find(
        (cs) =>
          cs.id === data.session_id ||
          (student && cs.batch_id === student.batch_id && cs.session_date === attendanceDate)
      ) || store.classSessions[0];

    const isValid = rowErrors.length === 0;

    previewRows.push({
      rowNumber,
      data: {
        student_id: student?.id,
        student_name: student?.full_name,
        student_code: student?.student_code,
        session_id: session?.id,
        batch_id: student?.batch_id || session?.batch_id,
        attendance_date: attendanceDate,
        status: matchedStatus || 'Present',
        duration_minutes: durationMinutes,
        source: 'Manual',
        notes: data.notes || 'Imported via Bulk CSV Attendance Register',
      },
      isValid,
      errors: rowErrors,
      warnings: rowWarnings,
    });
  }

  const validCount = previewRows.filter((r) => r.isValid).length;
  return { validCount, previewRows, errors };
}

// ==========================================
// 3. PREVIEW & EXECUTE SERVICE API
// ==========================================

/**
 * Parses and previews bulk import without committing changes
 */
export function previewBulkImport(
  entityType: BulkImportEntityType,
  csvContent: string
): BulkImportPreviewResult {
  const { headers, rows } = parseCSV(csvContent);

  if (rows.length === 0) {
    return {
      entityType,
      totalRows: 0,
      validRowsCount: 0,
      errorRowsCount: 0,
      warningRowsCount: 0,
      errors: [
        {
          rowNumber: 0,
          field: 'file',
          message: 'The uploaded CSV file is empty or contains only headers.',
          severity: 'error',
        },
      ],
      sampleHeaders: headers,
      previewRows: [],
    };
  }

  let validationResult: {
    validCount: number;
    previewRows: BulkImportPreviewRow[];
    errors: BulkImportRowError[];
  };

  switch (entityType) {
    case 'students':
      validationResult = validateStudentRows(rows);
      break;
    case 'leads':
      validationResult = validateLeadRows(rows);
      break;
    case 'attendance':
      validationResult = validateAttendanceRows(rows);
      break;
    default:
      throw new Error(`Unsupported entity type: ${entityType}`);
  }

  const errorRowsCount = validationResult.previewRows.filter((r) => !r.isValid).length;
  const warningRowsCount = validationResult.errors.filter((e) => e.severity === 'warning').length;

  return {
    entityType,
    totalRows: rows.length,
    validRowsCount: validationResult.validCount,
    errorRowsCount,
    warningRowsCount,
    errors: validationResult.errors,
    sampleHeaders: headers,
    previewRows: validationResult.previewRows,
  };
}

/**
 * Commits valid rows to store, generates audit log, and dispatches realtime event
 */
export async function executeBulkImport(
  entityType: BulkImportEntityType,
  csvContent: string,
  userId: string = 'usr-admin',
  userName: string = 'Operations Head',
  options: { skipInvalidRows?: boolean } = {}
): Promise<BulkImportExecutionResult> {
  const preview = previewBulkImport(entityType, csvContent);

  if (preview.totalRows === 0) {
    return {
      success: false,
      entityType,
      importedCount: 0,
      skippedCount: 0,
      totalProcessed: 0,
      createdIds: [],
      errors: preview.errors,
    };
  }

  if (preview.errorRowsCount > 0 && !options.skipInvalidRows) {
    return {
      success: false,
      entityType,
      importedCount: 0,
      skippedCount: preview.totalRows,
      totalProcessed: preview.totalRows,
      createdIds: [],
      errors: preview.errors,
    };
  }

  const rowsToImport = options.skipInvalidRows
    ? preview.previewRows.filter((r) => r.isValid)
    : preview.previewRows;

  const createdIds: string[] = [];
  const errors: BulkImportRowError[] = [...preview.errors.filter((e) => e.severity === 'error')];

  // Execute based on entity type
  if (entityType === 'students') {
    for (const row of rowsToImport) {
      const d = row.data;
      const count = store.students.length + 1;
      const studentCode = `STU-GEN-${String(count).padStart(3, '0')}`;
      const admissionNumber = generateAdmissionNumber(store.admissions.length + 1);

      // 1. User profile
      const userProfileId = `usr-stu-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      store.users.push({
        id: userProfileId,
        email: d.email,
        full_name: d.full_name,
        role: 'student',
        phone: d.phone,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      // 2. Admission
      const admissionId = `adm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const newAdmission: Admission = {
        id: admissionId,
        admission_number: admissionNumber,
        student_name: d.full_name,
        phone: d.phone,
        email: d.email,
        dob: '2000-01-01',
        gender: 'Male',
        address: d.address,
        city: d.city,
        education: "Bachelor's Degree",
        experience_years: 0,
        current_employment_status: 'Student',
        course_id: d.course_id,
        course_name: d.course_name,
        batch_id: d.batch_id,
        batch_name: d.batch_name,
        training_mode: 'Online',
        admission_date: new Date().toISOString().slice(0, 10),
        course_fee: d.course_fee,
        discount: 0,
        net_payable: d.course_fee,
        payment_plan: 'Full Payment',
        status: 'Active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      store.admissions.unshift(newAdmission);

      // 3. Student Record
      const newStudent: Student = {
        id: `stu-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        user_id: userProfileId,
        admission_id: admissionId,
        student_code: studentCode,
        admission_number: admissionNumber,
        full_name: d.full_name,
        email: d.email,
        phone: d.phone,
        address: d.address,
        course_id: d.course_id,
        course_name: d.course_name,
        batch_id: d.batch_id,
        batch_name: d.batch_name,
        joining_date: new Date().toISOString().slice(0, 10),
        status: 'Active',
        total_fee: d.course_fee,
        paid_amount: d.paid_amount,
        outstanding_amount: Math.max(0, d.course_fee - d.paid_amount),
        attendance_percentage: 100,
        course_progress: 0,
        placement_status: 'Not Started',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      store.students.unshift(newStudent);

      // 4. Fee Account
      const newFeeAccount: StudentFeeAccount = {
        id: `fa-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        student_id: newStudent.id,
        student_name: newStudent.full_name,
        admission_id: admissionId,
        course_id: d.course_id,
        course_name: d.course_name,
        original_fee: d.course_fee,
        discount: 0,
        net_payable: d.course_fee,
        paid_amount: d.paid_amount,
        outstanding_amount: Math.max(0, d.course_fee - d.paid_amount),
        payment_plan: 'Full Payment',
        status: d.paid_amount >= d.course_fee ? 'Paid' : d.paid_amount > 0 ? 'Partially Paid' : 'Unpaid',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      store.feeAccounts.unshift(newFeeAccount);

      createdIds.push(newStudent.id);
    }
  } else if (entityType === 'leads') {
    for (const row of rowsToImport) {
      const d = row.data;
      const count = store.leads.length + 1;
      const leadCode = `LD-2026-${String(count).padStart(3, '0')}`;

      const newLead: Lead = {
        id: `lead-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        lead_code: leadCode,
        full_name: d.full_name,
        phone: d.phone,
        email: d.email,
        interested_course_id: d.interested_course_id,
        interested_course_name: d.interested_course_name,
        current_status: 'Imported Prospect',
        experience_years: d.experience_years,
        training_preference: 'Online',
        lead_source: d.lead_source,
        notes: d.notes,
        stage: d.stage,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      store.leads.unshift(newLead);
      createdIds.push(newLead.id);
    }
  } else if (entityType === 'attendance') {
    for (const row of rowsToImport) {
      const d = row.data;
      const existing = store.attendanceRecords.find(
        (a) => a.student_id === d.student_id && a.attendance_date === d.attendance_date
      );

      if (existing) {
        existing.status = d.status;
        existing.duration_minutes = d.duration_minutes;
        existing.notes = d.notes;
        existing.marked_by = userId;
        existing.marked_by_name = userName;
        existing.marked_at = new Date().toISOString();
        createdIds.push(existing.id);
      } else {
        const newRecord: AttendanceRecord = {
          id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          student_id: d.student_id,
          student_name: d.student_name,
          batch_id: d.batch_id,
          session_id: d.session_id,
          attendance_date: d.attendance_date,
          status: d.status,
          source: 'Manual',
          duration_minutes: d.duration_minutes,
          notes: d.notes,
          marked_by: userId,
          marked_by_name: userName,
          marked_at: new Date().toISOString(),
        };
        store.attendanceRecords.push(newRecord);
        createdIds.push(newRecord.id);
      }

      // Recalculate student attendance percentage
      if (d.student_id) {
        await recalculateStudentAttendancePercentage(d.student_id);
      }
    }
  }

  // Audit Logging
  const audit = await recordAuditLog({
    user_id: userId,
    user_name: userName,
    user_role: 'admin',
    action: 'BULK_DATA_IMPORTED',
    module: entityType === 'students' ? 'ADMISSION' : entityType === 'leads' ? 'CRM' : 'ACADEMICS',
    record_id: `bulk-${entityType}-${Date.now()}`,
    new_value: {
      entityType,
      total_imported: createdIds.length,
      skipped_count: preview.totalRows - createdIds.length,
      created_ids: createdIds.slice(0, 10), // log up to 10 sample ids
    },
  });

  // Real-time broadcast
  publishRealtimeEvent('bulk_import', 'completed', {
    entityType,
    importedCount: createdIds.length,
    userId,
    timestamp: new Date().toISOString(),
  });

  return {
    success: true,
    entityType,
    importedCount: createdIds.length,
    skippedCount: preview.totalRows - createdIds.length,
    totalProcessed: preview.totalRows,
    createdIds,
    auditLogId: audit.id,
    errors,
  };
}

// ==========================================
// 4. SAMPLE TEMPLATE GENERATOR
// ==========================================

export function generateCsvTemplate(entityType: BulkImportEntityType): string {
  switch (entityType) {
    case 'students':
      return [
        'full_name,email,phone,course_code,batch_code,course_fee,paid_amount,address,city',
        'Rohan Verma,rohan.verma@example.com,+91 98765 11223,crs-fico-01,batch-fico-01,40000,20000,"Plot 12, Gachibowli",Hyderabad',
        'Anjali Sharma,anjali.s@example.com,+91 98765 44556,crs-mm-01,batch-mm-01,40000,40000,"Flat 302, Baner",Pune',
      ].join('\n');

    case 'leads':
      return [
        'full_name,email,phone,course_code,lead_source,stage,experience_years,notes',
        'Manish Mehta,manish.m@gmail.com,+91 98888 11111,crs-fico-01,Google Ads,New,3,"Interested in weekend SAP FICO fast-track batch"',
        'Pooja Nair,pooja.nair@yahoo.com,+91 98888 22222,crs-mm-01,Meta Ads,Contacted,1,"Working in procurement, wants S/4HANA upgrade"',
      ].join('\n');

    case 'attendance':
      return [
        'student_code,attendance_date,status,duration_minutes,notes',
        'STU-FICO-001,2026-03-02,Present,120,"Full attendance for Financial Statement Version session"',
        'STU-MM-002,2026-03-02,Late,55,"Joined after 20 minutes due to connectivity"',
      ].join('\n');

    default:
      return '';
  }
}
