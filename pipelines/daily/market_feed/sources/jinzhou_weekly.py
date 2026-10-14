# -*- coding: utf-8 -*-
"""锦州 · 市政府菜篮子平台「农产品市场价格周分析预测」（城市级零售均价，周度）。

列表：https://www.jz.gov.cn/ztzl/clzxxfbpt/fxyc.htm
条目：<a href="../../info/1797/{id}.htm" title="…周分析预测"><span>…</span></a><label>2026-09-27</label>
正文（散文体，非表格）：「五花猪肉零售均价13.1元/斤」「蔬菜平均价格为3.07元/斤」…
口径 = retail（零售均价，市内 17 家大型超市和市场监测）。

(2026-09-27 实测：猪肉 13.1、牛肉 36.8、羊肉 37.1、鸡肉 8.16、鸡蛋 5.59 元/斤，牛奶 2.5 元/250g。)
"""
from __future__ import annotations

import re
from datetime import date
from typing import Optional

from .. import clock, evidence
from ..http import Session
from ..normalize import parse_float
from ..records import PriceRecord
from .base import Adapter, FetchResult

LIST_URL = "https://www.jz.gov.cn/ztzl/clzxxfbpt/fxyc.htm"
BASE = "https://www.jz.gov.cn"
_ITEM = re.compile(
    r'href="(\.\./\.\./info/1797/\d+\.htm)"[^>]*title="([^"]*)"[\s\S]{0,120}?<label>([^<]*)</label>',
    re.I)
_GOODS = "五花猪肉|猪肉|牛肉|羊肉|鸡肉|鸡蛋|牛奶|鲜奶|大白菜|土豆|黄瓜|茄子|西红柿|青椒|尖椒|芸豆|芹菜|菠菜|韭菜|菜花"


def parse_index(html: str, base_page: str = LIST_URL) -> list[dict]:
    out, seen = [], set()
    for href, title, d in _ITEM.findall(html):
        url = href.replace("../../", BASE + "/")
        if url in seen:
            continue
        seen.add(url)
        out.append({"url": url, "title": title.strip(), "date": d.strip()})
    return out


def article_date(html: str) -> Optional[str]:
    m = re.search(r"发布时间[:：]\s*(\d{4}-\d{2}-\d{2})", html)
    if m:
        return m.group(1)
    m = re.search(r"(\d{4}-\d{2}-\d{2})", html)
    return m.group(1) if m else None


def parse_article(html: str) -> list[dict]:
    txt = re.sub(r"<[^>]+>", " ", re.sub(r"<script[\s\S]*?</script>|<style[\s\S]*?</style>", "", html))
    txt = re.sub(r"\s+", " ", txt)
    rows, seen = [], set()

    def add(name, val, unit):
        key = (name, val)
        if key in seen or val is None:
            return
        seen.add(key)
        rows.append({"product": name, "spec": "零售均价", "unit": f"元/{unit}", "price": val})

    # 「{商品} [五花] 零售均价 13.1 元/斤」等
    for m in re.finditer(rf"({_GOODS})零售均价\s*([\d.]+)\s*元/(斤|250g|500克|公斤|千克)", txt):
        add(m.group(1), parse_float(m.group(2)), m.group(3))
    # 「蔬菜平均价格为 3.07 元/斤」
    for m in re.finditer(r"蔬菜平均价格(?:为)?\s*([\d.]+)\s*元/(斤|500克|公斤)", txt):
        add("蔬菜均价", parse_float(m.group(1)), m.group(2))
    return rows


class JinzhouWeekly(Adapter):
    region_id = "jinzhou"
    source_id = "SRC-JZ-CLZ-WEEKLY"
    source_name = "锦州市人民政府 · 菜篮子平台 农产品市场价格周分析预测"
    source_url = LIST_URL
    price_level = "retail"
    frequency = "weekly"
    is_primary = True

    def collect(self, target_date: Optional[date] = None) -> FetchResult:
        day = (target_date or clock.today()).isoformat()
        res = FetchResult(region_id=self.region_id, source_id=self.source_id,
                          source_name=self.source_name)
        sess = Session()
        collected = clock.now_str()
        try:
            body = sess.get(LIST_URL).body
            res.raw_paths.append(evidence.save_raw(self.region_id, self.source_id, day,
                                                   "list.html", body))
            items = parse_index(body.decode("utf-8", "ignore"))
            if not items:
                res.status = "NO_NEW_PUBLICATION"
                res.schema_ok = False
                res.schema_note = "SOURCE_SCHEMA_CHANGED: 未解析到周报列表"
                return res
            items.sort(key=lambda x: x["date"], reverse=True)
            # 取监测区间不晚于目标日的最新一篇；weekly 允许最新一篇早于目标日
            chosen = next((x for x in items if x["date"] <= day), items[0])
            art = sess.get(chosen["url"], referer=LIST_URL).body
            res.raw_paths.append(evidence.save_raw(self.region_id, self.source_id,
                                                   chosen["date"], "article.html", art))
            rows = parse_article(art.decode("utf-8", "ignore"))
            obs_date = article_date(art.decode("utf-8", "ignore")) or chosen["date"]
            if not rows:
                res.status = "NO_NEW_PUBLICATION"
                res.schema_ok = False
                res.schema_note = "SOURCE_SCHEMA_CHANGED: 周报正文未解析到价格"
                return res
            for r in rows:
                res.records.append(PriceRecord(
                    region_id=self.region_id, region_name="锦州市",
                    source_id=self.source_id, source_name=self.source_name,
                    source_url=self.source_url, market_id="jinzhou_city_retail_avg",
                    product_raw=r["product"], product_standard="",
                    product_specification=r["spec"], observation_date=obs_date,
                    collected_at=collected, original_price=r["price"],
                    original_unit=r["unit"], price_per_kg=None, price_level=self.price_level,
                    raw_evidence_path=res.raw_paths[-1],
                    source_parser_version="jinzhou_weekly-1.0.0",
                    notes=[f"周报：{chosen['title']}"]))
            res.observation_date = obs_date
            res.detail = {"fetched": len(res.records), "articleUrl": chosen["url"],
                          "frequency": self.frequency, "requestedDate": day}
        except Exception as exc:  # noqa: BLE001
            res.status = "FAILED"
            res.error = repr(exc)[:200]
        return res
