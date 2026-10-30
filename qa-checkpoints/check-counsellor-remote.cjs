const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const env = fs.readFileSync('.env.local', 'utf-8').split('\n').reduce((acc, line) => {
  const [k, ...v] = line.split('=');
  if (k && v.length) acc[k.trim()] = v.join('=').trim().replace(/^["']|["']$/g, '');
  return acc;
}, {});
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
async function check() {
  const { data: users, error } = await supabase.auth.admin.listUsers();
  const counsellorUser = users?.users?.find(u => u.email === 'counsellor@next-generpsolutions.com');
  console.log('Counsellor Auth User ID:', counsellorUser ? counsellorUser.id : 'not found');
  
  const { data: profile } = await supabase.from('profiles').select('*').eq('email', 'counsellor@next-generpsolutions.com').maybeSingle();
  console.log('Counsellor Profile in Supabase:', profile);
}
check();
