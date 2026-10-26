'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, BookOpen, Eye, EyeOff, GraduationCap, AlertCircle } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/components/providers/auth-provider';
import { getSafeRedirectUrl } from '@/lib/auth/rbac';
import {
  generateAuthCookieSignature,
  AUTH_COOKIE_NAME,
  AUTH_SIG_COOKIE_NAME,
  AUTH_COOKIE_SECRET,
} from '@/lib/security/auth-cookie';

async function signAuthCookiePayload(cookieVal: string): Promise<string> {
  const sig = await generateAuthCookieSignature(cookieVal, AUTH_COOKIE_SECRET);
  if (typeof document !== 'undefined') {
    document.cookie = `${AUTH_SIG_COOKIE_NAME}=${sig}; path=/; max-age=604800; SameSite=Lax`;
  }
  return sig;
}

async function signCurrentAuthCookie(): Promise<string | null> {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp('(?:^|;\\s*)' + AUTH_COOKIE_NAME + '=([^;]*)'));
  if (match && match[1]) {
    return await signAuthCookiePayload(match[1]);
  }
  return null;
}

const DEMO_ACCOUNTS = [
  {
    role: 'super_admin' as const,
    label: 'Super Admin',
    name: 'Rajesh Sharma (Director)',
    email: 'superadmin@next-generpsolutions.com',
    password: 'AdminPass#2026',
    route: '/dashboard',
    badge: 'bg-blue-100 text-blue-800 border-blue-300',
  },
  {
    role: 'admin' as const,
    label: 'Operations Admin',
    name: 'Priya Nair (Operations Head)',
    email: 'admin@next-generpsolutions.com',
    password: 'AdminPass#2026',
    route: '/dashboard',
    badge: 'bg-indigo-100 text-indigo-800 border-indigo-300',
  },
  {
    role: 'accountant' as const,
    label: 'Accountant',
    name: 'Suresh Kumar (Chief Accountant)',
    email: 'accounts@next-generpsolutions.com',
    password: 'AccountsPass#2026',
    route: '/accounts/fees',
    badge: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  },
  {
    role: 'counsellor' as const,
    label: 'Counsellor',
    name: 'Ananya Desai (Senior Counsellor)',
    email: 'counsellor@next-generpsolutions.com',
    password: 'CounsellorPass#2026',
    route: '/crm/leads',
    badge: 'bg-amber-100 text-amber-800 border-amber-300',
  },
  {
    role: 'trainer' as const,
    label: 'Trainer / Faculty',
    name: 'Vikram Rao (SAP FICO Lead)',
    email: 'vikram.fico@next-generpsolutions.com',
    password: 'TrainerPass#2026',
    route: '/academics/courses',
    badge: 'bg-purple-100 text-purple-800 border-purple-300',
  },
  {
    role: 'placement_coordinator' as const,
    label: 'Placement Head',
    name: 'Sunita Reddy (Placement Head)',
    email: 'placement@next-generpsolutions.com',
    password: 'PlacementPass#2026',
    route: '/placement',
    badge: 'bg-violet-100 text-violet-800 border-violet-300',
  },
  {
    role: 'support' as const,
    label: 'Academic Support',
    name: 'Ananya Deshmukh (SAP Support Lead)',
    email: 'support@next-generpsolutions.com',
    password: 'SupportPass#2026',
    route: '/support',
    badge: 'bg-cyan-100 text-cyan-800 border-cyan-300',
  },
  {
    role: 'onboarding_team' as const,
    label: 'Onboarding Team',
    name: 'Sneha Patel (Student Onboarding Lead)',
    email: 'onboarding@next-generpsolutions.com',
    password: 'OnboardPass#2026',
    route: '/onboarding',
    badge: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  },
  {
    role: 'student' as const,
    label: 'Enrolled Student',
    name: 'Amit Gupta (SAP Student)',
    email: 'amit.gupta@student.next-gen.com',
    password: 'StudentPass#2026',
    route: '/portal',
    badge: 'bg-teal-100 text-teal-800 border-teal-300',
  },
];

