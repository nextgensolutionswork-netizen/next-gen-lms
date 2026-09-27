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
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { store } from '@/lib/services/data-store';
import { AuditLog } from '@/types';
import { formatDateTime, exportToCSV } from '@/lib/utils/formatters';

export default function AuditLogsPage() {
  const [logs, setLogs] = React.useState<AuditLog[]>(store.auditLogs);
  const [search, setSearch] = React.useState('');
  const [selectedModule, setSelectedModule] = React.useState('All');

  const refreshList = () => {
    let list = [...store.auditLogs];
    if (selectedModule !== 'All') {
      list = list.filter((l) => l.module === selectedModule);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (l) =>
          l.action.toLowerCase().includes(q) ||
          l.user_name.toLowerCase().includes(q) ||
          l.record_id.toLowerCase().includes(q)
      );
    }
    setLogs(list);
  };

  React.useEffect(() => {
    refreshList();
  }, [search, selectedModule]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">System Security & Audit Trail</h1>
          <p className="text-xs text-slate-500 mt-1">
            Tamper-evident system activity log capturing financial collections, batch transfers, and security permissions.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => exportToCSV('system_audit_logs', logs)}
          className="text-xs flex items-center space-x-1"
        >
          <Download className="h-3.5 w-3.5" />
          <span>Export Audit Log</span>
        </Button>
      </div>

      <Card className="p-4">
        <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by action, user, or record ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-[#0A6ED1]"
            />
          </div>

          <div className="flex items-center space-x-2">
            <span className="text-xs text-slate-500 font-medium">Module:</span>
            {['All', 'FINANCE', 'BATCHES', 'ADMISSIONS', 'CRM', 'CERTIFICATES'].map((m) => (
              <button
                key={m}
                onClick={() => setSelectedModule(m)}
                className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                  selectedModule === m
                    ? 'bg-[#0A6ED1] text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
      </Card>

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
                {logs.map((log) => (
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
                      <pre className="font-mono text-[10px] bg-slate-100 p-1.5 rounded max-w-xs overflow-x-auto text-slate-800">
                        {JSON.stringify(log.new_value || log.old_value, null, 1)}
                      </pre>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
