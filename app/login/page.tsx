'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, BookOpen, Eye, EyeOff, GraduationCap } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/components/providers/auth-provider';

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
  const { login } = useAuth();
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [activeRole, setActiveRole] = useState<string | null>(null);

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
      await login(account.email, account.password);
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
      const ok = await login(email, password);
      if (!ok) {
        setError('Unable to sign in. Check your email and password and try again.');
      }
    } catch (err: any) {
      setError(err?.message || 'Unable to sign in. Check your email and password and try again.');
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
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">Sign in to your account</h2>
          <p className="mt-1 text-xs leading-5 text-slate-500">Select any of the 8 accounts below or enter credentials manually.</p>
          
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
                <span className="text-slate-600">
                  Ready as <strong className="text-blue-700">{DEMO_ACCOUNTS.find(a => a.role === activeRole)?.label}</strong>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const acc = DEMO_ACCOUNTS.find(a => a.role === activeRole);
                    if (acc) directLogin(acc);
                  }}
                  className="font-bold text-blue-600 hover:text-blue-800 underline text-[11px]"
                >
                  Instant 1-Click Launch &rarr;
                </button>
              </div>
            )}
          </div>

          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
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
            {error && <p role="alert" className="rounded-lg bg-red-50 p-2.5 text-xs text-red-700">{error}</p>}
            <Button type="submit" disabled={busy} className="h-11 w-full gap-2 rounded-xl text-xs">{busy ? 'Signing in…' : 'Sign in'}{!busy && <ArrowRight aria-hidden="true" size={16} />}</Button>
          </form>
          <p className="mt-5 text-center text-xs leading-5 text-slate-500">Need assistance or access issue?<br />Contact institute administrator at <span className="font-mono text-slate-700">admin@next-generpsolutions.com</span></p>
        </div>
      </section>
    </main>
  );
}
