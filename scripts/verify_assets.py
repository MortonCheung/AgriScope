#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""校验 runtime/manifest.json 中的大型运行时资产（只读，不下载）。

用法：
  python3 scripts/verify_assets.py            # 只读校验（默认）
  python3 scripts/verify_assets.py --refresh  # 刷新「派生资产」的哈希（见下）

两类资产（关键设计）：
  - **强校验（canonical / 模型产物）**：`models/`、`data/model_ready/`、`data/metadata/`、
    `data/reports/`、`data/raw/` 下的资产，**任何** size/sha256 不符一律 FAIL —— 它们是事实来源。
  - **可刷新（派生）**：`data/processed/**` 是 Daily / Final 管道**重新生成**的产物
    （日志会追加、快照含 generated_at），每次管道运行都可能变化。
    只读校验时若不符 → 提示用 `--refresh` 刷新，而不是把整条验收判死。

退出码：0 通过；1 有缺失，或强校验资产不符。
"""
from __future__ import annotations

import hashlib
import json
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "runtime" / "manifest.json"

# 派生（可刷新）资产前缀：由管道重新生成，不属于事实来源
DERIVED_PREFIXES = ("data/processed/",)


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def is_derived(path: str) -> bool:
    return path.startswith(DERIVED_PREFIXES)


def main(argv: list[str] | None = None) -> int:
    argv = list(sys.argv[1:] if argv is None else argv)
    refresh = "--refresh" in argv
    if not MANIFEST.exists():
        print("[FAIL] runtime/manifest.json 不存在")
        return 1
    man = json.loads(MANIFEST.read_text(encoding="utf-8"))

    missing, mismatch, derived_drift, ok, refreshed = [], [], [], 0, []
    for a in man["assets"]:
        p = ROOT / a["path"]
        if not p.exists():
            missing.append(a["path"])
            continue
        size, digest = p.stat().st_size, sha256(p)
        if size == a["size"] and digest == a["sha256"]:
            ok += 1
            continue
        if is_derived(a["path"]):
            derived_drift.append(a["path"])
            if refresh:
                a["size"], a["sha256"] = size, digest
                refreshed.append(a["path"])
            continue
        mismatch.append(f"{a['path']} (size {size} != {a['size']} / sha256)")

    if refresh and (refreshed or derived_drift):
        man["generated_at"] = man.get("generated_at")
        man["refreshed_at"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        man["refresh_note"] = ("仅刷新派生资产（data/processed/**）；强校验资产未改动。"
                               "派生资产由 Daily / Final 管道重新生成。")
        MANIFEST.write_text(json.dumps(man, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(f"manifest: model_version={man['model_version']} code_fingerprint={man['code_fingerprint']}")
    print(f"assets: {ok}/{man['n_assets']} verified, missing={len(missing)}, "
          f"mismatch={len(mismatch)}, derived_drift={len(derived_drift)}")
    for m in missing[:10]:
        print(f"  [MISSING] {m}")
    for m in mismatch[:10]:
        print(f"  [MISMATCH] {m}")
    for m in derived_drift[:10]:
        tag = "REFRESHED" if refresh else "DERIVED_DRIFT"
        print(f"  [{tag}] {m}")

    if missing or mismatch:
        print("\n状态：ASSETS_VERIFY_FAILED")
        return 1
    if derived_drift and not refresh:
        print("\n状态：ASSETS_VERIFY_OK（派生资产有漂移；如属管道正常重跑，用 --refresh 刷新哈希）")
        return 0
    print(f"\n状态：ASSETS_VERIFY_OK{'（已刷新 ' + str(len(refreshed)) + ' 个派生资产）' if refresh else ''}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())