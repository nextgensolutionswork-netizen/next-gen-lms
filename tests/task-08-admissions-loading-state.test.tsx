import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import type { Admission } from '@/types';
import {
  classifyAdmissionsError,
  deriveAdmissionsViewState,
  filterAdmissions,
} from '@/lib/services/admissions-loading-state';
import { Skeleton, TableSkeleton } from '@/components/ui/skeleton';

const SAMPLE_ADMISSIONS = [
  {
    id: 'adm-1',
    admission_number: 'ADM-2026-0001',
    student_id: 'stu-1',
    student_unique_id: 'LMS-2026-0001',
    student_name: 'Aarav Sharma',
    email: 'aarav@example.com',
    phone: '9876543210',
    course_id: 'crs-fico',
    course_name: 'SAP S/4HANA FICO',
    training_mode: 'Online',
    course_fee: 45000,
    discount: 0,
    status: 'Confirmed',
    counsellor_id: 'usr-c1',
    counsellor_name: 'Priya Nair',
    admission_date: '2026-11-01',
    created_at: '2026-11-01T10:00:00.000Z',
    updated_at: '2026-11-01T10:00:00.000Z',
  },
  {
    id: 'adm-2',
    admission_number: 'ADM-2026-0002',
    student_id: 'stu-2',
    student_unique_id: 'LMS-2026-0002',
    student_name: 'Sneha Reddy',
    email: 'sneha@example.com',
    phone: '9876500002',
    course_id: 'crs-mm',
    course_name: 'SAP S/4HANA MM',
    training_mode: 'Offline',
    course_fee: 42000,
    discount: 2000,
    status: 'Active',
    counsellor_id: 'usr-c2',
    counsellor_name: 'Rahul Verma',
    admission_date: '2026-11-02',
    created_at: '2026-11-02T10:00:00.000Z',
    updated_at: '2026-11-02T10:00:00.000Z',
  },
] as unknown as Admission[];

describe('TASK-08: Admissions Loading State, Skeleton UI & Authoritative Empty State', () => {
  it('stays in initial_loading during auth hydration and before first authoritative response (never flashes empty state)', () => {
    expect(
      deriveAdmissionsViewState({
        isAuthLoading: true,
        isAuthenticated: false,
        canAccess: false,
        hasLoadedOnce: false,
        isFetching: false,
        error: null,
        totalAuthorizedCount: 0,
        filteredCount: 0,
        hasActiveFilters: false,
      })
    ).toBe('initial_loading');

    expect(
      deriveAdmissionsViewState({
        isAuthLoading: false,
        isAuthenticated: true,
        canAccess: true,
        hasLoadedOnce: false,
        isFetching: true,
        error: null,
        totalAuthorizedCount: 0,
        filteredCount: 0,
        hasActiveFilters: false,
      })
    ).toBe('initial_loading');
  });

  it('distinguishes loaded, confirmed_empty, filtered_empty, refreshing, error, unauthorized, and session_expired', () => {
    const base = {
      isAuthLoading: false,
      isAuthenticated: true,
      canAccess: true,
      hasLoadedOnce: true,
      isFetching: false,
      error: null,
      totalAuthorizedCount: 2,
      filteredCount: 2,
      hasActiveFilters: false,
    };

    expect(deriveAdmissionsViewState(base)).toBe('loaded');
    expect(deriveAdmissionsViewState({ ...base, isFetching: true })).toBe('refreshing');
    expect(deriveAdmissionsViewState({ ...base, filteredCount: 0, hasActiveFilters: true })).toBe('filtered_empty');
    expect(deriveAdmissionsViewState({ ...base, totalAuthorizedCount: 0, filteredCount: 0 })).toBe('confirmed_empty');
    expect(
      deriveAdmissionsViewState({
        ...base,
        hasLoadedOnce: false,
        totalAuthorizedCount: 0,
        filteredCount: 0,
        error: { kind: 'recoverable', message: 'Failed' },
      })
    ).toBe('error');
    expect(deriveAdmissionsViewState({ ...base, canAccess: false })).toBe('unauthorized');
    expect(deriveAdmissionsViewState({ ...base, isAuthenticated: false })).toBe('session_expired');
  });

  it('classifies 401, 403, and database/network failures without leaking internal SQL details', () => {
    expect(classifyAdmissionsError({ status: 401, message: 'Unauthorized' }).kind).toBe('session_expired');
    expect(classifyAdmissionsError({ status: 403, message: 'Forbidden' }).kind).toBe('unauthorized');
    const dbErr = classifyAdmissionsError(new Error('SELECT * FROM admissions relation timeout'));
    expect(dbErr.kind).toBe('recoverable');
    expect(dbErr.message).not.toContain('SELECT');
    expect(dbErr.message).not.toContain('relation');
  });

  it('filters by student name, admission number, LMS registration number, phone, and status', () => {
    expect(filterAdmissions(SAMPLE_ADMISSIONS, { search: 'ADM-2026-0001', statusFilter: 'All' })).toHaveLength(1);
    expect(filterAdmissions(SAMPLE_ADMISSIONS, { search: 'LMS-2026-0002', statusFilter: 'All' })).toHaveLength(1);
    expect(filterAdmissions(SAMPLE_ADMISSIONS, { search: '9876543210', statusFilter: 'All' })).toHaveLength(1);
    expect(filterAdmissions(SAMPLE_ADMISSIONS, { search: '', statusFilter: 'Active' })).toHaveLength(1);
    expect(filterAdmissions(SAMPLE_ADMISSIONS, { search: 'nonexistent', statusFilter: 'All' })).toHaveLength(0);
    expect(filterAdmissions(SAMPLE_ADMISSIONS, { search: '', statusFilter: 'All' })).toHaveLength(2);
  });

  it('renders accessible reduced-motion Skeleton and TableSkeleton placeholders without fake records', () => {
    const html = renderToStaticMarkup(
      <table>
        <tbody>
          <TableSkeleton columns={8} rows={6} />
        </tbody>
      </table>
    );
    expect(html).toContain('motion-reduce:animate-none');
    expect(html).not.toContain('No Admissions Found');
    expect(html).not.toContain('ADM-');

    const badgeSkel = renderToStaticMarkup(<Skeleton className="h-5 w-32" />);
    expect(badgeSkel).toContain('motion-reduce:animate-none');
  });

  it('guards app/(dashboard)/admissions/page.tsx against premature empty state, stale responses, and unauthorized creation', () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), 'app/(dashboard)/admissions/page.tsx'),
      'utf8'
    );
    expect(src).toContain('deriveAdmissionsViewState');
    expect(src).toContain('requestGenerationRef');
    expect(src).toContain('No admissions yet');
    expect(src).toContain('No matching admissions');
    expect(src).toContain('Clear Filters');
    expect(src).toContain('Unable to load admissions');
    expect(src).toContain('Showing previously loaded records — refresh failed');
    expect(src).toContain('aria-busy={');
  });
});
