const fs = require('fs');
let code = fs.readFileSync('lib/services/crm-service.ts', 'utf8');
code = code.replace(/\r\n/g, '\n');

const target = `  store.leads = store.leads || [];
  const existingCodes = (store.leads || [])
    .map((l) => {
      const m = l.lead_code?.match(/LD-\\d{4}-(\\d+)/);
      return m ? parseInt(m[1], 10) : 0;
    })
    .filter((n) => !isNaN(n) && n < 900);
  let nextNum = (existingCodes.length > 0 ? Math.max(...existingCodes) : store.leads.length) + 1;
  while ((store.leads || []).some((l) => l.lead_code === \`LD-2026-\${String(nextNum).padStart(3, '0')}\`)) {
    nextNum++;
  }
  const lead_code = \`LD-2026-\${String(nextNum).padStart(3, '0')}\`;`;

const repl = `  store.leads = store.leads || [];
  const existingCodes = (store.leads || [])
    .map((l) => {
      const m = l.lead_code?.match(/LD-\\d{4}-(\\d+)/);
      return m ? parseInt(m[1], 10) : 0;
    })
    .filter((n) => !isNaN(n) && n < 900);
  let nextNum = (existingCodes.length > 0 ? Math.max(...existingCodes) : store.leads.length) + 1;
  while ((store.leads || []).some((l) => l.lead_code === \`LD-2026-\${String(nextNum).padStart(3, '0')}\`)) {
    nextNum++;
  }
  if (isLiveSupabaseEnabled()) {
    try {
      const client = createClient(authContext || data.counsellor_id);
      const { data: recent } = await client.from('leads').select('lead_code').order('created_at', { ascending: false }).limit(25);
      if (recent && recent.length > 0) {
        for (const r of recent) {
          const m = r.lead_code?.match(/LD-\\d{4}-(\\d+)/);
          if (m) {
            const num = parseInt(m[1], 10);
            if (!isNaN(num) && num >= nextNum) nextNum = num + 1;
          }
        }
      }
    } catch {}
  }
  const lead_code = \`LD-2026-\${String(nextNum).padStart(3, '0')}\`;`;

if (code.includes(target)) {
  fs.writeFileSync('lib/services/crm-service.ts', code.replace(target, repl), 'utf8');
  console.log('Successfully updated lead_code generation in crm-service.ts');
} else {
  console.error('Target not found in crm-service.ts');
}
