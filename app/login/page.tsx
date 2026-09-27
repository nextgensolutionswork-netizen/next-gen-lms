'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, BookOpen, Eye, EyeOff, GraduationCap } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';

export default function LoginPage() {
  const router = useRouter();
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setBusy(true);
    const fields = new FormData(event.currentTarget);
    try {
      const { error: authError } = await createClient().auth.signInWithPassword({
        email: String(fields.get('email')).trim(),
        password: String(fields.get('password')),
      });
      if (authError) {
        setError('Unable to sign in. Check your email and password and try again.');
        return;
      }
      router.replace('/dashboard');
      router.refresh();
    } catch {
      setError('Unable to connect to sign-in. Please try again shortly.');
    } finally {
      setBusy(false);
    }
  }

  const inputClass = 'mt-2 h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100 disabled:opacity-60';

  return (
    <main className="grid min-h-screen bg-white lg:grid-cols-2">
      <section className="relative flex flex-col justify-between overflow-hidden bg-slate-950 p-8 text-white lg:p-16">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-blue-600 p-3"><GraduationCap aria-hidden="true" size={28} /></div>
          <div><p className="text-lg font-bold">Next-Gen ERP</p><p className="text-sm text-slate-400">Solutions & Learning</p></div>
        </div>
        <div className="py-12 lg:py-24">
          <p className="mb-5 text-xs font-semibold uppercase tracking-[0.25em] text-blue-400">Your learning starts here</p>
          <h1 className="max-w-lg text-4xl font-semibold leading-tight lg:text-6xl">Build skills.<br />Create your future.</h1>
          <p className="mt-6 max-w-md text-base leading-relaxed text-slate-300">One place for your SAP training, classes, and institute management. Stay connected to every step of your learning journey.</p>
          <div className="mt-10 flex items-center gap-3 text-sm text-slate-300"><BookOpen aria-hidden="true" className="text-blue-400" size={20} />Learning. Progress. Opportunity.</div>
        </div>
        <p className="text-xs text-slate-500">Next-Gen ERP Solutions · SAP Training Institute</p>
      </section>
      <section className="flex items-center justify-center px-6 py-14 sm:px-12">
        <div className="w-full max-w-sm">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-blue-600">Welcome back</p>
          <h2 className="text-3xl font-bold tracking-tight text-slate-900">Sign in to your account</h2>
          <p className="mt-3 text-sm leading-6 text-slate-500">Enter the credentials provided by your institute.</p>
          <form onSubmit={handleSubmit} className="mt-9 space-y-6">
            <div><label htmlFor="email" className="text-sm font-medium text-slate-700">Email address</label><input id="email" name="email" type="email" autoComplete="username" placeholder="you@example.com" required disabled={busy} className={inputClass} /></div>
            <div>
              <label htmlFor="password" className="text-sm font-medium text-slate-700">Password</label>
              <div className="relative"><input id="password" name="password" type={visible ? 'text' : 'password'} autoComplete="current-password" placeholder="Enter your password" required disabled={busy} className={`${inputClass} pr-12`} /><button type="button" onClick={() => setVisible(!visible)} aria-label={visible ? 'Hide password' : 'Show password'} aria-pressed={visible} className="absolute right-3 top-5 rounded p-1 text-slate-500 focus-visible:outline focus-visible:outline-blue-600">{visible ? <EyeOff size={20} /> : <Eye size={20} />}</button></div>
            </div>
            {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
            <Button type="submit" disabled={busy} className="h-12 w-full gap-2 rounded-xl">{busy ? 'Signing in…' : 'Sign in'}{!busy && <ArrowRight aria-hidden="true" size={18} />}</Button>
          </form>
          <p className="mt-7 text-center text-sm leading-6 text-slate-500">Need an account or forgot your password?<br />Contact your institute administrator.</p>
        </div>
      </section>
    </main>
  );
}
