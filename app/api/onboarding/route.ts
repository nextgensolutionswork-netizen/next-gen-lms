import { GET as getCases, POST as postCases } from './cases/route';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Route Handlers for /api/onboarding
 * Provides canonical REST endpoints for listing and creating onboarding cases.
 * Enforces server session HMAC validation and RBAC checks (401/403).
 */
export const GET = getCases;
export const POST = postCases;
