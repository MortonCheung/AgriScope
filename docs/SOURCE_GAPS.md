# SOURCE_GAPS

记录"页面上出现了数据、但当前前端索引里没有声明确切来源"的位置（V3 §32）。

规则：

1. **不猜、不编**。找不到确切来源时，界面上如实写「来源未在当前前端索引中声明」。
2. 只使用研究工程已经存在的信息；确需补全来源时，必须由用户明确要求后再补研究，不在前端造来源（§68）。
3. 本文件只登记缺口，不替代研究工程里的来源说明。

---

## 已声明来源（可正常显示，不算缺口）

研究工程在 `index.json` 的 `sourceOfTruth` 里声明了城市级来源，前端只转述（`CityResearchIndex.provenance`）：

| 键 | 值 |
|---|---|
| research_doc | SHENYANG_RESEARCH.md |
| process_reports | reports/01~15 + MILESTONE_1_REPORT.md |
| lineage | outputs/results_registry.csv |

所有 `ChartFrame` 的 `sources` 也都是真实数据文件的 basename（如 `case2026_summary.csv`、`F27_case2026_vs_history.png`），精确到具体文件，属于已声明来源。

---

## 缺口 1：Research Figure 的逐图来源

| Research Point | Data Block | Missing Source | Possible Origin | Needs Verification |
|---|---|---|---|---|
| G1–G10、C1–C7（全部 17 个研究点） | `figures[]`（静态图 / 图集） | 索引只给了图片路径 `figures[]`，没有逐图来源字段 | 可能来自研究工程的 `outputs/` 与各 process report | 需要研究工程在索引里为每张图补 `source` |
| G1–G10、C1–C7 | `tables[]`（研究表） | 同上，只有 `src` 路径 | 同上 | 同上 |

处理方式：`adapters.ts` 的 `toFigures()` 不再合成 `shenyang · <id>` 这类假来源，改为空值；`SourceCitation` 会显示「来源未在当前前端索引中声明」。

> 修正记录：在此之前适配器会为每张图合成 `source: 'shenyang · <pointId>'`。这不是真实来源，已按 §32 删除。

---

## 缺口 2：Key Numbers 的来源

| Research Point | Data Block | Missing Source | Possible Origin | Needs Verification |
|---|---|---|---|---|
| G1–G10、C1–C7（全部 17 个研究点） | `keyNumbers`（核心数据宫格） | `ResearchKeyNumber` 只有 `label` / `value`，没有来源字段 | 各研究点对应的 summary CSV | 需要研究工程决定是"整组一个来源"还是"逐项来源"（§36） |

处理方式：`KeyNumberGrid` 下方统一显示「来源未在当前前端索引中声明」，不使用 `--ag-ink-ghost` 这类过淡颜色，也不加 Badge / Pill（§33/§40）。

---

## 缺口 3：地图与几何

| 页面 | Data Block | Missing Source | Possible Origin | Needs Verification |
|---|---|---|---|---|
| 辽宁 / 城市 | `/geo/liaoning.json` 行政边界 | 索引未声明边界数据的来源与版本 | 可能来自公开行政区划数据 | 需要在研究工程补充声明 |

---

## 后续补全的前提

以上补全都属于"补研究来源"，不是"补前端文案"。**只有用户明确要求补全数据来源研究时才做**（§68）。
