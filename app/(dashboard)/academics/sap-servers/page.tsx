'use client';

import * as React from 'react';
import {
  Server,
  Plus,
  Search,
  CheckCircle2,
  AlertTriangle,
  Download,
  Copy,
  Check,
  Eye,
  EyeOff,
  Edit3,
  Trash2,
  Wifi,
  KeyRound,
  RefreshCw,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { useAuth } from '@/components/providers/auth-provider';
import { store } from '@/lib/services/data-store';
import {
  getSapSystems,
  getSapAllocations,
  provisionSapAccess,
  extendSapAccess,
  revokeSapAccess,
  resetSapPassword,
  testSapConnection,
  generateSapGuiShortcutContent,
  createSapServerSystem,
  updateSapServerSystem,
  deleteSapServerSystem,
  logSapCredentialAccess,
} from '@/lib/services/sap-lab-service';
import { SapServerAllocation, SapServerSystem } from '@/types';
import { formatDate } from '@/lib/utils/formatters';

export default function SapServersPage() {
  const { user, role, hasPermission } = useAuth();
  const [systems, setSystems] = React.useState<SapServerSystem[]>(store.sapSystems);
  const [allocations, setAllocations] = React.useState<SapServerAllocation[]>(store.sapAllocations);
  const [search, setSearch] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState<'All' | 'Active' | 'Expired' | 'Revoked'>('All');
  const [isProvisionModalOpen, setIsProvisionModalOpen] = React.useState(false);
  const [copiedKey, setCopiedKey] = React.useState<string | null>(null);
  const [revealedPasswords, setRevealedPasswords] = React.useState<Record<string, boolean>>({});

  // Confirmation modal state for revocation
  const [revokeModalAlloc, setRevokeModalAlloc] = React.useState<SapServerAllocation | null>(null);

  const isStudent = role === 'student';
  const canManage = hasPermission('batches:write') || role === 'admin' || role === 'super_admin';

  // Current student resolution
  const currentStudent = React.useMemo(() => {
    if (!isStudent) return null;
    return store.students.find((s) => s.user_id === user?.id || s.email === user?.email) || null;
  }, [isStudent, user]);

  // Dynamic actor resolution (no hardcoded IDs)
  const currentActorId = React.useMemo(() => {
    return (
      user?.id ||
      store.users.find((u) => u.role === 'super_admin' || u.role === 'admin')?.id ||
      store.users[0]?.id ||
      ''
    );
  }, [user]);

  // Role-based password access verification
  const canRevealPassword = React.useCallback(
    (alloc: SapServerAllocation) => {
      if (role === 'admin' || role === 'super_admin' || role === 'trainer') return true;
      if (isStudent && currentStudent && alloc.student_id === currentStudent.id) return true;
      return false;
    },
    [role, isStudent, currentStudent]
  );

  // Form State
  const [selectedStudentId, setSelectedStudentId] = React.useState(store.students[0]?.id || '');
  const [selectedSystemId, setSelectedSystemId] = React.useState(store.sapSystems[0]?.id || '');
  const [customClient, setCustomClient] = React.useState('800');
  const [validMonths, setValidMonths] = React.useState(3);
  const [customUserId, setCustomUserId] = React.useState('');
  const [customPassword, setCustomPassword] = React.useState('');
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [statusMessage, setStatusMessage] = React.useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [testingSysId, setTestingSysId] = React.useState<string | null>(null);

  // Synchronize initial select state if empty or invalid
  React.useEffect(() => {
    if (store.students.length > 0) {
      if (!selectedStudentId || !store.students.some((s) => s.id === selectedStudentId)) {
        setSelectedStudentId(store.students[0].id);
      }
    } else {
      setSelectedStudentId('');
    }
  }, [selectedStudentId]);

  React.useEffect(() => {
    if (systems.length > 0) {
      if (!selectedSystemId || !systems.some((s) => s.id === selectedSystemId)) {
        setSelectedSystemId(systems[0].id);
      }
    } else {
      setSelectedSystemId('');
    }
  }, [systems, selectedSystemId]);

  // Server Infrastructure Management Form State
  const [isServerModalOpen, setIsServerModalOpen] = React.useState(false);
  const [editingServer, setEditingServer] = React.useState<SapServerSystem | null>(null);
  const [serverName, setServerName] = React.useState('');
  const [serverSid, setServerSid] = React.useState('');
  const [serverInstance, setServerInstance] = React.useState('00');
  const [serverHost, setServerHost] = React.useState('');
  const [serverRouter, setServerRouter] = React.useState('');
  const [serverDefaultClient, setServerDefaultClient] = React.useState('800');
  const [serverDescription, setServerDescription] = React.useState('');
  const [serverStatus, setServerStatus] = React.useState<'Online' | 'Maintenance' | 'Offline'>('Online');
  const [serverError, setServerError] = React.useState<string | null>(null);

  const refreshData = async () => {
    const s = await getSapSystems();
    const a = await getSapAllocations();
    setSystems(s);
    setAllocations(a);
  };

  const handleTestConnection = async (sys: SapServerSystem) => {
    setTestingSysId(sys.id);
    try {
      const res = await testSapConnection(sys.id);
      setStatusMessage({
        type: res.success ? 'success' : 'error',
        text: res.message,
      });
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err?.message || 'Connection test failed' });
    } finally {
      setTestingSysId(null);
    }
  };

  const handleResetPassword = async (alloc: SapServerAllocation) => {
    if (!canManage) return;
    if (!window.confirm(`Generate new random SAP sandbox password for ${alloc.student_name} (${alloc.sap_user_id})?`)) {
      return;
    }
    try {
      const res = await resetSapPassword(alloc.id, undefined, currentActorId);
      setStatusMessage({
        type: 'success',
        text: `New SAP password set for ${alloc.student_name}: "${res.generatedPassword}". Student access active.`,
      });
      refreshData();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err?.message || 'Failed to reset password' });
    }
  };

  const togglePasswordVisibility = (allocId: string) => {
    const isCurrentlyRevealed = Boolean(revealedPasswords[allocId]);
    if (!isCurrentlyRevealed) {
      // Audit log credential reveal
      logSapCredentialAccess(allocId, 'REVEAL', currentActorId).catch((err) => {
        console.warn('Failed to record audit log for password reveal:', err);
      });
    }
    setRevealedPasswords((prev) => ({ ...prev, [allocId]: !isCurrentlyRevealed }));
  };

  const handleCopy = (text: string, key: string, alloc?: SapServerAllocation, isPassword?: boolean) => {
    if (alloc && !canRevealPassword(alloc)) {
      setStatusMessage({ type: 'error', text: 'You are not authorized to copy student credentials.' });
      return;
    }
    if (alloc) {
      const accessType = isPassword ? 'COPY_PASSWORD' : 'COPY_USER_ID';
      logSapCredentialAccess(alloc.id, accessType, currentActorId).catch((err) => {
        console.warn('Failed to record audit log for credential copy:', err);
      });
    }
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
    if (!canManage) return;
    setErrorMessage(null);

    const targetStudentId = selectedStudentId || store.students[0]?.id;
    const targetSystemId = selectedSystemId || systems[0]?.id;

    if (!targetStudentId) {
      setErrorMessage('No enrolled student found to allocate access. Please enroll students first.');
      return;
    }
    if (!targetSystemId) {
      setErrorMessage('No SAP server system available. Please configure an SAP server endpoint first.');
      return;
    }

    // Verify system capacity
    const targetSys = systems.find((s) => s.id === targetSystemId);
    if (!targetSys) {
      setErrorMessage('Selected SAP server system is invalid or no longer exists.');
      return;
    }
    const activeSysCount = allocations.filter((a) => a.system_id === targetSystemId && a.status === 'Active').length;
    const targetCapacity = (targetSys as any)?.capacity || 50;
    if (activeSysCount >= targetCapacity) {
      setErrorMessage(`SAP Server ${targetSys.sid} is at maximum capacity (${targetCapacity} users). Please extend system quota or select another server.`);
      return;
    }

    try {
      await provisionSapAccess(
        {
          student_id: targetStudentId,
          system_id: targetSystemId,
          client_number: customClient,
          valid_months: validMonths,
          sap_user_id: customUserId.trim() || undefined,
          sap_password: customPassword.trim() || undefined,
        },
        currentActorId
      );
      setIsProvisionModalOpen(false);
      setCustomUserId('');
      setCustomPassword('');
      setStatusMessage({ type: 'success', text: 'SAP Sandbox credentials generated and activated.' });
      refreshData();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to provision access');
    }
  };

  const handleExtend = async (allocId: string) => {
    if (!canManage) return;
    const alloc = allocations.find((a) => a.id === allocId);
    if (!alloc) return;
    const current = new Date(alloc.valid_to);
    current.setMonth(current.getMonth() + 1); // +30 days
    try {
      await extendSapAccess(allocId, current.toISOString().slice(0, 10), currentActorId);
      setStatusMessage({ type: 'success', text: `Validity extended by 30 days for ${alloc.student_name}.` });
      refreshData();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err?.message || 'Failed to extend access' });
    }
  };

  const confirmRevoke = async () => {
    if (!revokeModalAlloc || !canManage) return;
    try {
      await revokeSapAccess(revokeModalAlloc.id, currentActorId);
      setStatusMessage({ type: 'success', text: `SAP Access revoked for ${revokeModalAlloc.student_name}.` });
      setRevokeModalAlloc(null);
      refreshData();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err?.message || 'Failed to revoke access' });
    }
  };

  // Server Management Handlers
  const openAddServerModal = () => {
    setEditingServer(null);
    setServerName('');
    setServerSid('');
    setServerInstance('00');
    setServerHost('');
    setServerRouter('');
    setServerDefaultClient('800');
    setServerDescription('');
    setServerStatus('Online');
    setServerError(null);
    setIsServerModalOpen(true);
  };

  const openEditServerModal = (sys: SapServerSystem) => {
    setEditingServer(sys);
    setServerName(sys.system_name);
    setServerSid(sys.sid);
    setServerInstance(sys.instance_number);
    setServerHost(sys.server_host || (sys as any).ip_or_host || '');
    setServerRouter(sys.sap_router || '');
    setServerDefaultClient(sys.default_client);
    setServerDescription(sys.description);
    setServerStatus(sys.status);
    setServerError(null);
    setIsServerModalOpen(true);
  };

  const handleSaveServer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManage) return;
    setServerError(null);

    if (!serverName.trim() || !serverSid.trim() || !serverHost.trim()) {
      setServerError('Please provide System Name, SID (3 letters), and Server Host.');
      return;
    }

    try {
      if (editingServer) {
        await updateSapServerSystem(
          editingServer.id,
          {
            system_name: serverName.trim(),
            sid: serverSid.toUpperCase().trim(),
            instance_number: serverInstance.trim() || '00',
            server_host: serverHost.trim(),
            sap_router: serverRouter.trim() || undefined,
            default_client: serverDefaultClient.trim() || '800',
            description: serverDescription.trim(),
            status: serverStatus,
          },
          currentActorId
        );
        setStatusMessage({ type: 'success', text: `SAP System ${serverSid.toUpperCase()} updated successfully.` });
      } else {
        await createSapServerSystem(
          {
            system_name: serverName.trim(),
            sid: serverSid.toUpperCase().trim(),
            instance_number: serverInstance.trim() || '00',
            server_host: serverHost.trim(),
            sap_router: serverRouter.trim() || undefined,
            default_client: serverDefaultClient.trim() || '800',
            description: serverDescription.trim(),
            status: serverStatus,
          },
          currentActorId
        );
        setStatusMessage({ type: 'success', text: `New SAP System ${serverSid.toUpperCase()} configured and available.` });
      }
      setIsServerModalOpen(false);
      refreshData();
    } catch (err: any) {
      setServerError(err.message || 'Failed to save SAP Server System');
    }
  };

  const handleDeleteServer = async (sys: SapServerSystem) => {
    if (!canManage) return;
    if (!window.confirm(`Are you sure you want to delete SAP Server System ${sys.sid} (${sys.system_name})?`)) {
      return;
    }
    try {
      await deleteSapServerSystem(sys.id, currentActorId);
      setStatusMessage({ type: 'success', text: `SAP System ${sys.sid} deleted.` });
      refreshData();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Failed to delete server system' });
    }
  };

  // Scoped allocations
  const scopedAllocations = React.useMemo(() => {
    if (isStudent && currentStudent) {
      return allocations.filter((a) => a.student_id === currentStudent.id);
    }
    return allocations;
  }, [allocations, isStudent, currentStudent]);

  const filteredAllocations = scopedAllocations.filter((alloc) => {
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
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              {isStudent ? 'My SAP Server Sandbox' : 'SAP Server Management & Sandbox Allocations'}
            </h1>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            {isStudent
              ? 'Your dedicated SAP GUI logon parameters, sandbox credentials, and 1-click shortcut launcher.'
              : 'Provision, monitor, and revoke enterprise SAP S/4HANA sandboxes for enrolled students with automated SAP GUI shortcut generation.'}
          </p>
        </div>

        {canManage && (
          <div className="flex items-center space-x-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={openAddServerModal}
              className="text-xs flex items-center space-x-1 border-blue-200 text-blue-700 hover:bg-blue-50"
            >
              <Server className="h-4 w-4" />
              <span>Add SAP Server</span>
            </Button>
            <Button
              type="button"
              variant="sap"
              size="sm"
              onClick={() => {
                setErrorMessage(null);
                if (!selectedStudentId && store.students.length > 0) {
                  setSelectedStudentId(store.students[0].id);
                }
                if (!selectedSystemId && systems.length > 0) {
                  setSelectedSystemId(systems[0].id);
                }
                setIsProvisionModalOpen(true);
              }}
              className="text-xs flex items-center space-x-1"
            >
              <Plus className="h-4 w-4" />
              <span>Provision Sandbox Access</span>
            </Button>
          </div>
        )}
      </div>

      {statusMessage && (
        <div
          className={`p-3 rounded-lg text-xs font-semibold flex items-center justify-between ${
            statusMessage.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-rose-50 text-rose-800 border border-rose-200'
          }`}
        >
          <div className="flex items-center space-x-2">
            {statusMessage.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
            )}
            <span>{statusMessage.text}</span>
          </div>
          <button onClick={() => setStatusMessage(null)} className="text-slate-400 hover:text-slate-600 text-xs ml-4">
            Dismiss
          </button>
        </div>
      )}

      {/* SAP Systems Infrastructure Status Cards (Visible to Faculty / Admin) */}
      {!isStudent && (
        <>
          {systems.length === 0 ? (
            <Card className="border-dashed border-2 border-slate-200 p-8 text-center bg-slate-50/50">
              <div className="max-w-md mx-auto space-y-3">
                <div className="h-10 w-10 rounded-full bg-blue-100 text-[#0A6ED1] flex items-center justify-center mx-auto">
                  <Server className="h-5 w-5" />
                </div>
                <h3 className="font-bold text-slate-800 text-sm">No SAP Server Infrastructure Configured</h3>
                <p className="text-xs text-slate-500">
                  No enterprise SAP S/4HANA or ECC servers are currently registered. Register an SAP host endpoint to start provisioning student sandboxes.
                </p>
                {canManage && (
                  <Button
                    type="button"
                    size="sm"
                    variant="sap"
                    onClick={openAddServerModal}
                    className="text-xs"
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Add First SAP Server
                  </Button>
                )}
              </div>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {systems.map((sys) => {
            const activeCount = allocations.filter((a) => a.system_id === sys.id && a.status === 'Active').length;
            const maxCap = (sys as any).capacity || 50;
            const usagePercent = Math.round((activeCount / maxCap) * 100);
            return (
              <Card key={sys.id} className="hover:border-[#0A6ED1] transition-all flex flex-col justify-between">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700 bg-blue-100 px-2 py-0.5 rounded">
                        SID: {sys.sid} ({sys.instance_number})
                      </span>
                      <h3 className="font-bold text-slate-900 text-sm mt-1">{sys.system_name}</h3>
                      <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                        {sys.server_host || (sys as any).ip_or_host}
                      </p>
                    </div>
                    <Badge
                      variant={
                        sys.status === 'Online'
                          ? 'success'
                          : sys.status === 'Maintenance'
                          ? 'warning'
                          : 'destructive'
                      }
                    >
                      {sys.status}
                    </Badge>
                  </div>

                  <div className="space-y-1.5 pt-1">
                    <div className="flex justify-between text-xs text-slate-600">
                      <span>Server Capacity:</span>
                      <span className="font-semibold text-slate-900">
                        {activeCount} / {maxCap} trainees ({usagePercent}%)
                      </span>
                    </div>
                    <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all ${
                          usagePercent > 90 ? 'bg-rose-500' : usagePercent > 75 ? 'bg-amber-500' : 'bg-emerald-500'
                        }`}
                        style={{ width: `${Math.min(100, usagePercent)}%` }}
                      />
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-100 flex items-center justify-end space-x-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleTestConnection(sys)}
                      disabled={testingSysId === sys.id}
                      className="text-[11px] h-6 px-2 text-emerald-700 border-emerald-200 hover:bg-emerald-50"
                      title="Ping RFC / CPIC Server Port"
                    >
                      {testingSysId === sys.id ? (
                        <RefreshCw className="h-3 w-3 mr-1 animate-spin text-emerald-600" />
                      ) : (
                        <Wifi className="h-3 w-3 mr-1 text-emerald-600" />
                      )}
                      <span>{testingSysId === sys.id ? 'Pinging...' : 'Ping'}</span>
                    </Button>
                    {canManage && (
                      <>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => openEditServerModal(sys)}
                          className="text-[11px] h-6 px-2 text-slate-600 hover:text-slate-900"
                          title="Edit SAP Server Endpoint"
                        >
                          <Edit3 className="h-3 w-3 mr-1" />
                          <span>Edit</span>
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => handleDeleteServer(sys)}
                          className="text-[11px] h-6 px-2 text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                          title="Delete SAP Server Endpoint"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </>
  )}

      {/* Filters and Search Bar */}
      <Card className="p-4">
        <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
          <div className="relative w-full sm:w-80">
            <Search className="h-4 w-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search by student, admission #, user ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full text-xs bg-white border border-slate-300 rounded-lg pl-9 pr-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#0A6ED1]"
            />
          </div>

          <div className="flex items-center space-x-1.5 w-full sm:w-auto overflow-x-auto">
            {(['All', 'Active', 'Expired', 'Revoked'] as const).map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
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

      {/* Student Enrollment Profile Notice */}
      {isStudent && !currentStudent && (
        <Card className="p-8 text-center border-dashed border-amber-200 bg-amber-50/50">
          <AlertTriangle className="h-10 w-10 text-amber-500 mx-auto mb-2" />
          <h3 className="font-semibold text-slate-800 text-sm">Student Enrollment Profile Not Linked</h3>
          <p className="text-xs text-slate-600 mt-1 max-w-md mx-auto">
            No enrolled student record is linked to your account ({user?.email}). Please contact your institute administrator.
          </p>
        </Card>
      )}

      {/* Trainee SAP Allocations Table */}
      <Card>
        <CardContent className="p-0">
          {filteredAllocations.length === 0 ? (
            <div className="p-12 text-center">
              <Server className="h-10 w-10 text-slate-300 mx-auto mb-2" />
              <p className="text-xs text-slate-500 italic">
                {isStudent
                  ? 'No active SAP sandbox credentials allocated yet. Contact your administrator.'
                  : 'No SAP allocations found matching your search criteria.'}
              </p>
            </div>
          ) : (
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
                  {filteredAllocations.map((alloc) => {
                    const isAllowedToView = canRevealPassword(alloc);
                    const isRevealed = isAllowedToView && Boolean(revealedPasswords[alloc.id]);
                    const isExpired = new Date(alloc.valid_to).getTime() < Date.now();

                    return (
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
                              onClick={() => handleCopy(alloc.sap_user_id, `usr-${alloc.id}`, alloc, false)}
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
                            <span>{isRevealed ? alloc.sap_password : '••••••••'}</span>
                            {isAllowedToView ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => togglePasswordVisibility(alloc.id)}
                                  className="text-slate-400 hover:text-slate-600 p-0.5 ml-1"
                                  title={isRevealed ? 'Hide Password' : 'Click to Reveal Password'}
                                >
                                  {isRevealed ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleCopy(alloc.sap_password, `pwd-${alloc.id}`, alloc, true)}
                                  className="text-slate-400 hover:text-slate-600 p-0.5"
                                  title="Copy Password"
                                >
                                  {copiedKey === `pwd-${alloc.id}` ? (
                                    <Check className="h-3 w-3 text-emerald-600" />
                                  ) : (
                                    <Copy className="h-3 w-3" />
                                  )}
                                </button>
                              </>
                            ) : (
                              <span className="text-[10px] text-slate-400 italic ml-1 select-none">(Masked)</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          <p className="text-[11px]">
                            {formatDate(alloc.valid_from)} &rarr;{' '}
                            <strong className={isExpired ? 'text-rose-600' : 'text-slate-800'}>
                              {formatDate(alloc.valid_to)}
                            </strong>
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          <Badge
                            variant={
                              alloc.status === 'Active' && !isExpired
                                ? 'success'
                                : alloc.status === 'Expired' || isExpired
                                ? 'warning'
                                : 'destructive'
                            }
                          >
                            {isExpired && alloc.status === 'Active' ? 'Expired' : alloc.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end space-x-1.5">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDownloadShortcut(alloc)}
                              className="text-[11px] h-7 px-2 border-blue-200 text-blue-700 hover:bg-blue-50"
                              title="Download 1-Click SAP GUI Shortcut (.sap file)"
                            >
                              <Download className="h-3 w-3 mr-1" />
                              <span>Shortcut</span>
                            </Button>

                            {canManage && (
                              <>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleResetPassword(alloc)}
                                  className="text-[11px] h-7 px-2 text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50"
                                  title="Reset SAP Password & notify student"
                                >
                                  <KeyRound className="h-3 w-3 mr-0.5" />
                                  <span>Reset</span>
                                </Button>

                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleExtend(alloc.id)}
                                  className="text-[11px] h-7 px-2 text-slate-600 hover:text-slate-900"
                                >
                                  +30 Days
                                </Button>

                                {alloc.status === 'Active' && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setRevokeModalAlloc(alloc)}
                                    className="text-[11px] h-7 px-2 text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                                  >
                                    Revoke
                                  </Button>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Revocation Confirmation Modal */}
      {revokeModalAlloc && (
        <Modal
          isOpen={Boolean(revokeModalAlloc)}
          onClose={() => setRevokeModalAlloc(null)}
          title="Confirm SAP Sandbox Access Revocation"
          description="Are you sure you want to revoke this student's SAP sandbox access? This will terminate active server sessions."
        >
          <div className="space-y-4 text-xs">
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-800">
              <p><strong>Student:</strong> {revokeModalAlloc.student_name} ({revokeModalAlloc.admission_number})</p>
              <p className="mt-1"><strong>Server:</strong> {revokeModalAlloc.system_name} ({revokeModalAlloc.sid})</p>
              <p className="mt-1"><strong>SAP User ID:</strong> {revokeModalAlloc.sap_user_id}</p>
            </div>

            <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
              <Button variant="outline" size="sm" onClick={() => setRevokeModalAlloc(null)}>
                Cancel
              </Button>
              <Button variant="destructive" size="sm" onClick={confirmRevoke}>
                Confirm Revocation
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Provision Access Modal */}
      <Modal
        isOpen={isProvisionModalOpen}
        onClose={() => setIsProvisionModalOpen(false)}
        title="Provision Student SAP Sandbox Access"
        description="Allocate credentials, client access, and generate auto-login parameters."
      >
        <form onSubmit={handleProvision} className="space-y-4 text-xs">
          {errorMessage && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-xs font-semibold">
              {errorMessage}
            </div>
          )}

          {systems.length === 0 && (
            <div className="p-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg text-xs space-y-2">
              <div className="flex items-center space-x-1.5 font-bold">
                <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                <span>No SAP Server Endpoints Available</span>
              </div>
              <p>You must configure at least one SAP enterprise server before provisioning student sandbox access.</p>
              {canManage && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setIsProvisionModalOpen(false);
                    openAddServerModal();
                  }}
                  className="text-xs border-amber-300 text-amber-900 hover:bg-amber-100"
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Add SAP Server Endpoint Now
                </Button>
              )}
            </div>
          )}

          {store.students.length === 0 && (
            <div className="p-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg text-xs">
              <div className="flex items-center space-x-1.5 font-bold">
                <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                <span>No Enrolled Students Available</span>
              </div>
              <p className="mt-1">Please admit and register students before allocating SAP sandbox access.</p>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
              Select Enrolled Student *
            </label>
            <select
              value={selectedStudentId}
              onChange={(e) => setSelectedStudentId(e.target.value)}
              disabled={store.students.length === 0}
              className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800 disabled:bg-slate-100 disabled:text-slate-400"
            >
              {store.students.length === 0 ? (
                <option value="">-- No Enrolled Students --</option>
              ) : (
                store.students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.full_name} ({s.student_code} - {s.course_name})
                  </option>
                ))
              )}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
              Target SAP Enterprise System *
            </label>
            <select
              value={selectedSystemId}
              onChange={(e) => setSelectedSystemId(e.target.value)}
              disabled={systems.length === 0}
              className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800 disabled:bg-slate-100 disabled:text-slate-400"
            >
              {systems.length === 0 ? (
                <option value="">-- No SAP Servers Configured --</option>
              ) : (
                systems.map((sys) => (
                  <option key={sys.id} value={sys.id}>
                    {sys.system_name} ({sys.sid} - Inst: {sys.instance_number} - {sys.active_users ?? 0}/{sys.capacity ?? 50} users)
                  </option>
                ))
              )}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Client Number *"
              placeholder="e.g. 800"
              value={customClient}
              onChange={(e) => setCustomClient(e.target.value)}
              required
            />
            <Input
              label="Validity (Months) *"
              type="number"
              min={1}
              max={12}
              value={validMonths}
              onChange={(e) => setValidMonths(Number(e.target.value))}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Custom SAP User ID (Auto if blank)"
              placeholder="e.g. TRAINEE_01"
              value={customUserId}
              onChange={(e) => setCustomUserId(e.target.value)}
            />
            <Input
              label="Custom Password (Auto if blank)"
              placeholder="Default generated"
              value={customPassword}
              onChange={(e) => setCustomPassword(e.target.value)}
            />
          </div>

          <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
            <Button type="button" variant="outline" size="sm" onClick={() => setIsProvisionModalOpen(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="sap"
              size="sm"
              disabled={systems.length === 0 || store.students.length === 0}
            >
              Activate Sandbox Access
            </Button>
          </div>
        </form>
      </Modal>

      {/* Configure SAP Server Endpoint Modal (Add / Edit) */}
      <Modal
        isOpen={isServerModalOpen}
        onClose={() => setIsServerModalOpen(false)}
        title={editingServer ? `Edit SAP Server: ${editingServer.sid}` : 'Add New SAP Server Endpoint'}
        description="Configure enterprise host parameters, SID, instance number, and client configuration."
      >
        <form onSubmit={handleSaveServer} className="space-y-4 text-xs">
          {serverError && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-xs font-semibold">
              {serverError}
            </div>
          )}

          <Input
            label="System Display Name *"
            placeholder="e.g. SAP S/4HANA 2023 Enterprise Sandbox"
            value={serverName}
            onChange={(e) => setServerName(e.target.value)}
            required
          />

          <div className="grid grid-cols-3 gap-3">
            <Input
              label="System ID (SID) *"
              placeholder="e.g. S4H"
              maxLength={3}
              value={serverSid}
              onChange={(e) => setServerSid(e.target.value.toUpperCase())}
              required
            />
            <Input
              label="Instance Number *"
              placeholder="e.g. 00"
              maxLength={2}
              value={serverInstance}
              onChange={(e) => setServerInstance(e.target.value)}
              required
            />
            <Input
              label="Default Client *"
              placeholder="e.g. 800"
              maxLength={3}
              value={serverDefaultClient}
              onChange={(e) => setServerDefaultClient(e.target.value)}
              required
            />
          </div>

          <Input
            label="Server Host / IP *"
            placeholder="e.g. s4h-lab.next-generpsolutions.com"
            value={serverHost}
            onChange={(e) => setServerHost(e.target.value)}
            required
          />

          <Input
            label="SAP Router String (Optional)"
            placeholder="e.g. /H/103.212.120.45/S/3299"
            value={serverRouter}
            onChange={(e) => setServerRouter(e.target.value)}
          />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Operational Status *
              </label>
              <select
                value={serverStatus}
                onChange={(e) => setServerStatus(e.target.value as any)}
                className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800"
              >
                <option value="Online">Online (Operational)</option>
                <option value="Maintenance">Maintenance Mode</option>
                <option value="Offline">Offline</option>
              </select>
            </div>
            <Input
              label="Description / Purpose"
              placeholder="e.g. Dedicated for FICO & MM modules"
              value={serverDescription}
              onChange={(e) => setServerDescription(e.target.value)}
            />
          </div>

          <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
            <Button type="button" variant="outline" size="sm" onClick={() => setIsServerModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="sap" size="sm">
              {editingServer ? 'Save Changes' : 'Create SAP Server Endpoint'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
