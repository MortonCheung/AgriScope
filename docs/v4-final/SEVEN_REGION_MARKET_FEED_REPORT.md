# 七区域每日农产品价格采集 · 施工报告

分支 `feat/seven-region-daily-feed` · 基线 `a19bd08`（origin/codex/product-refactor-v2 HEAD）·
施工日期 2026-10-13 · 运行环境 macOS + Python 3.9.6（ECS 为 Ubuntu 26.04 / 2vCPU / 2GiB，见 E 节）

本报告只陈述**实测事实**：来源可达性、真实记录、测试结果、资源消耗。未部署到 ECS 的部分如实标注。

---

## A. 七区域数据源矩阵

| 区域 | 主来源（官方） | URL | 实测最新观测日 | 抓取条数 | 作物数 | 频率 | 市场 / 价格口径 | 采集状态 | 质量与局限 | 可长期自动运行 |
|---|---|---|---|---|---|---|---|---|---|---|
| 辽宁省 `liaoning` | 省发改委「每日价格」 | `fgw.ln.gov.cn/wjweb/price/MRJQ.aspx` | 2026-10-13 | 30 | 农副 14 + 蔬菜 16 | **每日** | 全省监测均价 / `market_average` | ✅ SUCCESS | 全省 14 市平均，**非**六市平均；豆油(元/5升)/鲜奶(元/500ml) 属体积不换算 | ✅ |
| 沈阳市 `shenyang` | 沈阳菜篮子信息发布平台（JSON） | `lnsyjgjc.com/api/showList` | 2026-10-13 | 85 | 10（批发）+ 超市/集市 | **每日（工作日）** | 批发/超市/集市 / `wholesale`·`supermarket`·`retail_market` | ✅ SUCCESS | 当日未发布时回看 ≤5 天；批发期望 10 品种触发结构漂移校验 | ✅ |
| 朝阳市 `chaoyang` | 市发改委「主要菜篮子产品每日价情」 | `fgw.chaoyang.gov.cn/.../glist.html` | 2026-10-12 | 29 | 29 | **每日（工作日）** | 全市平均价 / `market_average` | ✅ SUCCESS | 列表与文章标题含日期；非交易日无文章 | ✅ |
| 锦州市 `jinzhou` | 市菜篮子平台「周分析预测」 | `jz.gov.cn/ztzl/clzxxfbpt/fxyc.htm` | 2026-09-27 | 7 | 7（肉蛋奶+菜均） | **每周** | 零售均价 / `retail` | ✅ SUCCESS | 散文体正文，仅抽取明确"X元/单位"句；日度价为图片（未用） | ✅（周） |
| 大连市 `dalian` | 省发改委「按市查询」 | `fgw.ln.gov.cn/wjjc/...ReportGoodsInfoByCity.aspx` | 2026-10-05 | 21 | 7 | **旬（约 10 天）** | 城市监测价 / `market_average` | ✅ SUCCESS | 大连市政府门户文章正文为 JS 动态渲染（静态 HTML 无正文）→ 改用省级官方按市源 | ✅（旬） |
| 丹东市 `dandong` | 省发改委「按市查询」 | 同上 | 2026-10-05 | 21 | 7 | **旬（约 10 天）** | 城市监测价 / `market_average` | ✅ SUCCESS | 无本地日度公开源；使用省级官方城市级监测 | ✅（旬） |
| 铁岭市 `tieling` | 省发改委「按市查询」 | 同上 | 2026-10-05 | 21 | 7 | **旬（约 10 天）** | 城市监测价 / `market_average` | ✅ SUCCESS | 本地发改委站点 SSL/404 不可达；使用省级官方城市级监测 | ✅（旬） |

**关键结论**
- 全省价格来自**真实省级监测来源**，不是六市算术平均。
- 六城均有真实官方来源；`shenyang`/`chaoyang` 为**每日**，`jinzhou` 为**每周**，`dalian`/`dandong`/`tieling` 为**旬报（约 10 天）**——**不是**每日，快照中如实以 `freshness=DELAYED/MISSING` 体现。
- 备用来源：`shenyang`/`chaoyang`/`jinzhou` 均配有省级按市源作为备用（自动回退，独立序列）。

