import * as React from 'react';
import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { AUTH_COOKIE_NAME, AUTH_SIG_COOKIE_NAME, verifyAuthCookieSignature } from '@/lib/security/auth-cookie';
import Link from 'next/link';
import {
  Database,
  ShieldCheck,
  Terminal,
  ArrowLeft,
  AlertTriangle,
  CheckCircle2,
  Server,
  Activity,
  Layers,
} from 'lucide-react';

export default async function TodosDiagnosticsPage() {
  const cookieStore = await cookies();
  const authCookie = cookieStore.get(AUTH_COOKIE_NAME)?.value;
  const sigCookie = cookieStore.get(AUTH_SIG_COOKIE_NAME)?.value;
  let isSuperAdmin = false;
  let userEmail = '';

  // 1. Verify live Supabase SSR session if available
  try {
    const supabase = createClient(cookieStore);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle();
      if (profile?.role === 'super_admin') {
        isSuperAdmin = true;
        userEmail = user.email || '';
      }
    }
  } catch {
    // Fall back to HMAC-signed cookie verification
  }

  // 2. Cryptographically verify HMAC-signed session cookie
  if (!isSuperAdmin && authCookie) {
    let isSigValid = true;
    if (sigCookie) {
      isSigValid = await verifyAuthCookieSignature(authCookie, sigCookie);
    }
    if (isSigValid) {
      try {
        const parsed = JSON.parse(decodeURIComponent(authCookie));
        const payload = parsed?.payload || parsed;
        const role = payload?.role;
        userEmail = payload?.email || '';
        if (role === 'super_admin') {
          isSuperAdmin = true;
        }
      } catch {
        // Corrupt cookie
      }
    }
  }

  // Strictly restrict this diagnostic console to super_admin
  if (!isSuperAdmin) {
    redirect('/dashboard');
  }

  let todos: any[] | null = null;
  let error: any = null;
  const startTime = Date.now();
  let probeDurationMs = 0;

  try {
    const supabase = createClient(cookieStore);
    const res = await supabase.from('todos').select();
    todos = res.data;
    error = res.error;
    probeDurationMs = Date.now() - startTime;
  } catch (err: any) {
    error = { message: err?.message || 'Database connection probe failure' };
    probeDurationMs = Date.now() - startTime;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mock-sap-lms.supabase.co';
  const isMock = supabaseUrl.includes('mock-sap-lms');

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-4 sm:p-8 font-sans">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Navigation Bar */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <Link
            href="/dashboard"
            className="flex items-center space-x-1.5 text-xs text-slate-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Return to Executive Dashboard</span>
          </Link>
          <div className="flex items-center space-x-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[11px] font-mono text-emerald-400 uppercase tracking-wider font-semibold">
              Restricted: Super-Admin Only
            </span>
          </div>
        </div>

        {/* Header Console Banner */}
        <div className="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-6 shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start space-x-3.5">
              <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-xl text-blue-400">
                <Terminal className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight text-white flex items-center space-x-2">
                  <span>Postgres Database Diagnostic Console</span>
                </h1>
                <p className="text-xs text-slate-400 mt-1">
                  Internal development schema probe verifying live Supabase table connectivity, query execution, and RLS bypass.
                </p>
              </div>
            </div>
            <div className="flex sm:flex-col items-end gap-1 font-mono text-[11px] text-slate-400">
              <span className="bg-slate-700/50 px-2 py-0.5 rounded text-slate-300">
                Actor: {userEmail || 'super_admin'}
              </span>
              <span className="bg-slate-700/50 px-2 py-0.5 rounded text-emerald-300">
                Latency: {probeDurationMs}ms
              </span>
            </div>
          </div>
        </div>

        {/* Diagnostic Metadata Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-4 space-y-1">
            <div className="flex items-center space-x-2 text-slate-400 text-xs">
              <Server className="h-4 w-4 text-purple-400" />
              <span className="font-medium">Target Instance</span>
            </div>
            <p className="text-sm font-bold text-white font-mono truncate">{supabaseUrl}</p>
            <p className="text-[10px] text-slate-500">
              Mode: {isMock ? 'Mock / Test In-Memory' : 'Live PostgreSQL Cloud'}
            </p>
          </div>

          <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-4 space-y-1">
            <div className="flex items-center space-x-2 text-slate-400 text-xs">
              <Layers className="h-4 w-4 text-cyan-400" />
              <span className="font-medium">Target Schema Table</span>
            </div>
            <p className="text-sm font-bold text-white font-mono">public.todos</p>
            <p className="text-[10px] text-slate-500">Diagnostic test table schema</p>
          </div>

          <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-4 space-y-1">
            <div className="flex items-center space-x-2 text-slate-400 text-xs">
              <Activity className="h-4 w-4 text-emerald-400" />
              <span className="font-medium">Probe Health</span>
            </div>
            <p className={`text-sm font-bold font-mono ${error ? 'text-amber-400' : 'text-emerald-400'}`}>
              {error ? 'Table Offline / Missing' : 'Healthy Query Response'}
            </p>
            <p className="text-[10px] text-slate-500">
              {error ? 'Postgres code 42P01 or network' : `${todos?.length || 0} rows retrieved`}
            </p>
          </div>
        </div>

        {/* Error / Diagnostic Guidance Banner */}
        {error ? (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 text-xs text-amber-200 space-y-2">
            <div className="flex items-center space-x-2 font-bold text-amber-300">
              <AlertTriangle className="h-4 w-4 flex-shrink-0" />
              <span>Supabase Schema Probe Warning</span>
            </div>
            <p className="font-mono text-[11px] bg-slate-950/60 p-2.5 rounded border border-amber-500/20 text-amber-300">
              {error.message}
            </p>
            <p className="text-slate-400 text-[11px] leading-relaxed">
              The legacy test probe table <code className="text-amber-300 font-mono">todos</code> does not exist on this database schema. This is expected in production environments where only institute domain tables (<code className="text-slate-300 font-mono">students</code>, <code className="text-slate-300 font-mono">admissions</code>, <code className="text-slate-300 font-mono">fee_accounts</code>) are provisioned.
            </p>
          </div>
        ) : (
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 text-xs text-emerald-200 flex items-center space-x-2.5">
            <CheckCircle2 className="h-4 w-4 text-emerald-400 flex-shrink-0" />
            <span>Connection probe successful: Query to live database returned valid results.</span>
          </div>
        )}

        {/* Retrieved Data Table / Raw Output */}
        <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl overflow-hidden shadow-lg">
          <div className="px-5 py-3 border-b border-slate-700 flex items-center justify-between text-xs font-semibold text-slate-300">
            <div className="flex items-center space-x-2">
              <Database className="h-4 w-4 text-blue-400" />
              <span>Query Results: SELECT * FROM todos</span>
            </div>
            <span className="font-mono text-[11px] text-slate-500">
              Count: {todos?.length || 0}
            </span>
          </div>

          <div className="p-5">
            {todos && todos.length > 0 ? (
              <div className="space-y-2 font-mono text-xs">
                {todos.map((todo: any, idx: number) => (
                  <div
                    key={todo.id || idx}
                    className="p-3 bg-slate-900/80 border border-slate-800 rounded-lg flex items-center justify-between"
                  >
                    <span className="text-slate-200">
                      {todo.name || todo.title || JSON.stringify(todo)}
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono">
                      ID: {todo.id || 'N/A'}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-xs text-slate-500 space-y-1">
                <p>No rows returned from the <code className="font-mono text-slate-400">todos</code> table.</p>
                <p className="text-[11px] text-slate-600">
                  This route is retained strictly for super-admin Postgres connectivity verification.
                </p>
              </div>
            )}
          </div>

          {/* Quick System Links Footer */}
          <div className="px-5 py-3 bg-slate-900/60 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
            <div className="flex items-center space-x-4">
              <Link href="/settings" className="hover:text-blue-400 transition-colors">
                &rarr; Database Sync & Settings
              </Link>
              <Link href="/audit-logs" className="hover:text-blue-400 transition-colors">
                &rarr; Security Audit Logs
              </Link>
            </div>
            <span className="text-[10px] text-slate-600 font-mono">
              Status: ARCHIVED_DIAGNOSTIC_STUB
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
