# market_feed · 七区域每日农产品价格采集

面向 AgriScope 的**轻量、可长期运行**的真实行情采集系统：抓取辽宁省官方公开价格源，
保存历史（SQLite）+ 原始证据，发布供前端读取的版本化 JSON 快照。

- 仅标准库（`urllib` / `sqlite3` / `json` / `re` / `zoneinfo`），无 pandas / 模型资产，
  适配 2 vCPU / 2 GiB ECS。
- 不改动 `frontend/**`、`models/**`、正式研究/模型资产与既有 Daily 契约；本目录自包含。

## 七个区域与真实来源

| 区域 | 主来源 | 采集口径 | 频率 | 状态 |
|---|---|---|---|---|
| 辽宁省 `liaoning` | 省发改委「每日价格」`fgw.ln.gov.cn/wjweb/price/MRJQ.aspx` | 全省监测均价（market_average） | 日 **已实测** |
| 沈阳市 `shenyang` | 沈阳菜篮子信息发布平台 `www.lnsyjgjc.com/api/showList`（JSON） | 批发/超市/集市（wholesale/supermarket/retail_market） | 日 **已实测** |
| 朝阳市 `chaoyang` | 市发改委「主要菜篮子产品每日价情」`fgw.chaoyang.gov.cn` | 全市平均价（market_average） | 日 **已实测** |
| 锦州市 `jinzhou` | 市菜篮子平台「周分析预测」`www.jz.gov.cn` | 零售均价（retail） | 周 **已实测** |
| 大连市 `dalian` | 省发改委「按市查询」`fgw.ln.gov.cn/wjjc/...ReportGoodsInfoByCity.aspx` | 城市监测价（market_average） | 旬（约 10 天）**已实测** |
| 丹东市 `dandong` | 同上 | 城市监测价 | 旬 **已实测** |
| 铁岭市 `tieling` | 同上 | 城市监测价 | 旬 **已实测** |

> **全省 ≠ 六市平均**：`liaoning` 使用省发改委真实省级监测来源，不与六市数据混算。
> 不同来源/市场/口径互为**独立序列**，绝不并入同一条历史价格曲线。

## 运行

```bash
# 仓库根执行
python3 -m pipelines.daily.market_feed run                     # 采集全部七区域并发布区域快照
python3 -m pipelines.daily.market_feed daily                   # 生产入口：采集 + 区域快照 + 每日汇总报表
python3 -m pipelines.daily.market_feed run --regions shenyang  # 仅某区域
python3 -m pipelines.daily.market_feed run --date 2026-10-13   # 指定日期（补采）
python3 -m pipelines.daily.market_feed backfill --start 2026-10-01 --end 2026-10-13
python3 -m pipelines.daily.market_feed aggregate               # 仅用已有库生成每日汇总报表
python3 -m pipelines.daily.market_feed status                    # 查看最新区域索引
python3 -m pipelines.daily.market_feed publish                   # 仅用已有库重发区域快照
```

环境变量：`AGRISCOPE_MARKET_FEED_HOME`（运行目录，默认本目录 `.data/`）、
`AGRISCOPE_MARKET_FEED_REPORT_DIR`（汇总报表目录，默认仓库 `data/market_feed/`）、
`AGRISCOPE_HTTP_TIMEOUT/RETRIES/SLEEP`、`AGRISCOPE_SY_LOOKBACK`。

### 每日汇总报表（`aggregate` / `daily`）

对每个**同城 + 同品种 + 同日期 + 同价格口径**的价格做**算术平均**，产出报表：
`data/market_feed/YYYY-MM-DD-sevenday.json`（`daily` 自动生成）。

字段（每 item 一条）：`date` / `region` / `regionName` / `product` / `unit`(元/kg) /
`avg_price`(两位小数) / `sample_count`(样本数 N) / `source_count` / `price_change`(较上一有效观测日均价, %) /
`price_level` / `price_level_cn` / `updated_at`；文档级含 `version`(git 短哈希) 与 `versionHash`。

同时给出**嵌套视图 `byRegion`**（`region → products[] → prices[]`）与每城 `supportedPriceLevels`
（供前端渲染 `[批发][超市][集市]` 按钮）：某品种缺失某口径时 `price=null`（**不填 0**）。

规则：体积/未知单位不参与、不猜测；无数据不补造（不生成条目）；`price_change` 无上一日时为 `null`；
**不混价格口径**（批发价与零售价不平均，分别成条）；时间统一北京时间。

```bash
python3 -m json.tool data/market_feed/2026-10-13-sevenday.json   # JSON 校验
```

## 产物

```
$AGRISCOPE_MARKET_FEED_HOME/
  raw/<region>/<source>/<date>/*            # 原始证据（原子写；重复抓取进 attempts/）
  market_feed.sqlite                        # 历史价格（observations + revisions + runs）
  snapshots/index.json                      # 轻量索引（每区域，前端入口）
  snapshots/regions/<region>.json           # 每区域行情快照
  logs/run_*.json                           # 每次运行摘要

$AGRISCOPE_MARKET_FEED_REPORT_DIR/            # 默认 仓库 data/market_feed/
  YYYY-MM-DD-sevenday.json                  # 每日汇总报表（前端可直接消费）
```

## 保证

- **幂等**：同来源/市场/原始品种/规格/监测日/口径重复采集不新增记录。
- **官方修订留痕**：同日价格被官方修改时，旧值进 `revisions`，不静默覆盖。
- **不猜测价格**：体积/未知单位不换算（`price_per_kg=null`）；缺历史时变化值为 `null` 而非 0。
- **区域隔离**：单区失败不影响其他区域；状态分七区记录。
- **原子发布**：仅在校验通过后原子替换快照；失败保留上一版本。
- **并发安全**：文件锁防止 20:30 与 23:30 两次任务并发写库。

## 测试

```bash
python3 -m pytest pipelines/daily/market_feed/tests -q
```

## 部署

见 `deploy/agriscope-market-feed.{service,timer}` 与 `deploy/market-feed.README.md`。
