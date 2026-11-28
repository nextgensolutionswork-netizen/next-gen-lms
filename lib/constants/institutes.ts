import type { InstituteBrand } from '@/types';

const now = '2026-01-01T00:00:00.000Z';

export const DEFAULT_INSTITUTES: InstituteBrand[] = [
  {
    id: 'inst-myerp-hub',
    name: 'MyERP Hub',
    code: 'MYERP',
    is_active: true,
    tagline: 'Enterprise SAP & ERP Career Academy',
    created_at: now,
    updated_at: now,
  },
  {
    id: 'inst-nextgen',
    name: 'NextGen',
    code: 'NEXTGEN',
    is_active: true,
    tagline: 'Next-Gen SAP Training & Placement Institute',
    created_at: now,
    updated_at: now,
  },
  {
    id: 'inst-tecopad',
    name: 'Tecopad',
    code: 'TECOPAD',
    is_active: true,
    tagline: 'Tecopad Digital & SAP Skilling',
    created_at: now,
    updated_at: now,
  },
];

export const UNASSIGNED_INSTITUTE_LABEL = 'Not Assigned';

export function formatInstituteLabel(value?: string | null): string {
  const trimmed = (value ?? '').trim();
  return trimmed || UNASSIGNED_INSTITUTE_LABEL;
}
