# SHENYANG V2 × 前端审计（V5 Phase 1）

> 审计对象：沈阳 v2 研究工程导出的**真实文件**。
> 原则：本文件只记录**实际读到的事实**，不写预期、不写推测；缺什么就写缺什么。
> 审计时间：基于本轮 HEAD `b488f9e`（branch `feat/frontend-v4-polish`）。

---

## 0. 路径修正（重要）

V5 手册给出的路径**缺少一层 `city_data/`**，实际不存在：

| 手册写的路径 | 实际情况 |
|---|---|
| `大数据分析/shenyang/workspace/research_v2/exports/frontend` | ❌ 不存在（`shenyang/` 目录本身不存在） |
| `大数据分析/shenyang/reports/v2` | ❌ 不存在 |
| `大数据分析/city_data/shenyang/workspace/research_v2/exports/frontend` | ✅ 真实位置 |
| `大数据分析/city_data/shenyang/reports/v2` | ✅ 真实位置 |

本审计后续一律使用 `city_data/shenyang/`。

---

## 1. 清点结果

### 1.1 `workspace/research_v2/exports/frontend/`（共 11 个文件）

```
manifest.json
sources.json
articles/A01.json … A09.json      （9 篇）
figures/                            （空目录）
sources/                            （空目录）
```

### 1.2 `reports/v2/`（共 31 个文件）

```
README.md
references.md
00_研究总览.md
01_…季节性特征.md
02_…日度响应.md
03_…滞后累积与非线性特征.md
04_…2026年强降雨案例.md
05_…恢复特征.md
06_…预测增量.md
07_…区县格局与作物结构_2018-2024.md
08_…区县面板研究.md
09_…综合研究.md
figures/  A01_seasonal_amplitude.png, A07_district_structure.png   （仅 2 张）
tables/   17 个 CSV
```

---

## 2. A01–A09 → JSON 映射（手册 §5 要求）

`manifest.json` 直接给出映射，9 篇 `status` 全部为 `ACCEPTED`：

| ID | title | file | slug | n_sections | n_sources |
|---|---|---|---|---|---|
| A01 | 沈阳市主要蔬菜批发市场的时间结构与季节性特征 | `articles/A01.json` | market-time-seasonality | 7 | 1 |
| A02 | 气象条件与沈阳市主要蔬菜批发市场日度响应 | `articles/A02.json` | weather-market-daily-response | 7 | 3 |
| A03 | 气象影响的滞后累积与非线性特征 | `articles/A03.json` | weather-lag-accumulation-nonlinearity | 7 | 2 |
| A04 | 极端天气事件下…及 2026 年强降雨案例 | `articles/A04.json` | extreme-weather-events-case-2026 | 7 | 4 |
| A05 | 沈阳市不同蔬菜的气象响应差异与市场恢复特征 | `articles/A05.json` | crop-heterogeneity-recovery | 7 | 3 |
| A06 | 沈阳市蔬菜市场量价关系风险传导与天气信息预测增量 | `articles/A06.json` | price-volume-transmission-forecast | 7 | 2 |
| A07 | 沈阳市农业生产的区县格局与作物结构（2018-2024） | `articles/A07.json` | district-production-structure | 7 | 11 |
| A08 | 气象条件与沈阳市农业单产变化的区县面板研究 | `articles/A08.json` | district-yield-weather-panel | 7 | 3 |
| A09 | 沈阳市农业气象风险、生产响应与农产品市场表现综合研究 | `articles/A09.json` | synthesis-agrometeorological-risk | 7 | **16** |

→ 与手册 §6 的意图一致：**A01–A08 → 「研究」；A09 → 「报告」**。

---

## 3. 逐篇资产与**存在性**（实测）

| ID | sections | figures | 图存在 | tables | 表存在 | source_ids |
|---|---|---|---|---|---|---|
| A01 | 7 | 1 | 1/1 ✅ | 4 | **1/4** ❌ | 1 |
| A02 | 7 | 0 | — | 2 | **1/2** ❌ | 3 |
| A03 | 7 | 0 | — | 3 | 3/3 ✅ | 2 |
| A04 | 7 | 0 | — | 1 | 1/1 ✅ | 4 |
| A05 | 7 | 0 | — | 3 | **2/3** ❌ | 3 |
| A06 | 7 | 0 | — | 3 | **2/3** ❌ | 2 |
| A07 | 7 | 1 | 1/1 ✅ | 3 | **2/3** ❌ | 11 |
| A08 | 7 | 0 | — | 3 | 3/3 ✅ | 3 |
| A09 | 7 | 0 | — | 0 | — | 16 |

