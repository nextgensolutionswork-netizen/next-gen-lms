const fs = require('fs'), path = require('path'), { spawnSync } = require('child_process');
const root = path.resolve(__dirname, '../../..');
const { scratch } = JSON.parse(fs.readFileSync(path.join(__dirname, 'source-manifest.json'), 'utf8').replace(/^\uFEFF/, ''));
const env = { ...process.env };
for (const name of fs.readdirSync(root).filter(n => n.startsWith('.env'))) {
  if (!fs.statSync(path.join(root,name)).isFile()) continue;
  for (const line of fs.readFileSync(path.join(root,name),'utf8').split(/\r?\n/)) {
    const key = line.match(/^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)=/)?.[1]; if (key) env[key] = '';
  }
}
Object.assign(env, { NEXT_PUBLIC_APP_ENV:'staging', NEXT_PUBLIC_SUPABASE_URL:'https://mock-sap-lms.supabase.co', NEXT_PUBLIC_SUPABASE_ANON_KEY:'mockAnonKey', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'mockAnonKey', SUPABASE_SERVICE_ROLE_KEY:'mockServiceRoleKey', NEXT_TELEMETRY_DISABLED:'1', LMS_TEST_STORAGE_DIR:path.join(scratch,'synthetic-storage'), NODE_OPTIONS:'--require '+JSON.stringify(path.join(__dirname,'no-network.cjs')) });
fs.writeFileSync(path.join(__dirname, 'safe-env.json'), JSON.stringify(envKeys()));
function envKeys() { return { mode:'mock adapter', networkDisabled:true, storage:env.LMS_TEST_STORAGE_DIR }; }
if (process.argv[2] === 'diagnostic' || process.argv[2] === 'suite-confirm') { env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=''; env.NODE_ENV='test'; }
const commands = process.argv[2] === 'admission-contract' ? [['admission-contract','npm.cmd test -- tests/audit-admission-failure-contract.test.ts --silent --maxWorkers=1 --minWorkers=1']] : process.argv[2] === 'suite-confirm' ? [['suite-confirm','npm.cmd test -- --exclude tests/audit-*.test.ts --silent --maxWorkers=2 --minWorkers=2']] : process.argv[2] === 'build' ? [['build','npm.cmd run build']] : process.argv[2] === 'contracts' ? [['contracts','npm.cmd test -- tests/audit-crm-live-contract.test.ts tests/audit-payment-roster-contract.test.ts --silent --maxWorkers=1 --minWorkers=1']] : process.argv[2] === 'diagnostic' ? [['diagnostic','npm.cmd test -- tests/auth-session-client.test.ts tests/payment-gateway.test.ts --silent --maxWorkers=1 --minWorkers=1']] : [['typecheck','npm.cmd run typecheck'],['lint','npm.cmd run lint'],['tests','npm.cmd test -- --silent --maxWorkers=2 --minWorkers=2']];
const results=[];
for (const [name, command] of commands) {
  const started=new Date().toISOString(), fd=fs.openSync(path.join(__dirname,name+'.log'),'w');
  const r=spawnSync(process.env.ComSpec||'cmd.exe',['/d','/s','/c',command],{cwd:scratch,env,stdio:['ignore',fd,fd],windowsHide:true}); fs.closeSync(fd);
  results.push({name,command,exitCode:r.status,started,finished:new Date().toISOString()});
  console.log(name+': '+r.status);
  fs.writeFileSync(path.join(__dirname,process.argv[2]?process.argv[2]+'-results.json':'check-results.json'),JSON.stringify(results,null,2));
}
