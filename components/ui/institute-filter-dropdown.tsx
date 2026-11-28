'use client';

import * as React from 'react';
import { Building2 } from 'lucide-react';
import { getInstitutes } from '@/lib/services/institute-service';
import { UNASSIGNED_INSTITUTE_LABEL } from '@/lib/constants/institutes';
import type { InstituteBrand } from '@/types';

export function matchesInstituteFilter(
  record: { institute_id?: string | null; institute_name?: string | null } | null | undefined,
  filterValue: string
): boolean {
  if (!filterValue || filterValue === 'All') return true;
  const instId = (record?.institute_id ?? '').trim();
  const instName = (record?.institute_name ?? '').trim();
  if (filterValue === 'unassigned') {
    return !instId && !instName;
  }
  return instId === filterValue || instName === filterValue;
}

export interface InstituteFilterDropdownProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export function InstituteFilterDropdown({
  value,
  onChange,
  className = '',
}: InstituteFilterDropdownProps) {
  const [institutes, setInstitutes] = React.useState<InstituteBrand[]>(() => getInstitutes());

  React.useEffect(() => {
    let active = true;
    fetch('/api/settings/institutes')
      .then((r) => r.json())
      .then((d) => {
        if (active && d?.success && Array.isArray(d.institutes)) {
          setInstitutes(d.institutes);
        }
      })
      .catch(() => {
        if (active) setInstitutes(getInstitutes());
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      <Building2 className="h-3.5 w-3.5 text-slate-400 shrink-0" />
      <span className="text-xs text-slate-500 font-medium whitespace-nowrap">Institute:</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Filter by Institute"
        className="text-xs bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700 font-medium focus:outline-none focus:ring-1 focus:ring-[#0A6ED1]"
      >
        <option value="All">All Institutes (Consolidated)</option>
        {institutes.map((inst) => (
          <option key={inst.id} value={inst.id}>
            {inst.name}{inst.is_active === false ? ' (Inactive)' : ''}
          </option>
        ))}
        <option value="unassigned">{UNASSIGNED_INSTITUTE_LABEL}</option>
      </select>
    </div>
  );
}
