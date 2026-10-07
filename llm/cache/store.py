# -*- coding: utf-8 -*-
"""文件型 LLM 缓存。

规则（§9.2）：
  - key = provider config + model + rendered prompt hash + schema + context + request config；
  - **只有通过数字安全校验的结构化结果**才允许写入；
  - API 错误（超时/限流/5xx/解析失败）一律**不写缓存**。
"""
from __future__ import annotations
import json
import os
import tempfile
from typing import Any, Dict, Optional

from llm.common import LLM_CACHE, ensure_llm_dirs, stable_hash, now_iso

_STATS = {"hits": 0, "misses": 0, "writes": 0, "rejected_writes": 0}


def cache_key(context_hash: str, prompt_hash: str, model: str, *,
              provider_config: Dict[str, Any], schema: Dict[str, Any],
              request_config: Dict[str, Any]) -> str:
    return stable_hash({"cache_version": 2, "context_hash": context_hash,
                        "rendered_prompt_hash": prompt_hash, "model": model,
                        "provider_config": provider_config, "schema": schema,
                        "request_config": request_config}, n=64)


def _path(key: str):
    return LLM_CACHE / f"{key}.json"


def get(key: str) -> Optional[Dict[str, Any]]:
    p = _path(key)
    if p.exists():
        try:
            obj = json.loads(p.read_text(encoding="utf-8"))
            if not isinstance(obj, dict) or not isinstance(obj.get("payload"), dict):
                raise ValueError("invalid_cache_structure")
        except (ValueError, OSError):
            _STATS["misses"] += 1
            return None
        _STATS["hits"] += 1
        return obj
    _STATS["misses"] += 1
    return None


def put(key: str, payload: Dict[str, Any], meta: Dict[str, Any], validated: bool) -> bool:
    """validated=False 时拒绝写入（保证缓存不被未校验/错误结果污染）。"""
    if not validated or not isinstance(payload, dict):
        _STATS["rejected_writes"] += 1
        return False
    ensure_llm_dirs()
    obj = {"payload": payload, "meta": meta, "cached_at": now_iso()}
    fd, temp = tempfile.mkstemp(prefix=".cache-", dir=LLM_CACHE)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(obj, handle, ensure_ascii=False, indent=2, allow_nan=False)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temp, _path(key))
    finally:
        if os.path.exists(temp):
            os.unlink(temp)
    _STATS["writes"] += 1
    return True


def stats() -> Dict[str, int]:
    return dict(_STATS)


__all__ = ["cache_key", "get", "put", "stats"]