**汇总**：v2 全库只有 **2 张图**（A01、A07 各 1 张）；被引用的表 **22 个**，实际存在 **17 个**。

- 被引用但**缺失**（7 个）：`A01_monthly.csv`、`A01_seasonal_index.csv`、`A01_stl_strength.csv`、`A02_daily_response_Fwx.csv`、`A05_recovery.csv`、`A06_forecast_rolling.csv`、`A07_change_2018_2024.csv`
- 存在但**未被任何文章引用**（2 个）：`A01_trend.csv`、`A04_event_clusters.csv`

---

## 4. Article JSON 真实 schema

```
{ id, slug, title,
  abstract, frontend_summary, keywords[], research_questions[], status,
  data_scope:  { summary },                 // markdown
  methods:     [{ summary }],               // markdown
  key_findings:[{ heading }],               // 只有小标题，无正文
  sections:    [{ number, title, content }],// content 为 markdown 字符串（含 ###、**、| 表格 |、`文件名`）
  limitations: [string],                    // markdown 列表项
  conclusion:  string,                      // 纯散文
  figures:     [{ file }],                  // 只有文件名
  tables:      [{ file }],                  // 只有文件名
  source_ids:  [string] }                   // → sources.json
```

**结论**：v2 不是手册 §33 设想的 `ArticleBlock` 结构化数组，而是**分段 markdown 字符串**。
因此「不再解析 markdown」在这一版数据上**做不到**——`sections[].content` 本身就是 markdown。
可行的退化方案（不改研究文件）：只解析**有限的、研究侧已实际使用的**语法（`###` 小标题、`**强调**`、`| 表格 |`、`` `文件名` ``），
并且**只渲染不猜测**；这属于渲染层转述，不是内容创作。

---

## 5. Figure

| 手册要求 | 实际 |
|---|---|
| 路径 | ✅ `reports/v2/figures/<file>` |
| 标题 | ❌ 无 |
| caption | ❌ 无（正文里只有行内提及，如「图 `A01_seasonal_amplitude.png`」） |
| source | ❌ 无（图级来源不存在，只有篇级 `source_ids`） |

→ 手册 §34（图 2 / 标题 / 图注 / 数据来源）与 §81（每张 Figure 必须有 `SourceRef[]`）**在 v2 数据上无法满足**。
只能做到：图编号 + 文件名派生的**中性**标题（或不给标题）+ 继承篇级 `source_ids` 作为来源。
**不得**由前端编写图注或给图配来源。

---

## 6. Dataset

- `exports/frontend/` 下**没有 dataset 层**，也没有表/图的元数据 JSON。
- 表实体在 `reports/v2/tables/*.csv`（17 个）；字段是**英文 key**，例如：
  - `A01_trend.csv` → `crop,response,beta_per_year,se,p_raw,n,r2,ar1,n_eff,annual_pct,q_fdr,ci_low,ci_high`
  - `A07_district_crop_structure.csv` → `crop,district,years,sown_area_median_ha,production_median_t,yield_median_kg_ha`
- **单位线索**：一部分来自列名后缀（`_ha`、`_t`、`_kg_ha`、`annual_pct`）。

**权威单位口径来自研究自身**（`reports/v2/00_研究总览.md:18`）：

> 单位纪律：价格 **元/500g**；成交量 **单位未知**（禁写「吨」）；生产 **公顷 / 吨 / 公斤·公顷⁻¹**。

这条与手册 §11/§14 完全一致，说明**单位可以转述、不可以发明**。

---

## 7. Source（`sources.json`，16 条）

字段：`source_id, title, publisher, authors, type, url, data_period, published_date, accessed_at, source_grade, verification_status`

- `type` ∈ {`official_statistics`, `official_api`, `official_news`}
- `source_grade` ∈ {A, B}；`verification_status` 全部 `verified`
- 例：`SRC-SY-CLZ` = 沈阳菜篮子信息发布平台 / 沈阳市发展和改革委员会 / `https://www.lnsyjgjc.com/` / A

**这正好是一张可用的 SourceRef 表**（`publisher`→机构，`title`→数据集，`url`→链接，`data_period`/`accessed_at`→时间）。
手册 §51「数据来源不要显示 weather.csv」在本数据上**天然成立**。

---

## 8. Evidence

- Article JSON **没有** evidence / evidence_level / 证据等级字段。
- 旧前端的「证据 A/B」来自 v1 的 `evidenceLevels`，**v2 不提供**。
- 可由 `sources[].source_grade`（A/B）与 `verification_status` 间接说明来源等级，但**这不是"证据等级"**，不能把两者混为一谈。

