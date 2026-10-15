// Write local keys directly to an ignored file; never print credential values.
import { execFileSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
if (existsSync('.env.local')) throw new Error('.env.local exists; preserve it and configure manually.');
const status=JSON.parse(execFileSync('npx',['supabase','status','-o','json'],{encoding:'utf8',stdio:['ignore','pipe','inherit']}));
writeFileSync('.env.local',`NEXT_PUBLIC_SUPABASE_URL=${status.API_URL}\nNEXT_PUBLIC_SUPABASE_ANON_KEY=${status.ANON_KEY}\nSUPABASE_SERVICE_ROLE_KEY=${status.SERVICE_ROLE_KEY}\n`,{mode:0o600,flag:'wx'});
console.log('Local connection settings written to ignored .env.local');
