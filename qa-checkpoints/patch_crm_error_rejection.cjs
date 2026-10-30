const fs = require('fs');
const file = 'E:/my erp hub/next gen lms/lib/services/crm-service.ts';
let content = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');

const oldCheck = `    if (data.counsellor_id) {
      const supabase = createClient(authContext || data.counsellor_id);
      if (typeof supabase.from('profiles')?.select === 'function') {
        let profile: any = null;
        try {
          const { data: prof, error: profErr } = await supabase
            .from('profiles')
            .select('id, full_name, role, is_active, tenant_id')
            .eq('id', data.counsellor_id)
            .maybeSingle();
          if (!profErr && prof) profile = prof;
        } catch {}

        if (!profile) {
          profile = (store.users || []).find((u) => u.id === data.counsellor_id);
        }
        if (!profile) {
          throw new Error('Invalid counsellor ID: Selected counsellor does not exist in authorized staff roster.');
        }
        if (profile.is_active === false) {
          throw new Error('Invalid counsellor ID: Assigned counsellor is inactive.');
        }
        if (!['counsellor', 'admin', 'super_admin'].includes(profile.role)) {
          throw new Error('Invalid counsellor ID: Assigned staff member is not authorized for lead counselling.');
        }
        if (authContext?.tenant_id && profile.tenant_id && profile.tenant_id !== authContext.tenant_id) {
          throw new Error('Invalid counsellor ID: Counsellor belongs to another tenant.');
        }
        verifiedCounsellorName = profile.full_name;
      }
    }`;

const newCheck = `    if (data.counsellor_id) {
      const supabase = createClient(authContext || data.counsellor_id);
      if (typeof supabase.from('profiles')?.select === 'function') {
        let profile: any = null;
        const { data: prof, error: profErr } = await supabase
          .from('profiles')
          .select('id, full_name, role, is_active, tenant_id')
          .eq('id', data.counsellor_id)
          .maybeSingle();

        if (profErr) {
          throw new Error('Invalid counsellor ID: Selected counsellor does not exist in authorized staff roster.');
        }
        profile = prof;
        if (!profile) {
          profile = (store.users || []).find((u) => u.id === data.counsellor_id);
        }
        if (!profile) {
          throw new Error('Invalid counsellor ID: Selected counsellor does not exist in authorized staff roster.');
        }
        if (profile.is_active === false) {
          throw new Error('Invalid counsellor ID: Assigned counsellor is inactive.');
        }
        if (!['counsellor', 'admin', 'super_admin'].includes(profile.role)) {
          throw new Error('Invalid counsellor ID: Assigned staff member is not authorized for lead counselling.');
        }
        if (authContext?.tenant_id && profile.tenant_id && profile.tenant_id !== authContext.tenant_id) {
          throw new Error('Invalid counsellor ID: Counsellor belongs to another tenant.');
        }
        verifiedCounsellorName = profile.full_name;
      }
    }`;

if (content.includes(oldCheck)) {
  content = content.replace(oldCheck, newCheck);
  fs.writeFileSync(file, content, 'utf8');
  console.log('Updated crm-service.ts profile check with error rejection');
} else {
  console.error('Target not found in crm-service.ts');
}
