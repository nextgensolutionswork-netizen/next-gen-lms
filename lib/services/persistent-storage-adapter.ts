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
  onboardingCases?: any[];
  onboardingAuditLogs?: any[];
}

function getPathModule(): any {
  if (typeof window === 'undefined') {
    try {
      return eval('require')('path');
    } catch {
      return null;
    }
  }
  return null;
}

function getStoragePaths() {
  if (
    typeof window === 'undefined' &&
    typeof process !== 'undefined' &&
    typeof process.cwd === 'function'
  ) {
    try {
      const p = getPathModule();
      if (p) {
        const storageDir = (process.env.VITEST || process.env.NEXT_PUBLIC_APP_ENV === 'staging') && process.env.LMS_TEST_STORAGE_DIR
          ? process.env.LMS_TEST_STORAGE_DIR
          : p.join(process.cwd(), 'data');
        return {
          STORAGE_DIR: storageDir,
          STORAGE_FILE: p.join(storageDir, 'institute_store.json'),
          BACKUPS_DIR: p.join(storageDir, 'backups'),
        };
      }
    } catch {
      // fallback
    }
  }
  return {
    STORAGE_DIR: '',
    STORAGE_FILE: '',
    BACKUPS_DIR: '',
  };
}

function getFs(): any {
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
    if (this.isServer) return true;
    return typeof localStorage !== 'undefined';
  }

  private buildSnapshotPayload(state: Partial<InstituteDataSnapshot>): InstituteDataSnapshot {
    return {
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
      onboardingCases: (state as any).onboardingCases || [],
      onboardingAuditLogs: (state as any).onboardingAuditLogs || [],
      feeCategories: (state as any).feeCategories || [],
      studentFees: (state as any).studentFees || [],
      feeApprovalHistories: (state as any).feeApprovalHistories || [],
      feeRevisionRequests: (state as any).feeRevisionRequests || [],
      studentPayments: (state as any).studentPayments || [],
      studentRefunds: (state as any).studentRefunds || [],
      studentFinancialLedgers: (state as any).studentFinancialLedgers || [],
      financeSettings: (state as any).financeSettings || null,
    };
  }

  /**
   * Loads serialized data store snapshot from disk (server) or localStorage (browser)
   */
  public loadState(): Partial<InstituteDataSnapshot> | null {
    if (typeof window !== 'undefined') {
      try {
        if (typeof localStorage !== 'undefined') {
          const raw = localStorage.getItem('next_gen_lms_store_snapshot_v1');
          if (raw) {
            const parsed = JSON.parse(raw);
            return parsed;
          }
        }
      } catch (err) {
        console.warn('[PersistentStorageAdapter] Could not load state from localStorage:', err);
      }
      return null;
    }

    try {
      const { STORAGE_FILE } = getStoragePaths();
      if (!STORAGE_FILE) return null;

      const fs = getFs();
      if (fs && fs.existsSync(STORAGE_FILE)) {
        const raw = fs.readFileSync(STORAGE_FILE, 'utf-8');
        if (!raw || !raw.trim()) return null;
        const parsed = JSON.parse(raw);
        return parsed;
      }
    } catch (err) {
      console.warn('[PersistentStorageAdapter] Could not load state from disk:', err);
    }
    return null;
  }

  /**
   * Writes data store snapshot to disk (server) or localStorage (browser)
   */
  public saveState(state: Partial<InstituteDataSnapshot>): boolean {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
      this.saveTimeout = null;
    }

    const payload = this.buildSnapshotPayload(state);

    if (typeof window !== 'undefined') {
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('next_gen_lms_store_snapshot_v1', JSON.stringify(payload));
          return true;
        }
      } catch (err) {
        console.warn('[PersistentStorageAdapter] Could not save state to localStorage:', err);
      }
      return false;
    }

    try {
      const { STORAGE_DIR, STORAGE_FILE } = getStoragePaths();
      if (!STORAGE_DIR || !STORAGE_FILE) return false;

      const fs = getFs();
      if (!fs) return false;

      if (!fs.existsSync(STORAGE_DIR)) {
        fs.mkdirSync(STORAGE_DIR, { recursive: true });
      }

      const tmpFile = `${STORAGE_FILE}.tmp.${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      fs.writeFileSync(tmpFile, JSON.stringify(payload, null, 2), 'utf-8');

      let saved = false;
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          fs.renameSync(tmpFile, STORAGE_FILE);
          saved = true;
          break;
        } catch (renameErr: any) {
          if (renameErr.code === 'EPERM' || renameErr.code === 'EBUSY') {
            try {
              fs.copyFileSync(tmpFile, STORAGE_FILE);
              try {
                fs.unlinkSync(tmpFile);
              } catch {}
              saved = true;
              break;
            } catch (copyErr: any) {
              const startWait = Date.now();
              while (Date.now() - startWait < 30) {}
            }
          } else {
            throw renameErr;
          }
        }
      }

      if (!saved) {
        fs.writeFileSync(STORAGE_FILE, JSON.stringify(payload, null, 2), 'utf-8');
        try {
          fs.unlinkSync(tmpFile);
        } catch {}
      }

      return true;
    } catch (err) {
      console.warn('[PersistentStorageAdapter] Failed to save state to disk:', err);
      return false;
    }
  }

  /**
   * Debounced save to prevent excessive disk/storage I/O on high-frequency mutations
   */
  public scheduleSave(state: Partial<InstituteDataSnapshot>, delayMs: number = 200): void {
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
      const { BACKUPS_DIR } = getStoragePaths();
      const p = getPathModule();
      if (!BACKUPS_DIR || !p) return { success: false };

      const fs = getFs();
      if (!fs) return { success: false };

      if (!fs.existsSync(BACKUPS_DIR)) {
        fs.mkdirSync(BACKUPS_DIR, { recursive: true });
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `snapshot_${timestamp}.json`;
      const backupPath = p.join(BACKUPS_DIR, filename);

      fs.writeFileSync(backupPath, JSON.stringify(state, null, 2), 'utf-8');
      return { success: true, backupPath, filename };
    } catch (err) {
      console.error('[PersistentStorageAdapter] Failed to create backup:', err);
      return { success: false };
    }
  }
}

export const persistentStorage = new PersistentStorageAdapter();

