import { randomBytes, createHmac } from 'node:crypto';
import { existsSync,writeFileSync } from 'node:fs';
if(existsSync('local/.env')||existsSync('.env.local')) throw new Error('Existing local configuration preserved; no files changed.');
const secret=randomBytes(32).toString('hex'),password=randomBytes(24).toString('hex');
function jwt(role){const b=x=>Buffer.from(JSON.stringify(x)).toString('base64url');const body=b({alg:'HS256',typ:'JWT'})+'.'+b({iss:'supabase-local',role,iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+31536000});return body+'.'+createHmac('sha256',secret).update(body).digest('base64url');}
const anon=jwt('anon'),service=jwt('service_role');
writeFileSync('local/.env',`LOCAL_DB_PASSWORD=${password}\nLOCAL_JWT_SECRET=${secret}\nLOCAL_ANON_KEY=${anon}\nLOCAL_SERVICE_KEY=${service}\n`,{mode:0o600,flag:'wx'});
writeFileSync('.env.local',`NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321\nNEXT_PUBLIC_SUPABASE_ANON_KEY=${anon}\nSUPABASE_SERVICE_ROLE_KEY=${service}\n`,{mode:0o600,flag:'wx'});
console.log('Generated ignored local-only configuration. No credential values printed.');
