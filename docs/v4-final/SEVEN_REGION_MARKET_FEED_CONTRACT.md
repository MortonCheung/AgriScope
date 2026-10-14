# 七区域行情快照契约（前端交接）

版本：`schemaVersion = 1.0.0`  ·  生成方：`pipelines/daily/market_feed`（本文件**只描述契约**，不改动 `frontend/**`）

本契约面向前端 Agent：用**真实官方行情**替换现有 `demoMarketFor()` 演示数据。前端只读快照，
不感知采集细节。数据只读、可离线。

## 1. 文件位置与更新机制

运行目录由 `AGRISCOPE_MARKET_FEED_HOME` 决定（服务器 `/var/lib/agriscope-market-feed`）：

```
snapshots/index.json               # 轻量索引：先读它，再按需读区域文件
snapshots/regions/<regionId>.json  # 每区域完整快照
```

- 更新机制：每日 20:30 主采、23:30 补偿（systemd timer）。文件为**原子替换**，读取不会遇到半写文件。
- 前端读取建议：`GET index.json` 判断各区域 `freshness`；再按需读取 `regions/<id>.json`。
  若部署为静态站点，直接按相对路径读取即可；离线时使用最后一次发布的快照。

## 2. `index.json`

```json
{
  "schemaVersion": "1.0.0",
  "frameworkVersion": "market-feed-1.0.0",
  "generatedAt": "2026-10-13T20:30:00+08:00",
  "regionCount": 7,
  "regions": [
    {
      "regionId": "liaoning", "regionName": "辽宁省", "regionKind": "province",
      "status": "SUCCESS", "blocked": false,
      "latestObservationDate": "2026-10-13", "freshness": "FRESH", "ageDays": 0,
      "seriesCount": 11, "recordCount": 30,
      "file": "regions/liaoning.json", "dataVersion": "ab12cd34ef56",
      "note": ""
    }
  ]
}
```

## 3. `regions/<regionId>.json`

```json
{
  "schemaVersion": "1.0.0",
  "generatedAt": "2026-10-13T20:30:00+08:00",
  "regionId": "liaoning", "regionName": "辽宁省",
  "regionKind": "province", "isProvince": true,
  "status": "SUCCESS", "unit": "元/kg",
  "dataVersion": "ab12cd34ef56",
  "freshness": { "latestObservationDate": "2026-10-13", "ageDays": 0, "freshness": "FRESH" },
  "quality": { "records": 30, "firstDate": "2026-10-13", "lastDate": "2026-10-13", "seriesCount": 11 },
  "sources": [ { "sourceId": "SRC-LN-FGW-DAILY",
                 "sourceName": "辽宁省发展和改革委员会 · 每日价格（省级监测均价）",
                 "sourceUrl": "https://fgw.ln.gov.cn/fgw/xxgk/jgjc/mrjg/index.shtml",
                 "priceLevel": "market_average" } ],
  "notes": [],
  "series": [
    {
      "regionId": "liaoning",
      "productStandard": "土豆", "productRaw": "土豆", "productSpecification": "新鲜",
      "marketId": "liaoning_province_average", "priceLevel": "market_average", "priceLevelCn": "监测均价",
      "sourceId": "SRC-LN-FGW-DAILY", "sourceName": "…", "sourceUrl": "…", "unit": "元/kg",
      "latestObservationDate": "2026-10-13", "latestPricePerKg": 3.12,
      "previousObservationDate": "2026-10-12", "previousPricePerKg": 3.10,
      "previousIsYesterday": true,
      "changePct": 0.6452, "change7dPct": -1.2, "change30dPct": null,
      "observationCount": 2,
      "history": [ { "date": "2026-10-12", "pricePerKg": 3.10 },
                   { "date": "2026-10-13", "pricePerKg": 3.12 } ],
      "freshness": "FRESH", "ageDays": 0
    }
  ]
}
```

## 4. 字段使用说明（前端必读）

1. **直接展示**：`regionName`、`productStandard`、`latestPricePerKg`（单位 `unit`，恒为 `元/kg`）、
   `priceLevelCn`（口径中文）、`unit`、`latestObservationDate`、`changePct`。
2. **可能为 `null`**：
   - `latestPricePerKg`：原始数据单位不可精确换算为公斤时（如 `元/5升`、`元/500ml`）为空。
     此时 `productRaw`/`unit` 仍可展示原始口径，但**不要**显示换算价。
   - `previousObservationDate`/`previousPricePerKg`/`changePct`/`change7dPct`/`change30dPct`：
     缺历史观测时为 `null`，**表示"无对比"而非 0**。
