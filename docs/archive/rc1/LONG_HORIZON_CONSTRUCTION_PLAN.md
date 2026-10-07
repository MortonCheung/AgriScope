# LONG-HORIZON 施工计划（Phase 7–22）

> 本文件是**计划**，不是实现。Phase 0–6（只读扫描 / 资产审计 / 迁移设计 / 单仓库迁移 / 路径修复 / 旧系统回归）
> 见 `MONOREPO_MIGRATION_DESIGN.md` §12。
> 数据可行性依据：`LONG_HORIZON_FEASIBILITY_AUDIT.md`；LLM 方法依据：`LLM_EVALUATION_DESIGN.md`。

---

## 0. 可行性约束（先立规矩，再干活）

审计实测（沈阳，单一 wholesale 口径）：

| 事实 | 值 |
|---|---|
| 价格跨度 | 2021-01-01 ~ 2026-09-14（1410 有效观测日，缺 ~32% 日历日，6 个自然年，10 作物完全同覆盖） |
| 已有均值 target | `target_mean_price_next_{7,14,30,60,90}d`（**最大 N=90**） |
| 非重叠样本（主口径） | 30→68、60→34、90→22、**120→17**、150→13、180→11、210→9、240→8 |
| 非重叠样本（现有 3 折 OOT 口径） | 30→33、60→17、90→12、**120→9**、150→7、180→7、210→5、240→5（fold3 2026 在 N≥150 仅剩 1） |
| 季节性 baseline | 月份 1–9 有 6 年、10–12 有 5 年 → 全部 N 可行 |
| 短期误差基线（多 horizon WAPE） | 30d 4.8–15.1% → 60d 7.1–19.0% → 90d 8.3–21.0% |
| 城市级作物物候 | **NOT_FOUND**（`phenology.parquet` 只覆盖粮作）；仅有省级/区域级、月/旬粒度 `data/raw/metadata/crop_calendar.csv`（10 作物全覆盖，含官方标准，属中等强度粗粒度） |

**据此确定本轮 horizon 覆盖策略（诚实版）：**

| N | 定位 | 依据 |
|---|---|---|
| 30 | 维持 `PRODUCTION`（点预测） | 现状 `MODEL_HORIZONS=[7,14,30]` |
| 60 / 90 | 维持可评估；目标是**从 scenario-only 升级为可验证的长期方法**（若验证通过） | 标签充分（1368/1347 非空）、季节性 baseline 年份足够 |
| 120 | **重点研究**：可行（17 非重叠 / OOT 9），但误差预计 >20% → 上限为 `SCENARIO_ONLY` 或（若真增益）`PRODUCTION_HYBRID` | §1.2 要求必须真正研究 120d+ |
| 150 / 180 | **必须研究但明确标注「探索级」**：OOT 仅 7 个非重叠样本、fold3 仅 1 → 不足以支撑上线级评估 | §12 要求覆盖；§104 要求如实报告 |
| 210 / 240 | **不研究**，明确停止 | 非重叠 9/8、OOT 5 → **数据不支持**（§12：数据不支持就明确停止） |

> 该策略同时满足 owner「必须真正研究 120 天以上」与「不要为了页面漂亮制造 365d」两条要求。

---

## Phase 7 · Long-Horizon Target 研究

**问题**：长期目标应该是「第 N 天单点价」还是「N 天附近未来 7/14/30 日均价」？

**做法（只读 + 回测，不改 Final）**：
1. 对 N ∈ {30,60,90,120}，构造候选 target：
   - `endpoint`：`target_price_t{N}`（单点）
   - `window7 / window14 / window30`：N 附近未来 w 日内已有观测的均价（`final/build.py:add_mean_targets` 已是参数化函数，可复用其口径）
2. 用**同一组 baseline**（LastValue / SeasonalNaive / 同期中位数）在**同一时间折**上比 MAE / WAPE / sMAPE / 稳定性（跨 fold 方差）。
3. 判定标准（必须程序化，不主观）：误差更稳定 **且** 业务语义更合理者胜。

