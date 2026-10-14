# -*- coding: utf-8 -*-
"""朝阳 · 市发改委「朝阳市主要菜篮子产品每日价情」（城市级全市平均价，日度）。

列表：https://fgw.chaoyang.gov.cn/cysfzhggwyh/zwgk/zwgkzdgz/wjzd/glist.html
      分页 glist{p}.html；条目形如 <a href=".../html/CYFGW/YYYYMM/{id}.html">
      <b>朝阳市主要菜篮子产品每日价情</b><span>2026-10-12</span></a>
文章表格列：名称 / 类型 / 单位 / 全市平均价格（口径 = market_average）。

(2026-10-12 实测：大米 标一 元/500克 2.85、鲜猪肉 去骨后腿肉 8.60 等。)
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

LIST_URL = "https://fgw.chaoyang.gov.cn/cysfzhggwyh/zwgk/zwgkzdgz/wjzd/glist.html"
_ITEM = re.compile(
    r'href="(https://fgw\.chaoyang\.gov\.cn/html/CYFGW/\d{6}/[^"]+\.html)"[^>]*>\s*'
    r"<b>([^<]*)</b>\s*<span>([^<]*)</span>", re.I)
# 兜底：无 <b>/<span> 包装时
_ITEM_LOOSE = re.compile(
    r'href="(https://fgw\.chaoyang\.gov\.cn/html/CYFGW/\d{6}/[^"]+\.html)"', re.I)


def parse_index(html: str) -> list[dict]:
    items = [{"url": u, "title": t.strip(), "date": d.strip()}
             for u, t, d in _ITEM.findall(html)]
    seen, out = set(), []
    for it in items:
        if it["url"] not in seen:
            seen.add(it["url"])
            out.append(it)
    return out


def parse_table(html: str) -> list[dict]:
    rows = []
    for t in re.findall(r"<table[\s\S]*?</table>", html, re.I):
        for r in re.findall(r"<tr[\s\S]*?</tr>", t, re.I):
            cells = []
            for c in re.findall(r"<t[dh][\s\S]*?</t[dh]>", r, re.I):
                txt = re.sub(r"<[^>]+>", " ", c).replace("&nbsp;", " ").replace("\xa0", " ")
                cells.append(re.sub(r"\s+", " ", txt).strip())
            if len(cells) < 4 or not cells[0] or cells[0] == "名称":
                continue
            price = parse_float(cells[3])
            if price is None:
                continue
            rows.append({"product": cells[0], "spec": cells[1],
                         "unit": cells[2], "price": price})
    return rows


class ChaoyangBasket(Adapter):
    region_id = "chaoyang"
    source_id = "SRC-CY-FGW-BASKET"
    source_name = "朝阳市发展和改革委员会 · 主要菜篮子产品每日价情（全市平均）"
    source_url = LIST_URL
    price_level = "market_average"
    frequency = "daily"
    is_primary = True

    def collect(self, target_date: Optional[date] = None) -> FetchResult:
        day = (target_date or clock.today()).isoformat()
        res = FetchResult(region_id=self.region_id, source_id=self.source_id,
                          source_name=self.source_name)
        sess = Session()
        collected = clock.now_str()
        try:
            index_rows = []
            for p in (1, 2, 3):
                url = LIST_URL if p == 1 else LIST_URL.replace("glist.html", f"glist{p}.html")
                try:
                    body = sess.get(url, referer=LIST_URL).body
                except Exception:  # noqa: BLE001
                    break
                res.raw_paths.append(evidence.save_raw(self.region_id, self.source_id, day,
                                                       f"list_{p}.html", body))
                html = body.decode("utf-8", "ignore")
                got = parse_index(html)
                index_rows.extend(got)
                if not got or (got and max(x["date"] for x in got) < day
                               and f"glist{p+1}" not in html):
                    # 列表按日期降序；已覆盖目标日或列表结束
                    if got and min(x["date"] for x in got) < day:
                        break
            # 选择目标日文章；若无则取最新一篇（记录真实监测日）
            dated = [x for x in index_rows if x["date"]]
            dated.sort(key=lambda x: x["date"], reverse=True)
            target = next((x for x in dated if x["date"] == day), None)
            chosen = target or (dated[0] if dated else None)
            if chosen is None:
                res.status = "NO_NEW_PUBLICATION"
                return res
            art = sess.get(chosen["url"], referer=LIST_URL).body
            res.raw_paths.append(evidence.save_raw(self.region_id, self.source_id,
                                                   chosen["date"], "article.html", art))
            rows = parse_table(art.decode("utf-8", "ignore"))
            obs_date = chosen["date"]
            if not rows:
                res.status = "NO_NEW_PUBLICATION"
                res.schema_ok = False
                res.schema_note = "SOURCE_SCHEMA_CHANGED: 文章未解析到价情表"
                return res
            for r in rows:
                res.records.append(PriceRecord(
                    region_id=self.region_id, region_name="朝阳市",
                    source_id=self.source_id, source_name=self.source_name,
                    source_url=self.source_url, market_id="chaoyang_city_average",
                    product_raw=r["product"], product_standard="",
                    product_specification=r["spec"] or "",
                    observation_date=obs_date, collected_at=collected,
                    original_price=r["price"], original_unit=r["unit"], price_per_kg=None,
                    price_level=self.price_level,
                    raw_evidence_path=res.raw_paths[-1],
                    source_parser_version="chaoyang_basket-1.0.0",
                    notes=[f"文章：{chosen['title']}"]))
            res.observation_date = obs_date
            res.detail = {"fetched": len(res.records), "articleUrl": chosen["url"],
                          "requestedDate": day, "isTargetDate": target is not None}
            if target is None:
                res.status = "NO_NEW_PUBLICATION"
        except Exception as exc:  # noqa: BLE001
            res.status = "FAILED"
            res.error = repr(exc)[:200]
        return res
