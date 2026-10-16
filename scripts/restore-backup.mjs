// Safe recovery rehearsal only: NEVER overwrites the current DB or Storage volume.
import {mkdtemp,rm,readFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join,resolve} from 'node:path';
import {run,toFile,fromFile,decrypt,hash,password,counts} from './backup/common.mjs';
const args=process.argv.slice(2),value=(n,f)=>args.includes(n)?args[args.indexOf(n)+1]:f;
let temp,database,volume,createdDB=false,createdVolume=false,step='preflight';
try{
 password();const file=value('--file');if(!file)throw new Error('Use --file <encrypted .embackup>');
 const suffix=Date.now().toString();database=value('--database','estatematch_restore_'+suffix);volume='estatematch_restore_files_'+suffix;
 if(!/^estatematch_restore_[a-z0-9_]{1,35}$/.test(database))throw new Error('Recovery target must be a NEW estatematch_restore_* database');
 temp=await mkdtemp(join(tmpdir(),'estatematch-restore-'));step='decrypt';await decrypt(resolve(file),join(temp,'bundle.tar'));
 const names=run('tar',['-tf',join(temp,'bundle.tar')]).split(/\r?\n/).filter(Boolean);const expected=['database.dump','files.tar','app.env','config.env','manifest.json'];if(names.length!==expected.length||!expected.every(n=>names.includes(n)))throw new Error('Unexpected backup entries');
 for(const name of ['database.dump','files.tar','manifest.json'])await toFile('tar',['-xOf',join(temp,'bundle.tar'),name],join(temp,name));
 const manifest=JSON.parse(await readFile(join(temp,'manifest.json'),'utf8'));if(manifest.format!==1)throw new Error('Unsupported manifest');for(const name of ['database.dump','files.tar'])if(await hash(join(temp,name))!==manifest.files[name].sha256)throw new Error('Archive checksum mismatch');
 step='new-database';run('docker',['exec','estatematch-db','createdb','-U','postgres',database]);createdDB=true;
 await fromFile('docker',['exec','-i','estatematch-db','pg_restore','-U','postgres','--no-owner','--exit-on-error','-d',database],join(temp,'database.dump'));
 const actual=await counts(database);if(JSON.stringify(Object.entries(actual).sort())!==JSON.stringify(Object.entries(manifest.counts).sort()))throw new Error('Restored table counts differ');
 step='new-file-volume';run('docker',['volume','create',volume]);createdVolume=true;await fromFile('docker',['run','--rm','-i','--network','none','--mount','type=volume,src='+volume+',dst=/restore','postgres:17','tar','-C','/restore','-xf','-'],join(temp,'files.tar'));
 console.log('Recovery rehearsal passed: all public table counts match and original file archive was restored.');console.log('Isolated database: '+database);console.log('Isolated file volume: '+volume);console.log('Live DB, files and configuration were not changed.');
 if(args.includes('--cleanup')){run('docker',['exec','estatematch-db','dropdb','-U','postgres',database]);createdDB=false;run('docker',['volume','rm',volume]);createdVolume=false;console.log('Rehearsal resources removed.');}
}catch(error){console.error('Recovery failed at '+step+': '+(error instanceof Error?error.message:'unknown error'));if(createdDB)console.error('Isolated recovery DB retained for inspection: '+database);if(createdVolume)console.error('Isolated file volume retained for inspection: '+volume);process.exitCode=1;}
finally{if(temp)await rm(temp,{recursive:true,force:true});}