**产出**：`LONG_HORIZON_TARGET_STUDY.md`（含表格与结论）+ 冻结的正式 Long-Horizon Target 定义。
**门禁**：目标定义写入代码常量前，须有 ≥2 种口径的对照表；不得只报最优者（§33）。

---

## Phase 8 · 长期 Baseline（正式对照集）

必建（§10）：

| # | Baseline | 落地 |
|---|---|---|
| 1 | Last Value | 已有（`baseline_last_value`） |
| 2 | Seasonal Naive（去年同月/同日） | 新建（数据支持：每月 5–6 年） |
| 3 | Historical Same-Season Mean | 新建 |
| 4 | Historical Same-Season Median | 已有季节性特征列（`seasonal_p50` 等），需包装成预测器 |
| 5 | Trend Baseline（线性/稳健趋势外推） | 新建 |
| 6 | 可延伸统计模型 | 复用/延伸现有 `models/src/decision_engine/models/*` 工厂 |
| 7 | ML Baseline | 复用 ExtraTrees / ElasticNet 工厂（**不重训 Final**，新训练即可） |
| 8 | LLM Direct / LLM Residual / Hybrid | Phase 11–13 |

**产出**：`long_horizon/baselines/` + `LONG_HORIZON_MODEL_REPORT.md` 的 baseline 对照节。
**门禁**：任何后续方法必须与**全部** baseline 同折同口径比较（§10：不允许只比 "LLM vs current Final"）。

---

## Phase 9 · ForecastContextPacket

- 实现 `llm/context/` 的 packet builder；字段见 `LLM_EVALUATION_DESIGN.md` §3。
- **所有数值由程序计算**；LLM 不参与输入构造。
- `data + cutoff + config → context_hash` 必须**确定性**（同输入同哈希，跨进程一致）。
- **point-in-time 强制**：只能读 `<= cutoff` 的数据；对 feature / event publication / price observation / production publication 四类时间戳做泄漏检测（§13/§14）。

**产出**：packet schema + builder + determinism 测试 + 泄漏检测测试。
**门禁**：`no_leakage` 与 `determinism` 测试通过后才允许进入 LLM Phase（§74）。

---

## Phase 10 · LLM Provider / Schema / Cache / Prompt

- `llm/providers/`：`LLMProvider` 抽象（OpenAI-compatible），模型可切换。
- `llm/schemas/`：结构化输出 JSON Schema（见设计文档 §4），单位固定 `CNY/kg`。
- `llm/prompts/`：`forecast_v1.md`、`residual_v1.md`、`scenario_v1.md`、`critic_v1.md`；记录 `prompt_version/prompt_hash`。
- `llm/cache/`：key = `context_hash + prompt_hash + model`；**只缓存通过校验的结构化结果**，API 错误不入缓存。
- secret：`.env` + `.gitignore`，只提交 `.env.example`。

**无 API Key 时的处理（§44）**：以上组件全部先完成并用 **stub/mock provider** 跑通 harness；**不停止**。有合法 key 时再实跑。

**产出**：provider + schema + cache + prompt 版本化 + 数字安全校验（finite / `low<=point<=high` / 量级 / 单位；异常 reject）。
**门禁**：数字安全校验与缓存一致性测试通过。

---

## Phase 11 · Blind LLM Pilot（`blind_numeric_forecast`）

- 匿名城市/作物、**相对时间索引**（T-180…T0）、结构化历史序列、季节/统计特征、短期模型输出、HRI/Market Risk/Climate；**不给真实年份、真实事件名**。
- **Pilot 作物必须由数据统计选出**（§47 禁止凭印象）：程序计算每作物
  - 价格波动（CV / log-return σ）
  - 季节强度（如按年-月方差分解或 lag≈365 自相关）
  然后按「低波动 / 高波动 / 季节性强」各取 1 个代表（实际名单由该计算产出，**不预先指定**）。
- Pilot horizon：{60, 90, 120}；cutoff 数受限（先 5–8 个）以控成本（§46）。
- **重复性**：同一 packet 同模型跑 3–5 次，测 point / direction / range 方差；不稳定则降温 / ensemble / 中位数聚合 / 降级（§49）。