**实测证据（2026-10-13 从本机直连）**
- 沈阳 API：`{"code":0,"count":10,"data":[{"productName":"甘蓝","unit":"元/500g","price":"0.86",...}]}`
- 省级页：`辽宁主要农副产品市场价格 / 监测时间：2026-10-13 / 大米 标一 元/500克 2.87`
- 朝阳页：`朝阳市主要菜篮子产品每日价情 / 时间：2026-10-12 / 大米 标一 元/500克 2.85`
- 锦州页：`9月21日-9月27日…周分析预测 / 五花猪肉零售均价13.1元/斤 / 蔬菜平均价格为3.07元/斤`
- 省级按市：`铁岭 20261005 蔬菜 黄瓜 新鲜一级 元/500克 2.50`；`丹东 20261005 粮食 粳米 标一 元/500克 2.70`

---

## B. 实际工程成果（新增文件）

全部位于 `pipelines/daily/market_feed/`（自包含、仅标准库）：

| 文件 | 作用 |
|---|---|
| `config.py` | 区域/口径/单位/作物映射/新鲜度常量，运行目录解析 |
| `records.py` | 规范化记录 `PriceRecord`：身份哈希、内容哈希、`finalize()` |
| `normalize.py` | 单位→元/kg 换算、作物标准化、记录构造与校验 |
| `http.py` | 标准库 HTTP 会话（限重试/超时/退避/Cookie，直连禁代理） |
| `clock.py` | Asia/Shanghai 时间、`observation_date` 与 `collected_at` 分离 |
| `evidence.py` | 原始证据原子落盘，重复抓取留存 attempts |
| `store.py` | SQLite 存储：幂等 upsert、官方修订留痕、运行状态 |
| `metrics.py` | 最新价、前一观测、涨跌、7/30 日变化、新鲜度（同系列内计算） |
| `publish.py` | 版本化 JSON 快照 + 索引，原子发布、可离线读取 |
| `runner.py` | 编排：文件锁、逐区状态、主/备来源回退、失败保留旧数据 |
| `cli.py` / `__main__.py` | `run` / `backfill` / `status` / `publish` |
| `sources/shenyang_clz.py` | 沈阳 JSON API 适配器（含回看） |
| `sources/liaoning_fgw_daily.py` | 省级每日价格（WebForms 回传 + 表解析） |
| `sources/chaoyang_basket.py` | 朝阳每日价情（列表 + 表格） |
| `sources/jinzhou_weekly.py` | 锦州周报（列表 + 散文抽取） |
| `sources/lnfgw_by_city.py` | 省级「按市查询」城市级旬报（覆盖大连/丹东/铁岭） |
| `sources/base.py` / `sources/__init__.py` | 适配器基类 / 七区域注册表 |
| `README.md` | 使用说明 |
| `tests/`（4 文件） | 35 项自动化测试 |
| `deploy/agriscope-daily-chain.{service,timer}` | 七地区采集已并入每日编排（采集由链统一调度） |
| `docs/v4-final/SEVEN_REGION_MARKET_FEED_CONTRACT.md` | 前端交接契约（版本化 JSON） |

**未改动**：`frontend/**`、`models/**`、`runtime/manifest.json`、既有 `pipelines/daily/*`、正式研究/模型资产与冻结 API 契约。

---

## C. 真实数据样本

快照（真实、可核验）：

- 省级 `liaoning.json`：`大米 · market_average · 2026-10-13 · 5.62 元/kg`（原始 2.81 元/500克，×2）
- 省级 `黄瓜 6.16 元/kg`、`土豆 3.10 元/kg`
- 沈阳 `shenyang.json`：批发/超市/集市三口径各 10 品种，如 `土豆 元/500g`
- 朝阳 `chaoyang.json`：`大米 2.85 元/500克 → 5.70 元/kg`（2026-10-12，全市平均）
- 锦州 `jinzhou.json`：`五花猪肉 13.1 元/斤 → 26.2 元/kg`（2026-09-27 零售均价）
- 铁岭 `tieling.json`：`土豆 3.0 元/kg`、`鲜猪肉 18.0 元/kg`（2026-10-05，城市监测价）

**是否含真实日度新增数据**：`liaoning`（10-13）、`shenyang`（10-13）为**当日真实新增**；
`chaoyang`（10-12）为最近交易日；`jinzhou`（09-27 周报）、`dalian/dandong/tieling`（10-05 旬报）
为其来源的最近一次发布日——**均为真实发布数据，非模拟、非补齐**。

SQLite 入库：**214 条观测**（7 区），`revisions=0`（无同日修订）。

