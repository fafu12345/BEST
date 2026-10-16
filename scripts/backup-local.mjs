// Consistent local backup: briefly stop API writers, snapshot DB + Storage, then resume.
import {rmSync,closeSync} from 'node:fs';
import {mkdtemp,copyFile,writeFile,rm,rename,readdir,stat,open} from 'node:fs/promises';import {tmpdir,homedir} from 'node:os';import {resolve,join,relative,isAbsolute} from 'node:path';import {randomUUID} from 'node:crypto';
import {root,compose,run,toFile,encrypt,decrypt,hash,password,counts,privateDir,readFile} from './backup/common.mjs';
const args=process.argv.slice(2);const value=(name,fallback)=>args.includes(name)?args[args.indexOf(name)+1]:fallback;
let temp,lock,partial,running=[],stopped=false;const lockPath=join(tmpdir(),'estatematch-local-backup.lock');let step='preflight';
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{
 console.error('Backup interrupted; resuming original services.');
 if(stopped&&running.length){try{run('docker',[...compose,'start',...running]);}catch{console.error('Resume failed; run bash scripts/start-local.sh.');}}
 if(lock){try{closeSync(lock.fd);rmSync(lockPath,{force:true});}catch{}}
 for(const path of [temp,partial].filter(Boolean)){try{rmSync(path,{recursive:true,force:true});}catch{}}
 process.exit(signal==='SIGINT'?130:143);
});
try{
 password();try{lock=await open(lockPath,'wx',0o600);await lock.writeFile(String(process.pid));}catch{throw new Error('A backup lock exists. Check the running backup before removing '+lockPath);}
 const output=resolve(value('--output',join(homedir(),'EstateMatchBackups')));const rel=relative(root,output);if(!rel||(!rel.startsWith('..')&&!isAbsolute(rel)))throw new Error('Choose a backup directory outside the project checkout');
 const retain=Number(value('--retain-days','30'));if(!Number.isInteger(retain)||retain<1||retain>3650)throw new Error('Invalid retention days');
 run('docker',['info','--format','{{.ServerVersion}}']);await readFile(join(root,'.env.local'));await readFile(join(root,'local/.env'));await privateDir(output);
 temp=await mkdtemp(join(tmpdir(),'estatematch-backup-'));const storage=run('docker',[...compose,'ps','-a','-q','storage']);if(!storage)throw new Error('Local Storage container not found');
 running=run('docker',[...compose,'ps','--status','running','--services']).split(/\r?\n/).filter(s=>['gateway','auth','rest','storage','property-scheduler'].includes(s));
 step='pause-writers';stopped=true;if(running.length)run('docker',[...compose,'stop',...running]);
 console.log('Local maintenance window: API writes paused for DB + file snapshot.');
 step='database-snapshot';await toFile('docker',['exec','estatematch-db','pg_dump','-U','postgres','-Fc','postgres'],join(temp,'database.dump'));
 step='storage-snapshot';await toFile('docker',['run','--rm','--network','none','--volumes-from',storage+':ro','postgres:17','tar','-C','/var/lib/storage','-cf','-','.'],join(temp,'files.tar'));
 await copyFile(join(root,'.env.local'),join(temp,'app.env'));await copyFile(join(root,'local/.env'),join(temp,'config.env'));
 let commit='zip-checkout';try{commit=run('git',['rev-parse','HEAD']);}catch{}
 const manifest={format:1,created_at:new Date().toISOString(),commit,counts:await counts(),files:{}};
 for(const name of ['database.dump','files.tar','app.env','config.env'])manifest.files[name]={sha256:await hash(join(temp,name)),bytes:(await stat(join(temp,name))).size};
 await writeFile(join(temp,'manifest.json'),JSON.stringify(manifest,null,2),{mode:0o600});
 if(running.length)run('docker',[...compose,'start',...running]);stopped=false;
 step='encrypt';run('tar',['-cf',join(temp,'bundle.tar'),'-C',temp,'database.dump','files.tar','app.env','config.env','manifest.json']);
 const filename='EstateMatch-'+new Date().toISOString().replace(/[:.]/g,'-')+'-'+randomUUID().slice(0,8)+'.embackup';const target=join(output,filename);partial=target+'.partial';await encrypt(join(temp,'bundle.tar'),partial);
 step='verify-encryption';await decrypt(target+'.partial',join(temp,'verified.tar'));if(await hash(join(temp,'verified.tar'))!==await hash(join(temp,'bundle.tar')))throw new Error('Encrypted archive verification failed');await rename(target+'.partial',target);partial=undefined;
 step='retention';for(const name of await readdir(output)){if(!/^EstateMatch-.*\.embackup$/.test(name)||name===filename)continue;const path=join(output,name);const info=await stat(path);if(info.isFile()&&info.mtimeMs<Date.now()-retain*86400000)await rm(path);}
 await writeFile(join(output,'last-success.json'),JSON.stringify({created_at:manifest.created_at,file:filename,sha256:await hash(target),bytes:(await stat(target)).size}),{mode:0o600});
 console.log('Encrypted backup verified: '+target);console.log('DB + file originals + recovery configuration included. Retention: '+retain+' days.');
}catch(error){console.error('Backup failed at '+step+': '+(error instanceof Error?error.message:'unknown error'));process.exitCode=1;}
finally{if(stopped&&running.length){try{run('docker',[...compose,'start',...running]);console.log('Original local services resumed.');}catch{console.error('Resume failed; run bash scripts/start-local.sh before using the app.');process.exitCode=1;}}if(temp)await rm(temp,{recursive:true,force:true});if(partial)await rm(partial,{force:true});if(lock){await lock.close();await rm(lockPath,{force:true});}}
