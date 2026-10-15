import { GET as getCaseById, PATCH as patchCaseById } from '../cases/[id]/route';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Route Handlers for /api/onboarding/[id]
 * Provides canonical REST endpoints for retrieving and updating individual onboarding cases.
 * Enforces server session HMAC validation and RBAC checks (401/403).
 */
export const GET = getCaseById;
export const PATCH = patchCaseById;
