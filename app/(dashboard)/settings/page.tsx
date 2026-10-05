'use client';

import * as React from 'react';
import {
  Settings as SettingsIcon,
  Save,
  CheckCircle,
  Building,
  Bell,
  Clock,
  IndianRupee,
  Database,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { store } from '@/lib/services/data-store';
import { SystemSettings } from '@/types';
import { isLiveSupabaseEnabled } from '@/lib/supabase/db';
import { syncStoreToSupabase, SeedSyncResult } from '@/lib/supabase/seeder';
import { syncPostgresToLocal } from '@/lib/supabase/sync-service';

export default function SettingsPage() {
  const [settings, setSettings] = React.useState<SystemSettings>(store.settings);
  const [saved, setSaved] = React.useState(false);
  const [isSyncing, setIsSyncing] = React.useState(false);
  const [syncResult, setSyncResult] = React.useState<SeedSyncResult | null>(null);
  const isSupabaseLive = isLiveSupabaseEnabled();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const projectRef = supabaseUrl.includes('.supabase.co')
    ? supabaseUrl.replace(/^https?:\/\//, '').split('.')[0]
    : isSupabaseLive ? 'Connected' : 'Local In-Memory';

  const handleSyncToDb = async () => {
    setIsSyncing(true);
    setSyncResult(null);
    try {
      const res = await syncStoreToSupabase();
      setSyncResult(res);
    } catch (err: any) {
      setSyncResult({
        success: false,
        message: err.message || 'Sync failed',
        syncedTables: [],
        errors: [err.message],
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const handlePullFromDb = async () => {
    setIsSyncing(true);
    setSyncResult(null);
    try {
      const res = await syncPostgresToLocal();
      setSyncResult({
        success: res.success,
        message: res.success ? 'Successfully pulled latest data from Supabase PostgreSQL' : 'Pull completed with warnings',
        syncedTables: res.syncedTables.map((t) => ({ table: t, count: res.totalSynced })),
        errors: res.errors,
      });
    } catch (err: any) {
      setSyncResult({
        success: false,
        message: err.message || 'Pull failed',
        syncedTables: [],
        errors: [err.message],
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    store.settings = { ...settings };
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Institute System Settings</h1>
          <p className="text-xs text-slate-500 mt-1">
            Global institution profile, statutory GSTIN details, default currency (INR ₹), timezone, and numbering prefixes.
          </p>
        </div>
      </div>

      {saved && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-xs font-semibold flex items-center space-x-2">
          <CheckCircle className="h-4 w-4 text-emerald-600" />
          <span>System configuration successfully saved and updated across all modules!</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Profile Card */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Institute Identity & Campus Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-xs">
            <Input
              label="Institute Full Name *"
              value={settings.institute_name}
              onChange={(e) => setSettings({ ...settings, institute_name: e.target.value })}
              required
            />

            <Input
              label="Tagline / Motto"
              value={settings.tagline}
              onChange={(e) => setSettings({ ...settings, tagline: e.target.value })}
            />

            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Official Email *"
                type="email"
                value={settings.email}
                onChange={(e) => setSettings({ ...settings, email: e.target.value })}
                required
              />
              <Input
                label="Official Phone *"
                value={settings.phone}
                onChange={(e) => setSettings({ ...settings, phone: e.target.value })}
                required
              />
            </div>

            <Input
              label="Registered Campus Address *"
              value={settings.address}
              onChange={(e) => setSettings({ ...settings, address: e.target.value })}
              required
            />
          </CardContent>
        </Card>

        {/* Financial & Statutory Settings */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Financial, Statutory & Regional Localization</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="GSTIN Number *"
                value={settings.gst_number}
                onChange={(e) => setSettings({ ...settings, gst_number: e.target.value })}
                required
              />
              <Input
                label="Default Currency Code *"
                value={settings.default_currency}
                onChange={(e) => setSettings({ ...settings, default_currency: e.target.value })}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Academic Year *"
                value={settings.academic_year}
                onChange={(e) => setSettings({ ...settings, academic_year: e.target.value })}
                required
              />
              <Input
                label="Default Timezone *"
                value={settings.timezone}
                onChange={(e) => setSettings({ ...settings, timezone: e.target.value })}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Receipt Sequence Prefix"
                value={settings.receipt_prefix}
                onChange={(e) => setSettings({ ...settings, receipt_prefix: e.target.value })}
              />
              <Input
                label="Invoice Sequence Prefix"
                value={settings.invoice_prefix}
                onChange={(e) => setSettings({ ...settings, invoice_prefix: e.target.value })}
              />
            </div>
          </CardContent>
        </Card>

        {/* Notification Preferences */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Automated Multi-Channel Notifications</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-xs">
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.enable_email_notifications}
                onChange={(e) =>
                  setSettings({ ...settings, enable_email_notifications: e.target.checked })
                }
                className="rounded border-slate-300 text-[#0A6ED1] focus:ring-[#0A6ED1]"
              />
              <span className="font-medium text-slate-800">Enable Automated Email Dispatch</span>
            </label>

            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.enable_whatsapp_notifications}
                onChange={(e) =>
                  setSettings({ ...settings, enable_whatsapp_notifications: e.target.checked })
                }
                className="rounded border-slate-300 text-[#0A6ED1] focus:ring-[#0A6ED1]"
              />
              <span className="font-medium text-slate-800">Enable Instant WhatsApp Fee Receipt & Class Alerts</span>
            </label>

            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.enable_sms_notifications}
                onChange={(e) =>
                  setSettings({ ...settings, enable_sms_notifications: e.target.checked })
                }
                className="rounded border-slate-300 text-[#0A6ED1] focus:ring-[#0A6ED1]"
              />
              <span className="font-medium text-slate-800">Enable SMS Gateways for Overdue Reminders</span>
            </label>
          </CardContent>
        </Card>

        {/* Supabase Database Connection & PostgreSQL Sync */}
        <Card className="border border-slate-200">
          <CardHeader className="pb-3 bg-gradient-to-r from-slate-900 to-slate-950 text-white rounded-t-xl p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <div className="h-8 w-8 rounded-lg bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center text-emerald-300">
                  <Database className="h-4 w-4" />
                </div>
                <div>
                  <CardTitle className="text-sm font-bold text-white flex items-center space-x-2">
                    <span>Supabase PostgreSQL Engine</span>
                    <Badge variant={isSupabaseLive ? 'success' : 'warning'} className="text-[10px]">
                      {isSupabaseLive ? 'Live PostgreSQL Connected' : 'In-Memory State (Offline)'}
                    </Badge>
                  </CardTitle>
                  <p className="text-[11px] text-slate-300 mt-0.5">
                    Cloud database persistence layer for student rosters, fee ledger, and doubt tickets.
                  </p>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-4 sm:p-5 space-y-4 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Database Engine</p>
                <p className="font-semibold text-slate-900">PostgreSQL 15 (Supabase Cloud)</p>
                <p className="text-[10px] text-slate-500">Row-Level Security (RLS) & Foreign Keys active</p>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Persistence Mode</p>
                <p className="font-semibold text-slate-900">
                  {isSupabaseLive ? 'Direct PostgreSQL Database Queries' : 'Hybrid Dual-Layer Cache'}
                </p>
                <p className="text-[10px] text-slate-500">
                  Project: <strong className="font-mono text-slate-700">{projectRef}</strong>
                </p>
              </div>
            </div>

            {syncResult && (
              <div
                className={`p-3 rounded-xl border text-xs space-y-1.5 ${
                  syncResult.success
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                    : 'bg-amber-50 border-amber-200 text-amber-900'
                }`}
              >
                <div className="flex items-center space-x-2 font-bold">
                  <ShieldCheck className="h-4 w-4 text-emerald-600" />
                  <span>{syncResult.message}</span>
                </div>
                {syncResult.syncedTables.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {syncResult.syncedTables.map((t) => (
                      <span key={t.table} className="bg-white/80 border border-emerald-300 px-2 py-0.5 rounded text-[10px] font-medium">
                        {t.table}: {t.count} records
                      </span>
                    ))}
                  </div>
                )}
                {syncResult.errors.length > 0 && (
                  <p className="text-[10px] text-rose-600">{syncResult.errors.join('; ')}</p>
                )}
              </div>
            )}

            <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <span className="text-[11px] text-slate-500">
                Synchronize institute seed data (courses, staff, students, fees) with your live Supabase PostgreSQL database.
              </span>
              <div className="flex items-center space-x-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handlePullFromDb}
                  disabled={isSyncing}
                  className="text-xs flex items-center space-x-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200"
                >
                  <RefreshCw className={`h-3 w-3 ${isSyncing ? 'animate-spin' : ''}`} />
                  <span>Pull from DB</span>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleSyncToDb}
                  disabled={isSyncing}
                  className="text-xs flex items-center space-x-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-300 font-semibold"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                  <span>{isSyncing ? 'Syncing...' : 'Push to Supabase DB'}</span>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button type="submit" variant="sap" size="md" className="text-xs flex items-center space-x-1">
            <Save className="h-4 w-4" />
            <span>Save System Settings</span>
          </Button>
        </div>
      </form>
    </div>
  );
}
