# -*- coding: utf-8 -*-
"""沈阳 · 菜篮子信息发布平台（结构化 JSON，日度，公开无鉴权）。

GET https://www.lnsyjgjc.com/api/showList?marketType={1|2|3}&dates=YYYY-MM-DD&page=1&limit=100
  marketType 1=批发(wholesale) 2=超市零售(supermarket) 3=集市零售(retail_market)
每条含 productName / price / unit / grade。 (2026-10-06 实测：批发 10 品种，单位 元/500g)

口径映射沿用项目治理口径；必需字段缺失或批发作物数异常 → SOURCE_SCHEMA_CHANGED。
"""
from __future__ import annotations

import json
import os
from datetime import date, timedelta
from typing import Optional

from .. import clock, evidence
from ..http import Session
from ..normalize import parse_float
from ..records import PriceRecord
from .base import Adapter, FetchResult

API = "https://www.lnsyjgjc.com/api/showList"
REFERER = "https://www.lnsyjgjc.com/api/daily"
LOOKBACK = int(os.environ.get("AGRISCOPE_SY_LOOKBACK", "5"))
MARKET_TYPES = {
    "1": ("wholesale", "批发价格"),
    "2": ("supermarket", "超市零售"),
    "3": ("retail_market", "集市零售"),
}
EXPECTED_WHOLESALE_CROPS = 10
REQUIRED_FIELDS = ("productName", "price", "unit")


class ShenyangCLZ(Adapter):
    region_id = "shenyang"
    source_id = "SRC-SY-CLZ"
    source_name = "沈阳市发展和改革委员会 · 沈阳菜篮子信息发布平台"
    source_url = "https://fgw.shenyang.gov.cn/wjgz/clzxxfbpt/"
    price_level = "wholesale"
    frequency = "daily"
    is_primary = True

    def collect(self, target_date: Optional[date] = None) -> FetchResult:
        day = (target_date or clock.today()).isoformat()
        res = FetchResult(region_id=self.region_id, source_id=self.source_id,
                          source_name=self.source_name, observation_date=day)
        sess = Session()
        collected = clock.now_str()
        # 当日未发布时回看最近 LOOKBACK 天（发布延迟/周末），取最早命中者；
        # observation_date 记录**命中的真实官方日期**，不写成目标日。
        lookback = LOOKBACK
        base = target_date or clock.today()
        payloads, hit_day = {}, None
        try:
            for back in range(lookback + 1):
                cand = (base - timedelta(days=back)).isoformat()
                got, cand_payloads = {}, {}
                for mt in MARKET_TYPES:
                    url = f"{API}?marketType={mt}&dates={cand}&page=1&limit=100"
                    resp = sess.get(url, referer=REFERER,
                                    extra_headers={"X-Requested-With": "XMLHttpRequest"})
                    cand_payloads[mt] = resp.body
                    try:
                        got[mt] = json.loads(resp.body.decode("utf-8", "replace")).get("data") or []
                    except Exception:  # noqa: BLE001
                        got[mt] = []
                if got.get("1"):
                    payloads, hit_day = cand_payloads, cand
                    for mt, body in payloads.items():
                        res.raw_paths.append(evidence.save_raw(self.region_id, self.source_id,
                                                               cand, f"mt{mt}.json", body))
                    break
            if hit_day is None:
                # 全部为空：仍归档目标日原始响应，状态 NO_NEW_PUBLICATION
                for mt, body in cand_payloads.items():
                    res.raw_paths.append(evidence.save_raw(self.region_id, self.source_id,
                                                           day, f"mt{mt}.json", body))
                res.status = "NO_NEW_PUBLICATION"
                res.detail = {"lookback": lookback, "requestedDate": day}
                return res
        except Exception as exc:  # noqa: BLE001
            res.status = "FAILED"
            res.error = repr(exc)[:200]
            return res
        day = hit_day
        res.observation_date = hit_day

        for mt, body in payloads.items():
            level, market_cn = MARKET_TYPES[mt]
            try:
                obj = json.loads(body.decode("utf-8", "replace"))
            except Exception as exc:  # noqa: BLE001
                res.schema_ok = False
                res.schema_note = f"SOURCE_SCHEMA_CHANGED: marketType={mt} 非 JSON（{exc}）"
                continue
            data = obj.get("data")
            if data is None:
                res.schema_ok = False
                res.schema_note = (f"SOURCE_SCHEMA_CHANGED: marketType={mt} 缺少 data 字段 "
                                   f"(keys={sorted(obj)[:8]})")
                continue
            for item in data:
                missing = [k for k in REQUIRED_FIELDS if k not in item]
                if missing:
                    res.schema_ok = False
                    res.schema_note = f"SOURCE_SCHEMA_CHANGED: 记录缺少 {missing}"
                    continue
                price = parse_float(item.get("price"))
                if price is None:
                    continue
                res.records.append(PriceRecord(
                    region_id=self.region_id, region_name="沈阳市",
                    source_id=self.source_id, source_name=self.source_name,
                    source_url=self.source_url, market_id=f"shenyang_{market_cn}",
                    product_raw=str(item.get("productName")),
                    product_standard="", product_specification=str(item.get("grade") or ""),
                    observation_date=day, collected_at=collected,
                    original_price=price, original_unit=str(item.get("unit") or ""),
                    price_per_kg=None, price_level=level,
                    raw_evidence_path=res.raw_paths[-1] if res.raw_paths else "",
                    source_parser_version="shenyang_clz-1.0.0",
                    notes=[f"marketType={mt}"]))
            if mt == "1" and data and len(data) != EXPECTED_WHOLESALE_CROPS:
                res.schema_ok = False
                res.schema_note = (f"SOURCE_SCHEMA_CHANGED: 批发作物数 {len(data)} ≠ "
                                   f"期望 {EXPECTED_WHOLESALE_CROPS}")
        res.detail = {"marketTypes": list(MARKET_TYPES), "fetched": len(res.records)}
        if not res.records:
            res.status = "NO_NEW_PUBLICATION"
        return res
