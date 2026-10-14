"""Shared manifest transaction and rollback history; all callers hold one lock."""
from __future__ import annotations
from contextlib import contextmanager
import fcntl
import json
import os
from pathlib import Path
import tempfile

@contextmanager
def publication_lock(runtime):
    root = Path(runtime).resolve()
    lock = root / '.manifest.lock'
    if lock.is_symlink():
        raise ValueError('manifest lock cannot be a symlink')
    with lock.open('a') as handle:
        fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        try:
            yield
        finally:
            fcntl.flock(handle, fcntl.LOCK_UN)


def atomic_bytes(path: Path, data: bytes, mode=0o640):
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.is_symlink():
        raise ValueError('publication destination cannot be a symlink')
    fd, name = tempfile.mkstemp(prefix='.publish-', dir=path.parent)
    temporary = Path(name)
    try:
        with os.fdopen(fd, 'wb') as handle:
            handle.write(data); handle.flush(); os.fsync(handle.fileno())
            os.fchmod(handle.fileno(), mode)
        os.replace(temporary, path)
        directory = os.open(path.parent, os.O_RDONLY)
        try: os.fsync(directory)
        finally: os.close(directory)
    finally:
        temporary.unlink(missing_ok=True)


def retain_entry(runtime, field, entry):
    """Immutable pointer receipts allow an explicit, verified data-only rollback."""
    if not entry:
        return
    identity = Path(entry['generation']).name
    if not identity.isalnum():
        raise ValueError('invalid generation receipt')
    root = Path(runtime).resolve()
    target = root / 'publication_history' / field / (identity + '.json')
    if not target.resolve().is_relative_to(root):
        raise ValueError('publication receipt escapes runtime')
    data = json.dumps(entry, ensure_ascii=False, sort_keys=True, indent=2).encode()
    if target.exists():
        existing = json.loads(target.read_text())
        if {k: v for k, v in existing.items() if k != 'published_at'} != {k: v for k, v in entry.items() if k != 'published_at'}:
            raise ValueError('publication receipt identity conflict')
        return existing
    atomic_bytes(target, data, 0o440)
    return entry
