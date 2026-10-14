# -*- coding: utf-8 -*-
"""P0 数据源：沈阳菜篮子信息发布平台（结构化 JSON，日度，公开无鉴权）。

复用 AgriScope/pipelines/data_foundation/collectors/shenyang_price.py 已验证的接口与参数：
    GET {SOURCE_API}?marketType={1|2|3}&dates=YYYY-MM-DD&page=1&limit=100

原始响应原样落盘（原子写、不修改）：
    data/raw/daily/shenyang_clz/<date>/mt<n>.json      原始 JSON
    data/raw/daily/shenyang_clz/<date>/metadata.json   抓取元数据（URL/时间/状态/条数）

网络礼貌：合理 User-Agent、有限重试、超时、请求间隔。
"""
from __future__ import annotations

import json
import hashlib
import math
import os
import ssl
import time
import urllib.parse
import urllib.request
import uuid
from dataclasses import dataclass, field, asdict
from pathlib import Path

from . import config as C
from . import io_utils as IO

_UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
       "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")

# 抓取状态
ST_OK = "OK"
ST_EMPTY = "EMPTY"
ST_FAIL = "FAIL"
ST_SKIPPED = "SKIPPED"

# 结构漂移标记（fail loud）
SCHEMA_CHANGED = "SOURCE_SCHEMA_CHANGED"


@dataclass
class RawResult:
    date: str
    market_type: str
    url: str
    status: str
    count: int = 0
    records: list = field(default_factory=list)
    raw_path: str | None = None
    error: str | None = None
    crawl_time: str = ""
    http_attempts: int = 0
    schema_ok: bool = True
    schema_note: str | None = None
    raw_bytes: bytes | None = field(default=None, repr=False)


def _ctx() -> ssl.SSLContext:
    return ssl.create_default_context(cafile=C.SOURCE_CA_FILE)


def _build_url(target_date: str, market_type: str) -> str:
    params = {"marketType": market_type, "dates": target_date, "page": 1, "limit": 100}
    return f"{C.SOURCE_API}?{urllib.parse.urlencode(params)}"


def fetch(target_date: str, market_type: str, retries: int | None = None,
          timeout: int | None = None) -> RawResult:
    """抓取单个 (日期, marketType)。带有限重试与超时，失败不抛异常、只记录。"""
    retries = C.HTTP_RETRIES if retries is None else retries
    timeout = C.HTTP_TIMEOUT if timeout is None else timeout
    url = _build_url(target_date, market_type)
    now = IO.now_str()
    last_err = None
    for attempt in range(1, retries + 1):
        try:
            req = urllib.request.Request(url, headers={
                "User-Agent": _UA,
                "X-Requested-With": "XMLHttpRequest",
                "Referer": C.SOURCE_REFERER,
            })
            with urllib.request.urlopen(req, timeout=timeout, context=_ctx()) as resp:
                raw_bytes = resp.read()
            obj = json.loads(raw_bytes)
            if not isinstance(obj, dict) or obj.get("code") != 0:
                return RawResult(date=target_date, market_type=market_type, url=url,
                                 status=ST_FAIL, error="SOURCE_RESPONSE_NOT_SUCCESS", schema_ok=False,
                                 crawl_time=now, http_attempts=attempt, raw_bytes=raw_bytes)
            data = obj.get("data")
            if not isinstance(data, list):
                # 结构变化：期望 data 字段却不存在 → fail loud，不当作"空"
                return RawResult(date=target_date, market_type=market_type, url=url,
                                 status=ST_EMPTY, count=0, records=[],
                                 crawl_time=now, http_attempts=attempt,
                                 schema_ok=False,
                                 schema_note=f"{SCHEMA_CHANGED}: data 不是列表（keys={sorted(obj)[:8]}）", raw_bytes=raw_bytes)
            res = RawResult(date=target_date, market_type=market_type, url=url,
                            status=ST_OK if data else ST_EMPTY, count=len(data),
                            records=data, crawl_time=now, http_attempts=attempt, raw_bytes=raw_bytes)
            res.schema_note = _schema_check(res)
            res.schema_ok = not (res.schema_note or "").startswith(SCHEMA_CHANGED)
            return res
        except Exception as exc:  # noqa: BLE001
            last_err = repr(exc)[:200]
            if attempt < retries:
                time.sleep(1.5 * attempt)
    return RawResult(date=target_date, market_type=market_type, url=url, status=ST_FAIL,
                     error=last_err, crawl_time=now, http_attempts=retries)


