const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const env = fs.readFileSync('.env.local', 'utf-8').split('\n').reduce((acc, line) => {
  const [k, ...v] = line.split('=');
  if (k && v.length) acc[k.trim()] = v.join('=').trim().replace(/^["']|["']$/g, '');
  return acc;
}, {});
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
async function check() {
  const { data: dbLead } = await supabase.from('leads').select('*').eq('id', 'lead-01').maybeSingle();
  console.log('lead-01 in Supabase:', dbLead);
  
  const { data: allLeads } = await supabase.from('leads').select('id, lead_code, counsellor_id, full_name').limit(10);
  console.log('First 10 leads in Supabase:', allLeads);
}
check();
