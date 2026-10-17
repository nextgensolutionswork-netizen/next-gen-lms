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
  ShieldAlert,
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
import { useAuth } from '@/components/providers/auth-provider';

export default function SettingsPage() {
  const { role: currentRole, hasPermission } = useAuth();
  const [settings, setSettings] = React.useState<SystemSettings>(() => {
    const base = store.settings || {};
    return {
      id: base.id || 'sys-01',
      institute_name: base.institute_name || 'Next-Gen ERP Solutions',
      logo_url: base.logo_url || '',
      tagline: base.tagline || 'Premier SAP Training, Certification & Placement Institute',
      address: base.address || 'Plot 42, Silicon Valley Towers, Hitec City, Hyderabad, Telangana 500081',
      phone: base.phone || '+91 98765 43210',
      email: base.email || 'admissions@next-generpsolutions.com',
      gst_number: base.gst_number || '36AAACN1234F1Z8',
      default_currency: base.default_currency || 'INR',
      academic_year: base.academic_year || '2026-2027',
      timezone: base.timezone || 'Asia/Kolkata',
      receipt_prefix: base.receipt_prefix || 'REC',
      admission_prefix: base.admission_prefix || 'ADM',
      student_code_prefix: base.student_code_prefix || 'STU',
      invoice_terms: base.invoice_terms || 'Full payment required before course completion certificate is generated.',
      authorized_signatory_name: base.authorized_signatory_name || 'Dr. Rajesh Kumar',
      authorized_signatory_designation: base.authorized_signatory_designation || 'Managing Director & Academic Dean',
      bank_account_name: base.bank_account_name || 'NEXT GEN ERP SOLUTIONS PRIVATE LIMITED',
      bank_name: base.bank_name || 'HDFC Bank Ltd',
      bank_account_no: base.bank_account_no || base.bank_account_number || '50200088991122',
      bank_account_number: base.bank_account_number || base.bank_account_no || '50200088991122',
      bank_ifsc: base.bank_ifsc || 'HDFC0000123',
      bank_branch: base.bank_branch || 'Hitec City, Hyderabad',
      upi_id: base.upi_id || 'nextgenerp@hdfcbank',
      enable_email_notifications: base.enable_email_notifications ?? true,
      enable_sms_notifications: base.enable_sms_notifications ?? false,
      enable_whatsapp_notifications: base.enable_whatsapp_notifications ?? true,
      created_at: base.created_at || new Date().toISOString(),
      updated_at: base.updated_at || new Date().toISOString(),
    };
  });
  const [saved, setSaved] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [isSyncing, setIsSyncing] = React.useState(false);
  const [syncResult, setSyncResult] = React.useState<SeedSyncResult | null>(null);
  const isSupabaseLive = isLiveSupabaseEnabled();

  const canManageSettings =
    currentRole === 'admin' ||
    currentRole === 'super_admin' ||
    hasPermission('settings:manage');

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const projectRef = supabaseUrl.includes('.supabase.co')
    ? supabaseUrl.replace(/^https?:\/\//, '').split('.')[0]
    : isSupabaseLive ? 'Connected' : 'Local In-Memory';
  const { user } = useAuth();
  const [isSaving, setIsSaving] = React.useState(false);

  React.useEffect(() => {
    let isMounted = true;
    // 1. Immediately hydrate from localStorage if client had previously saved
    if (typeof localStorage !== 'undefined') {
      try {
        const stored = localStorage.getItem('institute_settings');
        if (stored) {
          const parsed = JSON.parse(stored);
          if (isMounted) {
            setSettings((prev) => ({
              ...prev,
              ...parsed,
              bank_account_no: parsed.bank_account_no || parsed.bank_account_number || prev.bank_account_no,
              bank_account_number: parsed.bank_account_number || parsed.bank_account_no || prev.bank_account_number,
            }));
          }
          store.settings = { ...store.settings, ...parsed };
        }
      } catch {}
    }

    // 2. Fetch authoritative persisted settings from server disk snapshot
    void fetch('/api/settings')
      .then((res) => res.json())
      .then((data) => {
        if (isMounted && data.success && data.settings) {
          setSettings((prev) => ({
            ...prev,
            ...data.settings,
            bank_account_no: data.settings.bank_account_no || data.settings.bank_account_number || prev.bank_account_no,
            bank_account_number: data.settings.bank_account_number || data.settings.bank_account_no || prev.bank_account_number,
          }));
          store.settings = { ...store.settings, ...data.settings };
          if (typeof localStorage !== 'undefined') {
            try {
              localStorage.setItem('institute_settings', JSON.stringify(data.settings));
            } catch {}
          }
        }
      })
      .catch((err) => {
        console.warn('[Settings] Failed to fetch server settings:', err);
      });

    return () => {
      isMounted = false;
    };
  }, []);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageSettings) {
      alert('Access Denied: You do not have permission to modify global system settings.');
      return;
    }
    setIsSaving(true);
    setSaveError(null);

    const bankAcc = settings.bank_account_no || settings.bank_account_number || '';
    const updatedSettings: SystemSettings = {
      ...settings,
      bank_account_no: bankAcc,
      bank_account_number: bankAcc,
      updated_at: new Date().toISOString(),
    };

    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...updatedSettings,
          updated_by: user?.id || 'usr-admin',
          updated_by_name: user?.full_name || 'Administrator',
          updated_by_role: currentRole || 'admin',
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to save settings on server');
      }

      const confirmedSettings = data.settings || updatedSettings;

      // 1. Update component state with server-confirmed settings
      setSettings(confirmedSettings);

      // 2. Instantly update in-memory client singleton
      store.settings = { ...store.settings, ...confirmedSettings };

      // 3. Persist to browser localStorage across multiple storage adapters
      if (typeof localStorage !== 'undefined') {
        try {
          localStorage.setItem('institute_settings', JSON.stringify(confirmedSettings));
          const rawSnapshot = localStorage.getItem('next_gen_lms_store_snapshot_v1');
          const parsedSnapshot = rawSnapshot ? JSON.parse(rawSnapshot) : {};
          parsedSnapshot.settings = confirmedSettings;
          localStorage.setItem('next_gen_lms_store_snapshot_v1', JSON.stringify(parsedSnapshot));
        } catch (storageErr) {
          console.warn('[Settings] LocalStorage persistence warning:', storageErr);
        }
      }

      // 4. Persist client-side store adapter
      store.persistSync();
      store.persist();

      // 5. Record client-side audit log
      if (!store.auditLogs) store.auditLogs = [];
      store.auditLogs.unshift({
        id: `aud-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        user_id: user?.id || 'usr-admin',
        user_name: user?.full_name || 'Administrator',
        user_role: currentRole || 'admin',
        action: 'SETTINGS_UPDATED',
        module: 'SETTINGS',
        record_id: confirmedSettings.id || 'sys-01',
        new_value: confirmedSettings,
        created_at: new Date().toISOString(),
      });

      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      console.warn('[Settings] Failed to save to /api/settings:', err);
      setSaveError(err instanceof Error ? err.message : 'Failed to save settings on server');
    } finally {
      setIsSaving(false);
    }
  };

  if (currentRole === 'student') {
    return (
      <div className="p-8 max-w-xl mx-auto text-center space-y-4">
        <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
          <ShieldAlert className="w-6 h-6" />
        </div>
        <h2 className="text-xl font-bold text-slate-800">Access Restricted</h2>
        <p className="text-sm text-slate-500">
          Students do not have access to institutional configuration and financial settings.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Institute System Settings</h1>
          <p className="text-xs text-slate-500 mt-1">
            Global institution profile, default currency (INR ₹), timezone, statutory GST details, and numbering prefixes.
          </p>
        </div>
      </div>

      {!canManageSettings && (
        <div className="p-3.5 bg-amber-50 border border-amber-300 rounded-xl text-amber-900 text-xs flex items-center space-x-2.5">
          <ShieldAlert className="h-4 w-4 text-amber-600 flex-shrink-0" />
          <span>
            <strong>Read-Only Mode:</strong> Your role ({currentRole ? currentRole.replace('_', ' ') : 'viewer'}) does not have administrative permissions to edit global system settings. Only Super Admins and Operations Admins can commit changes.
          </span>
        </div>
      )}

      {saveError && (
        <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-xs font-semibold flex items-center space-x-2">
          <ShieldAlert className="h-4 w-4 text-rose-600 flex-shrink-0" />
          <span>Failed to save system settings: {saveError}</span>
        </div>
      )}

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
              disabled={!canManageSettings}
              required
            />

            <Input
              label="Tagline / Motto"
              value={settings.tagline || ''}
              onChange={(e) => setSettings({ ...settings, tagline: e.target.value })}
              disabled={!canManageSettings}
            />

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="md:col-span-2">
                <Input
                  label="Institute Logo URL"
                  placeholder="https://example.com/logo.png"
                  value={settings.logo_url || ''}
                  onChange={(e) => setSettings({ ...settings, logo_url: e.target.value })}
                  disabled={!canManageSettings}
                />
              </div>
              <div className="flex flex-col justify-end">
                <div className="h-10 px-3 border border-slate-200 rounded-md bg-slate-50 flex items-center gap-2 overflow-hidden">
                  {settings.logo_url ? (
                    <>
                      <img
                        src={settings.logo_url}
                        alt="Logo Preview"
                        className="h-6 w-auto object-contain max-w-[80px]"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                      <span className="text-[11px] text-slate-600 truncate">Preview Active</span>
                    </>
                  ) : (
                    <span className="text-[11px] text-slate-400 italic">No logo configured</span>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Official Email *"
                type="email"
                value={settings.email}
                onChange={(e) => setSettings({ ...settings, email: e.target.value })}
                disabled={!canManageSettings}
                required
              />
              <Input
                label="Official Phone *"
                value={settings.phone}
                onChange={(e) => setSettings({ ...settings, phone: e.target.value })}
                disabled={!canManageSettings}
                required
              />
            </div>

            <Input
              label="Registered Campus Address *"
              value={settings.address}
              onChange={(e) => setSettings({ ...settings, address: e.target.value })}
              disabled={!canManageSettings}
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
                label="GSTIN / GST Number *"
                placeholder="e.g. 36AAACN1234F1Z8"
                value={settings.gst_number || ''}
                onChange={(e) => setSettings({ ...settings, gst_number: e.target.value.toUpperCase() })}
                disabled={!canManageSettings}
                required
              />
              <Input
                label="Default Currency Code *"
                value={settings.default_currency}
                onChange={(e) => setSettings({ ...settings, default_currency: e.target.value })}
                disabled={!canManageSettings}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Academic Year *"
                value={settings.academic_year}
                onChange={(e) => setSettings({ ...settings, academic_year: e.target.value })}
                disabled={!canManageSettings}
                required
              />
              <Input
                label="Default Timezone *"
                value={settings.timezone}
                onChange={(e) => setSettings({ ...settings, timezone: e.target.value })}
                disabled={!canManageSettings}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Receipt Sequence Prefix"
                value={settings.receipt_prefix}
                onChange={(e) => setSettings({ ...settings, receipt_prefix: e.target.value })}
                disabled={!canManageSettings}
              />
              <Input
                label="Invoice Sequence Prefix"
                value={settings.invoice_prefix}
                onChange={(e) => setSettings({ ...settings, invoice_prefix: e.target.value })}
                disabled={!canManageSettings}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Authorized Signatory Name"
                placeholder="e.g. Dr. Rajesh Kumar"
                value={settings.authorized_signatory_name || ''}
                onChange={(e) => setSettings({ ...settings, authorized_signatory_name: e.target.value })}
                disabled={!canManageSettings}
              />
              <Input
                label="Signatory Designation"
                placeholder="e.g. Managing Director & Academic Dean"
                value={settings.authorized_signatory_designation || ''}
                onChange={(e) => setSettings({ ...settings, authorized_signatory_designation: e.target.value })}
                disabled={!canManageSettings}
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-slate-700">Official Invoice & Receipt Terms</label>
              <textarea
                rows={2}
                value={settings.invoice_terms || ''}
                onChange={(e) => setSettings({ ...settings, invoice_terms: e.target.value })}
                disabled={!canManageSettings}
                placeholder="e.g. Full payment required before course completion certificate is generated."
                className="w-full text-xs p-2.5 rounded-md border border-slate-300 focus:outline-none focus:ring-1 focus:ring-[#0A6ED1] focus:border-[#0A6ED1] disabled:bg-slate-50 disabled:text-slate-400"
              />
            </div>
          </CardContent>
        </Card>

        {/* Bank & Settlement Details */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Official Bank & Settlement Accounts</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Bank Name"
                placeholder="e.g. HDFC Bank Ltd"
                value={settings.bank_name || ''}
                onChange={(e) => setSettings({ ...settings, bank_name: e.target.value })}
                disabled={!canManageSettings}
              />
              <Input
                label="Beneficiary / Account Name"
                placeholder="e.g. NEXT GEN ERP SOLUTIONS PRIVATE LIMITED"
                value={settings.bank_account_name || ''}
                onChange={(e) => setSettings({ ...settings, bank_account_name: e.target.value })}
                disabled={!canManageSettings}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Account Number"
                placeholder="e.g. 50200088991122"
                value={settings.bank_account_no || settings.bank_account_number || ''}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    bank_account_no: e.target.value,
                    bank_account_number: e.target.value,
                  })
                }
                disabled={!canManageSettings}
              />
              <Input
                label="IFSC Code"
                placeholder="e.g. HDFC0000123"
                value={settings.bank_ifsc || ''}
                onChange={(e) => setSettings({ ...settings, bank_ifsc: e.target.value })}
                disabled={!canManageSettings}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Branch Location"
                placeholder="e.g. Hitec City, Hyderabad"
                value={settings.bank_branch || ''}
                onChange={(e) => setSettings({ ...settings, bank_branch: e.target.value })}
                disabled={!canManageSettings}
              />
              <Input
                label="Primary Institute UPI VPA ID"
                placeholder="e.g. nextgenerp@hdfcbank"
                value={settings.upi_id || ''}
                onChange={(e) => setSettings({ ...settings, upi_id: e.target.value })}
                disabled={!canManageSettings}
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
            <label className={`flex items-center space-x-2 ${canManageSettings ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`}>
              <input
                type="checkbox"
                checked={settings.enable_email_notifications}
                onChange={(e) =>
                  setSettings({ ...settings, enable_email_notifications: e.target.checked })
                }
                disabled={!canManageSettings}
                className="rounded border-slate-300 text-[#0A6ED1] focus:ring-[#0A6ED1]"
              />
              <span className="font-medium text-slate-800">Enable Automated Email Dispatch</span>
            </label>

            <label className={`flex items-center space-x-2 ${canManageSettings ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`}>
              <input
                type="checkbox"
                checked={settings.enable_whatsapp_notifications}
                onChange={(e) =>
                  setSettings({ ...settings, enable_whatsapp_notifications: e.target.checked })
                }
                disabled={!canManageSettings}
                className="rounded border-slate-300 text-[#0A6ED1] focus:ring-[#0A6ED1]"
              />
              <span className="font-medium text-slate-800">Enable Instant WhatsApp Fee Receipt & Class Alerts</span>
            </label>

            <label className={`flex items-center space-x-2 ${canManageSettings ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`}>
              <input
                type="checkbox"
                checked={settings.enable_sms_notifications}
                onChange={(e) =>
                  setSettings({ ...settings, enable_sms_notifications: e.target.checked })
                }
                disabled={!canManageSettings}
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
              {canManageSettings && (
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
              )}
            </div>
          </CardContent>
        </Card>

        {canManageSettings ? (
          <div className="flex justify-end">
            <Button type="submit" variant="sap" size="md" disabled={isSaving} className="text-xs flex items-center space-x-1">
              <Save className={`h-4 w-4 ${isSaving ? 'animate-spin' : ''}`} />
              <span>{isSaving ? 'Saving Settings...' : 'Save System Settings'}</span>
            </Button>
          </div>
        ) : (
          <div className="flex justify-end">
            <Button type="button" variant="outline" size="md" disabled className="text-xs text-slate-400 cursor-not-allowed">
              Read-Only Configuration (Admin Required)
            </Button>
          </div>
        )}
      </form>
    </div>
  );
}
