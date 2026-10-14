"""Select the existing frozen index and registered weights for an independent runtime release."""
from __future__ import annotations
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import sys
import tempfile
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT))
from agriscope_publication import publication_lock, atomic_bytes


def selected_files(source):
    source=Path(source).resolve();index=source/'index.json'
    if index.is_symlink():raise ValueError('frozen index cannot be a symlink')
    original=index.read_bytes();obj=json.loads(original)
    if not isinstance(obj.get('entries'),list) or not obj['entries'] or obj.get('schema_version')!='2.0':
        raise ValueError('existing frozen v2 index required')
    result={'index.json':hashlib.sha256(original).hexdigest()};keys=set()
    for entry in obj['entries']:
        key=entry.get('key')
        if not isinstance(key,str) or key in keys:raise ValueError('duplicate/invalid frozen model entry')
        keys.add(key)
        name,sha=entry.get('artifact'),entry.get('artifact_sha256')
        if not name:continue
        if not isinstance(name,str) or Path(name).name!=name or not name.endswith('.pkl') or not isinstance(sha,str) or not re.fullmatch('[0-9a-f]{64}',sha):
            raise ValueError('invalid registered model artifact')
        file=source/name
        if file.is_symlink() or hashlib.sha256(file.read_bytes()).hexdigest()!=sha:
            raise ValueError('frozen artifact checksum mismatch')
        if name in result and result[name]!=sha:raise ValueError('conflicting registered artifact')
        result[name]=sha
    if len(result)==1:raise ValueError('no frozen model weights registered')
    return obj,result


def publish(source,runtime):
    source,runtime=Path(source).resolve(),Path(runtime).resolve()
    obj,files=selected_files(source);dest=runtime/'models/models/long_horizon'
    if dest.is_symlink() or not dest.resolve().is_relative_to(runtime):raise ValueError('model destination escapes runtime')
    with publication_lock(runtime):
        manifest=runtime/'manifest.json'
        original=manifest.read_bytes();metadata=json.loads(original)
        if dest.exists():
            if any(not (dest/name).is_file() or hashlib.sha256((dest/name).read_bytes()).hexdigest()!=sha for name,sha in files.items()):
                raise ValueError('existing frozen release differs; prepare a separate release rather than overwrite')
        else:
            dest.parent.mkdir(parents=True,exist_ok=True)
            with tempfile.TemporaryDirectory(prefix='.stage-long-horizon-',dir=dest.parent) as temporary:
                stage=Path(temporary)/'models';stage.mkdir()
                for name,sha in files.items():
                    target=stage/name;shutil.copyfile(source/name,target)
                    if hashlib.sha256(target.read_bytes()).hexdigest()!=sha:raise ValueError('frozen source changed during copy')
                    target.chmod(0o440)
                    with target.open('rb') as handle:os.fsync(handle.fileno())
                os.replace(stage,dest)
                fd=os.open(dest.parent,os.O_RDONLY)
                try:os.fsync(fd)
                finally:os.close(fd)
        existing={item.get('destination'):item for item in metadata['assets']}
        for name,sha in files.items():
            relative='runtime/models/models/long_horizon/'+name
            item=dict(source='models/long_horizon/'+name,destination=relative,status='OK',sha256=sha,
                      description='Existing frozen long-horizon inference artifact; no training')
            if relative in existing:
                if existing[relative].get('sha256')!=sha:raise ValueError('frozen manifest identity conflict')
            else:metadata['assets'].append(item)
        if manifest.read_bytes()!=original:raise ValueError('manifest changed during model publication')
        if json.loads(original)!=metadata:atomic_bytes(manifest,json.dumps(metadata,ensure_ascii=False,indent=2).encode())
    return {'status':'PUBLISHED','model_version':obj['model_version'],'config_hash':obj['config_hash'],'files':len(files),'sha256':files}


def main(argv=None):
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--model-root',type=Path,required=True);parser.add_argument('--runtime-dir',type=Path,default=ROOT/'runtime');args=parser.parse_args(argv)
    print(json.dumps(publish(args.model_root,args.runtime_dir),ensure_ascii=False))
    return 0

if __name__=='__main__':raise SystemExit(main())