export default function LoginPage() {
  const router = useRouter();
  const { login, user } = useAuth();
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null);
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [accountSetupMode, setAccountSetupMode] = useState(false);
  const [forgotPasswordMode, setForgotPasswordMode] = useState(false);
  const [passwordResetComplete, setPasswordResetComplete] = useState(false);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [activeRole, setActiveRole] = useState<string | null>(null);
  const [targetRedirect, setTargetRedirect] = useState<string | null>(null);

  useEffect(() => {
    // Capture the callback before the auth client consumes its URL parameters.
    const query = new URLSearchParams(window.location.search);
    const redirectToParam = query.get('redirectTo');
    if (redirectToParam) {
      setTargetRedirect(redirectToParam);
    }

    // Security Defense: Strip any sensitive credentials that may have leaked into URL query
    const sensitiveKeys = ['password', 'pass', 'pwd', 'secret', 'newPassword', 'confirmPassword'];
    let hadSensitive = false;
    sensitiveKeys.forEach((k) => {
      if (query.has(k)) {
        query.delete(k);
        hadSensitive = true;
      }
    });
    if (hadSensitive && typeof window !== 'undefined') {
      const cleanSearch = query.toString() ? `?${query.toString()}` : '';
      window.history.replaceState(null, '', `${window.location.pathname}${cleanSearch}`);
      setError('Insecure login attempt detected. Credentials must never be transmitted in the URL.');
    }

    // Handle standard server-side redirect error and notice query parameters
    const urlError = query.get('error') || query.get('reason');
    if (urlError) {
      const errorMap: Record<string, string> = {
        invalid_credentials: 'Unable to sign in. Check your email and password and try again.',
        missing_credentials: 'Please enter both your email address and password.',
        onboarding_pending: 'Your LMS portal account is currently pending onboarding verification. Please contact your coordinator.',
        account_deactivated: 'This account has been deactivated. Please contact the administrator.',
        access_unavailable: 'We could not verify your LMS access. Please retry in a moment or contact your coordinator.',
        insecure_request: 'Insecure login attempt detected. Credentials must never be transmitted in the URL.',
        csrf_failed: 'Security verification failed. Please try signing in again.',
      };
      setError(errorMap[urlError] || 'Unable to sign in. Please try again.');
    }

    const urlNotice = query.get('notice');
    if (urlNotice === 'logged_out') {
      setNotice('You have been securely signed out.');
    }

    const hash = new URLSearchParams(window.location.hash.slice(1));
    const authError = query.get('error_description') || hash.get('error_description');
    const authErrorCode = query.get('error_code') || hash.get('error_code');
    const authType = query.get('type') || hash.get('type');
    const isPasswordLink = authType === 'invite' || authType === 'recovery';
    const supabase = createClient();
    supabaseRef.current = supabase;
    if (authErrorCode || authError) {
      setForgotPasswordMode(true);
      setError(
        authErrorCode === 'otp_expired'
          ? 'This account link has expired or was already used. Request a fresh link below.'
          : authError || 'This account link could not be verified. Request a fresh link below.'
      );
    }

    const { data: authListener } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY' && !authError && !authErrorCode) {
        setRecoveryMode(true);
        setAccountSetupMode(false);
        setForgotPasswordMode(false);
        setError('');
      }
    });

    void supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (sessionError) {
        if (isPasswordLink) {
          setRecoveryMode(false);
          setForgotPasswordMode(true);
          setError(`Unable to verify the password reset link: ${sessionError.message}`);
        } else {
          console.warn('[Login] getSession warning:', sessionError.message);
        }
        return;
      }
      if (authError || authErrorCode) return;
      if (data?.session && isPasswordLink) {
        setRecoveryMode(true);
        setForgotPasswordMode(false);
        setAccountSetupMode(authType === 'invite');
      } else if (isPasswordLink && !data?.session) {
        setRecoveryMode(false);
        setForgotPasswordMode(true);
        setError('This reset link could not be verified. Request a fresh link and open it in the same browser.');
      }
    }).catch((err) => {
      console.warn('[Login] getSession exception:', err);
    });

    return () => authListener.subscription.unsubscribe();
  }, []);

  const selectAccount = (account: typeof DEMO_ACCOUNTS[0]) => {
    setEmail(account.email);
    setPassword(account.password);
    setActiveRole(account.role);
    setError('');
  };

  const directLogin = async (account: typeof DEMO_ACCOUNTS[0]) => {
    selectAccount(account);
    setError('');
    setBusy(true);
    try {
      await login(account.email, account.password, targetRedirect || undefined);
      await signCurrentAuthCookie();
    } catch (err: any) {
      setError(err?.message || 'Unable to sign in. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setBusy(true);

    try {
      const ok = await login(email, password, targetRedirect || undefined);
      if (!ok) {
        setError('Unable to sign in. Check your email and password and try again.');
      } else {
        await signCurrentAuthCookie();
      }
    } catch (err: any) {
      setError(err?.message || 'Unable to sign in. Check your email and password and try again.');
    } finally {
      setBusy(false);
    }
  }

  async function handlePasswordRecovery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setNotice('');
    setBusy(true);

    try {
      const supabase = supabaseRef.current || createClient();
      supabaseRef.current = supabase;
      const { error: recoveryError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/login?type=recovery`,
      });
      if (recoveryError) throw recoveryError;
      setNotice('If an account exists for that email, a password reset link has been sent.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to send a password reset email.');
    } finally {
      setBusy(false);
    }
  }

  async function handlePasswordUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setNotice('');

    if (newPassword !== confirmPassword) {
      setError('The passwords do not match.');
      return;
    }

    setBusy(true);
    try {
      const supabase = supabaseRef.current || createClient();
      supabaseRef.current = supabase;
      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
      if (updateError) throw updateError;

      await supabase.auth.signOut();
      setPasswordResetComplete(true);
      setRecoveryMode(false);
      setNewPassword('');
      setConfirmPassword('');
      window.history.replaceState(null, '', '/login');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update the password.');
    } finally {
      setBusy(false);
    }
  }

  const inputClass = 'mt-1.5 h-11 w-full rounded-xl border border-slate-300 bg-white px-3.5 text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100 disabled:opacity-60';

  return (
    <main className="grid min-h-screen bg-white lg:grid-cols-2">
      <section className="relative flex flex-col justify-between overflow-hidden bg-slate-950 p-8 text-white lg:p-14">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-blue-600 p-2.5"><GraduationCap aria-hidden="true" size={24} /></div>
          <div><p className="text-base font-bold">Next-Gen ERP</p><p className="text-xs text-slate-400">Solutions & Learning</p></div>
        </div>
        <div className="py-8 lg:py-16">
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.25em] text-blue-400">Multi-Role Institute ERP & LMS</p>
          <h1 className="max-w-lg text-3xl font-semibold leading-tight lg:text-5xl">Build skills.<br />Create your future.</h1>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-slate-300">Complete enterprise training management for students, trainers, accountants, counsellors, support mentors, and administrators.</p>
          <div className="mt-8 flex items-center gap-3 text-xs text-slate-300"><BookOpen aria-hidden="true" className="text-blue-400" size={18} />8 Dedicated Role Workspaces & Portals</div>
        </div>
        <p className="text-[11px] text-slate-500">Next-Gen ERP Solutions · SAP Training Institute</p>
      </section>

      <section className="flex items-center justify-center px-6 py-10 sm:px-10 overflow-y-auto">
        <div className="w-full max-w-md">
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-blue-600">Access Portal</p>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">
            {passwordResetComplete
              ? 'Password updated'
              : recoveryMode
                ? 'Choose a new password'
                : forgotPasswordMode
                  ? 'Reset your password'
                  : 'Sign in to your account'}
          </h2>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            {passwordResetComplete
              ? 'Your password has been changed. You can now sign in.'
              : recoveryMode
                ? accountSetupMode
                  ? 'Set a password to activate your account.'
                  : 'Enter and confirm your new password below.'
                : forgotPasswordMode
                  ? 'Enter your account email and we’ll send you a fresh recovery link.'
                  : 'Select any of the 8 accounts below or enter credentials manually.'}
          </p>

          {passwordResetComplete ? (
            <Button
              type="button"
              onClick={() => setPasswordResetComplete(false)}
              className="mt-6 h-11 w-full rounded-xl text-xs"
            >
              Return to sign in
            </Button>
          ) : recoveryMode ? (
            <form method="POST" action="/api/auth/update-password" onSubmit={handlePasswordUpdate} className="mt-6 space-y-4">
              <div>
                <label htmlFor="new-password" className="text-xs font-medium text-slate-700">New password</label>
                <input
                  id="new-password"
                  name="new_password"
                  type="password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  required
                  disabled={busy}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="confirm-password" className="text-xs font-medium text-slate-700">Confirm new password</label>
                <input
                  id="confirm-password"
                  name="confirm_password"
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  required
                  disabled={busy}
                  className={inputClass}
                />
              </div>
              {error && <p role="alert" className="rounded-lg bg-red-50 p-2.5 text-xs text-red-700">{error}</p>}
              <Button type="submit" disabled={busy} className="h-11 w-full rounded-xl text-xs">
                {busy ? 'Updating password…' : 'Update password'}
              </Button>
            </form>
          ) : forgotPasswordMode ? (
            <form method="POST" action="/api/auth/recover-password" onSubmit={handlePasswordRecovery} className="mt-6 space-y-4">
              <div>
                <label htmlFor="recovery-email" className="text-xs font-medium text-slate-700">Email address</label>
                <input
                  id="recovery-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  required
                  disabled={busy}
                  className={inputClass}
                />
              </div>
              {error && <p role="alert" className="rounded-lg bg-red-50 p-2.5 text-xs text-red-700">{error}</p>}
              {notice && <p role="status" className="rounded-lg bg-green-50 p-2.5 text-xs text-green-700">{notice}</p>}
              <Button type="submit" disabled={busy} className="h-11 w-full rounded-xl text-xs">
                {busy ? 'Sending link…' : 'Send reset link'}
              </Button>
              <button
                type="button"
                onClick={() => {
                  setForgotPasswordMode(false);
                  setError('');
                  setNotice('');
                }}
                className="w-full text-xs font-medium text-blue-700 hover:text-blue-900"
              >
                Back to sign in
              </button>
            </form>
          ) : (
          <>
          {notice && <p role="status" className="mt-3 rounded-lg bg-green-50 p-2.5 text-xs text-green-700">{notice}</p>}

          {/* Deep link indicator banner */}
          {targetRedirect && !user && (
            <div className="mt-3 p-2.5 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between text-xs animate-in fade-in">
              <div className="flex items-center gap-2 overflow-hidden">
                <span className="h-2 w-2 rounded-full bg-amber-500 shrink-0 animate-pulse" />
                <div className="truncate">
                  <p className="font-semibold text-amber-900 text-[11px]">Deep Link Redirection</p>
                  <p className="text-[10px] text-amber-700 truncate">
                    Signing in will open: <code className="bg-amber-100 px-1 py-0.5 rounded font-mono text-[10px] text-amber-900">{targetRedirect}</code>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setTargetRedirect(null);
                  if (typeof window !== 'undefined') {
                    window.history.replaceState(null, '', '/login');
                  }
                }}
                className="text-[10px] text-amber-800 hover:text-amber-950 font-medium underline px-1 shrink-0"
                title="Dismiss deep link and navigate to default workspace on sign-in"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Active Session Indicator */}
          {user && (
            <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-xl flex items-center justify-between text-xs animate-in fade-in">
              <div>
                <p className="font-semibold text-blue-900 text-xs">Active Session Detected</p>
                <p className="text-[11px] text-blue-700">
                  Signed in as <strong>{user.full_name}</strong> ({user.role.replace('_', ' ')})
                </p>
                {targetRedirect && (
                  <p className="text-[10px] text-blue-600 mt-0.5 truncate max-w-[220px]">
                    Target: <code className="bg-blue-100/80 px-1 py-0.5 rounded font-mono text-[10px]">{getSafeRedirectUrl(user.role, targetRedirect)}</code>
                  </p>
                )}
              </div>
              <Button
                type="button"
                size="sm"
                variant="sap"
                onClick={() => {
                  const dest = getSafeRedirectUrl(user.role, targetRedirect);
                  router.push(dest);
                }}
                className="text-xs py-1 h-8 shrink-0"
              >
                {targetRedirect ? 'Continue to Page \u2192' : 'Go to Workspace \u2192'}
              </Button>
            </div>
          )}

          {/* Quick Demo Fill Buttons for ALL 8 ROLES */}
          <div className="mt-4 p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600">8 Preset Role Accounts:</span>
              <span className="text-[10px] text-blue-600 font-medium">Click to fill</span>
            </div>

            <div className="grid grid-cols-2 gap-1.5 max-h-48 overflow-y-auto pr-0.5">
              {DEMO_ACCOUNTS.map((acc) => (
                <button
                  key={acc.role}
                  type="button"
                  onClick={() => selectAccount(acc)}
                  className={`text-left p-1.5 rounded-lg border text-[11px] transition-all ${
                    activeRole === acc.role
                      ? 'border-blue-600 bg-blue-50 font-bold shadow-2xs'
                      : 'border-slate-200 bg-white hover:border-slate-300 text-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-900 truncate">{acc.label}</span>
                    <span className="text-[9px] text-slate-400">{acc.route}</span>
                  </div>
                  <p className="text-[10px] text-slate-500 truncate">{acc.email}</p>
                </button>
              ))}
            </div>

            {activeRole && (
              <div className="pt-2 border-t border-slate-200 flex items-center justify-between text-[11px]">
                <div className="text-slate-600 truncate mr-2">
                  <span>Ready as <strong className="text-blue-700">{DEMO_ACCOUNTS.find(a => a.role === activeRole)?.label}</strong></span>
                  {targetRedirect && (
                    <span className="text-[10px] text-slate-500 block truncate">
                      Redirect: <code className="text-blue-600 font-mono text-[10px]">{getSafeRedirectUrl(activeRole, targetRedirect)}</code>
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const acc = DEMO_ACCOUNTS.find(a => a.role === activeRole);
                    if (acc) directLogin(acc);
                  }}
                  className="font-bold text-blue-600 hover:text-blue-800 underline text-[11px] shrink-0"
                >
                  Instant 1-Click Launch &rarr;
                </button>
              </div>
            )}
          </div>

          <form
            method="POST"
            action="/api/auth/login"
            onSubmit={handleSubmit}
            className="mt-4 space-y-4"
          >
            <input type="hidden" name="redirectTo" value={targetRedirect || ''} />
            <noscript>
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                <p className="font-semibold text-amber-900">JavaScript is disabled.</p>
                <p className="mt-0.5 text-[11px] text-amber-700">
                  Secure server-side authentication is active. Form submissions are transmitted via encrypted HTTP POST.
                </p>
              </div>
            </noscript>
            <div>
              <label htmlFor="email" className="text-xs font-medium text-slate-700">Email address</label>
              <input
                id="email"
                name="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
                placeholder="you@example.com"
                required
                disabled={busy}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="password" className="text-xs font-medium text-slate-700">Password</label>
              <div className="relative">
                <input
                  id="password"
                  name="password"
                  type={visible ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  required
                  disabled={busy}
                  className={`${inputClass} pr-10`}
                />
                <button
                  type="button"
                  onClick={() => setVisible(!visible)}
                  aria-label={visible ? 'Hide password' : 'Show password'}
                  aria-pressed={visible}
                  className="absolute right-2.5 top-4 rounded p-1 text-slate-500 focus-visible:outline focus-visible:outline-blue-600"
                >
                  {visible ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setForgotPasswordMode(true);
                  setError('');
                  setNotice('');
                }}
                className="text-xs font-medium text-blue-700 hover:text-blue-900"
              >
                Forgot password?
              </button>
            </div>
            {error && (
              (error.startsWith('ONBOARDING_PENDING:') || error.includes('pending onboarding verification')) ? (
                <div role="alert" className="p-3.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-xs space-y-2 shadow-sm text-left animate-in fade-in duration-200">
                  <div className="flex items-center space-x-2 font-bold text-amber-900 text-xs">
                    <AlertCircle className="h-4 w-4 text-amber-600 flex-shrink-0" />
                    <span>LMS Portal Account Pending Onboarding</span>
                  </div>
                  <p className="text-[11px] leading-relaxed text-amber-800">
                    {error.replace('ONBOARDING_PENDING:', '').trim()}
                  </p>
                  <div className="pt-2 border-t border-amber-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-[10px] text-amber-700 font-medium">
                    <span>Desk: onboarding@next-generpsolutions.com</span>
                    <span>Student Helpline: +91 98765 43210</span>
                  </div>
                </div>
              ) : (
                <p role="alert" className="rounded-lg bg-red-50 p-2.5 text-xs text-red-700">{error}</p>
              )
            )}
            <Button type="submit" disabled={busy} className="h-11 w-full gap-2 rounded-xl text-xs">{busy ? 'Signing in…' : 'Sign in'}{!busy && <ArrowRight aria-hidden="true" size={16} />}</Button>
          </form>
          <p className="mt-5 text-center text-xs leading-5 text-slate-500">Need assistance or access issue?<br />Contact institute administrator at <span className="font-mono text-slate-700">admin@next-generpsolutions.com</span></p>
          </>
          )}
        </div>
      </section>
    </main>
  );
}
