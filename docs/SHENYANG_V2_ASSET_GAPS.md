# 沈阳 v2 资产缺口

由 `scripts/sync-shenyang-v2.mjs` 自动生成，请勿手改（重新运行同步即可刷新）。

同步策略：文章 / 来源 / manifest 缺失 = 硬失败；**被引用的图表资产缺失 = 记录并继续**。
资产缺失是研究侧的发布进度问题，不是前端缺陷；前端不会为空缺的资产造内容，也不会去 v1 管线里找替身。

## 被引用但任何来源都没有

| 类型 | 文件 |
|---|---|
| — | 无 |

## 已导出但暂无文章引用

| 类型 | 文件 |
|---|---|
| table | A01_trend.csv |
| table | A04_event_clusters.csv |
| table | A04_event_responses.csv |

## 资产来源

| 目录 | 角色 |
|---|---|
| `reports/v2/tables`、`reports/v2/figures` | 出版物口径，优先 |
| `workspace/research_v2/results/tables`、`figures` | 研究管线口径，兜底 |

同名文件逐字节比对：本次冲突 0 个。


## 计数

- 文章 9（A01–A09）
- 来源 16
- 图 2（引用 2）
- 表 25（引用 22）
- 推演表 3
