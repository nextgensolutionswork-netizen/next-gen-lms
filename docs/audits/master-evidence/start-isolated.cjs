const fs=require('fs'),path=require('path'),cp=require('child_process');
const dir=fs.readFileSync(path.join(process.env.TEMP,'master-audit-copy-path.txt'),'utf8');
const env={};
for(const k of ['PATH','Path','SystemRoot','WINDIR','TEMP','TMP','COMSPEC','USERPROFILE','APPDATA','LOCALAPPDATA'])if(process.env[k])env[k]=process.env[k];
Object.assign(env,{NODE_ENV:'production',NEXT_TELEMETRY_DISABLED:'1',NEXT_PUBLIC_SUPABASE_URL:'https://mock-sap-lms.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'mockAnonKey',NEXT_PUBLIC_APP_URL:'http://127.0.0.1:3127',AUTH_COOKIE_SECRET:'isolated-master-audit-synthetic-signing-key'});
const log=fs.openSync(path.join(__dirname,'isolated-server.log'),'w');
const child=cp.spawn(process.execPath,[path.resolve('node_modules/next/dist/bin/next'),'start','--hostname','127.0.0.1','--port','3127'],{cwd:dir,env,stdio:['ignore',log,log]});
fs.writeFileSync(path.join(process.env.TEMP,'master-audit-server-pid.txt'),String(child.pid));
child.on('exit',code=>{console.log('SERVER_EXIT='+code);process.exitCode=code;});
