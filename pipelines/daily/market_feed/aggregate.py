# -*- coding: utf-8 -*-
"""汇总层：把采集到的同城/同品种/同日期价格做**算术平均**，产出每日报表 JSON。

规则（严格遵守，不伪造）：
- 按 (region, product_standard, observation_date) 分组；组内取 ``price_per_kg`` 非空记录，
  ``avg_price = round(mean, 2)``，``sample_count = N``（参与平均的非重复记录数）。
- **不混价格层级**：同城同品种同日若存在批发/零售等不同 ``price_level``，分别成条并在
  ``price_level`` 中标注——把批发价与零售价平均会得到无意义的数字（项目硬约束）。
- 仅质量口径可换算为 元/kg 的记录参与；体积/未知单位（``price_per_kg`` 为空）不参与、不猜测。
- 每个 region+product+level 输出其**最新观测日**的一条均值（即"每日报表"）；该 region 当日无新
  发布时，保留其最近一次真实观测并在 ``date`` 中如实标注，不补造当日数据。
- ``price_change`` = 相对同城同品种同口径**上一有效观测日均价**的百分比；无上一日则 ``null``（非 0）。
- 时间统一北京时间 UTC+8；``updated_at`` 精确到秒。
"""
from __future__ import annotations

import hashlib
import json
import os
import subprocess
from datetime import date
from pathlib import Path
from typing import Optional

from . import config as C
from .clock import now_str, today
from .store import Store

REPORT_SCHEMA_VERSION = "1.0.0"
REPORT_TYPE = "seven_region_daily_average"


def git_version() -> str:
    """当前源码版本（短哈希）；不可用时返回 unknown（不阻塞报表）。"""
    try:
        out = subprocess.run(["git", "rev-parse", "--short", "HEAD"],
                             cwd=str(C.REPO_ROOT), capture_output=True, text=True, timeout=5)
        v = out.stdout.strip()
        return v or "unknown"
    except Exception:  # noqa: BLE001
        return "unknown"


def _mean(values: list[float]) -> Optional[float]:
    vals = [v for v in values if v is not None]
    if not vals:
        return None
    return round(sum(vals) / len(vals), 2)


def _pct(new: Optional[float], old: Optional[float]) -> Optional[float]:
    if new is None or old in (None, 0):
        return None
    return round((new - old) / old * 100.0, 2)


def build_report(store: Store, *, generated_at: Optional[str] = None,
                 version: Optional[str] = None) -> dict:
    """从数据库构建每日汇总报表（不含写盘）。"""
    gen = generated_at or now_str()
    items: list[dict] = []

    for region_id in C.REGION_ORDER:
        region_name = C.REGIONS[region_id]["name"]
        rows = store.region_rows(region_id)  # 已按 observation_date 升序、price_per_kg 非空
        # {(product, price_level): {date: [ (price, source_id) ]}}
        groups: dict[tuple[str, str], dict[str, list[tuple[float, str]]]] = {}
        for r in rows:
            prod = r["product_standard"] or r["product_raw"]
            key = (prod, r["price_level"])
            groups.setdefault(key, {}).setdefault(r["observation_date"], []).append(
                (float(r["price_per_kg"]), r["source_id"]))
        for (prod, level) in sorted(groups):
            by_date = groups[(prod, level)]
            dates = sorted(by_date)
            latest = dates[-1]
            cur = by_date[latest]
            avg = _mean([p for p, _ in cur])
            if avg is None:
                continue
            prev_avg = None
            if len(dates) >= 2:
                prev_avg = _mean([p for p, _ in by_date[dates[-2]]])
            items.append({
                "date": latest,
                "region": region_id,             # 英文小写，前端指定
                "regionName": region_name,
                "product": prod,                 # 正式展示名（如 土豆）
                "unit": "元/kg",
                "avg_price": avg,
                "sample_count": len(cur),        # 同城同品种同日同口径的样本数 N
                "source_count": len({s for _, s in cur}),
                "price_level": level,            # 价格口径（不混层级）
                "price_level_cn": C.PRICE_LEVEL_CN.get(level, level),
                "price_change": _pct(avg, prev_avg),
                "updated_at": gen,
            })

    payload = {
        "schemaVersion": REPORT_SCHEMA_VERSION,
        "reportType": REPORT_TYPE,
        "date": today().isoformat(),
        "generatedAt": gen,
        "collectedAt": gen,            # 采集/生成时刻（≠ 各行 observation_date）
        "timezone": C.TZ_NAME,
        "version": version or git_version(),
        "regionCount": len({i["region"] for i in items}),
        "itemCount": len(items),
        "items": items,
        "byRegion": _build_by_region(items),
    }
    payload["versionHash"] = hashlib.sha256(
        json.dumps(items, ensure_ascii=False, sort_keys=True).encode("utf-8")).hexdigest()[:16]
    return payload


