const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const env = fs.readFileSync('.env.local', 'utf-8').split('\n').reduce((acc, line) => {
  const [k, ...v] = line.split('=');
  if (k && v.length) acc[k.trim()] = v.join('=').trim().replace(/^["']|["']$/g, '');
  return acc;
}, {});
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  const { data, error } = await supabase.from('fee_workflow_state').select('tenant_id, revision, snapshot').eq('tenant_id', 'default').maybeSingle();
  console.log('Revision:', data ? data.revision : null, 'Error:', error);
  if (data && data.snapshot && data.snapshot.leads) {
    console.log('Leads in snapshot count:', data.snapshot.leads.length);
    const l1 = data.snapshot.leads.find(l => l.id === 'lead-01');
    console.log('lead-01 in snapshot:', l1);
  } else {
    console.log('No leads in snapshot');
  }
  if (data && data.snapshot && data.snapshot.users) {
    console.log('Users in snapshot count:', data.snapshot.users.length);
    const u1 = data.snapshot.users.find(u => u.email === 'counsellor@next-generpsolutions.com');
    console.log('Counsellor in snapshot:', u1);
  }
}
check();
