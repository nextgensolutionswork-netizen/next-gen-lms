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
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { store } from '@/lib/services/data-store';
import { SystemSettings } from '@/types';

export default function SettingsPage() {
  const [settings, setSettings] = React.useState<SystemSettings>(store.settings);
  const [saved, setSaved] = React.useState(false);

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