def _level_order(level: str) -> int:
    return C.PRICE_LEVEL_ORDER.index(level) if level in C.PRICE_LEVEL_ORDER else 99


def _build_by_region(items: list[dict]) -> list[dict]:
    """把扁平的 (region, product, price_level) 条目重排成前端易读的嵌套视图。

    每个 region 给出 ``supportedPriceLevels``（该区声明支持的口径，用于按钮）；
    每个 product 的 ``prices[]`` **始终按声明口径列出**：缺失的口径 ``price=null``（绝不填 0）。
    """
    regions: dict[str, dict] = {}
    for it in items:
        rid = it["region"]
        rec = regions.setdefault(rid, {"regionName": it["regionName"],
                                       "observation_date": it["date"], "products": {}})
        if it["date"] > rec["observation_date"]:
            rec["observation_date"] = it["date"]
        prod = rec["products"].setdefault(it["product"], {})
        prod[it["price_level"]] = {
            "price_level": it["price_level"], "price_level_cn": it["price_level_cn"],
            "price": it["avg_price"], "unit": it["unit"],
            "sample_count": it["sample_count"], "source_count": it["source_count"],
            "price_change": it["price_change"], "observation_date": it["date"],
        }

    out = []
    for rid in C.REGION_ORDER:
        if rid not in regions:
            continue
        rec = regions[rid]
        declared = C.REGION_PRICE_LEVELS.get(rid, [])
        products = []
        for name in sorted(rec["products"]):
            present = rec["products"][name]
            levels = sorted(set(declared) | set(present), key=_level_order)
            prices = []
            for lv in levels:
                if lv in present:
                    prices.append(present[lv])
                else:
                    prices.append({"price_level": lv,
                                   "price_level_cn": C.PRICE_LEVEL_CN.get(lv, lv),
                                   "price": None, "unit": "元/kg", "sample_count": 0,
                                   "source_count": 0, "price_change": None,
                                   "observation_date": None})
            products.append({"product": name, "prices": prices})
        out.append({
            "region": rid,
            "regionName": rec["regionName"],
            "observation_date": rec["observation_date"],
            "supportedPriceLevels": [{"price_level": lv,
                                      "price_level_cn": C.PRICE_LEVEL_CN.get(lv, lv)}
                                     for lv in sorted(declared, key=_level_order)],
            "products": products,
        })
    return out


def report_path(report: dict, out_dir: Optional[Path] = None) -> Path:
    d = Path(out_dir) if out_dir else C.REPORT_DIR
    return d / f"{report['date']}-sevenday.json"


def write_report(report: dict, out_dir: Optional[Path] = None) -> str:
    """原子写盘。返回文件路径。"""
    path = report_path(report, out_dir)
    path.parent.mkdir(parents=True, exist_ok=True)
    import tempfile
    fd, tmp = tempfile.mkstemp(dir=str(path.parent), prefix=".tmp-")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(report, f, ensure_ascii=False, indent=1)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, path)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)
    return str(path)


def aggregate(store: Store, out_dir: Optional[Path] = None) -> dict:
    report = build_report(store)
    path = write_report(report, out_dir)
    return {"path": path, "itemCount": report["itemCount"],
            "versionHash": report["versionHash"], "date": report["date"]}
