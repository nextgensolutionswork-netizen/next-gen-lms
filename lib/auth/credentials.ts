import { UserProfile } from '@/types';
import { store } from '@/lib/services/data-store';
import { isLiveSupabaseEnabled, getDb } from '@/lib/supabase/db';

export function validateLoginPreflight(user: Pick<UserProfile, 'role' | 'is_active'> | null): void {
  if (!user) {
    throw new Error('User profile not found');
  }
  if (user.role === 'student' && !user.is_active) {
    throw new Error('Your LMS portal account is currently pending onboarding verification. Please contact your student coordinator.');
  }
  if (!user.is_active) {
    throw new Error('This account has been deactivated. Please contact the administrator.');
  }
}

/**
 * Standard preset passwords for isolated test and synthetic fixture environments.
 * SEC-BUG-02: Strictly blocked in production runtime (NODE_ENV === 'production').
 */
export const DEMO_CREDENTIALS: Record<string, string[]> = {
  'mock.superadmin@test-fixture.local': ['TestAdminPass#2026'],
  'mock.admin@test-fixture.local': ['TestAdminPass#2026'],
  'student1@lms.internal': ['StudentPass#2026'],
  'student2@lms.internal': ['StudentPass#2026'],
};

// In test environment only, support legacy test suite role addresses
if (process.env.NODE_ENV === 'test') {
  Object.assign(DEMO_CREDENTIALS, {
    'superadmin@next-generpsolutions.com': ['AdminPass#2026'],
    'admin@next-generpsolutions.com': ['AdminPass#2026'],
    'accounts@next-generpsolutions.com': ['AccountsPass#2026'],
    'counsellor@next-generpsolutions.com': ['CounsellorPass#2026'],
    'vikram.fico@next-generpsolutions.com': ['TrainerPass#2026'],
    'neha.mm@next-generpsolutions.com': ['TrainerPass#2026'],
    'placement@next-generpsolutions.com': ['PlacementPass#2026'],
    'support@next-generpsolutions.com': ['SupportPass#2026'],
    'onboarding@next-generpsolutions.com': ['OnboardingPass#2026', 'OnboardPass#2026'],
    'amit.gupta@student.next-gen.com': ['StudentPass#2026'],
    'sneha.k@student.next-gen.com': ['StudentPass#2026'],
  });
}

export interface VerificationResult {
  success: boolean;
  user?: UserProfile;
  error?: string;
  errorCode?: 'missing_credentials' | 'invalid_credentials' | 'onboarding_pending' | 'account_deactivated';
}

/**
 * Validates credentials safely without ever exposing secrets in errors or URLs.
 */
export async function verifyUserCredentials(
  email: string | null | undefined,
  password: string | null | undefined
): Promise<VerificationResult> {
  const cleanEmail = email?.trim() || '';
  const cleanPassword = password || '';

  if (!cleanEmail || !cleanPassword) {
    return {
      success: false,
      error: 'Please enter both your email address and password.',
      errorCode: 'missing_credentials',
    };
  }

  // 1. If Supabase is live, attempt genuine Supabase authentication
  const isProduction = process.env.NODE_ENV === 'production';
  const isTestEnvironment = process.env.NODE_ENV === 'test';

  if (isLiveSupabaseEnabled()) {
    try {
      const db = getDb();
      const { data, error } = await db.auth.signInWithPassword({
        email: cleanEmail,
        password: cleanPassword,
      });

      if (!error && data?.user) {
        const { data: profile } = await db
          .from('profiles')
          .select('*')
          .eq('id', data.user.id)
          .maybeSingle();

        if (profile) {
          try {
            validateLoginPreflight(profile);
            return { success: true, user: profile as UserProfile };
          } catch (preflightErr: any) {
            const isPending = preflightErr?.message?.includes('pending onboarding');
            return {
              success: false,
              error: preflightErr?.message || 'Account access denied.',
              errorCode: isPending ? 'onboarding_pending' : 'account_deactivated',
            };
          }
        }
      } else if (error) {
        // In production, invalid credentials from Supabase must not fall through to demo passwords
        if (isProduction) {
          return {
            success: false,
            error: 'Unable to sign in. Check your email and password and try again.',
            errorCode: 'invalid_credentials',
          };
        }
      }
    } catch (networkErr: any) {
      if (isProduction) {
        // Fail closed in production when auth provider is unreachable
        return {
          success: false,
          error: 'Authentication service temporarily unavailable. Please try again later.',
          errorCode: 'account_deactivated' as any,
        };
      }
    }
  } else if (isProduction) {
    // In production without live auth, fail securely (zero demo credential fallback)
    return {
      success: false,
      error: 'Authentication service configuration error.',
      errorCode: 'account_deactivated' as any,
    };
  }

  // 2. Local / Staging Store Verification (Strictly gated to test or non-production staging)
  if (isProduction) {
    return {
      success: false,
      error: 'Unable to sign in. Check your email and password and try again.',
      errorCode: 'invalid_credentials',
    };
  }

  const user = store.users.find(
    (u) => u.email.toLowerCase() === cleanEmail.toLowerCase()
  );

  if (!user) {
    return {
      success: false,
      error: 'Unable to sign in. Check your email and password and try again.',
      errorCode: 'invalid_credentials',
    };
  }

  // Verify password matches known demo, staging, or role pattern in non-production
  const acceptedPasswords = DEMO_CREDENTIALS[user.email.toLowerCase()] || [];
  const isStagingUser = user.email.includes('next-gen-staging.local');
  const isGenericValid =
    acceptedPasswords.includes(cleanPassword) ||
    (isStagingUser && ['StagingPass#2026', 'AdminPass#2026', 'StudentPass#2026', 'AccountsPass#2026', 'TrainerPass#2026', 'CounsellorPass#2026', 'OnboardPass#2026'].includes(cleanPassword)) ||
    (isTestEnvironment && ['AdminPass#2026', 'AccountsPass#2026', 'TrainerPass#2026', 'StudentPass#2026', 'CounsellorPass#2026', 'OnboardPass#2026', 'OnboardingPass#2026', 'PlacementPass#2026', 'SupportPass#2026', 'NextGen#2026', 'DemoPass#2026'].includes(cleanPassword));

  if (!isGenericValid) {
    return {
      success: false,
      error: 'Unable to sign in. Check your email and password and try again.',
      errorCode: 'invalid_credentials',
    };
  }

  // 3. Preflight status validation (Unprovisioned student and inactive account checks)
  try {
    validateLoginPreflight(user);
  } catch (preflightErr: any) {
    const isPending = preflightErr?.message?.includes('pending onboarding');
    return {
      success: false,
      error: preflightErr?.message || 'Account access denied.',
      errorCode: isPending ? 'onboarding_pending' : 'account_deactivated',
    };
  }

  return {
    success: true,
    user,
  };
}
