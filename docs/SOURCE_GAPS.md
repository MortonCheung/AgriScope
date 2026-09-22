# SOURCE_GAPS

记录"页面上出现了数据、但前端拿不到可如实展示的 **SourceRef**"的位置（V4 §五十五）。

规则：

1. **不猜、不编**：没有来源声明时，正式界面不显示来源块，或如实写「来源待补充」。
   绝不显示 `来源未在当前前端索引中声明` 这类开发文案，也绝不由 Agent 猜机构或链接。
2. **Source 与 Lineage 分离**（§五十三）：用户要看的是机构 / 数据集（`SourceRef`）；
   `.md` / `.csv` / `.png` 文件名是技术血缘（`LineageRef`），只在开发模式或技术折叠区出现。
3. 本文件只登记缺口，不替代研究工程里的来源说明；补来源属于"补研究"，须用户明确要求（§68）。

---

## 一、现状：索引没有声明任何 SourceRef

`index.json` 目前只有 `sourceOfTruth`，内容是**血缘**（文件路径），不是来源：

| 键 | 值 | 性质 |
|---|---|---|
| research_doc | SHENYANG_RESEARCH.md | Lineage |
| process_reports | reports/01~15 + MILESTONE_1_REPORT.md | Lineage |
| lineage | outputs/results_registry.csv | Lineage |

因此：

- `CityResearchIndex.sources` 当前**为空数组** → 右栏「来源」如实显示「来源待补充」。
- 研究数据的**逐图 / 逐表 / 逐项数字**来源字段也不存在 → 图表页脚不再显示来源块（§五十五允许），
  也不再显示文件名（§五十三禁止）。
- `sourceOfTruth` 与各图的文件名改为 `CityResearchIndex.lineage` / `ChartFrame.lineage`，
  **仅开发模式**在技术折叠区可见（§五十四）。

> 修正记录：本文档此前把各图文件名（如 `case2026_summary.csv`）称为"已声明来源"，并把
> `sourceOfTruth` 当作来源展示。按 §五十三–§五十五 二者都是 Lineage，已从正式界面移除。

---

## 二、缺口清单

| # | 范围 | 缺失内容 | 可能的来源 | 需要谁处理 |
|---|---|---|---|---|
| 1 | 城市级（`index.json`） | `sources: SourceRef[]` 声明 | 研究正文已写明的来源（见第三节） | 研究工程把散文结构化为 `sources[]` |
| 2 | 全部 17 个研究点 × `figures[]` | 逐图 `SourceRef` | 同上 | 研究工程 |
| 3 | 全部 17 个研究点 × `tables[]` | 逐表 `SourceRef` | 同上 | 研究工程 |
| 4 | 全部 17 个研究点 × `keyNumbers[]` | 逐项数字来源 | 各研究点对应的 summary CSV | 研究工程决定"整组一个来源"还是"逐项来源" |
| 5 | 辽宁 / 城市地图 | `/geo/liaoning.json` 行政边界的来源与版本 | 公开行政区划数据 | 研究工程 |

开发期定位缺口：控制台输出 `Missing SourceRef: <cityId> / <pointId> / figure <file>`
（同一条只报一次，见 `domain/research/sourceRef.ts`）。

验收（§五十五）：正式页面不出现 `.csv` / `.md` 作为来源，不出现「来源未在当前前端索引中声明」，
不出现任何未经声明的机构名或外链。

---

## 三、研究正文已写明的来源（待结构化为 `sources[]`）

以下**逐字摘自研究正文**，只作转述素材，前端不据此自行拼装 `SourceRef`：

> 本研究使用沈阳市官方农产品批发价格简讯（10 种核心蔬菜的日度价格与成交量指标）、
> Open-Meteo ERA5/ERA5-Land 逐日再分析气象与分层土壤数据、1991–2020 日值气候基线、
> 算法派生极端天气事件（沈阳 20 起，与官方通报严格分离），以及市级年度农业生产统计（2017–2025）。
> —— `public/research/shenyang/articles/abstract.json`

另外 `tables/shenyang_yearly_panel.csv` 内带有研究工程标注的气象口径：
`Open-Meteo ERA5 / ERA5-Land 再分析（非气象站实测）`。

研究红线亦明确：`不把 ERA5 再分析写成气象站实测`（`index.json` → `redLines`）。

> 研究正文**没有**给出这些数据的发布机构全称与官方网址，因此前端不填 `organization` 的
> "推测值"，也不填 `url` —— 这正是本阶段正式界面只显示「来源待补充」的原因。

---

## 四、补全前提

以上都属于"补研究来源声明"，不是"补前端文案"。
**只有用户明确要求补全数据来源时**，才由研究工程在 `index.json` 增加 `sources[]`，
前端无需改动即可自动展示。
