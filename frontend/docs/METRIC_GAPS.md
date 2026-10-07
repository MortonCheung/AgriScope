# METRIC_GAPS

记录「界面会出现这个指标，但研究侧没有给出定义 / 公式 / 解释」的缺口（V5 §13/§48）。

规则：**前端不补写定义**，只登记缺口；正式界面只显示可靠的名称与单位。
每一条的 `unit` 都来自研究自己的《单位纪律》或列名后缀，其余一律留空。

| metric / 列 | 使用页面 | 已有 | 缺失 |
|---|---|---|---|
| `seasonal_index` 季节指数 | 研究（若被引用） | 定义、公式 | — |
| `seasonal_range` 季节指数极差 | 研究 A01 | 定义 | — |
| `trend_beta_per_year` 年化趋势 | 研究 A01 | 定义、公式、解读 | — |
| `stl_seasonal_strength` STL 季节强度 | 研究 A01 | 定义、公式、解读 | — |
| `ar1` / `n_eff` / `q_fdr` | 研究 A01–A08 | 定义 | 公式（家族定义仅在 A01 给出） |
| `beta_per_sd` 每标准差系数 | 研究 A02 | 定义 | 公式 |
| `post_mean` 事件后均值 | 研究 A04 | 定义 | 公式、解读 |
| `placebo_mean` 安慰剂均值 | 研究 A04 | 定义 | 公式 |
| `rec_median` 恢复期中位数 | 研究 A05 | 定义 | **单位**（"交易日/天"未声明） |
| `cum_days` 累积天数 | 研究 A03 | 定义、单位（天） | — |
| `baseline` 基线 RMSE | 研究 A06 | 名称、值 | **单位**、定义、公式 |
| `weather` 含天气模型 RMSE | 研究 A06 | 名称、值 | **单位**、定义、公式 |
| `delta_rmse` RMSE 变化 | 研究 A06 | 名称、值 | **单位**、定义、公式 |
| `rel_gain_pct` 相对增益 | 研究 A06 | 名称、值 | 定义、公式（分母未说明） |
| `x_mean` / `x_sd` 暴露变量均值/标准差 | 研究 A02/A03 | 名称 | **单位**（随暴露变量而变，研究侧未逐变量声明） |
| `severity_mult` 事件强度倍率 | 推演 | 名称 | 定义、公式、解读 |
| `buffer_frac` 供应缓冲比例 | 推演 | 名称、单位（%） | 定义、公式 |
| `gate_min_r2` 模型门槛（R² 下限） | 推演 | 名称 | 定义、门槛来源 |
| `mean_gap_*_z` / `mean_gap_*_pct` 标准化缺口 / 缺口比例 | 推演 | 名称 | 定义、公式、解读 |
| `avoided_fraction` 避免比例 | 推演 | 名称、单位（%） | 定义、公式 |
| `hazard_score`、`resilience_index`、`recovery_score` | 未出现 | — | v2 export **未提供**，界面也不出现 |

> 结论：v2 导出没有任何 `MetricDefinition` 结构，因此 `About → 指标定义` 只列出研究正文里
> **明确写过**的 12 条；其余全部登记在此，等研究侧补 `definition / formula / interpretation`。
