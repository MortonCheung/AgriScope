# TABLE_SCHEMA_GAPS

表字段中文化覆盖情况（V5 §36/§76）。

规则：`DataTable` 只渲染在 `src/domain/research/v2/metrics.ts` 的 `COLUMN_META` 里登记过的列；
未登记的列**不渲染**，也不会回退成原始英文 key。覆盖性由 `scripts/verify-v2-payload.mjs` 强制检查。

## 已覆盖（界面会渲染的表）

- **v2 载荷全部 17 张表**：`columnMeta` 逐列登记中文名 + 单位 + 精度；
- **推演页读取的 3 张情景表**（`counterfactual_gate / severity / buffer`）：已登记，并按 §47/§78 中文化
  （`gate_min_r2 → 模型门槛（R² 下限）`、`severity_mult → 事件强度倍率`、`buffer_frac → 供应缓冲比例` …）。

校验命令：`npm run verify:v2`（未登记列会直接失败并列出列名）。

## 尚未覆盖（界面当前不渲染，因此暂不登记）

v1 载荷里另有约 34 张过程表，属于旧研究前台的产物，v5 不引用、不渲染：

`counterfactual_analog / counterfactual_gap / counterfactual_gap_summary / case2026_* / crop_risk_profile /
descriptive_by_crop / event_study_* / extreme_day_contrast / fingerprint_* / lag_* / m1_volume_price_leadlag /
model_ale_curves / model_baseline_comparison / model_metrics_* / annual_market_by_year / …`

处理原则：

1. 这些表**不进界面**，所以不存在 schema 泄漏；
2. 若将来要渲染其中任何一张，必须先在 `COLUMN_META` 登记该表全部列，否则 `verify:v2` 会失败——
   这是有意设计的闸门，不是遗漏；
3. v1 表本身会在旧载荷退休时一并清理。

## 附：`figures` / `tables` 的元数据缺口

v2 的 `figures[]` / `tables[]` 只有文件名，**没有** `title / caption / metricId`。
因此表格题注只能由章节名与研究侧行内引用派生，图片只有编号。这些元数据缺口记录在
`docs/SHENYANG_V2_FRONTEND_AUDIT.md` §G3，未在前端补写。
