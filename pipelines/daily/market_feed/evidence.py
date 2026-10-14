# -*- coding: utf-8 -*-
"""原始证据归档：原子写、按「区域/来源/日期」分目录、重复抓取保留 attempts。

历史原始证据不得因任务失败而删除；同一日期重复抓取时旧响应移入 attempts/。
"""
from __future__ import annotations

import hashlib
import json
import os
import tempfile
from pathlib import Path

from . import config as C
from .clock import now_str


def _atomic_write(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=str(path.parent), prefix=".tmp-")
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(data)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, path)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)


def atomic_write_json(path: Path, obj) -> None:
    _atomic_write(path, json.dumps(obj, ensure_ascii=False, indent=1).encode("utf-8"))


def save_raw(region_id: str, source_id: str, observation_date: str,
             name: str, body: bytes) -> str:
    """保存原始响应，返回相对 HOME 的路径。重复内容不覆盖，改存 attempts。"""
    day_dir = C.RAW_DIR / region_id / source_id / observation_date
    target = day_dir / name
    new_hash = hashlib.sha256(body).hexdigest()
    if target.exists():
        old_hash = hashlib.sha256(target.read_bytes()).hexdigest()
        if old_hash != new_hash:
            attempts = day_dir / "attempts"
            attempts.mkdir(parents=True, exist_ok=True)
            ts = now_str().replace(":", "").replace("-", "").replace(" ", "T")
            _atomic_write(attempts / f"{name}.{ts}", target.read_bytes())
        else:
            return str(target.relative_to(C.HOME))
    _atomic_write(target, body)
    return str(target.relative_to(C.HOME))


def save_meta(region_id: str, source_id: str, observation_date: str, meta: dict) -> str:
    day_dir = C.RAW_DIR / region_id / source_id / observation_date
    path = day_dir / "_meta.json"
    existing = {}
    if path.exists():
        try:
            existing = json.loads(path.read_text(encoding="utf-8"))
        except Exception:  # noqa: BLE001
            existing = {}
    runs = existing.get("runs", [])
    runs.append({"collected_at": now_str(), **meta})
    atomic_write_json(path, {"runs": runs[-50:]})
    return str(path.relative_to(C.HOME))
