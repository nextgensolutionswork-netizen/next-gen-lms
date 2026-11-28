import { NextRequest, NextResponse } from 'next/server';
import { authenticatePaymentRequest } from '@/lib/auth/payment-session';
import { getLeads, getLeadAdmission, classifyLeadConversion } from '@/lib/services/crm-service';
import { resolveLeadScope } from '@/lib/services/lead-security';
import { createAdminClient } from '@/lib/supabase/admin';
import { isLiveSupabaseEnabled } from '@/lib/supabase/db';
import { store } from '@/lib/services/data-store';

export async function GET(request: NextRequest) {
  try {
    const scope = await resolveLeadScope(await authenticatePaymentRequest(request));
    const leads = await getLeads(Object.fromEntries(request.nextUrl.searchParams), scope.actor);
    let users = store.users.filter(u => u.tenant_id === scope.actor.tenant_id && (!scope.creatorIds || scope.creatorIds.includes(u.id)))
      .map(u => ({ id: u.id, full_name: u.full_name }));
    let teams: { id: string; name: string; memberIds: string[] }[] = [];
    let admissions = store.admissions;
    if (isLiveSupabaseEnabled()) {
      const db = createAdminClient();
      let q = db.from('profiles').select('id,full_name').eq('tenant_id', scope.actor.tenant_id!);
      if (scope.creatorIds) q = q.in('id', scope.creatorIds);
      const [result, admResult] = await Promise.all([
        q,
        db.from('admissions').select('*'),
      ]);
      if (result.error) throw new Error('CRM staff lookup unavailable.');
      users = result.data || [];
      if (!admResult.error && Array.isArray(admResult.data)) {
        admissions = admResult.data;
      }
      if (scope.actor.role !== 'counsellor') {
        let tq = db.from('crm_teams').select('id,name,leader_id').eq('tenant_id', scope.actor.tenant_id!);
        if (scope.creatorIds) tq = tq.eq('leader_id', scope.actor.id);
        const tr = await tq;
        if (tr.error) throw new Error('CRM teams unavailable.');
        if (tr.data?.length) {
          const mr = await db.from('crm_team_members').select('team_id,member_id').eq('tenant_id', scope.actor.tenant_id!).in('team_id', tr.data.map(t => t.id));
          if (mr.error) throw new Error('CRM teams unavailable.');
          teams = tr.data.map(t => ({ id: t.id, name: t.name, memberIds: [...new Set([t.leader_id, ...(mr.data || []).filter(m => m.team_id === t.id).map(m => m.member_id)])] }));
        }
      }
    }
    const leadClassifications = leads.map(l => ({ lead: l, ...classifyLeadConversion(l, admissions) }));
    const converted = leads.filter(l => ['Converted', 'Enrolled'].includes(l.stage)).length;
    const activeConversions = leadClassifications.filter(c => c.status === 'active').length;
    const historicalConversions = leadClassifications.filter(c => c.status === 'historical').length;
    const cancelledConversions = leadClassifications.filter(c => c.status === 'cancelled').length;
    const integrityErrors = leadClassifications.filter(c => c.status === 'integrity_error').length;
    const performance = users.map(u => {
      const uLeads = leads.filter(l => l.counsellor_id === u.id || (l.created_by === u.id && !l.counsellor_id));
      const uClassified = uLeads.map(l => ({ lead: l, ...classifyLeadConversion(l, admissions) }));
      const uConverted = uLeads.filter(l => ['Converted', 'Enrolled'].includes(l.stage)).length;
      const uActive = uClassified.filter(c => c.status === 'active').length;
      const uHistorical = uClassified.filter(c => c.status === 'historical').length;
      const uCancelled = uClassified.filter(c => c.status === 'cancelled').length;
      const uIntegrity = uClassified.filter(c => c.status === 'integrity_error').length;
      return {
        ...u,
        total: uLeads.length,
        converted: uConverted,
        activeConversions: uActive,
        historicalConversions: uHistorical,
        cancelledConversions: uCancelled,
        integrityErrors: uIntegrity,
      };
    });
    return NextResponse.json({ success: true, users, teams, performance, metrics: {
      total: leads.length, new: leads.filter(l => l.stage === 'New').length,
      followups: leads.filter(l => Boolean(l.follow_up_date)).length,
      pending: leads.filter(l => !['Converted', 'Enrolled', 'Lost', 'Not Interested'].includes(l.stage)).length,
      converted,
      activeConversions,
      historicalConversions,
      cancelledConversions,
      integrityErrors,
      conversionRate: leads.length ? Math.round(converted / leads.length * 100) : 0,
      activeAdmissionRatio: leads.length ? Math.round(activeConversions / leads.length * 100) : 0,
    } }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'CRM summary unavailable.';
    return NextResponse.json({ success: false, error: message }, { status: message.startsWith('Unauthorized') ? 401 : 403 });
  }
}
