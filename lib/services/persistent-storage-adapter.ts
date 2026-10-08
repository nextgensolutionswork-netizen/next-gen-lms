import path from 'path';

/**
 * Interface representing the complete enterprise serializable state
 */
export interface InstituteDataSnapshot {
  version: string;
  timestamp: string;
  settings: any;
  users: any[];
  admissions: any[];
  students: any[];
  leads: any[];
  courses: any[];
  modules: any[];
  lessons: any[];
  lessonProgress: any[];
  batches: any[];
  batchTransferAudits: any[];
  classSessions: any[];
  attendanceRecords: any[];
  assignments: any[];
  submissions: any[];
  quizzes: any[];
  quizQuestions: any[];
  quizAttempts: any[];
  feeAccounts: any[];
  installments: any[];
  payments: any[];
  receipts: any[];
  expenses: any[];
  vendors: any[];
  placementProfiles: any[];
  jobOpenings: any[];
  jobApplications: any[];
  certificates: any[];
  notifications: any[];
  auditLogs: any[];
  sapSystems?: any[];
  sapServers?: any[];
  sapAllocations: any[];
  doubts: any[];
  meetingLogs: any[];
  placementEnrollments?: any[];
  placementEnrollmentStatusHistories?: any[];
  placementEligibilitySettings?: any;
  studentFees?: any[];
  feeApprovalHistories?: any[];
  feeCategories?: any[];
  feeRevisionRequests?: any[];
  studentPayments?: any[];
  studentRefunds?: any[];
  studentFinancialLedgers?: any[];
  financeSettings?: any;
}

const STORAGE_DIR = path.join(process.cwd(), 'data');
const STORAGE_FILE = path.join(STORAGE_DIR, 'institute_store.json');
const BACKUPS_DIR = path.join(STORAGE_DIR, 'backups');

function getFs() {
  if (typeof window === 'undefined') {
    try {
      return eval('require')('fs');
    } catch {
      return null;
    }
  }
  return null;
}

export class PersistentStorageAdapter {
  private isServer: boolean;
  private saveTimeout: NodeJS.Timeout | null = null;

  constructor() {
    this.isServer = typeof window === 'undefined';
  }

  public isAvailable(): boolean {
    return this.isServer;
  }

  /**
   * Loads serialized data store snapshot from disk if present
   */
  public loadState(): Partial<InstituteDataSnapshot> | null {
    if (!this.isServer) return null;

    try {
      const fs = getFs();
      if (fs && fs.existsSync(STORAGE_FILE)) {
        const raw = fs.readFileSync(STORAGE_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        return parsed;
      }
    } catch (err) {
      console.warn('[PersistentStorageAdapter] Could not load state from disk:', err);
    }
    return null;
  }

  /**
   * Atomically writes data store snapshot to disk
   */
  public saveState(state: Partial<InstituteDataSnapshot>): boolean {
    if (!this.isServer) return false;

    try {
      const fs = getFs();
      if (!fs) return false;

      if (!fs.existsSync(STORAGE_DIR)) {
        fs.mkdirSync(STORAGE_DIR, { recursive: true });
      }

      const payload: InstituteDataSnapshot = {
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        settings: state.settings,
        users: state.users || [],
        admissions: state.admissions || [],
        students: state.students || [],
        leads: state.leads || [],
        courses: state.courses || [],
        modules: state.modules || [],
        lessons: state.lessons || [],
        lessonProgress: state.lessonProgress || [],
        batches: state.batches || [],
        batchTransferAudits: state.batchTransferAudits || [],
        classSessions: state.classSessions || [],
        attendanceRecords: state.attendanceRecords || [],
        assignments: state.assignments || [],
        submissions: state.submissions || [],
        quizzes: state.quizzes || [],
        quizQuestions: state.quizQuestions || [],
        quizAttempts: state.quizAttempts || [],
        feeAccounts: state.feeAccounts || [],
        installments: state.installments || [],
        payments: state.payments || [],
        receipts: state.receipts || [],
        expenses: state.expenses || [],
        vendors: state.vendors || [],
        placementProfiles: state.placementProfiles || [],
        jobOpenings: state.jobOpenings || [],
        jobApplications: state.jobApplications || [],
        certificates: state.certificates || [],
        notifications: state.notifications || [],
        auditLogs: state.auditLogs || [],
        sapSystems: (state as any).sapSystems || (state as any).sapServers || [],
        sapServers: (state as any).sapSystems || (state as any).sapServers || [],
        sapAllocations: state.sapAllocations || [],
        doubts: state.doubts || [],
        meetingLogs: state.meetingLogs || [],
        placementEnrollments: (state as any).placementEnrollments || [],
        placementEnrollmentStatusHistories: (state as any).placementEnrollmentStatusHistories || [],
        placementEligibilitySettings: (state as any).placementEligibilitySettings || null,
      };

      const tmpFile = `${STORAGE_FILE}.tmp.${Date.now()}`;
      fs.writeFileSync(tmpFile, JSON.stringify(payload, null, 2), 'utf-8');
      fs.renameSync(tmpFile, STORAGE_FILE);
      return true;
    } catch (err) {
      console.warn('[PersistentStorageAdapter] Failed to save state to disk:', err);
      return false;
    }
  }

  /**
   * Debounced save to prevent excessive disk I/O on high-frequency mutations
   */
  public scheduleSave(state: Partial<InstituteDataSnapshot>, delayMs: number = 200): void {
    if (!this.isServer) return;

    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }

    this.saveTimeout = setTimeout(() => {
      this.saveState(state);
    }, delayMs);
  }

  /**
   * Creates a timestamped backup snapshot in data/backups/
   */
  public createBackup(state: Partial<InstituteDataSnapshot>): {
    success: boolean;
    backupPath?: string;
    filename?: string;
  } {
    if (!this.isServer) return { success: false };

    try {
      const fs = getFs();
      if (!fs) return { success: false };

      if (!fs.existsSync(BACKUPS_DIR)) {
        fs.mkdirSync(BACKUPS_DIR, { recursive: true });
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `snapshot_${timestamp}.json`;
      const backupPath = path.join(BACKUPS_DIR, filename);

      fs.writeFileSync(backupPath, JSON.stringify(state, null, 2), 'utf-8');
      return { success: true, backupPath, filename };
    } catch (err) {
      console.error('[PersistentStorageAdapter] Failed to create backup:', err);
      return { success: false };
    }
  }
}

export const persistentStorage = new PersistentStorageAdapter();
