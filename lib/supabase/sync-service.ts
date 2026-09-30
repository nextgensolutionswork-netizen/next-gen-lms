import { getDb, isLiveSupabaseEnabled } from './db';
import { store } from '@/lib/services/data-store';
import { persistentStorage } from '@/lib/services/persistent-storage-adapter';

export interface DatabaseHealthReport {
  status: 'connected' | 'simulated_local' | 'error';
  isLive: boolean;
  latencyMs: number;
  tables: Record<string, number>;
  totalRecords: number;
  lastSyncTimestamp: string;
  error?: string;
}

export interface SyncResult {
  success: boolean;
  direction: 'push' | 'pull' | 'bidirectional';
  syncedTables: string[];
  totalSynced: number;
  errors: string[];
  timestamp: string;
}

/**
 * Checks connectivity, latency, and table statistics for Postgres
 */
export async function checkDatabaseHealth(): Promise<DatabaseHealthReport> {
  const isLive = isLiveSupabaseEnabled();

  if (!isLive) {
    // Local / development mode statistics
    const localTables: Record<string, number> = {
      users: store.users.length,
      admissions: store.admissions.length,
      students: store.students.length,
      courses: store.courses.length,
      batches: store.batches.length,
      class_sessions: store.classSessions.length,
      attendance_records: store.attendanceRecords.length,
      fee_accounts: store.feeAccounts.length,
      payments: store.payments.length,
      receipts: store.receipts.length,
      leads: store.leads.length,
      doubts: store.doubts.length,
      audit_logs: store.auditLogs.length,
    };

    const totalRecords = Object.values(localTables).reduce((a, b) => a + b, 0);

    return {
      status: 'simulated_local',
      isLive: false,
      latencyMs: 1, // instantaneous memory/file read
      tables: localTables,
      totalRecords,
      lastSyncTimestamp: new Date().toISOString(),
    };
  }

  const startMs = Date.now();
  try {
    const db = getDb();
    // Test query on courses table
    const { count, error } = await db.from('courses').select('*', { count: 'exact', head: true });
    const latencyMs = Date.now() - startMs;

    if (error) {
      return {
        status: 'error',
        isLive: true,
        latencyMs,
        tables: {},
        totalRecords: 0,
        lastSyncTimestamp: new Date().toISOString(),
        error: error.message,
      };
    }

    // Query counts from key tables
    const tableNames = [
      'admissions',
      'students',
      'courses',
      'batches',
      'payments',
      'leads',
      'attendance_records',
      'student_doubts',
    ];

    const tables: Record<string, number> = {};
    let totalRecords = 0;

    for (const t of tableNames) {
      try {
        const { count: c } = await db.from(t).select('*', { count: 'exact', head: true });
        tables[t] = c || 0;
        totalRecords += c || 0;
      } catch {
        tables[t] = 0;
      }
    }

    return {
      status: 'connected',
      isLive: true,
      latencyMs,
      tables,
      totalRecords,
      lastSyncTimestamp: new Date().toISOString(),
    };
  } catch (err: any) {
    return {
      status: 'error',
      isLive: true,
      latencyMs: Date.now() - startMs,
      tables: {},
      totalRecords: 0,
      lastSyncTimestamp: new Date().toISOString(),
      error: err.message || 'Failed to ping Postgres',
    };
  }
}

/**
 * Pushes all in-memory / local state into Postgres tables
 */