3. **地区/作物口径差异**：`priceLevel` 区分 `wholesale`（批发，沈阳）、`market_average`
   （监测均价，省级/朝阳/大连/丹东/铁岭）、`supermarket`/`retail_market`（沈阳超市/集市零售）、
   `retail`（锦州周报零售均价）。**不同 `priceLevel`/`marketId` 的价格不可直接比较**。
4. **"前一观测日"**：`previousObservationDate` 是同一序列内的上一个**有效观测日**，不一定昨天。
   仅当 `previousIsYesterday=true` 时才可写"较昨日"；否则写"较 X 月 X 日"。
5. **延迟判断**：用 `freshness`（`FRESH` 当日 / `DELAYED` 1–2 天 / `STALE` 3–7 天 / `MISSING`）
   与 `ageDays`。非日度来源（如锦州周报、大连/丹东/铁岭旬报）常态为 `DELAYED`/`STALE`，属正常。
6. **省级 vs 城市**：`regionKind=province`（`isProvince=true`，`regionId=liaoning`）为省发改委
   **全省监测均价**，**不是**六市平均、也不是某一市场价；六市为各自来源的城市级数据。展示时请标明口径。
7. **历史趋势**：用 `history[]`（按日期升序）；跨序列不要混画。数据点稀疏时不要插值、不要连线成"每日"。
8. **离线**：直接读取最后一次发布的快照文件；用 `generatedAt` 与 `freshness` 注明数据时间。

## 5. 状态语义（`status`）

`SUCCESS`（有新记录）· `NO_NEW_PUBLICATION`（来源未发布新数据，**不是失败**）·
`PARTIAL`（部分记录被质量规则拒绝）· `SOURCE_SCHEMA_CHANGED`（来源结构变化，需人工核查）·
`FAILED`（采集失败，保留上一有效数据）。七区域**分别**给出，不以单一总状态掩盖某城失败。

## 6. 与前端现有逻辑的关系

- 前端现有 `frontend/src/domain/market/demoMarket.ts`、`MarketOverview.tsx` 为**演示数据**，
  由前端 Agent 决定如何切换到本契约；**本次不改动任何 `frontend/**` 文件**。
- 若需后端 API 透传，建议新增独立只读端点（如 `/api/market/feed`），**不改**现有
  `/api/market/observations`、`/api/daily/latest` 冻结契约。

## 7. 校验

快照由 `pipelines/daily/market_feed` 生成，`dataVersion` 为该区域内容 SHA-256 前 16 位；
重新发布数据变化时 `dataVersion` 随之变化，可用于前端缓存失效判断。

## 8. 每日汇总报表（聚合层，`data/market_feed/YYYY-MM-DD-sevenday.json`）

`daily` 任务生成的**每日报表**：对同一 **城市 + 品种 + 日期 + 价格口径** 的价格做算术平均，
**保留不同价格口径、绝不跨口径合并**。报表同时提供两种等价视图：

- `items[]`：**扁平**，一行 = 一个 `region + product + date + price_level`（便于检索/追溯）。
- `byRegion[]`：**嵌套**（`region → products[] → prices[]`），便于前端按城市/品种/口径读取与切换。

### 8.1 `price_level` 枚举（项目命名）

| price_level | 中文 | 交易环节 | 出现区域 |
|---|---|---|---|
| `wholesale` | 批发价 | 批发 | 沈阳 |
| `supermarket` | 超市零售价 | 超市零售 | 沈阳 |
| `retail_market` | 集市零售价 | 集市零售 | 沈阳 |
| `market_average` | 监测均价 | 官方监测（城市/省级） | 辽宁省、朝阳、大连、丹东、铁岭 |
| `retail` | 零售价 | 零售 | 锦州（周报零售均价） |
| `farm_gate` | 产地价 | 产地/收购 | 预留 |
| `purchase` | 采购价 | 收购 | 预留（省级水稻收购价） |
| `other` | 其他 | — | 预留 |

> 用户口语「批发 / 超市 / 集市」对应 `wholesale / supermarket / retail_market`。

### 8.2 顶层与嵌套结构