**Pilot 成功条件（§48）**：pipeline 正确、无泄漏、LLM 输出稳定、历史 evaluation 可执行、成本可控 → 才扩到 10 作物。
**产出**：`LLM_FORECAST_REPORT.md`（blind 节）+ pilot 结论。

---

## Phase 12 · Context LLM Pilot（`context_augmented_forecast`）

- 允许使用 cutoff 当时**已公开**的政策/事件/天气异常/市场信息；每条必须存 `source / publication_date / retrieved_content / cutoff_eligible`。
- **不得**宣称完全排除 pretrained leakage；结论只能表述为「结合当时可获得信息是否有增量」。

**产出**：blind 与 context **分开报告**（§18：不得合并成一个 accuracy）。

---

## Phase 13 · Residual / Hybrid

- **LLM Residual（重点候选）**：先给统计 baseline 点值，再让 LLM 输出 `adjustment`。
- `max_adjustment` **必须由 development 集学习**，禁止手写 ±30%；必须比较 **unbounded / bounded / confidence-gated**（§26）。
- **Hybrid A/B/C**：A=统计点值+LLM残差；B=加权集成（统计/季节/LLM）；C=按 market regime 门控。
- **权重由程序基于 development OOT 选择**，LLM 无权重决定权（§28）。
- LLM 自报 confidence **不得**当概率（未经 calibration 只能叫 confidence）。

**产出**：`HYBRID_REPORT.md`（含三种残差约束与三种 Hybrid 的对照）。

---

## Phase 14 · Multi-crop Expansion

- Pilot 通过后扩到 10 作物；仍按 per crop × horizon 独立评估（§32/§39：允许每作物不同方法）。
- 报告 **worst crop / worst horizon / worst season**（§33）。

---

## Phase 15 · 60–180d Walk-forward Backtest

- 严格 point-in-time、逐 fold、逐 crop、逐 horizon（60/90/120/150/180）。
- 指标：MAE / WAPE / sMAPE / MASE / Directional Accuracy / Bias；范围：Coverage / Average Width / Interval Score。
- **必须输出 Error Growth Curve**（7→180d），回答"从什么时候开始失效"。
- **必须如实报告 150/180 为探索级**（OOT 样本 ≤7）。

**产出**：`LONG_HORIZON_METRICS.csv`（含 `fold/crop/horizon/method/metric/worst_case`）。
**门禁**：不得只报平均指标（§33）。

---

## Phase 16 · Ablation / Calibration

- Ablation（§83）：LLM only / +seasonality / +short model / +risk / +events / Hybrid full；回答"LLM 到底在利用什么"。
- **反「复述输入」检查**（§84）：分析 gain source，禁止以「LLM 推理能力强」交差。
- Calibration（§29/§30）：LLM confidence → 概率需 calibration；长期区间默认 `base/downside/upside`，只有 coverage 达标才可称 prediction interval。

**产出**：`LLM_ABLATION_REPORT.md`。

---

## Phase 17 · Production Method Selection

- 逐 crop × horizon 依 §37 gate 判定：
  - `PRODUCTION_HYBRID`：比 baseline 稳定增益 + 无 bias 爆炸 + worst-case 可接受 + 可复现
  - 否则 `SCENARIO_ONLY`
- 登记 `LONG_HORIZON_REGISTRY.csv`：`crop, horizon, method, metric, confidence, range_type, production_status, reason`。
- 诚实性：若 LLM 数值不赢，**不让它进数值真源**（§85/§105-C）；LLM 仍可承担 scenario reasoning / disagreement / uncertainty 解释。

**产出**：`LONG_HORIZON_REGISTRY.csv` + `LONG_HORIZON_MODEL_REPORT.md`（含 Method Map：作物/horizon/final_method/error/fallback）。

---

## Phase 18 · Long-Horizon API

