# -*- coding: utf-8 -*-
"""辽宁六城 · 省发改委「按市查询」官方城市级监测价（旬报，5/15/25 日）。

页面：https://fgw.ln.gov.cn/wjjc/jgjc/ReportGoodsInfoByCity.aspx?PriceBureauMainType_Id=101
表单：ddlCity(14 市) / ddlPriceBureauType(54 品种) / ddlStartYear|Month … ddlEndYear|Month
      submit btnQuery=搜索（ASP.NET WebForms，同会话 ViewState）
表格列：时间(YYYYMMDD) / 分类 / 商品名称 / 规格、登记、牌号 / 单位 / 价格 / 同比 / 环比

(2026 实测：铁岭 黄瓜 元/500克 2.50/3.00/2.50/2.00 于 10-05/09-05/09-15/09-25；
 丹东 粳米 2.70。真实城市级、可长期自动化的官方来源，但**频次约 10 天，非每日**。)
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

URL = "https://fgw.ln.gov.cn/wjjc/jgjc/ReportGoodsInfoByCity.aspx?PriceBureauMainType_Id=101"
REF = "https://fgw.ln.gov.cn/wjjc/jgjc/"
_P = "ctl00$cphMainFrame$"
_HIDDEN = ("__VIEWSTATE", "__VIEWSTATEGENERATOR", "__EVENTVALIDATION")
_SHORT = {"shenyang": "沈阳", "tieling": "铁岭", "chaoyang": "朝阳", "jinzhou": "锦州",
          "dandong": "丹东", "dalian": "大连", "liaoning": "辽宁"}

# 关注的品种（按名称匹配页面下拉；缺失则跳过）。含项目研究的 10 蔬菜 + 主要粮油肉蛋。
COMMODITIES = [
    "土豆", "西红柿", "黄瓜", "韭菜", "青椒", "尖椒", "茄子", "芹菜", "芸豆", "甘蓝",
    "大白菜", "菠菜", "油菜", "菜花", "蒜苔", "圆葱", "胡萝卜",
    "粳米", "面粉", "玉米粉", "大豆", "豆油",
    "鲜猪肉", "鲜牛肉", "鲜羊肉", "鸡肉", "鸡蛋",
]


def _options(html: str, name: str) -> list[tuple[str, str]]:
    m = re.search(r'<select[^>]*name="' + re.escape(name) + r'"[\s\S]*?</select>', html)
    if not m:
        return []
    return [(v, t.strip()) for v, t in re.findall(r'<option[^>]*value="([^"]*)"[^>]*>([^<]*)', m.group(0))]


def _hidden(html: str) -> dict:
    out = {}
    for n in _HIDDEN:
        m = re.search(r'name="' + n + r'"[^>]*value="([^"]*)"', html)
        out[n] = m.group(1) if m else ""
    return out


def _rows(html: str) -> list[list[str]]:
    data = []
    for r in re.findall(r"<tr[\s\S]*?</tr>", html, re.I):
        cells = []
        for c in re.findall(r"<t[dh][\s\S]*?</t[dh]>", r, re.I):
            t = re.sub(r"<[^>]+>", " ", c).replace("&nbsp;", " ").replace("\xa0", " ")
            cells.append(re.sub(r"\s+", " ", t).strip())
        if len(cells) >= 6 and re.match(r"^\d{8}$", cells[0]):
            data.append(cells)
    return data


class LnfgwByCity(Adapter):
    """一个实例对应一个城市（region_id 由构造参数决定）。"""

    source_id = "SRC-LN-FGW-BYCITY"
    source_name = "辽宁省发展和改革委员会 · 按市价格监测（城市级旬报）"
    source_url = URL
    price_level = "market_average"
    frequency = "dekad"
    is_primary = False

    def __init__(self, region_id: str):
        self.region_id = region_id
        self.city_code = None  # 从页面下拉按城市名匹配

    def collect(self, target_date: Optional[date] = None) -> FetchResult:
        day = (target_date or clock.today()).isoformat()
        res = FetchResult(region_id=self.region_id, source_id=self.source_id,
                          source_name=self.source_name)
        sess = Session()
        collected = clock.now_str()
        try:
            # 取带参数的表单页（含 ViewState 与下拉选项）
            h0 = sess.get(URL, referer=REF).text(("utf-8",))
            res.raw_paths.append(evidence.save_raw(self.region_id, self.source_id, day,
                                                   "form.html", h0.encode("utf-8")))
            cities = _options(h0, _P + "ddlCity")
            goods = _options(h0, _P + "ddlPriceBureauType")
            by_name = {name: guid for guid, name in goods}
            # 匹配城市：region 名（如 铁岭）去「市」
            want = _SHORT[self.region_id]
            city_code = next((code for code, name in cities if name.startswith(want)), None)
            if city_code is None:
                res.status = "FAILED"
                res.error = f"按市查询下拉未找到城市 {want}"
                return res
            hid = _hidden(h0)
            year, month = (target_date or clock.today()).year, (target_date or clock.today()).month
            got_any = False
            for cname in COMMODITIES:
                guid = by_name.get(cname)
                if not guid:
                    continue
                form = dict(hid)
                form.update({
                    "__EVENTTARGET": "", "__EVENTARGUMENT": "",
                    _P + "ddlCity": city_code, _P + "ddlPriceBureauType": guid,
                    _P + "ddlStartYear": str(year), _P + "ddlStartMonth": f"{month:02d}",
                    _P + "ddlEndYear": str(year), _P + "ddlEndMonth": f"{month:02d}",
                    _P + "btnQuery": "搜索",
                })
                try:
                    html = sess.post_form(URL, form, referer=URL).text(("utf-8",))
                except Exception:  # noqa: BLE001
                    continue
                rows = _rows(html)
                for cells in rows:
                    ds = cells[0]
                    obs = f"{ds[0:4]}-{ds[4:6]}-{ds[6:8]}"
                    price = parse_float(cells[5])
                    if price is None:
                        continue
                    res.records.append(PriceRecord(
                        region_id=self.region_id,
                        region_name=C.REGIONS[self.region_id]["name"],
                        source_id=self.source_id, source_name=self.source_name,
                        source_url=self.source_url, market_id=f"{self.region_id}_monitored",
                        product_raw=cells[2], product_standard="",
                        product_specification=cells[3] or "",
                        observation_date=obs, collected_at=collected,
                        original_price=price, original_unit=cells[4], price_per_kg=None,
                        price_level=self.price_level,
                        raw_evidence_path=res.raw_paths[-1] if res.raw_paths else "",
                        source_parser_version="lnfgw_by_city-1.0.0",
                        notes=[f"分类：{cells[1]}"]))
                if rows:
                    got_any = True
            if not got_any:
                res.status = "NO_NEW_PUBLICATION"
                res.schema_ok = False
                res.schema_note = "SOURCE_SCHEMA_CHANGED: 按市查询未返回任何记录"
                return res
            res.observation_date = max(r.observation_date for r in res.records)
            res.detail = {"fetched": len(res.records), "city": want,
                          "frequency": self.frequency, "requestedMonth": f"{year}-{month:02d}"}
        except Exception as exc:  # noqa: BLE001
            res.status = "FAILED"
            res.error = repr(exc)[:200]
        return res
