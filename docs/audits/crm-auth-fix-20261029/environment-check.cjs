const fs=require('fs'),path=require('path');
const environments={};
for(const file of ['.env.local','.env.staging']){
 const vars={};for(const line of fs.readFileSync(file,'utf8').split(/\r?\n/)){const m=line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);if(m)vars[m[1]]=m[2].replace(/^['"]|['"]$/g,'')}
 const url=vars.NEXT_PUBLIC_SUPABASE_URL||'';let hostname='';try{hostname=new URL(url).hostname}catch{}
 const publicKey=vars.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||vars.NEXT_PUBLIC_SUPABASE_ANON_KEY||'';
 let claims={};try{claims=JSON.parse(Buffer.from(publicKey.split('.')[1],'base64url'))}catch{}
 environments[file]={urlPresent:!!url,urlValid:!!hostname,matchesConnectedProduction:hostname==='tgohtdzwehhjfahtgovq.supabase.co',publicKeyPresent:!!publicKey,publicKeyKind:publicKey.startsWith('sb_publishable_')?'publishable':claims.role==='anon'?'anon-jwt':claims.role==='service_role'?'UNSAFE-service-role':'unverified',legacyJwtProjectMatchesUrl:claims.ref?hostname===claims.ref+'.supabase.co':null,serviceRoleOnlyServerVariable:!!vars.SUPABASE_SERVICE_ROLE_KEY&&!Object.entries(vars).some(([k,v])=>k.startsWith('NEXT_PUBLIC_')&&v===vars.SUPABASE_SERVICE_ROLE_KEY),isolatedStagingVerified:false};
}
fs.writeFileSync(path.join(__dirname,'environment-check.json'),JSON.stringify(environments,null,2));console.log(JSON.stringify(environments,null,2));