export async function syncLocalToPostgres(): Promise<SyncResult> {
  const isLive = isLiveSupabaseEnabled();
  const errors: string[] = [];
  const syncedTables: string[] = [];
  let totalSynced = 0;

  if (!isLive) {
    // If running without remote Supabase, persist directly to local disk
    persistentStorage.saveState(store);
    return {
      success: true,
      direction: 'push',
      syncedTables: ['local_persistent_storage'],
      totalSynced: 1,
      errors: [],
      timestamp: new Date().toISOString(),
    };
  }

  const db = getDb();

  // 1. Courses
  try {
    for (const c of store.courses) {
      await db.from('courses').upsert({
        id: c.id,
        course_name: c.course_name,
        course_code: c.course_code,
        description: c.description,
        duration_weeks: c.duration_weeks,
        category: c.category,
        price: c.price,
        status: c.status,
      });
      totalSynced++;
    }
    syncedTables.push('courses');
  } catch (err: any) {
    errors.push(`courses: ${err.message}`);
  }

  // 2. Batches
  try {
    for (const b of store.batches) {
      await db.from('batches').upsert({
        id: b.id,
        batch_code: b.batch_code,
        batch_name: b.batch_name,
        course_id: b.course_id,
        trainer_id: b.trainer_id,
        training_mode: b.training_mode,
        start_date: b.start_date,
        end_date: b.end_date,
        start_time: b.start_time,
        end_time: b.end_time,
        days: b.days,
        maximum_capacity: b.maximum_capacity,
        current_enrolled: b.current_enrolled,
        status: b.status,
      });
      totalSynced++;
    }
    syncedTables.push('batches');
  } catch (err: any) {
    errors.push(`batches: ${err.message}`);
  }

  // 3. Students
  try {
    for (const s of store.students) {
      await db.from('students').upsert({
        id: s.id,
        user_id: s.user_id,
        admission_id: s.admission_id,
        student_code: s.student_code,
        admission_number: s.admission_number,
        full_name: s.full_name,
        email: s.email,
        phone: s.phone,
        address: s.address,
        course_id: s.course_id,
        batch_id: s.batch_id,
        trainer_id: s.trainer_id,
        joining_date: s.joining_date,
        status: s.status,
        total_fee: s.total_fee,
        paid_amount: s.paid_amount,
        outstanding_amount: s.outstanding_amount,
        attendance_percentage: s.attendance_percentage,
        course_progress: s.course_progress,
        placement_status: s.placement_status,
      });
      totalSynced++;
    }
    syncedTables.push('students');
  } catch (err: any) {
    errors.push(`students: ${err.message}`);
  }

  // 4. Leads
  try {
    for (const l of store.leads) {
      await db.from('leads').upsert({
        id: l.id,
        lead_code: l.lead_code,
        full_name: l.full_name,
        phone: l.phone,
        email: l.email,
        interested_course_id: l.interested_course_id,
        current_status: l.current_status,
        experience_years: l.experience_years,
        training_preference: l.training_preference,
        lead_source: l.lead_source,
        campaign: l.campaign,
        counsellor_id: l.counsellor_id,
        stage: l.stage,
        notes: l.notes,
      });
      totalSynced++;
    }
    syncedTables.push('leads');
  } catch (err: any) {
    errors.push(`leads: ${err.message}`);
  }

  // 5. Attendance Records
  try {
    for (const a of store.attendanceRecords) {
      await db.from('attendance_records').upsert({
        id: a.id,
        student_id: a.student_id,
        session_id: a.session_id,
        batch_id: a.batch_id,
        attendance_date: a.attendance_date,
        status: a.status,
        notes: a.notes,
        marked_by: a.marked_by,
        marked_at: a.marked_at,
      });
      totalSynced++;
    }
    syncedTables.push('attendance_records');
  } catch (err: any) {
    errors.push(`attendance_records: ${err.message}`);
  }

  return {
    success: errors.length === 0,
    direction: 'push',
    syncedTables,
    totalSynced,
    errors,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Pulls rows from Postgres tables into local store
 */
export async function syncPostgresToLocal(): Promise<SyncResult> {
  const isLive = isLiveSupabaseEnabled();
  if (!isLive) {
    // If no remote DB, load from local disk
    const snapshot = persistentStorage.loadState();
    if (snapshot) {
      store.hydrateFromDisk();
    }
    return {
      success: true,
      direction: 'pull',
      syncedTables: ['local_persistent_storage'],
      totalSynced: 1,
      errors: [],
      timestamp: new Date().toISOString(),
    };
  }

  const db = getDb();
  const syncedTables: string[] = [];
  const errors: string[] = [];
  let totalSynced = 0;

  try {
    // 1. Pull Students
    const { data: students, error: sErr } = await db.from('students').select('*');
    if (!sErr && students) {
      for (const s of students) {
        const idx = store.students.findIndex((item) => item.id === s.id);
        if (idx >= 0) {
          store.students[idx] = { ...store.students[idx], ...s };
        } else {
          store.students.push(s);
        }
        totalSynced++;
      }
      syncedTables.push('students');
    }
  } catch (err: any) {
    errors.push(`students pull: ${err.message}`);
  }

  try {
    // 2. Pull Leads
    const { data: leads, error: lErr } = await db.from('leads').select('*');
    if (!lErr && leads) {
      for (const l of leads) {
        const idx = store.leads.findIndex((item) => item.id === l.id);
        if (idx >= 0) {
          store.leads[idx] = { ...store.leads[idx], ...l };
        } else {
          store.leads.push(l);
        }
        totalSynced++;
      }
      syncedTables.push('leads');
    }
  } catch (err: any) {
    errors.push(`leads pull: ${err.message}`);
  }

  // Persist updated store to local disk
  store.persist();

  return {
    success: errors.length === 0,
    direction: 'pull',
    syncedTables,
    totalSynced,
    errors,
    timestamp: new Date().toISOString(),
  };
}
