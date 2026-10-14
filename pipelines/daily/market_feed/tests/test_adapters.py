# -*- coding: utf-8 -*-
"""适配器解析测试：用镜像真实页面结构的内联 fixture（离线、确定性）。

fixture 的字段与取值取自 2026-10-13 对真实来源的实测响应，仅保留解析所需结构。
"""
from __future__ import annotations

from pipelines.daily.market_feed.sources import liaoning_fgw_daily as ln
from pipelines.daily.market_feed.sources import chaoyang_basket as cy
from pipelines.daily.market_feed.sources import jinzhou_weekly as jz
from pipelines.daily.market_feed.sources import lnfgw_by_city as bc


# --------------------------------------------------------- liaoning 省级表
LN_HTML = """
<table><tr><td>辽宁主要农副产品市场价格</td></tr>
<tr><td>监测时间： 2026-10-13</td></tr>
<tr><td>名称</td><td>规格</td><td>单位</td><td>平均价格</td></tr>
<tr><td>大米</td><td>标一</td><td>元/500克</td><td>2.87</td></tr>
<tr><td>鲜猪肉</td><td>去骨后腿肉</td><td>元/500克</td><td>9.07</td></tr>
<tr><td>豆油</td><td>一级桶装</td><td>元/5升</td><td>64.19</td></tr>
<tr><td>水稻</td><td>混等(收购价)</td><td>元/500克</td><td>1.38</td></tr></table>
<table><tr><td>辽宁主要蔬菜品种市场价格</td></tr>
<tr><td>监测时间： 2026-10-13</td></tr>
<tr><td>名称</td><td>规格</td><td>单位</td><td>平均价格</td></tr>
<tr><td>土豆</td><td>新鲜</td><td>元/500克</td><td>1.56</td></tr></table>
"""


def test_liaoning_parse_page():
    rows, monitor = ln.parse_page(LN_HTML)
    assert monitor == "2026-10-13"
    names = {r["product"]: r for r in rows}
    assert names["大米"]["price"] == 2.87 and names["大米"]["unit"] == "元/500克"
    assert names["豆油"]["unit"] == "元/5升"
    assert names["土豆"]["table_title"].startswith("辽宁主要蔬菜")


# --------------------------------------------------------- chaoyang 表
CY_HTML = """
<table><tr><td>名称</td><td>类型</td><td>单位</td><td>全市平均价格</td></tr>
<tr><td>大米</td><td>标一</td><td>元/500克</td><td>2.85&nbsp;</td></tr>
<tr><td>鲜猪肉</td><td>去骨后腿肉</td><td>元/500克</td><td>8.60&nbsp;</td></tr></table>
"""
CY_LIST = """
<li><a objectId="1" href="https://fgw.chaoyang.gov.cn/html/CYFGW/202610/0999.html">
<b>朝阳市主要菜篮子产品每日价情</b><span>2026-10-12 </span></a></li>
"""


def test_chaoyang_parse_table_and_index():
    rows = cy.parse_table(CY_HTML)
    assert {r["product"] for r in rows} == {"大米", "鲜猪肉"}
    assert rows[0]["price"] == 2.85
    idx = cy.parse_index(CY_LIST)
    assert idx[0]["date"] == "2026-10-12" and idx[0]["title"].startswith("朝阳市")


# --------------------------------------------------------- jinzhou 周报
JZ_LIST = """
<li><i></i><a href="../../info/1797/128455.htm" target="_blank"
title="9月21日-9月27日锦州市农产品市场价格周分析预测"><span>x</span></a><label>2026-09-27</label></li>
"""
JZ_ART = """
<div>发布时间：2026-09-27</div>
<p>肉类 五花猪肉零售均价13.1元/斤，价格与前一周持平。牛肉零售均价36.8元/斤。</p>
<p>鸡蛋零售均价5.59元/斤。牛奶零售均价2.5元/250g。</p>
<p>蔬菜平均价格为3.07元/斤。</p>
"""


def test_jinzhou_parse():
    idx = jz.parse_index(JZ_LIST)
    assert idx[0]["url"].endswith("/info/1797/128455.htm")
    assert idx[0]["date"] == "2026-09-27"
    rows = jz.parse_article(JZ_ART)
    by = {r["product"]: r for r in rows}
    assert by["五花猪肉"]["price"] == 13.1 and by["五花猪肉"]["unit"] == "元/斤"
    assert by["牛奶"]["unit"] == "元/250g"
    assert by["蔬菜均价"]["price"] == 3.07
    assert jz.article_date(JZ_ART) == "2026-09-27"


# --------------------------------------------------------- 省级按市查询
BC_HTML = """
<tr><th>时间</th><th>分类</th><th>商品名称</th><th>规格、登记、牌号</th>
<th>单位</th><th>价格</th><th>同比</th><th>环比</th></tr>
<tr><td>20261005</td><td>蔬菜</td><td>黄瓜</td><td>新鲜一级</td>
<td>元/500克</td><td>2.50</td><td>-16.67%</td><td>-16.67%</td></tr>
<tr><td>20260925</td><td>蔬菜</td><td>黄瓜</td><td>新鲜一级</td>
<td>元/500克</td><td>2.00</td><td>-33%</td><td>-20%</td></tr>
"""


def test_by_city_rows_parse():
    rows = bc._rows(BC_HTML)
    assert len(rows) == 2
    assert rows[0][0] == "20261005" and rows[0][5] == "2.50"


def test_by_city_options_parse():
    sel = ('<select name="ctl00$cphMainFrame$ddlCity">'
           '<option value="210100000000">沈阳市</option>'
           '<option value="211200000000">铁岭市</option></select>')
    opts = bc._options(sel, "ctl00$cphMainFrame$ddlCity")
    assert ("211200000000", "铁岭市") in opts
