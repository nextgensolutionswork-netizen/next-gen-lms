import type { Admission } from '@/types';

export type AdmissionsViewState =
  | 'initial_loading'
  | 'session_expired'
  | 'unauthorized'
  | 'error'
  | 'refreshing'
  | 'loaded'
  | 'confirmed_empty'
  | 'filtered_empty';

export interface AdmissionsErrorInfo {
  kind: 'session_expired' | 'unauthorized' | 'recoverable';
  message: string;
}

/**
 * Classifies an admission read failure without exposing internal SQL or stack details.
 */
export function classifyAdmissionsError(error: unknown): AdmissionsErrorInfo {
  const status =
    typeof error === 'object' && error !== null && 'status' in error
      ? Number((error as { status?: unknown }).status)
      : undefined;
  const rawMessage = error instanceof Error ? error.message : '';
  const lower = rawMessage.toLowerCase();

  if (status === 401 || lower.includes('unauthorized') || lower.includes('session expired') || lower.includes('not authenticated')) {
    return {
      kind: 'session_expired',
      message: 'Your session has expired. Please sign in again to view admissions.',
    };
  }

  if (status === 403 || lower.includes('forbidden') || lower.includes('permission')) {
    return {
      kind: 'unauthorized',
      message: 'You do not have permission to access student admission records.',
    };
  }

  return {
    kind: 'recoverable',
    message: "We couldn't retrieve the admission records. Please try again.",
  };
}

/**
 * Applies role scope, status filter, and search query to an authoritative admissions array.
 */
export function filterAdmissions(
  admissions: Admission[],
  options: {
    search: string;
    statusFilter: string;
  }
): Admission[] {
  const q = options.search.trim().toLowerCase();
  return admissions.filter((a) => {
    if (options.statusFilter !== 'All' && a.status !== options.statusFilter) {
      return false;
    }
    if (!q) return true;
    return Boolean(
      a.student_name?.toLowerCase().includes(q) ||
        a.admission_number?.toLowerCase().includes(q) ||
        a.student_unique_id?.toLowerCase().includes(q) ||
        a.phone?.includes(q) ||
        a.alternate_phone?.includes(q) ||
        a.email?.toLowerCase().includes(q)
    );
  });
}

/**
 * Derives the explicit UI state for the Admissions module so initial loading, errors,
 * filtered-empty, confirmed-empty, and background refreshes can never be confused.
 */
export function deriveAdmissionsViewState(params: {
  isAuthLoading: boolean;
  isAuthenticated: boolean;
  canAccess: boolean;
  hasLoadedOnce: boolean;
  isFetching: boolean;
  error: AdmissionsErrorInfo | null;
  totalAuthorizedCount: number;
  filteredCount: number;
  hasActiveFilters: boolean;
}): AdmissionsViewState {
  if (params.isAuthLoading) {
    return 'initial_loading';
  }
  if (!params.isAuthenticated || params.error?.kind === 'session_expired') {
    return 'session_expired';
  }
  if (!params.canAccess || params.error?.kind === 'unauthorized') {
    return 'unauthorized';
  }
  if (!params.hasLoadedOnce) {
    if (params.error) return 'error';
    return 'initial_loading';
  }
  if (params.error && params.totalAuthorizedCount === 0) {
    return 'error';
  }
  if (params.isFetching && params.totalAuthorizedCount > 0) {
    return 'refreshing';
  }
  if (params.filteredCount > 0) {
    return 'loaded';
  }
  if (params.hasActiveFilters) {
    return 'filtered_empty';
  }
  return 'confirmed_empty';
}