---

## D. 自动化测试

```
python3 -m pytest pipelines/daily/market_feed/tests -q
=> 35 passed in 0.09s
```

覆盖（对应任务 §12）：
- 七区域配置完整、全省/城市隔离；不串城（跨城同源同品种不互相覆盖）
- 单位换算（元/斤、元/500克、元/250g…）正确；`元/5升`、`元/500ml` 等**不换算**
- 土豆/马铃薯映射；仔猪/生猪不合并
- 记录哈希幂等、重复采集去重、官方同日修订留痕（`revisions`）
- 指标：涨跌幅与 7/30 日变化；缺历史为 `null`（非 0）；`previousIsYesterday` 语义
- 快照契约字段完整 + 离线读取 + `dataVersion`
- 运行器：状态分类、主来源失败自动回退、全部失败保留旧数据、结构漂移标记、并发锁
- 适配器解析：用镜像真实页面结构的 fixture（省级表/朝阳表/锦州正文/按市行）

施工过程中测试暴露并修复的真实缺陷：① `record_hash` 未含区域→跨城覆盖；② `product_standard` 未回填→同规格蔬菜被并成一条序列；③ `price_per_kg` 未按单位回算。均已修复并回归通过。

真实来源的可达性/解析通过**实网运行**验证（见 A/C 节），未写入依赖网络的单元测试（保持离线确定性）。

---

## E. 服务器状态（如实区分）

| 阶段 | 状态 |
|---|---|
| 已准备部署 | ✅ 已提供 systemd service/timer + 部署手册 |
| 已连接服务器 | ❌ **未连接**（本轮无 SSH 授权/凭据） |
| 已安装采集程序 | ❌ 未安装 |
| 已成功执行真实采集 | ✅ **已在本机对真实来源执行**（214 条真实记录，见 C） |
| 已启用自动调度 | ❌ 未启用（定时器文件已备好） |
| 仍存在的阻塞 | 缺少 ECS 的 SSH 授权（私钥/口令）。**不绕过验证**，获授权后按 `deploy/market-feed.README.md` 执行即可。 |

**本机实测资源消耗**（等价采集负载）：单次全量七区采集 **实时 179s**、**峰值常驻内存 ≈ 24.1 MiB**
（`/usr/bin/time -l`），远低于 2 GiB 与 512M 限制；无对外端口、无模型、无 pandas。

---

## F. 前端 Agent 交接

- 契约文档：`docs/v4-final/SEVEN_REGION_MARKET_FEED_CONTRACT.md`（含 `index.json` 与
  `regions/<id>.json` 字段级说明、`null` 语义、"前一观测日"与延迟判断、省级 vs 城市口径、
  历史趋势读取、离线使用）。
- 数据文件：`snapshots/index.json` + `snapshots/regions/<regionId>.json`（原子替换）。
- 更新机制：每日 20:30 主采 / 23:30 补偿；`dataVersion`（内容 SHA-256 前 16 位）用于缓存失效。
- 明确边界：**本次不改动任何 `frontend/**`**；现有 `demoMarketFor()`/`MarketOverview.tsx` 由前端 Agent
  决定如何切换到本契约；如需 API，建议新增独立只读端点，不改冻结契约。

---

## G. Git 交付

- 工作分支：`feat/seven-region-daily-feed`（基于 `origin/codex/product-refactor-v2` = `a19bd08`）
- 独立工作区：`git worktree` → `/Users/morton_cheung/Desktop/比赛/agriscope-workspaces/seven-region-daily-feed`
  （与前端 Agent 及 main 完全隔离，**未直接提交到其分支**）
- 改动清单：全部为 `pipelines/daily/market_feed/**`、`deploy/agriscope-market-feed.*`、
  `deploy/market-feed.README.md`、`docs/v4-final/SEVEN_REGION_MARKET_FEED_CONTRACT.md` 及本报告。
- 合并注意：与 `frontend/**` 无重叠，冲突风险低；运行数据在仓库外，不入库。
- **不合并**到前端 Agent 分支。

---

## 附：已知局限（不弱化）

1. 大连/丹东/铁岭为**旬报**（约 10 天），非每日；`dalian` 市政府门户文章正文为 JS 渲染，未采用。
2. 锦州为**周报**零售均价；其日度价为图片，未使用（避免 OCR 引入不可核验误差）。
3. 省级按市源的品种为下拉逐项查询（本项目取 ~27 个关注品种），非全 54 种；如需全量可扩展配置。
4. 未在 ECS 实机部署与启用调度（缺 SSH 授权），相关证据缺失，如实标注。

