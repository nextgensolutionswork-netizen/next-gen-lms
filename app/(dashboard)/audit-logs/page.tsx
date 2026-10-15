'use client';

import * as React from 'react';
import {
  ShieldAlert,
  Search,
  Clock,
  User,
  Filter,
  Download,
  Code,
  Eye,
  Calendar,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  RotateCcw,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { store } from '@/lib/services/data-store';
import { AuditLog } from '@/types';
import { formatDateTime, exportToCSV } from '@/lib/utils/formatters';
import { useAuth } from '@/components/providers/auth-provider';
import { getAuditLogs } from '@/lib/services/audit-service';

export default function AuditLogsPage() {
  const [search, setSearch] = React.useState('');
  const [selectedModule, setSelectedModule] = React.useState('All');
  const [startDate, setStartDate] = React.useState('');
  const [endDate, setEndDate] = React.useState('');
  const [datePreset, setDatePreset] = React.useState<'all' | 'today' | '7days' | '30days' | 'custom'>('all');
  const [currentPage, setCurrentPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(15);
  const [selectedLog, setSelectedLog] = React.useState<AuditLog | null>(null);
  const [auditLogs, setAuditLogs] = React.useState<AuditLog[]>(store.auditLogs || []);
  const [isLoading, setIsLoading] = React.useState(false);

  const loadLogs = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await getAuditLogs();
      if (Array.isArray(data)) {
        setAuditLogs(data);
      }
    } catch (err) {
      console.warn('Failed to load authoritative audit logs:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const modulesList = React.useMemo(() => {
    const defaultModules = ['All', 'FINANCE', 'ADMISSIONS', 'BATCHES', 'CRM', 'CERTIFICATES', 'USERS', 'SETTINGS', 'ONBOARDING', 'SECURITY'];
    const presentModules = Array.from(new Set(auditLogs.map((l) => l.module).filter(Boolean)));
    return Array.from(new Set([...defaultModules, ...presentModules]));
  }, [auditLogs]);

  const applyDatePreset = (preset: 'all' | 'today' | '7days' | '30days') => {
    setDatePreset(preset);
    setCurrentPage(1);
    const now = new Date();
    if (preset === 'all') {
      setStartDate('');
      setEndDate('');
    } else if (preset === 'today') {
      const d = now.toISOString().split('T')[0];
      setStartDate(d);
      setEndDate(d);
    } else if (preset === '7days') {
      const start = new Date(now.getTime() - 7 * 86400000).toISOString().split('T')[0];
      const end = now.toISOString().split('T')[0];
      setStartDate(start);
      setEndDate(end);
    } else if (preset === '30days') {
      const start = new Date(now.getTime() - 30 * 86400000).toISOString().split('T')[0];
      const end = now.toISOString().split('T')[0];
      setStartDate(start);
      setEndDate(end);
    }
  };

  const handleCustomDateChange = (type: 'start' | 'end', value: string) => {
    setDatePreset('custom');
    setCurrentPage(1);
    if (type === 'start') setStartDate(value);
    else setEndDate(value);
  };

  const clearDateFilters = () => {
    applyDatePreset('all');
  };

  const filteredLogs = React.useMemo(() => {
    let list = [...auditLogs];
    if (selectedModule !== 'All') {
      list = list.filter((l) => l.module?.toUpperCase() === selectedModule.toUpperCase());
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (l) =>
          (l.action && l.action.toLowerCase().includes(q)) ||
          (l.user_name && l.user_name.toLowerCase().includes(q)) ||
          (l.record_id && l.record_id.toLowerCase().includes(q)) ||
          (l.module && l.module.toLowerCase().includes(q))
      );
    }
    if (startDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      list = list.filter((l) => new Date(l.created_at) >= start);
    }
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      list = list.filter((l) => new Date(l.created_at) <= end);
    }
    return list;
  }, [selectedModule, search, startDate, endDate, auditLogs]);

  // Pagination calculations
  const totalRecords = filteredLogs.length;
  const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));
  const safePage = Math.min(Math.max(1, currentPage), totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalRecords);
  const paginatedLogs = filteredLogs.slice(startIndex, endIndex);
  const { role: currentRole, hasPermission } = useAuth();

  const canAccessAudit =
    currentRole === 'admin' ||
    currentRole === 'super_admin' ||
    hasPermission('audit:read') ||
    hasPermission('all:manage');

  if (!canAccessAudit) {
    return (
      <div className="p-8 max-w-xl mx-auto text-center space-y-4">
        <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
          <ShieldAlert className="w-6 h-6" />
        </div>
        <h2 className="text-xl font-bold text-slate-800">Access Restricted</h2>
        <p className="text-sm text-slate-500">
          The forensic audit trail is strictly restricted to Super Administrators and Operational Administrators.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">System Security & Audit Trail</h1>
            <Badge variant="secondary" className="text-[10px] font-mono">
              {filteredLogs.length} / {auditLogs.length} Records
            </Badge>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Tamper-evident system activity log capturing financial collections, batch transfers, and security permissions.
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={loadLogs}
            disabled={isLoading}
            className="text-xs flex items-center space-x-1"
            title="Refresh latest audit trail events"
          >
            <RotateCcw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>{isLoading ? 'Refreshing…' : 'Refresh'}</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => exportToCSV('filtered_audit_logs', filteredLogs)}
            className="text-xs flex items-center space-x-1"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Export Filtered ({filteredLogs.length})</span>
          </Button>
          <Button
            variant="sap"
            size="sm"
            onClick={() => exportToCSV('full_system_audit_trail', auditLogs)}
            className="text-xs flex items-center space-x-1"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Export All ({auditLogs.length})</span>
          </Button>
        </div>
      </div>

      {/* Filter Toolbar: Search, Date Range & Modules */}
      <Card className="p-4 space-y-3.5">
        <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between">
          {/* Keyword Search */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by action, user, module, or record ID..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full pl-9 pr-4 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-[#0A6ED1]"
            />
          </div>

          {/* Date Range Picker */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <div className="flex items-center space-x-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1">
              <Calendar className="h-3.5 w-3.5 text-slate-500" />
              <span className="text-[11px] text-slate-500 font-medium">From:</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => handleCustomDateChange('start', e.target.value)}
                className="bg-transparent text-xs text-slate-800 font-medium focus:outline-none"
              />
              <span className="text-[11px] text-slate-500 font-medium ml-1">To:</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => handleCustomDateChange('end', e.target.value)}
                className="bg-transparent text-xs text-slate-800 font-medium focus:outline-none"
              />
              {(startDate || endDate) && (
                <button
                  onClick={clearDateFilters}
                  className="text-slate-400 hover:text-rose-600 p-0.5 rounded transition-colors ml-1"
                  title="Clear Date Filters"
                >
                  <RotateCcw className="h-3 w-3" />
                </button>
              )}
            </div>

            {/* Quick Date Presets */}
            <div className="flex items-center space-x-1 bg-slate-100 p-0.5 rounded-lg text-[11px]">
              {(
                [
                  { id: 'all', label: 'All Dates' },
                  { id: 'today', label: 'Today' },
                  { id: '7days', label: '7 Days' },
                  { id: '30days', label: '30 Days' },
                ] as const
              ).map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => applyDatePreset(preset.id)}
                  className={`px-2 py-0.5 rounded font-medium transition-colors ${
                    datePreset === preset.id
                      ? 'bg-white text-blue-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Module Filter Pills */}
        <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 pt-1 border-t border-slate-100">
          <span className="text-xs text-slate-500 font-medium whitespace-nowrap">Module:</span>
          {modulesList.map((m) => (
            <button
              key={m}
              onClick={() => {
                setSelectedModule(m);
                setCurrentPage(1);
              }}
              className={`px-2.5 py-1 rounded text-xs font-medium whitespace-nowrap transition-colors ${
                selectedModule === m
                  ? 'bg-[#0A6ED1] text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </Card>

      {/* Main Table with Pagination */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 text-slate-600 uppercase border-b border-slate-100 font-semibold">
                <tr>
                  <th className="px-4 py-3">Timestamp</th>
                  <th className="px-4 py-3">Action</th>
                  <th className="px-4 py-3">Module</th>
                  <th className="px-4 py-3">User & Role</th>
                  <th className="px-4 py-3">Record ID</th>
                  <th className="px-4 py-3">Change Payload</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedLogs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                      No security audit logs found matching criteria.
                    </td>
                  </tr>
                ) : (
                  paginatedLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{formatDateTime(log.created_at)}</td>
                      <td className="px-4 py-3">
                        <span className="font-mono font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                          {log.action}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-700">{log.module}</td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-800">{log.user_name}</p>
                        <p className="text-[10px] text-slate-400 capitalize">{log.user_role}</p>
                      </td>
                      <td className="px-4 py-3 font-mono text-[11px] text-slate-500">{log.record_id}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center space-x-2">
                          <pre className="font-mono text-[10px] bg-slate-100 p-1.5 rounded max-w-xs overflow-x-auto text-slate-800 line-clamp-2">
                            {JSON.stringify(log.new_value ?? log.old_value ?? {}, null, 1)}
                          </pre>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedLog(log)}
                            className="h-6 w-6 p-0 text-slate-500 hover:text-blue-600"
                            title="Inspect Complete Event Payload"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls Footer */}
          <div className="px-4 py-3 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-600 bg-slate-50/50">
            <div className="flex items-center space-x-3">
              <span>
                Showing <strong>{totalRecords === 0 ? 0 : startIndex + 1}</strong> to{' '}
                <strong>{endIndex}</strong> of <strong>{totalRecords}</strong> events
              </span>

              <div className="flex items-center space-x-1.5 ml-2">
                <span className="text-[11px] text-slate-500">Rows:</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="bg-white border border-slate-200 rounded px-2 py-0.5 text-xs text-slate-800 font-medium focus:outline-none focus:ring-1 focus:ring-[#0A6ED1]"
                >
                  <option value={10}>10</option>
                  <option value={15}>15</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>
            </div>

            <div className="flex items-center space-x-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(1)}
                disabled={safePage <= 1}
                className="h-7 w-7 p-0"
                title="First Page"
              >
                <ChevronsLeft className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={safePage <= 1}
                className="h-7 w-7 p-0"
                title="Previous Page"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>

              <span className="px-2.5 text-xs font-semibold text-slate-700">
                Page {safePage} of {totalPages}
              </span>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={safePage >= totalPages}
                className="h-7 w-7 p-0"
                title="Next Page"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(totalPages)}
                disabled={safePage >= totalPages}
                className="h-7 w-7 p-0"
                title="Last Page"
              >
                <ChevronsRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Audit Log Payload Detail Modal */}
      {selectedLog && (
        <Modal
          isOpen={Boolean(selectedLog)}
          onClose={() => setSelectedLog(null)}
          title={`Audit Event: ${selectedLog.action}`}
          description={`Logged on ${formatDateTime(selectedLog.created_at)} · Module: ${selectedLog.module}`}
        >
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 border border-slate-200 rounded-lg">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-500">Actor Identity:</span>
                <p className="font-semibold text-slate-900">{selectedLog.user_name}</p>
                <p className="text-[11px] text-slate-500 capitalize">{selectedLog.user_role} ({selectedLog.user_id})</p>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-500">Target Record ID:</span>
                <p className="font-mono text-slate-800">{selectedLog.record_id || 'N/A'}</p>
                <span className="text-[10px] text-slate-400">Action: <strong>{selectedLog.action}</strong></span>
              </div>
            </div>

            {selectedLog.old_value && (
              <div>
                <h4 className="font-bold text-slate-700 mb-1">Previous State (Before Mutation):</h4>
                <pre className="bg-slate-900 text-slate-100 p-3 rounded-lg overflow-x-auto text-[11px] font-mono max-h-48">
                  {JSON.stringify(selectedLog.old_value, null, 2)}
                </pre>
              </div>
            )}

            <div>
              <h4 className="font-bold text-slate-700 mb-1">New State / Action Payload:</h4>
              <pre className="bg-slate-900 text-emerald-300 p-3 rounded-lg overflow-x-auto text-[11px] font-mono max-h-48">
                {JSON.stringify(selectedLog.new_value ?? {}, null, 2)}
              </pre>
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-100">
              <Button type="button" variant="sap" size="sm" onClick={() => setSelectedLog(null)}>
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
