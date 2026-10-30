const fs=require('fs'),path=require('path'),{spawn}=require('child_process');
const {scratch}=JSON.parse(fs.readFileSync(path.join(__dirname,'source-manifest.json'),'utf8').replace(/^\uFEFF/,''));
const env={...process.env};
for(const key of Object.keys(env)) if(/SUPABASE|DATABASE|SMTP|RAZORPAY|STRIPE|TWILIO|RESEND|SECRET|TOKEN|API_KEY/.test(key)) delete env[key];
Object.assign(env,{NODE_ENV:'development',NEXT_PUBLIC_APP_ENV:'staging',NEXT_PUBLIC_SUPABASE_URL:'https://mock-sap-lms.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'mockAnonKey',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'mockAnonKey',SUPABASE_SERVICE_ROLE_KEY:'mockServiceRoleKey',NEXT_TELEMETRY_DISABLED:'1',NEXT_DIST_DIR:'.next-browser-test',LMS_TEST_STORAGE_DIR:path.join(scratch,'browser-synthetic-storage'),NODE_OPTIONS:'--require '+JSON.stringify(path.join(__dirname,'no-network.cjs'))});
const fd=fs.openSync(path.join(__dirname,'browser-server.log'),'w');
const child=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','-p','3013'],{cwd:scratch,env,stdio:['ignore',fd,fd],detached:true,windowsHide:true});child.unref();
fs.writeFileSync(path.join(__dirname,'server.json'),JSON.stringify({pid:child.pid,scratch,base:'http://localhost:3013',remoteDatabaseEnabled:false}));console.log('Isolated server PID '+child.pid);
