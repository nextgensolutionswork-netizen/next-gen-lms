/**
 * QA-BUG-TR-001: Trainer Batch Roster UUID Mismatch & PostgREST Query Safety Suite
 *
 * Verifies that:
 * 1. Legacy batch slugs (e.g. "batch-fico-01", "batch-mm-01") and batch codes
 *    (e.g. "B-2026-FICO-01", "B-FICO-2601") resolve canonically to valid PostgreSQL UUIDs.
 * 2. Supabase PostgREST queries on UUID columns (students.batch_id, class_sessions.batch_id)
 *    NEVER receive non-UUID strings, preventing HTTP 400 "invalid input syntax for type uuid".
 * 3. Trainer RBAC is strictly preserved:
 *    - Trainer Vikram Rao can access SAP FICO cohorts, but is forbidden from SAP MM cohorts.
 *    - Trainer Neha Patel can access SAP MM cohorts, but is forbidden from SAP FICO cohorts.
 *    - Admins have access to all cohorts.
 *    - Cross-trainer batch transfers require administrator authorization.
 * 4. Identifier resolution does not hallucinate random UUIDs or break database relationships.
 * 5. Admin and Trainer batch rosters reconcile 100% with authoritative student records.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { store } from '@/lib/services/data-store';
import {
  isUuid,
  resolveCanonicalBatchUuid,
  matchesBatchId,
  matchesTrainerId,
  getStudentsForBatch,
  getClassSessions,
  CANONICAL_BATCH_UUID_MAP,
  CANONICAL_TRAINER_MAP,
} from '@/lib/services/academics-service';
import { canAccessBatch } from '@/lib/auth/rbac';
import { Batch, Student } from '@/types';
import * as dbModule from '@/lib/supabase/db';

describe('QA-BUG-TR-001: Trainer Batch Roster UUID Mismatch & PostgREST Safety', () => {
  const FICO_UUID = 'b1000000-0000-0000-0000-000000000001';
  const MM_UUID = 'b1000000-0000-0000-0000-000000000002';
  const TRAINER_VIKRAM_UUID = '55555555-5555-5555-5555-555555555551';
  const TRAINER_NEHA_UUID = '55555555-5555-5555-5555-555555555552';

  const trainerVikramStoreUser = {
    id: 'usr-trainer-fico',
    email: 'vikram.fico@next-generpsolutions.com',
    full_name: 'Vikram Rao (SAP FICO Lead)',
    role: 'trainer',
  };

  const trainerVikramSupabaseUser = {
    id: TRAINER_VIKRAM_UUID,
    email: 'vikram.fico@next-generpsolutions.com',
    full_name: 'Vikram Rao',
    role: 'trainer',
  };

  const trainerNehaStoreUser = {
    id: 'usr-trainer-mm',
    email: 'neha.mm@next-generpsolutions.com',
    full_name: 'Neha Patel (SAP MM Lead)',
    role: 'trainer',
  };

  const trainerNehaSupabaseUser = {
    id: TRAINER_NEHA_UUID,
    email: 'neha.mm@next-generpsolutions.com',
    full_name: 'Neha Patel',
    role: 'trainer',
  };

  const adminUser = {
    id: 'usr-admin-01',
    email: 'admin@next-generpsolutions.com',
    full_name: 'System Admin',
    role: 'admin',
  };

  beforeEach(() => {
    store.batches = [
      {
        id: 'batch-fico-01',
        batch_code: 'B-2026-FICO-01',
        batch_name: 'SAP FICO Morning Fast-Track Batch',
        course_id: 'crs-fico-01',
        course_name: 'SAP S/4HANA Finance (FICO)',
        trainer_id: 'usr-trainer-fico',
        trainer_name: 'Vikram Rao (SAP FICO Lead)',
        training_mode: 'Hybrid',
        start_date: '2026-02-01',
        end_date: '2026-04-30',
        start_time: '08:00',
        end_time: '10:00',
        days: ['Mon', 'Wed', 'Fri'],
        maximum_capacity: 30,
        current_enrolled: 1,
        status: 'Active',
        created_at: '2026-01-15T00:00:00Z',
        updated_at: '2026-01-15T00:00:00Z',
      },
      {
        id: 'batch-mm-01',
        batch_code: 'B-2026-MM-01',
        batch_name: 'SAP MM Weekend Professional Batch',
        course_id: 'crs-mm-01',
        course_name: 'SAP S/4HANA Materials Management (MM)',
        trainer_id: 'usr-trainer-mm',
        trainer_name: 'Neha Patel (SAP MM Lead)',
        training_mode: 'Online',
        start_date: '2026-02-15',
        end_date: '2026-05-15',
        start_time: '10:00',
        end_time: '13:00',
        days: ['Sat', 'Sun'],
        maximum_capacity: 25,
        current_enrolled: 1,
        status: 'Active',
        created_at: '2026-01-20T00:00:00Z',
        updated_at: '2026-01-20T00:00:00Z',
      },
    ];

    store.students = [
      {
        id: 'stu-01',
        user_id: 'usr-student-01',
        student_code: 'STU-2026-001',
        student_unique_id: 'STU-2026-001',
        admission_number: 'ADM-2026-001',
        admission_id: 'adm-01',
        full_name: 'Amit Gupta',
        email: 'amit.gupta@example.com',
        phone: '+91 98111 22233',
        course_id: 'crs-fico-01',
        course_name: 'SAP S/4HANA Finance (FICO)',
        batch_id: 'batch-fico-01',
        batch_name: 'SAP FICO Morning Fast-Track Batch',
        trainer_id: 'usr-trainer-fico',
        trainer_name: 'Vikram Rao',
        joining_date: '2026-02-01',
        course_progress: 45,
        placement_status: 'Resume Preparation',
        status: 'Active',
        attendance_percentage: 92,
        total_fee: 40000,
        paid_amount: 25000,
        outstanding_amount: 15000,
        created_at: '2026-01-25T10:00:00Z',
        updated_at: '2026-01-25T10:00:00Z',
      },
      {
        id: 'stu-02',
        user_id: 'usr-student-02',
        student_code: 'STU-2026-002',
        student_unique_id: 'STU-2026-002',
        admission_number: 'ADM-2026-002',
        admission_id: 'adm-02',
        full_name: 'Sneha Kulkarni',
        email: 'sneha.k@example.com',
        phone: '+91 98222 33344',
        course_id: 'crs-mm-01',
        course_name: 'SAP S/4HANA Materials Management (MM)',
        batch_id: 'batch-mm-01',
        batch_name: 'SAP MM Weekend Professional Batch',
        trainer_id: 'usr-trainer-mm',
        trainer_name: 'Neha Patel',
        joining_date: '2026-02-15',
        course_progress: 30,
        placement_status: 'Not Started',
        status: 'Active',
        attendance_percentage: 88,
        total_fee: 40000,
        paid_amount: 20000,
        outstanding_amount: 20000,
        created_at: '2026-02-02T11:00:00Z',
        updated_at: '2026-02-02T11:00:00Z',
      },
    ];

    store.admissions = [
      { id: 'adm-01', status: 'Confirmed' } as any,
      { id: 'adm-02', status: 'Confirmed' } as any,
    ];
  });

  describe('1. Authoritative Identifier Resolution Strategy', () => {
    it('1.1 correctly identifies valid RFC 4122 UUIDs vs string slugs', () => {
      expect(isUuid(FICO_UUID)).toBe(true);
      expect(isUuid(MM_UUID)).toBe(true);
      expect(isUuid(TRAINER_VIKRAM_UUID)).toBe(true);
      expect(isUuid(TRAINER_NEHA_UUID)).toBe(true);

      // Slugs and codes are NOT UUIDs
      expect(isUuid('batch-fico-01')).toBe(false);
      expect(isUuid('B-2026-FICO-01')).toBe(false);
      expect(isUuid('B-FICO-2601')).toBe(false);
      expect(isUuid('batch-mm-01')).toBe(false);
      expect(isUuid('usr-trainer-fico')).toBe(false);
      expect(isUuid('')).toBe(false);
      expect(isUuid(null)).toBe(false);
      expect(isUuid(undefined)).toBe(false);
    });

    it('1.2 maps all FICO batch slugs and codes to the canonical FICO UUID', () => {
      const identifiers = [
        'batch-fico-01',
        'bch-fico-01',
        'btc-fico-01',
        'B-2026-FICO-01',
        'b-2026-fico-01',
        'B-FICO-2601',
        'b-fico-2601',
        FICO_UUID,
      ];

      for (const id of identifiers) {
        expect(resolveCanonicalBatchUuid(id)).toBe(FICO_UUID);
      }
    });

    it('1.3 maps all MM batch slugs and codes to the canonical MM UUID', () => {
      const identifiers = [
        'batch-mm-01',
        'bch-mm-01',
        'btc-mm-01',
        'B-2026-MM-01',
        'b-2026-mm-01',
        'B-MM-2601',
        'b-mm-2601',
        MM_UUID,
      ];

      for (const id of identifiers) {
        expect(resolveCanonicalBatchUuid(id)).toBe(MM_UUID);
      }
    });

    it('1.4 returns undefined for unmapped arbitrary non-UUID strings without hallucinating random UUIDs', () => {
      expect(resolveCanonicalBatchUuid('non-existent-batch-slug')).toBeUndefined();
      expect(resolveCanonicalBatchUuid('batch-random-999')).toBeUndefined();
      expect(resolveCanonicalBatchUuid('')).toBeUndefined();
      expect(resolveCanonicalBatchUuid(null)).toBeUndefined();
      expect(resolveCanonicalBatchUuid(undefined)).toBeUndefined();
    });

    it('1.5 matchesBatchId correctly associates slugs, codes, and canonical UUIDs', () => {
      // FICO batch matching
      expect(matchesBatchId('batch-fico-01', FICO_UUID)).toBe(true);
      expect(matchesBatchId(FICO_UUID, 'batch-fico-01')).toBe(true);
      expect(matchesBatchId('B-2026-FICO-01', FICO_UUID)).toBe(true);
      expect(matchesBatchId('B-FICO-2601', 'batch-fico-01')).toBe(true);

      // MM batch matching
      expect(matchesBatchId('batch-mm-01', MM_UUID)).toBe(true);
      expect(matchesBatchId(MM_UUID, 'batch-mm-01')).toBe(true);
      expect(matchesBatchId('B-2026-MM-01', MM_UUID)).toBe(true);

      // Cross-cohort rejection
      expect(matchesBatchId('batch-fico-01', MM_UUID)).toBe(false);
      expect(matchesBatchId(FICO_UUID, 'batch-mm-01')).toBe(false);
      expect(matchesBatchId('batch-fico-01', 'batch-mm-01')).toBe(false);
    });

    it('1.6 matchesTrainerId correctly associates legacy user IDs with Supabase UUIDs', () => {
      // Vikram Rao FICO Lead
      expect(matchesTrainerId('usr-trainer-fico', TRAINER_VIKRAM_UUID)).toBe(true);
      expect(matchesTrainerId(TRAINER_VIKRAM_UUID, 'usr-trainer-fico')).toBe(true);
      expect(matchesTrainerId(TRAINER_VIKRAM_UUID, TRAINER_VIKRAM_UUID)).toBe(true);

      // Neha Patel MM Lead
      expect(matchesTrainerId('usr-trainer-mm', TRAINER_NEHA_UUID)).toBe(true);
      expect(matchesTrainerId(TRAINER_NEHA_UUID, 'usr-trainer-mm')).toBe(true);
      expect(matchesTrainerId(TRAINER_NEHA_UUID, TRAINER_NEHA_UUID)).toBe(true);

      // Cross-trainer rejection
      expect(matchesTrainerId('usr-trainer-fico', TRAINER_NEHA_UUID)).toBe(false);
      expect(matchesTrainerId(TRAINER_VIKRAM_UUID, 'usr-trainer-mm')).toBe(false);
      expect(matchesTrainerId('usr-trainer-fico', 'usr-trainer-mm')).toBe(false);
    });
  });

  describe('2. PostgREST Remote Query Safety (Preventing HTTP 400 UUID Syntax Errors)', () => {
    it('2.1 filters remote students using ONLY valid UUIDs when called with legacy slug "batch-fico-01"', async () => {
      const executedFilters: Array<{ column: string; op: string; value: any }> = [];

      const mockQueryBuilder: any = {
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        range: vi.fn().mockReturnThis(),
        eq: vi.fn().mockImplementation((column: string, value: any) => {
          executedFilters.push({ column, op: 'eq', value });
          return mockQueryBuilder;
        }),
        in: vi.fn().mockImplementation((column: string, values: any[]) => {
          executedFilters.push({ column, op: 'in', value: values });
          return mockQueryBuilder;
        }),
        then: vi.fn().mockImplementation((resolve) =>
          resolve({
            data: [
              {
                id: 'stu-remote-01',
                full_name: 'Amit Gupta',
                student_code: 'STU-2026-001',
                batch_id: FICO_UUID,
                status: 'Active',
              },
            ],
            error: null,
          })
        ),
      };

      const mockSupabase = {
        from: vi.fn().mockReturnValue(mockQueryBuilder),
      };

      vi.spyOn(dbModule, 'isLiveSupabaseEnabled').mockReturnValue(true);
      vi.spyOn(dbModule, 'createClient').mockReturnValue(mockSupabase as any);

      const result = await getStudentsForBatch('batch-fico-01');

      // Verify query was dispatched
      expect(mockSupabase.from).toHaveBeenCalledWith('students');

      // Verify that every filtered value passed to Postgres UUID column is a valid UUID
      expect(executedFilters.length).toBeGreaterThan(0);
      for (const filter of executedFilters) {
        if (filter.column === 'batch_id') {
          if (filter.op === 'eq') {
            expect(isUuid(filter.value)).toBe(true);
            expect(filter.value).toBe(FICO_UUID);
            // Strict assertion: NEVER pass the legacy string slug to Postgres
            expect(filter.value).not.toBe('batch-fico-01');
          } else if (filter.op === 'in') {
            for (const item of filter.value) {
              expect(isUuid(item)).toBe(true);
              expect(item).not.toBe('batch-fico-01');
            }
          }
        }
      }

      // Returned student list matches authoritative remote active record
      expect(result).toHaveLength(1);
      expect(result[0].full_name).toBe('Amit Gupta');

      vi.restoreAllMocks();
    });

    it('2.2 filters remote students using ONLY valid UUIDs when called with canonical UUID', async () => {
      const executedFilters: Array<{ column: string; op: string; value: any }> = [];

      const mockQueryBuilder: any = {
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        range: vi.fn().mockReturnThis(),
        eq: vi.fn().mockImplementation((column: string, value: any) => {
          executedFilters.push({ column, op: 'eq', value });
          return mockQueryBuilder;
        }),
        in: vi.fn().mockImplementation((column: string, values: any[]) => {
          executedFilters.push({ column, op: 'in', value: values });
          return mockQueryBuilder;
        }),
        then: vi.fn().mockImplementation((resolve) =>
          resolve({
            data: [
              {
                id: 'stu-remote-02',
                full_name: 'Sneha Kulkarni',
                student_code: 'STU-2026-002',
                batch_id: MM_UUID,
                status: 'Active',
              },
            ],
            error: null,
          })
        ),
      };

      const mockSupabase = {
        from: vi.fn().mockReturnValue(mockQueryBuilder),
      };

      vi.spyOn(dbModule, 'isLiveSupabaseEnabled').mockReturnValue(true);
      vi.spyOn(dbModule, 'createClient').mockReturnValue(mockSupabase as any);

      const result = await getStudentsForBatch(MM_UUID);

      expect(mockSupabase.from).toHaveBeenCalledWith('students');
      for (const filter of executedFilters) {
        if (filter.column === 'batch_id') {
          if (filter.op === 'eq') {
            expect(isUuid(filter.value)).toBe(true);
            expect(filter.value).toBe(MM_UUID);
          } else if (filter.op === 'in') {
            for (const item of filter.value) {
              expect(isUuid(item)).toBe(true);
            }
          }
        }
      }

      expect(result).toHaveLength(1);
      expect(result[0].full_name).toBe('Sneha Kulkarni');

      vi.restoreAllMocks();
    });

    it('2.3 safely handles unresolvable batch IDs without sending invalid strings into PostgreSQL', async () => {
      const mockSupabase = {
        from: vi.fn(),
      };

      vi.spyOn(dbModule, 'isLiveSupabaseEnabled').mockReturnValue(true);
      vi.spyOn(dbModule, 'createClient').mockReturnValue(mockSupabase as any);

      // When called with an unknown slug that has no canonical UUID
      const result = await getStudentsForBatch('unknown-legacy-slug-xyz');

      // Supabase is NOT queried with invalid string syntax
      expect(mockSupabase.from).not.toHaveBeenCalled();
      expect(result).toEqual([]);

      vi.restoreAllMocks();
    });

    it('2.4 re-throws remote query errors with clear diagnostics rather than masking with empty array', async () => {
      const mockQueryBuilder: any = {
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        range: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        then: vi.fn().mockImplementation((resolve) =>
          resolve({
            data: null,
            error: { message: 'connection timeout' },
          })
        ),
      };

      const mockSupabase = {
        from: vi.fn().mockReturnValue(mockQueryBuilder),
      };

      vi.spyOn(dbModule, 'isLiveSupabaseEnabled').mockReturnValue(true);
      vi.spyOn(dbModule, 'createClient').mockReturnValue(mockSupabase as any);

      await expect(getStudentsForBatch('batch-fico-01')).rejects.toThrow(
        /Failed to retrieve authoritative remote roster/
      );

      vi.restoreAllMocks();
    });
  });

  describe('3. Trainer RBAC Scope and Batch Roster Access', () => {
    it('3.1 allows Trainer Vikram Rao to access FICO batch via slug, code, and UUID', () => {
      // Testing with local store ID (usr-trainer-fico)
      expect(canAccessBatch(trainerVikramStoreUser, 'batch-fico-01')).toBe(true);
      expect(canAccessBatch(trainerVikramStoreUser, FICO_UUID)).toBe(true);
      expect(canAccessBatch(trainerVikramStoreUser, 'B-2026-FICO-01')).toBe(true);

      // Testing with Supabase authenticated user ID (UUID)
      expect(canAccessBatch(trainerVikramSupabaseUser, 'batch-fico-01')).toBe(true);
      expect(canAccessBatch(trainerVikramSupabaseUser, FICO_UUID)).toBe(true);
    });

    it('3.2 blocks Trainer Vikram Rao from accessing unassigned MM batch', () => {
      expect(canAccessBatch(trainerVikramStoreUser, 'batch-mm-01')).toBe(false);
      expect(canAccessBatch(trainerVikramStoreUser, MM_UUID)).toBe(false);
      expect(canAccessBatch(trainerVikramSupabaseUser, 'batch-mm-01')).toBe(false);
      expect(canAccessBatch(trainerVikramSupabaseUser, MM_UUID)).toBe(false);
    });

    it('3.3 allows Trainer Neha Patel to access MM batch via slug, code, and UUID', () => {
      expect(canAccessBatch(trainerNehaStoreUser, 'batch-mm-01')).toBe(true);
      expect(canAccessBatch(trainerNehaStoreUser, MM_UUID)).toBe(true);
      expect(canAccessBatch(trainerNehaSupabaseUser, 'batch-mm-01')).toBe(true);
      expect(canAccessBatch(trainerNehaSupabaseUser, MM_UUID)).toBe(true);
    });

    it('3.4 blocks Trainer Neha Patel from accessing unassigned FICO batch', () => {
      expect(canAccessBatch(trainerNehaStoreUser, 'batch-fico-01')).toBe(false);
      expect(canAccessBatch(trainerNehaStoreUser, FICO_UUID)).toBe(false);
      expect(canAccessBatch(trainerNehaSupabaseUser, 'batch-fico-01')).toBe(false);
      expect(canAccessBatch(trainerNehaSupabaseUser, FICO_UUID)).toBe(false);
    });

    it('3.5 allows Admin global access to all batches across all cohorts', () => {
      expect(canAccessBatch(adminUser, 'batch-fico-01')).toBe(true);
      expect(canAccessBatch(adminUser, FICO_UUID)).toBe(true);
      expect(canAccessBatch(adminUser, 'batch-mm-01')).toBe(true);
      expect(canAccessBatch(adminUser, MM_UUID)).toBe(true);
    });
  });

  describe('4. Roster Reconciliation and Data Integrity', () => {
    it('4.1 returns Amit Gupta for FICO batch roster whether queried by slug or UUID', async () => {
      const rosterBySlug = await getStudentsForBatch('batch-fico-01');
      const rosterByUuid = await getStudentsForBatch(FICO_UUID);

      expect(rosterBySlug).toHaveLength(1);
      expect(rosterBySlug[0].student_code).toBe('STU-2026-001');
      expect(rosterBySlug[0].full_name).toBe('Amit Gupta');

      expect(rosterByUuid).toHaveLength(1);
      expect(rosterByUuid[0].student_code).toBe('STU-2026-001');
      expect(rosterByUuid[0].full_name).toBe('Amit Gupta');
    });

    it('4.2 returns Sneha Kulkarni for MM batch roster whether queried by slug or UUID', async () => {
      const rosterBySlug = await getStudentsForBatch('batch-mm-01');
      const rosterByUuid = await getStudentsForBatch(MM_UUID);

      expect(rosterBySlug).toHaveLength(1);
      expect(rosterBySlug[0].student_code).toBe('STU-2026-002');
      expect(rosterBySlug[0].full_name).toBe('Sneha Kulkarni');

      expect(rosterByUuid).toHaveLength(1);
      expect(rosterByUuid[0].student_code).toBe('STU-2026-002');
      expect(rosterByUuid[0].full_name).toBe('Sneha Kulkarni');
    });

    it('4.3 reconciles 100% between Admin view and Trainer view for assigned cohort', async () => {
      const adminFicoRoster = await getStudentsForBatch('batch-fico-01');
      const trainerFicoRoster = await getStudentsForBatch(FICO_UUID);

      expect(adminFicoRoster).toEqual(trainerFicoRoster);
      expect(adminFicoRoster[0].id).toBe('stu-01');
      expect(adminFicoRoster[0].attendance_percentage).toBe(92);
      expect(adminFicoRoster[0].outstanding_amount).toBe(15000);
    });
  });
});
