# -*- coding: utf-8 -*-
"""辽宁全省 · 省发改委「每日价格」（省级监测均价，日度）。

列表：https://fgw.ln.gov.cn/fgw/xxgk/jgjc/mrjg/index.shtml
数据页（iframe）：https://fgw.ln.gov.cn/wjweb/price/MRJQ.aspx  （GBK，ASP.NET WebForms）
  历史日期：POST __doPostBack 形式，字段 __EVENTTARGET=btncxjq & tnxtime=YYYY-MM-DD
内容：辽宁主要农副产品（14 种）+ 主要蔬菜（16 种）的**全省平均价**，监测时间在表内。
  这是省级监测均价，**不是**六市算术平均；价格口径 market_average。

(2026-10-13 实测：农副 14 + 蔬菜 16，单位 元/500克；豆油 元/5升、鲜奶 元/500ml 不换算。)
"""
from __future__ import annotations

import re
from datetime import date
from typing import Optional

from .. import clock, config as C, evidence
from ..http import Session
from ..normalize import parse_float
from ..records import PriceRecord
from .base import Adapter, FetchResult

URL = "https://fgw.ln.gov.cn/wjweb/price/MRJQ.aspx"
LIST_URL = "https://fgw.ln.gov.cn/fgw/xxgk/jgjc/mrjg/index.shtml"
_HIDDEN = ("__VIEWSTATE", "__VIEWSTATEGENERATOR", "__EVENTVALIDATION")


def _hidden(html: str) -> dict:
    out = {}
    for n in _HIDDEN:
        m = re.search(r'name="' + n + r'"[^>]*value="([^"]*)"', html)
        out[n] = m.group(1) if m else ""
    return out


def _cells(row: str) -> list[str]:
    out = []
    for c in re.findall(r"<t[dh][\s\S]*?</t[dh]>", row, re.I):
        t = re.sub(r"<[^>]+>", " ", c).replace("&nbsp;", " ").replace("\xa0", " ")
        out.append(re.sub(r"\s+", " ", t).strip())
    return out


def parse_page(html: str) -> tuple[list[dict], Optional[str]]:
    """返回 (rows, 监测时间)。rows: {product, spec, unit, price, table_title}。"""
    rows, monitor = [], None
    for t in re.findall(r"<table[\s\S]*?</table>", html, re.I):
        trs = re.findall(r"<tr[\s\S]*?</tr>", t, re.I)
        grid = [_cells(r) for r in trs]
        grid = [g for g in grid if any(g)]
        if not grid:
            continue
        flat = " ".join(" ".join(g) for g in grid)
        if "监测时间" in flat:
            m = re.search(r"监测时间[:：]\s*(\d{4}-\d{2}-\d{2})", flat)
            if m:
                monitor = m.group(1)
        header_idx = next((i for i, g in enumerate(grid)
                           if "名称" in g and any("平均价格" in x for x in g)), None)
        if header_idx is None:
            continue
        title = grid[0][0] if grid and grid[0] else ""
        for g in grid[header_idx + 1:]:
            if len(g) < 4:
                continue
            name, spec, unit, price = g[0], g[1], g[2], g[3]
            if parse_float(price) is None:
                continue
            rows.append({"product": name, "spec": spec, "unit": unit,
                         "price": parse_float(price), "table_title": title})
    return rows, monitor


class LiaoningFgwDaily(Adapter):
    region_id = "liaoning"
    source_id = "SRC-LN-FGW-DAILY"
    source_name = "辽宁省发展和改革委员会 · 每日价格（省级监测均价）"
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
            resp = sess.get(URL, referer=LIST_URL)
            html = resp.text(("gbk", "gb18030", "utf-8"))
            res.raw_paths.append(evidence.save_raw(self.region_id, self.source_id, day,
                                                   "page_init.html", resp.body))
            monitor = None
            rows, monitor = parse_page(html)
            # 目标日期与页面监测日不一致 → 回传表单查询历史日期
            if day != monitor:
                hid = _hidden(html)
                form = dict(hid)
                form.update({"__EVENTTARGET": "btncxjq", "__EVENTARGUMENT": "", "tnxtime": day})
                resp2 = sess.post_form(URL, form, referer=URL)
                html2 = resp2.text(("gbk", "gb18030", "utf-8"))
                res.raw_paths.append(evidence.save_raw(self.region_id, self.source_id, day,
                                                       "page_query.html", resp2.body))
                rows2, monitor2 = parse_page(html2)
                if rows2:
                    rows, monitor, html = rows2, monitor2, html2
            if not rows:
                res.status = "NO_NEW_PUBLICATION"
                res.schema_ok = False
                res.schema_note = "SOURCE_SCHEMA_CHANGED: 未解析到价格表（可能当日未发布）"
                return res
        except Exception as exc:  # noqa: BLE001
            res.status = "FAILED"
            res.error = repr(exc)[:200]
            return res

        obs_date = monitor or day
        for r in rows:
            # 「混等(收购价)」等属收购口径，单列 purchase，不与监测均价混在同一序列
            level = "purchase" if "收购" in (r["spec"] or "") else self.price_level
            res.records.append(PriceRecord(
                region_id=self.region_id, region_name="辽宁省",
                source_id=self.source_id, source_name=self.source_name, source_url=self.source_url,
                market_id="liaoning_province_average",
                product_raw=r["product"], product_standard="",
                product_specification=r["spec"] or "",
                observation_date=obs_date, collected_at=collected,
                original_price=r["price"], original_unit=r["unit"], price_per_kg=None,
                price_level=level,
                raw_evidence_path=res.raw_paths[-1] if res.raw_paths else "",
                source_parser_version="liaoning_fgw_daily-1.0.0",
                notes=[f"表：{r['table_title']}"]))
        res.observation_date = obs_date
        res.detail = {"fetched": len(res.records), "monitorDate": monitor,
                      "requestedDate": day}
        return res