# 必需字段（结构漂移 fail-loud 的依据）
_REQUIRED_FIELDS = ("productName", "price", "unit", "dates", "marketType")


def _schema_check(res: RawResult) -> str | None:
    """字段级结构检查：批发口径作物数异常或必需字段缺失 → SOURCE_SCHEMA_CHANGED。"""
    if res.status != ST_OK or not res.records:
        return None
    missing = [k for k in _REQUIRED_FIELDS if not all(isinstance(r, dict) and k in r for r in res.records)]
    if missing:
        return f"{SCHEMA_CHANGED}: 记录缺少必需字段 {missing}"
    for row in res.records:
        if str(row["marketType"]) != res.market_type:
            return f"{SCHEMA_CHANGED}: 来源价格类型与请求 marketType 不一致"
        published = IO.epoch_ms_to_tz_str(row.get("dates"))
        if not published or not published.startswith(res.date):
            return f"{SCHEMA_CHANGED}: 来源观测日期缺失或与请求日期不一致"
        if isinstance(row["price"], bool):
            return f"{SCHEMA_CHANGED}: 布尔值不是有效价格"
        try:
            price = float(row["price"])
        except (TypeError, ValueError, OverflowError):
            price = math.nan
        if not math.isfinite(price) or price <= 0 or not str(row["productName"]).strip() or str(row["unit"]).replace(" ", "") not in C.UNIT_TO_KG:
            return f"{SCHEMA_CHANGED}: 非法商品、价格或未确认单位"
    is_wholesale = C.MARKET_TYPES.get(res.market_type, {}).get("model_comparable")
    if is_wholesale and res.count != C.EXPECTED_WHOLESALE_CROPS:
        return (f"{SCHEMA_CHANGED}: 批发口径作物数 {res.count} ≠ 期望 "
                f"{C.EXPECTED_WHOLESALE_CROPS}")
    return None


def _archive(result: RawResult) -> RawResult:
    """原始响应 + 元数据落盘（原子写；dry-run 不落盘）。

    每份响应字节不可变；metadata pointer 指向最近有效 success。
    失败、空页或结构异常不会覆盖已有成功证据与观测抓取时间。
    """
    day_dir = C.RAW_DAILY_DIR / "shenyang_clz" / result.date
    day_dir.mkdir(parents=True, exist_ok=True)
    raw_file = day_dir / f"mt{result.market_type}.json"
    meta_file = day_dir / "metadata.json"
    meta = IO.read_json_safe(meta_file, {}) or {}
    key = f"mt{result.market_type}"
    valid = result.status == ST_OK and result.schema_ok and result.count > 0
    # Compatibility for offline fixture constructors; real network calls always carry exact bytes.
    body = result.raw_bytes
    if body is None and result.status in (ST_OK, ST_EMPTY):
        body = json.dumps({"code": 0, "count": result.count, "data": result.records}, ensure_ascii=False).encode()
    raw_sha256 = hashlib.sha256(body).hexdigest() if body is not None else None
    previous = meta.get(key)
    previous = previous if isinstance(previous, dict) else {}
    reused = False
    if (valid and previous.get("status") == ST_OK and previous.get("schema_ok") is True
            and isinstance(previous.get("count"), int) and previous["count"] > 0
            and previous.get("raw_sha256") == raw_sha256
            and isinstance(previous.get("active_raw_path"), str) and previous.get("crawl_time")):
        pointer = Path(previous["active_raw_path"])
        candidate = C.ROOT / pointer
        try:
            if (not pointer.is_absolute() and candidate.is_file() and not candidate.is_symlink()
                    and candidate.resolve().is_relative_to(day_dir.resolve())
                    and hashlib.sha256(candidate.read_bytes()).hexdigest() == raw_sha256):
                result.raw_path = previous["active_raw_path"]
                reused = True
        except (OSError, ValueError):
            pass  # A broken pointer cannot establish identical immutable evidence.
    if body is not None and not reused:
        target = raw_file if valid and not raw_file.exists() else day_dir / "attempts" / f"mt{result.market_type}.{hashlib.sha256(body).hexdigest()[:16]}.{uuid.uuid4().hex}.json"
        IO.atomic_write_bytes(target, body)
        result.raw_path = str(target.relative_to(C.ROOT))
    mt_meta = asdict(result)
    mt_meta.pop("records", None)
    mt_meta.pop("raw_bytes", None)
    mt_meta["raw_sha256"] = raw_sha256
    mt_meta["chain_run_id"] = os.environ.get("AGRISCOPE_CHAIN_RUN_ID")
    mt_meta["price_level"] = C.MARKET_TYPES.get(result.market_type, {}).get("price_level")
    mt_meta["market_cn"] = C.MARKET_TYPES.get(result.market_type, {}).get("market_cn")
    mt_meta["source_id"] = C.SOURCE_ID
    mt_meta["source_name"] = C.SOURCE_NAME
    mt_meta["source_url"] = C.SOURCE_URL
    mt_meta["parser_version"] = C.SOURCE_PARSER_VERSION
    mt_meta["timezone"] = C.SOURCE_TIMEZONE
    meta.setdefault("latest_attempts", {})[key] = mt_meta
    if reused:
        # The attempt retains its actual request time; normalized evidence and snapshots
        # retain the original successful evidence time and path for byte-identical data.
        result.crawl_time = previous["crawl_time"]
    elif valid:
        mt_meta["active_raw_path"] = result.raw_path
        meta[key] = mt_meta
    elif key not in meta:
        meta[key] = mt_meta
    meta["date"] = result.date
    IO.atomic_write_json(meta_file, meta)
    return result


