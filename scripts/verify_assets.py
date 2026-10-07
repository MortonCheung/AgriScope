#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""校验 runtime/manifest.json 中的大型运行时资产（只读，不下载）。

用法：python3 scripts/verify_assets.py
退出码：0 全部匹配；1 有缺失或哈希不符。
"""
from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "runtime" / "manifest.json"


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def main() -> int:
    if not MANIFEST.exists():
        print("[FAIL] runtime/manifest.json 不存在")
        return 1
    man = json.loads(MANIFEST.read_text(encoding="utf-8"))
    missing, mismatch, ok = [], [], 0
    for a in man["assets"]:
        p = ROOT / a["path"]
        if not p.exists():
            missing.append(a["path"])
            continue
        if p.stat().st_size != a["size"]:
            mismatch.append(f"{a['path']} (size {p.stat().st_size} != {a['size']})")
            continue
        if sha256(p) != a["sha256"]:
            mismatch.append(f"{a['path']} (sha256)")
            continue
        ok += 1
    print(f"manifest: model_version={man['model_version']} code_fingerprint={man['code_fingerprint']}")
    print(f"assets: {ok}/{man['n_assets']} verified, missing={len(missing)}, mismatch={len(mismatch)}")
    for m in missing[:10]:
        print(f"  [MISSING] {m}")
    for m in mismatch[:10]:
        print(f"  [MISMATCH] {m}")
    if missing or mismatch:
        print("\n状态：ASSETS_VERIFY_FAILED")
        return 1
    print("\n状态：ASSETS_VERIFY_OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())