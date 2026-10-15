from pathlib import Path
import tarfile,json,os,shutil,subprocess,tempfile
# Optional VFS-only workaround. Docker verifies the official image on pull.
subprocess.run(["docker","pull","ghcr.io/supabase/storage-api:v1.82.1"],check=True,stdout=subprocess.DEVNULL)
workspace=tempfile.TemporaryDirectory(prefix="estatematch-storage-")
archive=Path(workspace.name)/"image.tar"
subprocess.run(["docker","save","-o",str(archive),"ghcr.io/supabase/storage-api:v1.82.1"],check=True)
root=Path(workspace.name)/"root";root.mkdir(exist_ok=True)
with tarfile.open(archive) as outer:
 manifest=json.load(outer.extractfile('manifest.json'))[0]
 for layer in manifest['Layers']:
  with tarfile.open(fileobj=outer.extractfile(layer),mode='r|*') as t:
   for member in t:
    n=member.name.removeprefix('./'); target=root/n
    if '..' in Path(n).parts or member.name.startswith('/'):raise RuntimeError('Unexpected image path')
    if Path(n).name.startswith('.wh.'):
     if Path(n).name=='.wh..wh..opq':
      if target.parent.exists():
       for x in target.parent.iterdir():
        if x.is_dir() and not x.is_symlink():shutil.rmtree(x)
        else:x.unlink()
     else:
      victim=target.parent/Path(n).name[4:]
      if victim.is_dir() and not victim.is_symlink():shutil.rmtree(victim)
      elif victim.exists() or victim.is_symlink():victim.unlink()
     continue
    if member.issym() and member.linkname.startswith('/'):
     member.linkname=os.path.relpath(root/member.linkname.lstrip('/'),target.parent)
    if target.exists() and target.is_symlink() and not member.issym():target.unlink()
    t.extract(member,path=root,filter='data')
subprocess.run(['docker','image','rm','ghcr.io/supabase/storage-api:v1.82.1'],check=True,stdout=subprocess.DEVNULL)
with subprocess.Popen(['tar','-C',str(root),'-cf','-','.'],stdout=subprocess.PIPE) as pack:
 subprocess.run(['docker','import','--change','WORKDIR /app','--change','ENTRYPOINT ["docker-entrypoint.sh"]','--change','CMD ["node","dist/start/server.js"]','--change','ENV NODE_ENV=production','--change','ENV PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin','-','estatematch-storage-flat:1.82.1'],stdin=pack.stdout,check=True,stdout=subprocess.DEVNULL)
 assert pack.wait()==0
print('Official verified Storage image flattened locally for the VFS driver; application contents retained.')

workspace.cleanup()
