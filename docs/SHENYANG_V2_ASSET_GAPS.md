# SHENYANG V2 ASSET GAPS

由 `scripts/sync-shenyang-v2.mjs` 自动生成，请勿手改（重新运行同步即可刷新）。

同步策略（V5 决策 D1）：文章 / 来源 / manifest 缺失 = 硬失败；**被引用的图表资产缺失 = 记录并继续**。
资产缺失是研究侧的发布进度问题，不是前端缺陷；前端不会为空缺的资产造内容。

## 被引用但研究侧尚未导出

| 类型 | 引用位置 |
|---|---|
| table | A01 / A01_monthly.csv |
| table | A01 / A01_seasonal_index.csv |
| table | A01 / A01_stl_strength.csv |
| table | A02 / A02_daily_response_Fwx.csv |
| table | A05 / A05_recovery.csv |
| table | A06 / A06_forecast_rolling.csv |
| table | A07 / A07_change_2018_2024.csv |

## 已导出但暂无文章引用

| 类型 | 文件 |
|---|---|
| table | A01_trend.csv |
| table | A04_event_clusters.csv |

## 计数

- 文章 9（A01–A09）
- 来源 16
- 图 2（引用 2）
- 表 17（引用 22）