def _has_data(raw_file: Path) -> bool:
    """已归档的原始文件是否含有效数据（空响应不算，必须重取）。"""
    obj = IO.read_json_safe(raw_file)
    return bool(obj and obj.get("data"))


def collect_day(target_date: str, market_types: list[str] | None = None,
                dry_run: bool = False, skip_existing: bool = False) -> list[RawResult]:
    """采集某一天全部 marketType。

    skip_existing 仅对**已含有效数据**的日期生效；空响应会被重新抓取，
    避免"当日尚未发布"被永久跳过（发布延迟场景）。
    目标日期由调用方保证总是重取。
    """
    market_types = market_types or list(C.MARKET_TYPES.keys())
    if any(mt not in C.MARKET_TYPES for mt in market_types):
        raise ValueError("UNSUPPORTED_MARKET_TYPE")
    out: list[RawResult] = []
    for mt in market_types:
        raw_file = C.RAW_DAILY_DIR / "shenyang_clz" / target_date / f"mt{mt}.json"
        legacy = C.DATA_DIR / "raw" / "prices" / "shenyang_clz" / f"{target_date}_mt{mt}.json"
        if skip_existing and _has_data(raw_file):
            out.append(RawResult(date=target_date, market_type=mt,
                                 url=_build_url(target_date, mt), status=ST_SKIPPED,
                                 raw_path=str(raw_file.relative_to(C.ROOT))))
            continue
        if skip_existing and _has_data(legacy) and not raw_file.exists():
            _copy_legacy(legacy, raw_file)
            n = len(IO.read_json_safe(raw_file, {}).get("data") or [])
            out.append(RawResult(date=target_date, market_type=mt,
                                 url=_build_url(target_date, mt), status=ST_SKIPPED,
                                 count=n, raw_path=str(raw_file.relative_to(C.ROOT))))
            continue
        res = fetch(target_date, mt)
        if not dry_run:
            _archive(res)
        elif res.status in (ST_OK, ST_EMPTY):
            res.raw_path = None
        out.append(res)
        time.sleep(C.HTTP_SLEEP)
    return out


def _copy_legacy(legacy: Path, raw_file: Path) -> None:
    """旧布局已有有效数据 → 搬运行证据（不重复请求），保留来源标注。"""
    raw_file.parent.mkdir(parents=True, exist_ok=True)
    IO.atomic_write_bytes(raw_file, legacy.read_bytes())
    meta_file = raw_file.parent / "metadata.json"
    meta = IO.read_json_safe(meta_file, {}) or {}
    meta["date"] = raw_file.parent.name
    meta.setdefault("migrated_from_legacy", str(legacy.relative_to(C.ROOT)))
    IO.atomic_write_json(meta_file, meta)
