'use client';

import * as React from 'react';
import Link from 'next/link';
import { Calendar, Clock, Phone, User, CheckCircle2, ChevronRight } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { store } from '@/lib/services/data-store';
import { formatDate } from '@/lib/utils/formatters';

export default function FollowupsPage() {
  const followups = store.leads.filter(
    (l) => l.stage === 'Follow-up' || l.stage === 'Demo Scheduled' || l.demo_preference
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Follow-ups & Demo Calendar</h1>
          <p className="text-xs text-slate-500 mt-1">
            Scheduled counsellor calls and faculty demo sessions for prospective SAP candidates.
          </p>
        </div>
        <Link href="/crm/leads">
          <Button variant="outline" size="sm" className="text-xs">
            Back to All Leads
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {followups.map((lead) => (
          <Card key={lead.id} className="hover:border-[#0A6ED1] transition-all">
            <CardContent className="p-5 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-bold text-slate-800 text-sm">{lead.full_name}</h3>
                  <p className="text-xs text-[#0A6ED1] font-semibold">{lead.interested_course_name}</p>
                </div>
                <Badge variant={lead.stage === 'Demo Scheduled' ? 'default' : 'warning'}>
                  {lead.stage}
                </Badge>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs text-slate-600 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                <div className="flex items-center space-x-1.5">
                  <Phone className="h-3.5 w-3.5 text-slate-400" />
                  <span>{lead.phone}</span>
                </div>
                <div className="flex items-center space-x-1.5">
                  <Calendar className="h-3.5 w-3.5 text-slate-400" />
                  <span>Next: {formatDate(lead.follow_up_date || lead.created_at)}</span>
                </div>
              </div>

              {lead.notes && (
                <div className="text-xs text-slate-600 italic bg-amber-50/50 p-2 rounded border border-amber-100/50">
                  &ldquo;{lead.notes}&rdquo;
                </div>
              )}

              <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                <span className="text-[11px] text-slate-400">Counsellor: {lead.counsellor_name || 'Assigned'}</span>
                <Link href="/crm/leads">
                  <Button variant="sap" size="sm" className="text-xs px-2.5 py-1">
                    Manage Lead
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
