import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
const out='docs/audits/browser-fix-2026-10-26';const env={...process.env};
for(const line of fs.readFileSync('.env.local','utf8').split(/\r?\n/)){const key=line.match(/^([A-Z][A-Z0-9_]*)=/)?.[1];if(key)env[key]='';}
Object.assign(env,{NODE_ENV:'production',NEXT_DIST_DIR:'.next-build-check',NEXT_PUBLIC_APP_ENV:'staging',NEXT_PUBLIC_SUPABASE_URL:'https://mock-sap-lms.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'mockAnonKey',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'mockAnonKey',SUPABASE_SERVICE_ROLE_KEY:'mockServiceRoleKey',LMS_TEST_STORAGE_DIR:path.resolve('staging-runtime/browser-build-synthetic')});
fs.mkdirSync(env.LMS_TEST_STORAGE_DIR,{recursive:true});
const log=fs.openSync(`${out}/build.log`,'w');const start=Date.now();
const p=spawn(process.env.ComSpec || 'cmd.exe',['/d','/s','/c','npm.cmd run build'],{windowsHide:true,env,stdio:['ignore',log,log]});
p.on('close',code=>{fs.writeFileSync(`${out}/build-result.json`,JSON.stringify({command:'npm run build',exitCode:code,durationMs:Date.now()-start,remoteDatabaseEnabled:false,distDir:env.NEXT_DIST_DIR},null,2));console.log(`Isolated build exit code: ${code}`);process.exitCode=code||0;});
