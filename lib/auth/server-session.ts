import { authenticatePaymentRequest } from './payment-session';
import { NextRequest, NextResponse } from 'next/server';
import { UserProfile, UserRole, Permission } from '@/types';
import { store } from '@/lib/services/data-store';
import { hasPermission } from '@/lib/auth/rbac';

export interface AuthResultSuccess {
  user: UserProfile;
  errorResponse: null;
}

export interface AuthResultError {
  user: null;
  errorResponse: NextResponse;
}

export type AuthResult = AuthResultSuccess | AuthResultError;

export interface AuthenticateOptions {
  allowedRoles?: UserRole[];
  requiredPermission?: Permission;
}

/**
 * Extracts and cryptographically verifies the authenticated user from a Next.js server request.
 * Checks both session cookies (with HMAC-SHA256 signature verification) and Bearer authorization tokens.
 */
export async function getAuthenticatedUserFromRequest(
  request: NextRequest
): Promise<UserProfile | null> {
  try { return await authenticatePaymentRequest(request); } catch { return null; }
}

/**
 * Enforces session authentication and RBAC permissions for Next.js Route Handlers.
 * Returns either `{ user, errorResponse: null }` or `{ user: null, errorResponse: NextResponse }`.
 */
export async function authenticateApiRequest(
  request: NextRequest,
  options: AuthenticateOptions = {}
): Promise<AuthResult> {
  const user = await getAuthenticatedUserFromRequest(request);

  // 1. Authentication check
  if (!user) {
    return {
      user: null,
      errorResponse: NextResponse.json(
        {
          success: false,
          error: 'Unauthorized: Valid authentication session cookie or Bearer token is required.',
        },
        { status: 401 }
      ),
    };
  }

  // 2. Active status check
  if (user.is_active === false) {
    return {
      user: null,
      errorResponse: NextResponse.json(
        {
          success: false,
          error: 'Forbidden: User account is inactive or has been disabled by an administrator.',
        },
        { status: 403 }
      ),
    };
  }

  // 3. Super Admin bypasses role & permission restrictions
  if (user.role === 'super_admin') {
    return { user, errorResponse: null };
  }

  // 4. Role-based access check
  if (options.allowedRoles && options.allowedRoles.length > 0) {
    if (!options.allowedRoles.includes(user.role)) {
      return {
        user: null,
        errorResponse: NextResponse.json(
          {
            success: false,
            error: `Forbidden: Role '${user.role}' is not authorized to access this onboarding endpoint.`,
          },
          { status: 403 }
        ),
      };
    }
  }

  // 5. Permission check
  if (options.requiredPermission) {
    if (!hasPermission(user, options.requiredPermission)) {
      return {
        user: null,
        errorResponse: NextResponse.json(
          {
            success: false,
            error: `Forbidden: Insufficient privileges. Missing '${options.requiredPermission}' permission.`,
          },
          { status: 403 }
        ),
      };
    }
  }

  return { user, errorResponse: null };
}