→ 结论：v2 下不应再显示「证据 A/B」这类徽标（除非只按来源等级如实标注，且改名为"来源等级"）。

---

## 9. Metric

- **没有** `MetricDefinition` / `MetricValue` / metric id 表。
- 单位：见 §6（可转述）。
- 定义 / 公式 / 解释：只散落在 `data_scope.summary`、`methods.summary` 与正文散文里，例如 `seasonal_index = 某月均值 / 全年均值`、`log_price ~ t` 的 HAC(14) 回归、`n_eff`、`q_fdr`。
- 手册 §13 点名的 `seasonal_strength` / `hazard_score` / `resilience_index` / `recovery_score`：**v2 export 未提供** definition / formula / interpretation。

→ 必须产出 `docs/METRIC_GAPS.md`；正式界面只显示已有可靠名称 + 单位，自定义指标**不给数字以外的解释**，直到研究侧补上。

---

## 10. Report（A09 的正式入口）

- `articles/A09.json`：`status=ACCEPTED`，7 sections，引用 **16 条**来源（= 全库来源总量），`figures/tables` 均为空。
- 对应人读版：`reports/v2/09_沈阳市农业气象风险生产响应与农产品市场表现综合研究.md`。

→ A09 是**唯一**当前可发布的正式报告；其余城市没有 v2 报告 → 手册 §41「只发布真实完成的报告」成立。

---

## 11. Article

✅ 一篇一 JSON，`manifest.articles[].file` 显式给出路径，`n_articles=9` 可校验。

---

## 12. Table

- **没有中文字段 metadata**：CSV 只有英文 header；`dataset` 层没有 `ColumnMeta{key,label,metricId?,unit?,format?}`。
- → 手册 §36 的 `TABLE_SCHEMA_GAPS.md` 必须产出；正式界面**不得**直接显示 `PRICE_MEDIAN` / `YEAR` / `CROP` 这类原始 key。
  可行做法：前端维护**受控的中文列名映射**（仅对实际出现的列，逐列登记，且不改变数值语义），映射表本身进 docs 供审阅；未收录的列**不渲染**。

---

## 13. 缺口清单（本审计结论）

| # | 缺口 | 影响的手册条款 | 处理 |
|---|---|---|---|
| G1 | 7 个被引用的表文件缺失 | §8 fail-fast、§90 | 见"待决策 D1" |
| G2 | 全库只有 2 张图 | §86 图表 QA | 研究侧未产图；无图不渲染空框 |
| G3 | 图级 title / caption / source 全缺 | §34、§81 | 不编；仅图编号 + 继承篇级来源 |
| G4 | 无 metric 定义/公式/解释结构 | §10–§13、§53 | 产出 `METRIC_GAPS.md` |
| G5 | 无 dataset/ColumnMeta（表头是英文 key） | §36、§76 | 产出 `TABLE_SCHEMA_GAPS.md` + 受控中文列名映射 |
| G6 | 无 evidence 等级字段 | 旧 UI 的「证据 A/B」 | 不再显示该徽标，或按来源等级改名如实标注 |
| G7 | `key_findings` 只有小标题、无正文 | §29/§30 | 只用 sections + conclusion 组织叙事 |
| G8 | 内容为 markdown 字符串，非 blocks | §33 | 只解析有限语法，不发明结构 |

---

## 14. 相对手册的修正

1. **路径**：`city_data/shenyang/…`。
2. **§8 fail-fast 需分层**：文章 / source_id / manifest 缺失 → 硬失败；figure/table **资产**缺失 → 记录到 manifest 的 gaps 段落 + docs，并**非静默**地打印摘要（否则 7 个表会把整个 v5 卡死）。
3. **§33「不再解析 markdown」**在 v2 数据上不可实现，退化为"有限语法解析 + 不发明"。
4. **§34/§81 图级 caption/source** 无法满足 → 记入 gaps，不编造。
5. **§52「知识来源」有真实数据**：`reports/v2/references.md` 有 **43 条**已核验 DOI 的参考文献，并带"用途"标注 → 无需发明 DOI。
6. **旧 G/C 依赖面很大**：`modulesG.tsx`、`modulesC.tsx`、`registry.tsx`、`Case2026Chart`、`RainstormPage`、`ResearchRepository`、`index.json` 全部绑定旧索引 → 退役 G/C 等于**重建研究数据层 + 重新指向 22 个 widget**，这是 v5 最大的工作量，必须排在最前。