```json
{
  "schemaVersion": "1.0.0",
  "reportType": "seven_region_daily_average",
  "date": "2026-10-13",
  "generatedAt": "2026-10-13T20:30:05+08:00",
  "collectedAt": "2026-10-13T20:30:05+08:00",
  "timezone": "Asia/Shanghai",
  "version": "4fdeea1",
  "versionHash": "7dc4694089e184e0",
  "regionCount": 7,
  "itemCount": 204,
  "items": [
    { "date": "2026-10-13", "region": "shenyang", "regionName": "沈阳市",
      "product": "土豆", "unit": "元/kg", "avg_price": 2.2,
      "sample_count": 1, "source_count": 1,
      "price_level": "wholesale", "price_level_cn": "批发价",
      "price_change": null, "updated_at": "2026-10-13T20:30:05+08:00" }
  ],
  "byRegion": [
    {
      "region": "shenyang", "regionName": "沈阳市", "observation_date": "2026-10-13",
      "supportedPriceLevels": [
        { "price_level": "wholesale", "price_level_cn": "批发价" },
        { "price_level": "supermarket", "price_level_cn": "超市零售价" },
        { "price_level": "retail_market", "price_level_cn": "集市零售价" }
      ],
      "products": [
        { "product": "土豆",
          "prices": [
            { "price_level": "wholesale", "price_level_cn": "批发价", "price": 2.2,
              "unit": "元/kg", "sample_count": 1, "source_count": 1,
              "price_change": null, "observation_date": "2026-10-13" },
            { "price_level": "supermarket", "price_level_cn": "超市零售价", "price": 2.38,
              "unit": "元/kg", "sample_count": 1, "source_count": 1,
              "price_change": null, "observation_date": "2026-10-13" },
            { "price_level": "retail_market", "price_level_cn": "集市零售价", "price": 3.16,
              "unit": "元/kg", "sample_count": 1, "source_count": 1,
              "price_change": null, "observation_date": "2026-10-13" }
          ] }
      ]
    }
  ]
}
```

### 8.3 前端使用方式

1. **默认展示**：读 `byRegion`，取 `products[].prices[]` 中**第一个非 `null`** 的口径作为默认
   （或按 `supportedPriceLevels` 顺序取第一个）；`supportedPriceLevels` 即该城的可用按钮集合。
2. **切换**：用户点 `[批发] [超市] [集市]`（由 `supportedPriceLevels` 渲染），
   前端按 `price_level` 过滤该品种的 `prices[]` 取对应 `price`。**不做任何跨口径运算**。
3. **城市/品种**：`region`（英文小写）/ `product`（正式名，如 `土豆`）为主键的一部分；
   同一 `product` 在不同 `price_level` 下**不是同一数字**。
4. `items[]` 与 `byRegion[]` 数据等价（`byRegion` 由 `items` 重排而来）；前者便于检索，后者便于渲染。

### 8.4 `null` 情况（不填 0）

- 若某城市某品种**没有某价格类型**：该 `price_level` 仍会出现在 `prices[]` 中，但
  `price = null`、`sample_count = 0`、`observation_date = null`（**绝不填 0**）。
  例如沈阳「大米」仅集市零售有价 → `批发价/超市零售价` 的 `price` 为 `null`。
- 若某城市**完全没有数据**：该城市不出现在 `byRegion`（不补造空壳）。
- `price_change` 在无上一有效观测日时为 `null`（不是 0）。
- 体积/未知单位（如豆油 `元/5升`）不参与平均，也不会出现。

### 8.5 日期语义（务必区分）

- `observation_date`（扁平视图中的 `date`）：**官方监测/发布日**，即这条价格真实对应的日期。
  不同来源频率不同（日/周/旬），故同一报表内各品种的 `observation_date` 可能不同。
- `collectedAt` / `generatedAt` / `updated_at`：**本系统采集与生成时刻**（北京时间，精确到秒）。
- 二者绝不混用：展示"数据日期"用 `observation_date`，展示"抓取时间"用 `updated_at/collectedAt`。

### 8.6 覆盖限制（不同城市支持的口径不同）

- **沈阳**：`wholesale` / `supermarket` / `retail_market`（三档，可切换）。
- **锦州**：`retail`（周报零售均价，单一）。
- **辽宁省 / 朝阳 / 大连 / 丹东 / 铁岭**：`market_average`（监测均价，单一；其中大连/丹东/铁岭为旬报）。
- 前端渲染按钮时应以每城的 `supportedPriceLevels` 为准，**不要假设所有城市都有三档**。

前端若需"回到原始"（每来源/市场明细与历史序列），使用第 3 节的 `regions/<id>.json`。