- **不立即改 `/api/decision` 语义**（§76，防破坏冻结前端）。
- 新增：`GET /api/forecast/capabilities`、`POST /api/forecast/long-horizon`（路径先做设计评审，再由 Adapter 扩展）。
- **Online vs Precompute**：按 `LLM_EVALUATION_DESIGN.md` §10 的推荐实施（owner 倾向 precompute：Daily 后独立 Long Horizon Forecast Job，前端直读；不得塞进 Daily 核心采集逻辑）。
- 失败隔离：LLM 挂 → `LLM_UNAVAILABLE` 或 statistical fallback，且 `fallback_used=true`，前端可辨 method。
- 响应含：`point / range / trend / confidence / method / horizon / drivers / risks / model_disagreement`，且 `forecast.source ∈ {short_model, seasonal, llm_direct, llm_residual, hybrid, scenario_only}`。

---

## Phase 19 · Frontend 最小接入

- **不重新设计页面**；仅加入最必要 UI：预测周期、长期价格情景、模型来源、长期可信度、模型分歧。
- 主入口仍是结构化表单（area/budget/risk/crop/cost/yield/horizon），**不是聊天框**。
- LLM 解释放结果层，不做主视觉大聊天框。

---

## Phase 20 · 全系统 E2E

- 真实浏览器 E2E（沿用上一轮口径）+ `/api/**` Network 校验 + 失败隔离演练（停 LLM provider 看降级）。
- 回归：Frontend 299+ / Backend 24+ / Final 38/38 / Daily 33/33 **全绿**。

---

## Phase 21 · Freeze Gate

产出（§41）：`LONG_HORIZON_MODEL_REPORT.md`、`LONG_HORIZON_METRICS.csv`、`LONG_HORIZON_REGISTRY.csv`、
`LLM_FORECAST_REPORT.md`、`LLM_ABLATION_REPORT.md`、`HYBRID_REPORT.md`、`LONG_HORIZON_FREEZE_GATE.md`。

并回答 §104/§105/§106：30/60/90/120/150/180 的**正式 OOT WAPE**、LLM 是否真的提高准确度（A/B/C 三选一，不得为了故事硬说 A）、最终 Method Map。

---

## Phase 22 · monorepo merge main

- `feat/monorepo-v1` → `main`，push `MortonCheung/AgriScope`。
- 打 `v1.0.0-rc1`。
- **本轮不部署**（§99）。

---

## 全局门禁（贯穿）

1. point-in-time：任何 cutoff 只见 `<= cutoff`（§13）。
2. 泄漏检测：feature/event/price/production 时间戳（§14）；LLM 额外声明 pretrained 风险（§15）。
3. 数字安全：finite / 正数 / `low<=point<=high` / 量级 / 单位；异常 reject（§95）；hard bounds 由历史分布推出（§96）。
4. 不伪造：无来源的 production cycle / supply / event / policy / cost / yield 一律写 missing（§109）。
5. 冲突裁决顺序：报告 vs 代码 → **以 runtime 为准**；设想 vs 数据 → **以数据为准**；LLM 看起来聪明但回测不赢 → **以回测为准**（§118）。
6. 重大架构决定至少交叉验证两遍；重大统计结论 = 代码结果 + 独立复算（§118）。
7. 不频繁询问用户：只有「需付费 API 且无法继续 / 需 secret / 会造成不可逆 Git 数据损失」才阻断（§108）。

---

## 已知不确定项（需在对应 Phase 内解决）

| # | 不确定项 | 解决 Phase |
|---|---|---|
| 1 | 非重叠样本口径（日历天贪心 68 vs 观测索引 47 @N=30） | Phase 7 定口径 |
| 2 | 每个未来 N 天窗口内的实际观测数分布（缺 32% 日历日） | Phase 7 |
| 3 | 2026-09 后官方站点改版（数据止于 2026-09-14）的样本一致性 | Phase 15 |
| 4 | 120+ 的 WAPE 仅趋势外推，未实测 | Phase 15 |
| 5 | 区域级月粒度日历能否提供有效机制特征（未做消融） | Phase 8 / 16 |
| 6 | 长 horizon 尾部样本丢弃规则的影响 | Phase 7 |
| 7 | `common.py` 可移植性补丁（改变 code_fingerprint）需 owner 确认 | Phase 5 |