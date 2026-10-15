# -*- coding: utf-8 -*-
"""把 worker 的 market_feed 观测库桥接进产品的不可变 V3 行情发布。

职责边界（严格遵守）：
- market_feed 只负责「采集 + 原始证据 + 观测库」；本模块把它们**导出**为一个
  可被产品发布器校验的 checkpointed 快照 + ``provenance.json``（SHA256 收据）。
- 产品发布器 ``pipelines.publishing.publish_market_display``（strict=True）负责
  V3 契约、不可变 generation、原子 manifest 切换与 receipt。
- 本模块**不**改写任何冻结模型、研究与历史 raw。

``configured`` 语义：仅当该地区的采集器在当前观测库中确实有过**成功运行**
（SUCCESS / PARTIAL / NO_NEW_PUBLICATION，即来源被真实访问并成功解析）才标记为
``configured``；否则如实标 ``not_configured``。绝不为了凑覆盖率而伪造状态。
"""
from __future__ import annotations

import hashlib
import json
import os
import shutil
import sqlite3
import tempfile
from pathlib import Path

from . import config as C
from .clock import now_str
from .store import Store

PUBLICATION_DIR = C.HOME / "publication"
SNAPSHOT_NAME = "market-feed.sqlite"
PROVENANCE_NAME = "provenance.json"
_VERIFIED_RUN_STATUS = ("SUCCESS", "PARTIAL", "NO_NEW_PUBLICATION")


def _atomic_write(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=str(path.parent), prefix=".tmp-")
    try:
        with os.fdopen(fd, "wb") as handle:
            handle.write(data)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(tmp, path)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def checkpoint(store_path: Path | str = C.DB_PATH) -> None:
    """Fold the WAL back into the main DB so the snapshot is self-contained."""
    connection = sqlite3.connect(str(store_path))
    try:
        connection.execute("PRAGMA wal_checkpoint(TRUNCATE)")
        connection.commit()
    finally:
        connection.close()


def verified_regions(store: Store) -> list[str]:
    """Regions whose registered collector has at least one successful real run."""
    rows = store.conn.execute(
        "SELECT region_id, status FROM runs ORDER BY id").fetchall()
    # Configuration/capability does not disappear after a temporary timeout.
    # Last-run status and observation freshness remain separate feed metadata.
    return sorted({row["region_id"] for row in rows if row["status"] in _VERIFIED_RUN_STATUS})


def build_snapshot(store_path: Path | str = C.DB_PATH,
                   out_dir: Path | str = PUBLICATION_DIR) -> tuple[Path, Path]:
    """Export a checkpointed DB snapshot + adjacent SHA256 provenance receipt."""
    store_path, out_dir = Path(store_path), Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    checkpoint(store_path)
    snapshot = out_dir / SNAPSHOT_NAME
    fd, tmp = tempfile.mkstemp(dir=str(out_dir), prefix=".snap-")
    os.close(fd)
    try:
        shutil.copyfile(store_path, tmp)
        os.replace(tmp, snapshot)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)
    # A leftover WAL next to the snapshot would make the product reader refuse it.
    for suffix in ("-wal", "-shm"):
        stale = Path(str(snapshot) + suffix)
        if stale.exists():
            stale.unlink()
    provenance = out_dir / PROVENANCE_NAME
    receipt = {
        "sha256": _sha256(snapshot),
        "generated_at": now_str(),
        "producer": "pipelines/daily/market_feed/product_bridge.py",
        "schema": "market_feed_snapshot",
    }
    _atomic_write(provenance, json.dumps(receipt, ensure_ascii=False, indent=1).encode("utf-8"))
    return snapshot, provenance


def publish_product(strict: bool = True) -> dict:
    """Snapshot the feed store and publish the product's immutable V3 market display."""
    C.ensure_dirs()
    store = Store()
    try:
        configured = verified_regions(store)
    finally:
        store.close()
    snapshot, _ = build_snapshot()
    from pipelines.publishing.publish_market_display import publish as publish_display
    result = publish_display(
        project_root=C.WORKER_ROOT, runtime_root=C.RUNTIME_DIR,
        feed_db=snapshot, strict=strict, write_frontend=False,
        configured_regions=set(configured),
    )
    return {"configured_regions": configured, "snapshot": str(snapshot), "publication": result}
