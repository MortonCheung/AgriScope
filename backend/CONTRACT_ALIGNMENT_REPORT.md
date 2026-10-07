# 契约对齐报告（CONTRACT_ALIGNMENT_REPORT）

本报告记录 Final Model 冻结产物的**已知口径差异**，并声明后端的权威口径。

> **处理原则**：`models/reports/final/**` 是 `FINAL_RUN_META.json.artifact_hashes`
> 锁定的冻结交付物。实测所有相关文件 sha256 **与 META 完全一致**（见下表）：
> 修改任一 .md/json 都会破坏冻结哈希，违反「禁止修改旧研究结果 / canonical 文件」硬约束。
> 因此本轮**不改动任何冻结产物**，改为**在本报告如实登记差异 + 明确权威口径**。

| 文件 | 当前 sha256（前 16） | 与 META 一致 |
|---|---|---|
| FINAL_MODEL_REPORT.md | `80392389c4059d33` | ✅ |
| OPTIMIZATION_REPORT.md | `1d4e6e3b09017ecb` | ✅ |
| HRI_VALIDATION_REPORT.md | `5559422c29d86770` | ✅ |
| FINAL_MODEL_OUTPUT_SCHEMA.json | `ac2a2ad093b72bd5` | ✅ |

---

## 差异 1 · HRI 的 raw 与 robust 显著性

- `FINAL_MODEL_REPORT.md`（结论摘要）写：**沈阳 10 作物中 9 个 p<0.05**。
- `HRI_VALIDATION_REPORT.md`（§24/§25）给出更严格口径：
  - 沈阳：`raw 9/10`，**稳健显著（block bootstrap + HAC 双通过）5/10**；
  - 朝阳：`raw 19/25`，**稳健显著 13/25**。
- **权威口径**：`HRI_VALIDATION_REPORT.md`（含 §24/§25 时间序列稳健验证）。
  摘要行的「9 个」是**重叠窗口 raw** 口径，只可与其稳健口径并读；
  其自身的 `report.py`（L527）已如实写出「raw 9/10 → robust 5/10」。
- **后端行为**：`/api/decision/evaluate` 原样转达 Final 的 `hri` 块（value/level/percentile），
  不把 raw/robust 混为一谈；`/api/daily/latest` 的 HRI 亦来自 Final 引擎。

## 差异 2 · OPTIMIZATION_REPORT §34「单作物 vs 多作物」自相矛盾

- 同段同时出现：`最优配置：[('茄子', 30.0), ('甘蓝', 30.0)]` **与**
  `结论：…最优解仍收敛到单作物（HHI=1.0）`。
- 依据原始实验产物 `tables/portfolio_balanced.json`：
  - 组合配置 = 茄子 30 亩 + 甘蓝 30 亩，`hhi=0.5`、`hhi_normalized=0.0`、`portfolio_utility=0.4167`；
  - 单作物参考 = 茄子 60 亩，`hhi=1.0`、`utility=0.4038`。
  - 即：**该 cut-off 下组合效用略高于单作物**，`HHI=1.0` 属于**单作物参考**的值，
  不是组合的值；结论文本与同段配置不一致。
- 根因：`models/src/decision_engine/final/report.py`（§34 段，约 L496–498）把该结论
  **硬编码**为固定文字，未按 `portfolio_balanced.json` 动态生成。
- 因 `report.py` 属 Final 冻结代码（`code_fingerprint=5a5d68232b747549`），
  本轮**不修改**；以本报告登记为准。
- **权威口径**：以 `tables/portfolio_balanced.json` / `portfolio.csv` 数值为准；
  「多作物一定更优」不成立（结论方向成立），但**该 cut-off 的具体最优解是两作物组合**。

## 差异 3 · Profit-only 高-HRI 选中率的三个数字

三者均正确，口径不同，不应互相替代：

| 数字 | 口径 | 出处 |
|---|---|---|
| **8.70%** | 固定阈值 73.2 下的 `A_profit_only` | `tables/balanced_fix_before_after_fixed_thr.csv` |
| **13.04%** | `C_agriscope_balanced` **修复前**（before） | `tables/balanced_fix_before_after.csv` |
| **13.80%** | 全历史 652 cut-off **相对阈值**口径 | `tables/balanced_diagnosis.json` |

## 差异 4 · FINAL_MODEL_OUTPUT_SCHEMA.json 与运行时不符

- 该文件列出小写 `status`、`required=8`、profit 字段与运行时不一致。
- 它是 `FINAL_RUN_META.json` 的**哈希交付物**（历史产物），故保留不动。
- **权威 schema**：以 `models/src/decision_engine/final/inference.py` 的运行时输出 +
  本仓库 `backend/FRONTEND_INTEGRATION_HANDOFF.md` 的契约为准。

## 差异 5 · 朝阳能力计数

`capabilities.CITY_CAPABILITY['朝阳']` 登记的作物列表长度为 10，但实际可用作物为 8。
后端已将计数**拆分**，避免把「登记」误当「可用」：

| 指标 | 沈阳 | 朝阳 |
|---|---|---|
| `n_registered_crops`（城市登记） | 10 | 10 |
| `n_supported_crops`（有价格模型，`/api/decision/capabilities` 暴露） | 10 | **8** |
| `n_price_model_crops`（`price_model_selection` 命中） | 10 | **8** |
| `n_risk_crops`（HRI 与 Market Risk 均可用） | 10 | **8** |
| `market_as_of`（运行时快照） | 2026-10-06 | 2026-09-21 |

---

## 权威口径一览（后端最终采用）

| 主题 | 权威来源 |
|---|---|
| Final 运行时状态枚举 | `decision_engine/final/capabilities.py` 的 `STATUS` |
| 城市/作物能力 | `capabilities.CITY_CAPABILITY` + `crop_capability()`（后端 `capability_service`） |
| 运行时输出 schema | `decision_engine/final/inference.py` + 本仓库交接文档 |
| 版本真源 | `models/reports/final/FINAL_RUN_META.json` |
| Daily schema | `data/processed/daily/snapshots/latest.json`（schema 1.1.0） |
| HRI 严谨结论 | `HRI_VALIDATION_REPORT.md` |
| 组合优化数值 | `tables/portfolio_balanced.json` / `portfolio.csv` |