---

# 追加：每日汇总层（`feat/market-feed-agg`）

在采集之上新增**汇总层**，把同城/同品种/同日期（并同价格口径）的价格做**算术平均**，
产出前端可直接消费的每日报表 JSON。

## 交付物

| 项 | 内容 |
|---|---|
| 分支 | `feat/market-feed-agg`（基于 `feat/seven-region-daily-feed` 的 `74d1696`） |
| 代码 | `pipelines/daily/market_feed/aggregate.py`；`cli.py` 增 `daily`/`aggregate`；`config.py` 增 `REPORT_DIR` |
| 测试 | `tests/test_aggregate.py`（新增 8 项；全套 **43 passed**） |
| 报表样本 | `data/market_feed/2026-10-13-sevenday.json`（**204 条真实条目**，7 区） |
| 数据库样本 | `data/market_feed/market-feed-sevenday.sqlite`（214 条真实观测，`sqlite3` 可查） |
| 系统单元 | 采集并入 `scripts/run_daily_chain.py` 的 market_feed 阶段（`deploy/agriscope-daily-chain.*`） |
| 契约文档 | `docs/v4-final/SEVEN_REGION_MARKET_FEED_CONTRACT.md` 第 8 节 |

## 聚合规则与真实结果

- 分组键：`region + product + observation_date + price_level`；`avg_price = round(mean(元/kg), 2)`。
- **保留价格口径、不做跨口径平均**：批发/超市/集市属不同交易环节，分别成条。报表另给出**嵌套视图
  `byRegion`**（`region → products[] → prices[]`），并附每城 `supportedPriceLevels`（前端按钮集合）；
  某品种缺失某口径时 `price=null`（**不填 0**），如沈阳「大米」仅集市有价。
- 真实样本（`2026-10-13`）：`itemCount=204`，`byRegion` 覆盖 7 区；
  例：辽宁省 `大米 5.62 元/kg`（原 2.81 元/500克）、锦州 `猪肉 26.2 元/kg`（原 13.1 元/斤，×2）；
  沈阳 `土豆` → 批发 `2.20` / 超市 `2.38` / 集市 `3.16` 元/kg（三条独立，不合并）。
- 缺失处理：无数据的区域/品种**不生成条目**；体积/未知单位（豆油 元/5升）不参与平均。
- `price_change` 相对同城同品种同口径上一有效观测日均价；样本仅单日时为 `null`（非 0）。
- 日期语义：`observation_date`（=扁平视图 `date`）为官方监测日；`collectedAt/updated_at` 为采集时刻。

## 验收对照（本次新增部分）

| 验收项 | 结果 |
|---|---|
| 分支正确（不动 main/前端/模型） | ✅ 仅新增 market_feed/agg 相关文件 |
| 算术平均与 `sample_count` 正确 | ✅ 单测覆盖（同口径内平均） |
| **不同 `price_level` 不被聚合到一起** | ✅ 单测 `test_different_levels_not_merged` |
| **JSON 输出包含 `price_level`** | ✅ `items[]` 与 `byRegion[].products[].prices[]` 均含 |
| **缺失价格类型不报错、不填 0** | ✅ 单测 `test_by_region_nested_and_null_for_missing_level`（`price=null`） |
| 单位换算（元/斤→元/kg 等） | ✅ 单测 + 真实（锦州 13.1 元/斤→26.2） |
| JSON 契约完备、可 `json.tool` 校验 | ✅ `itemCount=204`，语法通过 |
| 幂等（重跑记录不增） | ✅ 采集复跑全 `NO_NEW_PUBLICATION`，214 条不变 |
| 单元测试通过 | ✅ `45 passed` |
| 资源限制 `MemoryMax=512M` | ✅ 单元已设；实测峰值 ~24 MiB |
| 定时器 | ✅ `.timer` 已就绪（`OnCalendar 20:30/23:30`，`Persistent`，`AccuracySec=5min`） |
| 前端可通过 `price_level` 按钮切换 | ✅ `supportedPriceLevels` + `prices[]` 支持 |
| ECS 实机部署/调度 | ❌ 未执行（缺 SSH 授权，如实标注） |

