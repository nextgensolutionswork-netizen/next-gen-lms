'use client';

import * as React from 'react';
import {
  Server,
  Plus,
  Search,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Key,
  Download,
  Copy,
  Check,
  ShieldCheck,
  ExternalLink,
  RefreshCw,
  XCircle,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { store } from '@/lib/services/data-store';
import {
  getSapSystems,
  getSapAllocations,
  provisionSapAccess,
  extendSapAccess,
  revokeSapAccess,
  generateSapGuiShortcutContent,
} from '@/lib/services/sap-lab-service';
import { SapServerAllocation, SapServerSystem } from '@/types';
import { formatDate } from '@/lib/utils/formatters';

export default function SapServersPage() {
  const [systems, setSystems] = React.useState<SapServerSystem[]>(store.sapSystems);
  const [allocations, setAllocations] = React.useState<SapServerAllocation[]>(store.sapAllocations);
  const [search, setSearch] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState<'All' | 'Active' | 'Expired' | 'Revoked'>('All');
  const [isProvisionModalOpen, setIsProvisionModalOpen] = React.useState(false);
  const [copiedKey, setCopiedKey] = React.useState<string | null>(null);

  // Form State
  const [selectedStudentId, setSelectedStudentId] = React.useState(store.students[0]?.id || '');
  const [selectedSystemId, setSelectedSystemId] = React.useState(store.sapSystems[0]?.id || '');
  const [customClient, setCustomClient] = React.useState('800');
  const [validMonths, setValidMonths] = React.useState(3);
  const [customUserId, setCustomUserId] = React.useState('');
  const [customPassword, setCustomPassword] = React.useState('');
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  const refreshData = async () => {
    const s = await getSapSystems();
    const a = await getSapAllocations();
    setSystems(s);
    setAllocations(a);
  };

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleDownloadShortcut = (alloc: SapServerAllocation) => {
    const content = generateSapGuiShortcutContent(alloc);
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${alloc.sid}_${alloc.sap_user_id}.sap`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleProvision = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    try {
      await provisionSapAccess(
        {
          student_id: selectedStudentId,
          system_id: selectedSystemId,
          client_number: customClient,
          valid_months: validMonths,
          sap_user_id: customUserId || undefined,
          sap_password: customPassword || undefined,
        },
        'usr-admin'
      );
      setIsProvisionModalOpen(false);
      setCustomUserId('');
      setCustomPassword('');
      refreshData();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to provision access');
    }
  };

  const handleExtend = async (allocId: string) => {
    const alloc = allocations.find((a) => a.id === allocId);
    if (!alloc) return;
    const current = new Date(alloc.valid_to);
    current.setMonth(current.getMonth() + 1); // +30 days
    await extendSapAccess(allocId, current.toISOString().slice(0, 10), 'usr-admin');
    refreshData();
  };

  const handleRevoke = async (allocId: string) => {
    if (confirm('Are you sure you want to revoke this student SAP sandbox access?')) {
      await revokeSapAccess(allocId, 'usr-admin');
      refreshData();
    }
  };

  const filteredAllocations = allocations.filter((alloc) => {
    if (statusFilter !== 'All' && alloc.status !== statusFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        alloc.student_name.toLowerCase().includes(q) ||
        alloc.sap_user_id.toLowerCase().includes(q) ||
        alloc.admission_number.toLowerCase().includes(q) ||
        alloc.system_name.toLowerCase().includes(q) ||
        alloc.sid.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <div className="h-8 w-8 rounded-lg bg-[#0A6ED1] text-white flex items-center justify-center">
              <Server className="h-4 w-4" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">SAP Lab Servers & Sandbox Access</h1>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Provision and manage student SAP GUI logon credentials, remote server endpoints, client allocations, and sandbox validity periods.
          </p>
        </div>

        <Button
          variant="sap"
          size="sm"
          onClick={() => {
            setErrorMessage(null);
            setIsProvisionModalOpen(true);
          }}
          className="flex items-center space-x-1.5 text-xs shadow-xs"
        >
          <Plus className="h-4 w-4" />
          <span>Provision SAP Access</span>
        </Button>
      </div>

      {/* Systems Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {systems.map((sys) => {
          const activeCount = allocations.filter((a) => a.system_id === sys.id && a.status === 'Active').length;
          return (
            <Card key={sys.id} className="border-l-4 border-l-[#0A6ED1] shadow-xs">
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                      SID: {sys.sid} | Instance: {sys.instance_number}
                    </span>
                    <h3 className="font-bold text-slate-900 text-sm mt-1">{sys.system_name}</h3>
                    <p className="text-xs text-slate-500 mt-0.5">{sys.description}</p>
                  </div>
                  <Badge variant="success" className="text-[10px]">
                    {sys.status}
                  </Badge>
                </div>

                <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-slate-100 text-xs">
                  <div>
                    <p className="text-[10px] text-slate-400 uppercase font-semibold">Server Host</p>
                    <p className="font-mono text-slate-800 text-[11px] truncate">{sys.server_host}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400 uppercase font-semibold">Default Client</p>
                    <p className="font-bold text-slate-800">{sys.default_client}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400 uppercase font-semibold">Active Trainees</p>
                    <p className="font-bold text-[#0A6ED1]">{activeCount} Allocated</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Filter and Search Bar */}
      <Card className="p-4">
        <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search student, SAP user ID, SID, or admission #..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-[#0A6ED1]"
            />
          </div>

          <div className="flex items-center space-x-2">
            <span className="text-xs text-slate-500 font-medium">Status:</span>
            {(['All', 'Active', 'Expired', 'Revoked'] as const).map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1 rounded text-xs font-semibold transition-colors ${
                  statusFilter === st
                    ? 'bg-[#0A6ED1] text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {st}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* Trainee SAP Allocations Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 text-slate-600 uppercase border-b border-slate-100 font-semibold">
                <tr>
                  <th className="px-4 py-3">Trainee / Admission</th>
                  <th className="px-4 py-3">SAP System (SID)</th>
                  <th className="px-4 py-3">Client</th>
                  <th className="px-4 py-3">SAP User ID</th>
                  <th className="px-4 py-3">Password</th>
                  <th className="px-4 py-3">Validity Window</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredAllocations.map((alloc) => (
                  <tr key={alloc.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-bold text-slate-800">{alloc.student_name}</p>
                      <p className="text-[10px] text-slate-400">{alloc.admission_number}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-800">{alloc.sid} ({alloc.instance_number})</p>
                      <p className="text-[10px] text-slate-500">{alloc.course_name}</p>
                    </td>
                    <td className="px-4 py-3 font-mono font-bold text-slate-700">{alloc.client_number}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center space-x-1 font-mono font-bold text-[#0A6ED1]">
                        <span>{alloc.sap_user_id}</span>
                        <button
                          onClick={() => handleCopy(alloc.sap_user_id, `usr-${alloc.id}`)}
                          className="text-slate-400 hover:text-slate-600 p-0.5"
                          title="Copy User ID"
                        >
                          {copiedKey === `usr-${alloc.id}` ? (
                            <Check className="h-3 w-3 text-emerald-600" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center space-x-1 font-mono text-slate-600">
                        <span>{alloc.sap_password}</span>
                        <button
                          onClick={() => handleCopy(alloc.sap_password, `pwd-${alloc.id}`)}
                          className="text-slate-400 hover:text-slate-600 p-0.5"
                          title="Copy Password"
                        >
                          {copiedKey === `pwd-${alloc.id}` ? (
                            <Check className="h-3 w-3 text-emerald-600" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      <p className="text-[11px]">{formatDate(alloc.valid_from)} &rarr; <strong className="text-slate-800">{formatDate(alloc.valid_to)}</strong></p>
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        variant={
                          alloc.status === 'Active'
                            ? 'success'
                            : alloc.status === 'Expired'
                            ? 'warning'
                            : 'destructive'
                        }
                      >
                        {alloc.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right space-x-1 whitespace-nowrap">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDownloadShortcut(alloc)}
                        className="text-xs px-2 py-1 flex-inline items-center space-x-1"
                        title="Download .sap shortcut for instant SAP GUI login"
                      >
                        <Download className="h-3 w-3 text-blue-600" />
                        <span>.sap</span>
                      </Button>
                      {alloc.status === 'Active' && (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleExtend(alloc.id)}
                            className="text-xs px-2 py-1 text-slate-600 hover:text-slate-900"
                            title="Extend 30 Days"
                          >
                            +30d
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRevoke(alloc.id)}
                            className="text-xs px-2 py-1 text-red-600 hover:text-red-700 hover:bg-red-50"
                            title="Revoke Access"
                          >
                            Revoke
                          </Button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Provision SAP Access Modal */}
      <Modal
        isOpen={isProvisionModalOpen}
        onClose={() => setIsProvisionModalOpen(false)}
        title="Provision Student SAP GUI Sandbox Access"
        description="Allocate dedicated user profile and client credentials on the practice server."
      >
        <form onSubmit={handleProvision} className="space-y-4 text-xs">
          {errorMessage && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 flex items-center space-x-2">
              <AlertTriangle className="h-4 w-4 flex-shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
              Select Enrolled Student *
            </label>
            <select
              value={selectedStudentId}
              onChange={(e) => setSelectedStudentId(e.target.value)}
              className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:ring-2 focus:ring-[#0A6ED1]"
            >
              {store.students.map((st) => (
                <option key={st.id} value={st.id}>
                  {st.full_name} ({st.student_code} — {st.course_name})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
              Select SAP Sandbox Server *
            </label>
            <select
              value={selectedSystemId}
              onChange={(e) => {
                setSelectedSystemId(e.target.value);
                const sys = systems.find((s) => s.id === e.target.value);
                if (sys) setCustomClient(sys.default_client);
              }}
              className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:ring-2 focus:ring-[#0A6ED1]"
            >
              {systems.map((sys) => (
                <option key={sys.id} value={sys.id}>
                  {sys.system_name} (SID: {sys.sid}, Client: {sys.default_client})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Client Number"
              placeholder="800"
              value={customClient}
              onChange={(e) => setCustomClient(e.target.value)}
              required
            />
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Validity Duration
              </label>
              <select
                value={validMonths}
                onChange={(e) => setValidMonths(Number(e.target.value))}
                className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800"
              >
                <option value={1}>1 Month (Crash Course)</option>
                <option value={2}>2 Months</option>
                <option value={3}>3 Months (Standard Program)</option>
                <option value={6}>6 Months (Master Program)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Custom SAP User ID (Optional)"
              placeholder="Leave blank to auto-generate"
              value={customUserId}
              onChange={(e) => setCustomUserId(e.target.value)}
            />
            <Input
              label="Custom Password (Optional)"
              placeholder="Leave blank to auto-generate"
              value={customPassword}
              onChange={(e) => setCustomPassword(e.target.value)}
            />
          </div>

          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-slate-700 space-y-1">
            <p className="font-bold text-[#0A6ED1]">Automatic Actions upon Provisioning:</p>
            <ul className="list-disc list-inside space-y-0.5 text-[11px]">
              <li>Credentials become immediately visible in the student&apos;s LMS portal.</li>
              <li>A pre-configured Windows `.sap` shortcut is generated for 1-click GUI logon.</li>
              <li>An immutable audit log record is created for institutional tracking.</li>
            </ul>
          </div>

          <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
            <Button type="button" variant="outline" size="sm" onClick={() => setIsProvisionModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="sap" size="sm">
              Confirm & Provision Access
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
