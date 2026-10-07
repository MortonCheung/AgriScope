# AgriScope LLM Long-Horizon Forecasting 设计与评估规范（设计文档 · 不写实现）

> 文档性质：**设计规范**。本轮不写实现代码、不改任何既有文件。
> 唯一产出文件：本文件。所有对现有工程的引用均给出 `文件路径:行号`；凡未在代码/数据中确认的项一律标注 `UNKNOWN`。
> 依据：`LONG_HORIZON_FEASIBILITY_AUDIT.md`、`REPOSITORY_ASSET_AUDIT.md`、`backend/README.md`、
> `backend/FRONTEND_INTEGRATION_HANDOFF.md`、`backend/app/services/final_model_service.py`、
> `models/src/decision_engine/final/{capabilities,inference,fcommon,artifacts,models,build}.py`、
> `models/src/decision_engine/models/{train_price,backtest}.py`、`data/daily/{run_daily,snapshot}.py`。

---

## 0. 结论摘要

1. **LLM 定位 = Long-Horizon Forecasting Expert**，不是 chatbot / RAG 问答 / 文案生成器 / 字段翻译器。"自然语言→结构化输入"仅为**最低优先级的可选便利功能**，不构成核心（见 §1）。
2. LLM **允许输出数字**（future price / change / direction / scenario range），但必须像任何模型一样接受**严格历史回测**（OOT + walk-forward + baseline 对比 + calibration + ablation）。
3. LLM **没有"天然预测权"**。只有证明有**稳定增量**才允许进入正式 Hybrid（`PRODUCTION_HYBRID`），否则降级 `SCENARIO_ONLY`（见 §8）。
4. **两类实验必须分开评估、不得合并成一个 accuracy**：`blind_numeric_forecast` 与 `context_augmented_forecast`（见 §2）。
5. 所有 LLM 输入数值**由程序计算**、锁定历史事实，LLM 只预测未来；`data+cutoff+config` 必须产出**完全一致的 `context_hash`**（见 §3）。
6. **推荐 Online vs Precompute = Option B（每日预生成）**，并以**独立 Long Horizon Forecast Job** 实现，**不得塞进 Daily 核心采集逻辑**（见 §10）。
7. 项目现状（真实）：数据 2021-01-01~2026-09-14、1410 观测日、10 作物、单一 wholesale；现有 target 最大 N=90；30d WAPE 4.8%–15.1%、60d 7.1%–19.0%、90d 8.3%–21.0%；现有区间校准**无方法达到 80% coverage**。因此长期能力的现实上限是**情景化而非点预测**。

---

## 1. LLM 定位与边界

### 1.1 明确是什么

- **Long-Horizon Forecasting Expert**：在 `ForecastContextPacket`（§3）之上，对 **60/90/120d 长期窗口**产出 `point_forecast / direction / scenario range / drivers / risks / assumptions`。
- 它是 **Hybrid 长期预测链条中的一类预测器**，与统计 baseline、短期模型并列，接受同一套评估协议（§7）与同一套生产 Gate（§8）。

### 1.2 明确不是什么

| 反模式 | 禁止理由 | 现有证据 |
|---|---|---|
| Chatbot / 对话助手 | 不产生可评估预测 | — |
| RAG 问答 / 知识检索 | 本任务输出是数字序列而非答案文本 | — |
| 文案生成器 | 无评估口径 | — |
| 字段翻译器 | 只是低级便利功能（NL→structured），非核心 | 现有 `final_model_service.py:87` 已支持 `input_source.kind ∈ {structured, natural_language}` |

### 1.3 "自然语言→结构化输入"的定位

- 允许存在，但**优先级最低**、**可选**、**不参与预测评分**。
- 若实现，必须走**独立旁路**：解析失败 → 直接回落到结构化输入，不得影响预测链路（对齐 `final_model_service.py:91` 对 `natural_language` 空文本即拒绝的处理风格）。
- 解析结果**不得**直接进入数值特征；必须经过程序校验（单位、量级、有限性，§12）。**该功能是否实现 = UNKNOWN（本轮不要求）。**

---

## 2. 两类实验与泄漏控制

> 硬性要求：两类实验**分开评估、分开 Registry、分开报告**，**禁止合并成一个 accuracy 数字**。

### 2.1 实验 A：`blind_numeric_forecast`（盲测数值预测）

**输入特征（匿名化 + 相对时间）：**

- 匿名城市 / 作物（用 `crop_id`、`market_id` 而非真实名）。
- 时间用**相对索引** `T-180 … T0`（不给真实年份、真实月份字符串可选保留季节）。
- 结构化历史序列（程序计算，§3）。
- 月份 / 季节（作为季节因子，不给具体年份）。
- 统计特征（rolling mean/median/volatility/drawdown、seasonal percentile）。
- 短期模型输出（7/14/30d）。
- HRI / Market Risk / Climate exposure。

**匿名化红线：**

- **尽量不给**真实年份、真实新闻标题、可被记忆定位的重大事件名（如具体灾害专名、政策文件名）。
- 目的：降低 **pretrained knowledge leakage**（模型靠记忆而非上下文作答）。

### 2.2 实验 B：`context_augmented_forecast`（上下文增强预测）

- 允许使用 **cutoff 当时已公开**的政策 / 事件 / 天气异常 / 市场信息。
- 每个事件必须带四个字段：
  - `source`（来源标识）
  - `publication_date`（发布时间）
  - `retrieved_content`（检索/摘录内容）
  - `cutoff_eligible`（bool：`publication_date <= cutoff`）
- **必须显式声明**：**不得宣称完全排除 pretrained knowledge leakage**。缓解手段见 §2.3、§11。
- 事件进入 Context Packet 时只能是 `cutoff_eligible=true` 的（见 §3 events(cutoff-safe)）。

### 2.3 泄漏控制总则（两类共用）

1. **antml:point-in-time 纪律**：任何 cutoff 只用 `<= cutoff` 的数据（价格观测、特征、事件发布、产量发布的时间戳全部单独检测，见 §11 泄漏检测）。
2. **blind + 相对时间索引**：实验 A 的主要缓解。
3. **结果解读限定**：实验 B 的增量只能解读为"在给定上下文下"，不得解读为"真实因果"。
4. **对照**：LLM 结果必须与 `same-context` 的统计 baseline 对比，避免把"上下文本身的价值"误记为"LLM 的价值"（§11 ablation）。

---

## 3. ForecastContextPacket 与 determinism

### 3.1 正式数据结构（所有数值由程序计算，LLM 不自己算输入）

```
ForecastContextPacket {
  city, crop, cutoff, horizon,
  current_price,                                  # 锁定历史事实
  returns: {d7, d14, d30, d60, d90},              # 7-90d 收益率
  rolling: {mean, median, volatility, drawdown},  # 程序计算
  seasonality: {
    same_month_history: [...],                    # 同月历史值序列
    seasonal_percentile,                          # 当前价在同期分布的百分位
    historical_profile: [...]                     # 多年季节轮廓
  },
  short_model: {d7, d14, d30},                    # 现有短期模型输出
  risk: {hri, market_risk, climate_exposure},
  supply: {...}, production: {...},
  events: [ {source, publication_date, retrieved_content, cutoff_eligible} ],  # cutoff-safe
  data_quality: {...}
}
```

**字段落地对照（现有代码）：**

| 字段 | 现有来源 | 状态 |
|---|---|---|
| `current_price` | `inference.py:126` `cur_price = latest["price_per_kg"]` | 已存在 |
| `rolling.mean/median` | `price_ma7`/`price_ma30`/`seasonal_p50`（`train_price.py:257-259`） | 部分存在 |
| `rolling.volatility` | `data/processed/daily` 的 `rolling_volatility`（`snapshot.py:150`） | 已存在 |
| `rolling.drawdown` | Market Risk 组件 `mr_dd`（`inference.py:220`） | 已存在（可复用） |
| `seasonality.same_month_history` | `inference.py:129-133` 同月窗口分布 | 已存在 |
| `seasonality.seasonal_percentile` | `snapshot.py:148` `historical_percentile` | 已存在 |
| `short_model.d7/d14/d30` | `ART.predict`（`artifacts.py:95`；`inference.py:158`） | 已存在 |
| `risk.hri/market_risk` | `inference.py:196,212` | 已存在 |
| `risk.climate_exposure` | `inference.py:223` | 已存在 |
| `supply` / `production` | `data/model_ready/recommendation/structural_context.parquet`（审计 §5 #3） | 数据存在，**接入方式 UNKNOWN** |
| `events` | 无现成结构化事件源 | **需新建** |
| `data_quality` | `inference.py:450` `data_quality` | 已存在（需扩展） |

### 3.2 Determinism

- `context_hash = H(canonical_json(packet))`，其中 `packet` 由 `data + cutoff + config` 唯一决定。
- **必须**：同一 `(data, cutoff, config)` → 完全一致的 `context_hash`。
- 参考现有稳定哈希实现：`fcommon.py:48 md5_of_frame`（列排序 + 行排序）、`snapshot.py:69 snapshot_hash`（剔除 `generated_at` 等易变字段）、`snapshot.py:48 data_version`。
- 禁止把 `generated_at` / 运行时刻写入被哈希内容（对齐 `snapshot.py:70-71` 的做法）。
- `config` 需包含：horizon、季节窗口定义、rolling 窗口、单位口径 `price_level`（对齐 `fcommon.py:29 PRICE_LEVELS`，**严禁混用**）。

---

## 4. Prompt 版本化与结构化输出

### 4.1 Prompt 文件版本化

```
llm/prompts/forecast_v1.md
llm/prompts/residual_v1.md
llm/prompts/scenario_v1.md
llm/prompts/critic_v1.md
```

每次运行必须记录：

```
prompt_version, prompt_hash, model_name, provider,
temperature, seed(if supported), context_hash, timestamp
```

- `prompt_hash`：对 prompt 文件内容做内容哈希（可用 `fcommon.py:70 git_fingerprint` 的风格）。
- `seed` 仅当 provider 支持时记录；不支持则显式写 `null` 并标记 `seed_supported=false`。

### 4.2 结构化输出 JSON Schema（单位固定显式 `CNY/kg`）

```jsonc
{
  "forecast_horizon": 90,
  "point_forecast": 5.20,
  "range_low": 4.60,
  "range_high": 6.10,
  "direction": "up",            // up | down | flat
  "confidence": 0.62,           // 自报置信（NOT probability，见 §6.4）
  "drivers": ["..."],
  "downside_risks": ["..."],
  "assumptions": ["..."],
  "uncertainty": "...",
  "unit": "CNY/kg"
}
```

- `unit` **固定显式** `CNY/kg`，与现有口径一致（`inference.py:180`、`final_model_service.py` 中 `unit:'CNY/kg'`；`snapshot.py:141` 用"元/公斤"——**两处需统一**，设计口径统一为 `CNY/kg`）。
- 所有数字字段必须过 §12 数字安全校验。

---

## 5. Benchmark 清单与在现有代码中的落地

> 每类说明在**已有代码/数据**里如何落地：已存在 / 改参数 / 需新建。

| # | Benchmark | 现有落地 | 文件:行号 | 状态 |
|---|---|---|---|---|
| 1 | **Last Value** | `baseline_last_value = price_per_kg` | `train_price.py:256`；选型 `price_model_selection.csv` 已大量使用 | **已存在** |
| 2 | **Seasonal Naive（same month last year）** | `baseline_previous_year_same_period` / `prev_year_window_mean` | `train_price.py:261`、`backtest.py:63` | **已存在** |
| 3 | **Historical Same-Season Mean/Median** | 中位数 `baseline_seasonal_median = seasonal_p50`；同月均值见 `inference.py:129-142`（用分位数） | `train_price.py:259`、`inference.py:129` | 中位数**已存在**；"同月均值"显式列 **需新建/UNKNOWN** |
| 4 | **Trend Baseline** | 现有仅 `price_ma7/ma30`（滑动均值，非趋势外推） | `train_price.py:257-258` | **需新建**（线性漂移/趋势外推） |
| 5 | **可延伸统计模型** | 区间侧有 `seasonal_window_quantile`、`residual_expanding`、`quantile_regression` | `interval_calibration_summary.csv:2-5` | 部分存在；ETS/ARIMA 类 **UNKNOWN，若不存在需新建** |
| 6 | **ML Baseline** | Final 生产模型 `elasticnet / extra_trees / catboost`（`per_crop` + `pooled`） | `models.py:31 CORE_MODELS`、`models.py:52-55`、`artifacts.py:26` | **已存在** |
| 7 | **LLM Direct** | 无 | — | **需新建** |
| 8 | **LLM Residual** | 无 | — | **需新建** |
| 9 | **Hybrid** | 无 | — | **需新建** |

**季节 baseline 的强制地位（要求 5）：**

- **必须**作为正式 baseline 之一：① same month last year（#2）② 同期中位数（#3）③ 多年季节轮廓（`historical_profile`，见 §3）。
- 审计证据（`LONG_HORIZON_FEASIBILITY_AUDIT.md` §4）：**10 作物 × 每月均有 ≥5 年数据**（月份 1–9 为 6 年、10–12 为 5 年），same-month-last-year 与同期中位数对**全部 N**均可落地。
- 落地方式：same-month-last-year 与同期中位数**已存在**（可跨 N 直接复用，因为 `prev_year_window_mean(days=N)` 与 `seasonal_p50` 与 horizon 无关）。

**长 horizon 数据可行性（`LONG_HORIZON_FEASIBILITY_AUDIT.md` §2–§3）：**

- 现有 target **最大 N=90**；120/150/180/210/240 **不存在**。
- 主口径非重叠样本：N=90→22、N=120→17、N=150→13、N=180→11、N≥210→9/8。
- 现有 OOT 折口径（`backtest.py:13-20`，3 折）：N=90→12、N=120→9、N=150→7，**fold3(2026) 仅剩 1**。
- **结论**：研究上限建议 N=120；**N≥150 仅探索、不上线**；N≥210 数据不支持。
- 扩展路径（若要做 N>90）：`add_mean_targets` 是**参数化函数**（`build.py:122`，调用点 `build.py:150`），改参数即可生成均值 target；但须同步改 `models.py:25 HORIZONS`、`capabilities.py:26-28`；若要辅助目标（obs_count/median/t{h}）则须改 `build_features.py:206 / :244` 的硬编码 `[7,14,30]`（`add_targets` 定义在 `:200`，`if h == 30` 的 median/min/max 在 `:238-241`）。

---

## 6. Hybrid 方案与权重/残差约束

### 6.1 三类实验形式

| 形式 | 定义 | 主要风险 | 判定方式 |
|---|---|---|---|
| **LLM Direct** | LLM 直接出 `point/range/direction` | 幻觉数字、量级漂移、不可解释 | 过 §12 校验 + §7 指标 + §8 Gate |
| **LLM Residual（重点候选）** | 先给统计 baseline，再让 LLM 只给 `adjustment` | 无限调整、把 baseline 误差放大 | §6.2 边界约束 + §7 比较三种模式 |
| **Hybrid A** | `statistical + LLM residual` | 权重不透明 | 权重由程序钉死（§6.3） |
| **Hybrid B** | `weighted ensemble(stat, LLM)` | LLM 单点失真被放大 | 权重由 dev OOT 选（§6.3） |
| **Hybrid C** | `regime gating`（按市场 regime 切换） | regime 划分不稳定 | regime 定义固定 + 分 regime 评估（§7） |

### 6.2 Residual 不得无限调整（要求 11）

- `max_adjustment` **必须由 development 集学习**，**禁止手写 ±30%**。
- 学习方式：在 development（严格早于 OOT 的时间段，对齐 `backtest.py:13-20` 的 fold 结构）上，根据"统计 baseline 残差的历史分布"推出边界（例如残差分位数）。
- **必须比较三种模式**：
  1. `unbounded`（无界，仅作对照）
  2. `bounded`（`|adjustment| <= max_adjustment`）
  3. `confidence-gated`（仅当 LLM 自报 confidence / 上下文质量达标时才采纳 adjustment，否则令 adjustment=0）
- 选择进入正式 Hybrid 的模式须在 OOT 上证明优于 `unbounded` 与纯 baseline。

### 6.3 权重绝不能由 LLM 自定（要求 12）

- 所有 ensemble 权重**由程序**基于 **development OOT performance** 选择（如最小化 WAPE / interval score）。
- LLM **不得**输出权重、不得输出"建议权重"作为生效参数。
- 权重选择结果必须写入 Registry（§8）并记录选择依据（dev 段、指标、日期）。

### 6.4 自报 confidence ≠ 概率（要求 13）

- LLM 的 `confidence` 字段**未经 calibration 不得**表述为 `80% probability`。
- 只能标为 `self_reported_confidence`（无概率含义）。
- 若要用作概率，必须过 calibration（§7 的 coverage calibration）并由程序映射。

---

## 7. 评估协议与指标

### 7.1 点预测指标

`MAE / WAPE / sMAPE / MASE / Directional Accuracy / Bias`。

- 现有实现：`backtest.py:45 metrics_table` 提供 `MAE / RMSE / sMAPE / WAPE / bias / direction_accuracy`。
- **MASE 缺失**：`backtest.py:45-60` 无 MASE → **需新建**（MASE 需 seasonal naive 作分母，正好复用 §5 #2）。

### 7.2 区间指标

`Coverage / Average Width / Interval Score`。

- 现有区间校准产物：`interval_calibration_summary.csv:2-5`（`coverage / coverage_std / mean_width / min_crop_coverage / coverage_gap`）。
- Interval Score **UNKNOWN（未在现有表出现）→ 需新建**。

### 7.3 强制拆分维度（要求 15）

必须 **per crop × per horizon × per season × per market regime** 拆分。

- `crop/horizon/season`：现有 `season` 映射见 `build.py:109-112`（winter/spring/summer/autumn）。
- `market regime`：**UNKNOWN**，现有无显式 regime 字段 → **需新建 regime 定义**（例如按 Market Risk 分位；须固定、可复现）。

### 7.4 必须报告项

- **Worst Case**：worst crop / worst horizon / worst season。
- **Error Growth Curve**：7…180d 误差曲线（数据支撑到 120d；150d+ 仅探索）。现有 `multi_horizon_WAPE.csv` 只有 7/14/30/60/90，需扩展 horizon 才能画到 180d。
- **禁用表述**：**不得**用"准确率 90%"这类说法；必须报具体指标名 + 拆分维度 + 样本量。

---

## 8. 生产 Gate 与 Registry

### 8.1 生产 Gate（要求 16）

对每个 **crop × horizon**，只有**同时**满足以下四条才允许 `PRODUCTION_HYBRID`：

1. **比 baseline 稳定增益**（OOT 上 WAPE/interval score 优于最佳 baseline，且跨 fold 稳定）。
2. **无 bias 爆炸**（`bias` 在可接受阈值内，阈值由 dev 段分布定，不手写）。
3. **worst-case 可接受**（worst crop/horizon/season 不劣于阈值）。
4. **可复现**（同 `context_hash` + 同 prompt/model 得到一致结果）。

否则 → `SCENARIO_ONLY`。

- **允许**每个 horizon、每个 crop 使用不同方法（对齐现有"逐 horizon 独立选择模型"的设计：`models.py:9`、`price_model_selection.csv`）。
- 与现有状态枚举对齐：`capabilities.py:19-23 STATUS`（含 `SCENARIO_ONLY`、`LOW_CONFIDENCE` 等）；`horizon_capability` `capabilities.py:78-87` 现有硬编码 `model/scenario_only` 分级，未来由本 Gate 输出驱动。

### 8.2 Long-Horizon Registry（要求 17）

字段：`crop / horizon / method / metric / confidence / range_type / production_status / reason`。

- 参考现有注册表格式：`models/reports/final/FINAL_MODEL_REGISTRY.csv:1` 表头
  （`model_id,module,city,crop,algorithm,route,horizon_days,...,status,note`）。
- 新表建议：`models/reports/final/LONG_HORIZON_REGISTRY.csv`（交付物见 §13）。
- `range_type` 取值需区分 `scenario_range` 与（通过 coverage calibration 后的）`prediction_interval`（§7.2、§14）。

---

## 9. Provider / 缓存 / 成本 / 失败隔离

### 9.1 Provider 抽象（要求 18）

- 定义接口 `LLMProvider`，至少实现 **OpenAI-compatible**，可切换模型。
- **secret 只进 `.env`**（已被 `.gitignore:28` 忽略），**只提交 `.env.example`**。
  - 现有 `backend/.env.example` 明确"无任何 secret"；新增 LLM secret 须走同一模式。
  - 现有 `.env` 实际文件数 = 0（`REPOSITORY_ASSET_AUDIT.md` §8.1）。
- **没有 API key 时不得停止**：先完成 provider 接口 / schemas / context builder / evaluation harness / caching / prompt versioning 的骨架（全部可离线运行）。
- 依赖：`backend/requirements.txt` 现有依赖**不含** `openai`（`requirements.txt:10-22`）→ 若采用官方 SDK 需新增依赖；**是否已安装 = UNKNOWN**。可用 stdlib HTTP 实现 OpenAI-compatible 调用以避免强依赖。

### 9.2 缓存（要求 19）

- `cache_key = context_hash + prompt_hash + model`。
- **只缓存"已通过校验的结构化结果"**（过 §12 校验的 JSON）。
- **API 错误不得污染缓存**：超时 / 限流 / 5xx / 解析失败一律不写缓存。

### 9.3 成本与稳定性（要求 20）

- 阶段：`pilot → validate → expand`。
- **pilot 选 2–3 个代表作物**：按**数据统计**选择（低波动 / 高波动 / 季节性明显），**不要凭印象**。
  - 依据现有指标选：波动 → `std_WAPE`（`price_model_selection.csv:1`）、误差水平 → `multi_horizon_WAPE.csv`、季节性 → `interval_calibration_summary.csv` 中 `seasonal_window_quantile` 表现。
- **重复稳定性测试**：同一 Context Packet + 同模型**重复 3–5 次**，测 `point / direction / range` 方差。
- 不稳定时依序：`降温(temperature) → ensemble → 中位数聚合 → 降级(SCENARIO_ONLY / statistical fallback)`。

### 9.4 成本记录（要求 27）

记录：`calls / tokens / cost / latency / cache_hit`（写入 §13 报告）。

### 9.5 失败隔离（要求 21）

- LLM 挂掉**不得**影响 **Daily / 短期 Final / 前端**。
- Long-Horizon 返回 `LLM_UNAVAILABLE` 或 **statistical fallback**。
- 返回体必须含 `fallback_used=true`，且**前端能看出真实 method**（**不许假装 fallback 还是 AI**）。
- 对齐现有诚实例子：`run_daily.py:206` 日志 `fallback=...`、`snapshot.py:341-349` 的 `MS_UNAVAILABLE/MS_LEGACY` 显式声明降级、`snapshot.py:347` "LEGACY_FALLBACK：不得当作 Final Model 结果"。

---

## 10. Online vs Precompute

### 10.1 两个方案

- **Option A（Online）**：用户请求时**实时**调 LLM。
  - 优点：实时、零冗余预计算。
  - 缺点：延迟高、成本随请求线性增长、输出非确定、可用性与 LLM 强耦合、缓存命中率低、难审计。
- **Option B（Precompute）**：Daily 完成后**每日预生成** 10 作物长期 Forecast，前端直接读。
  - 优点：**确定性**（`context_hash` 冻结）、**低成本**（每日一次）、**解耦**（LLM 挂掉不影响前端，前端读冻结产物）、**可复现可审计**、与现有 **Daily Snapshot 模式**（`snapshot.py`：原子写、契约校验、`snapshot_hash`、`latest.json` 不倒退）天然一致。
  - 缺点：仅日粒度（cutoff 固定为当日）、需为全部作物预计算（即使无人查阅）、不支持任意历史 cutoff 的即时探索。

### 10.2 推荐

**推荐 Option B**（与 owner 倾向一致），论证见上：长期预测**低频使用 + 高成本 + 需要确定性与可复现**，B 在成本、稳定性、可审计性、失败隔离上全面占优；A 的唯一优势（实时）在长期窗口下价值极低（90d 预测不差几小时）。**可选补充**：为研究保留一个**受控的 ad-hoc 触发**（单次、手动、写审计），不进入常规链路。

### 10.3 工程落地（若选 B）

- 新增**独立 `Long Horizon Forecast Job`**，**不得塞进 Daily 核心采集逻辑**。
  - 独立于 `data/daily/run_daily.py`（现有 Daily 流水线：Scheduler→Collector→…→Snapshot，`run_daily.py:11-13`）。
  - 输入：Daily Snapshot（`data/processed/daily/snapshots/latest.json`）+ Final artifacts（`models/models/final/*.pkl`）+ Context Builder。
  - 输出：`data/processed/long_horizon/snapshots/{date}.json` + `latest.json`（复用 `snapshot.py` 原子写 + 契约校验模式）。
  - 进程锁：复用 `run_daily.py:254 IO.ProcessLock` 的模式，避免与 Daily 互相刷新。
  - 调度：在 Daily 成功之后触发（cron/systemd），LLM 失败不得导致 Daily 失败。

---

## 11. Ablation 与 Critic

### 11.1 Ablation（要求 26）

必须回答"**LLM 到底在利用什么**"，消融阶梯：

1. `LLM only`
2. `+seasonality`
3. `+short model`
4. `+risk`
5. `+events`
6. `Hybrid full`

- **必须防止"LLM 只是复述输入"**：分析 **gain source**——对比每一层的边际增益，若 `LLM only` 与 `Hybrid full` 无显著差异，或 LLM 输出 ≈ 输入最近值（Last Value），判定"复述输入"，不得进入 Hybrid。
- 参考现有 ablation 产物风格：`models/reports/final/tables/ablation.csv`、`weather_ablation_summary.csv`。

### 11.2 LLM Critic（要求 25）

- 只产生三件事：`warnings / recommendation_strength / model_disagreement`。
- **不能改正式数值**：Critic 输出为**旁路元信息**，不参与 `point_forecast` 计算。
- `model_disagreement` 需能被 Decision 输出引用（§12）。

---

## 12. 与 Backend 的接口设计

### 12.1 优先顺序（硬约束：**不要立即改 `/api/decision` 语义**）

- **优先新增**：
  - `GET /api/forecast/capabilities`（长期能力：crop × horizon × method × production_status）。
  - `POST /api/forecast/long-horizon`（长期预测主契约）。
- 或：先做 **Long-Horizon capability**，再由 **Adapter** 扩展（前端通过独立 base，不改决策契约）。

### 12.2 现有接口基线（不得破坏）

- 路由注册：`backend/app/main.py:133-137`；决策路由 `backend/app/routes/decision.py:24-37`；能力路由 `backend/app/routes/capabilities.py:19-23`。
- 决策主契约：`final_model_service.py:171 evaluate`，信封 `{"request","batch","market_as_of","model_version","data_version","code_fingerprint"}`（`final_model_service.py:199-206`）。
- 前端通过 `HttpDecisionProvider` 默认 base `/api/decision`（`FRONTEND_INTEGRATION_HANDOFF.md:3,11`）→ **新增长期路由独立，不动 `/api/decision`**。
- 硬约束（`backend/README.md:11-15`）：不改 Final/Daily 冻结代码；`models/data/**`、`data/model_ready/**`、`models/reports/final/**` **只读**。

### 12.3 Decision 输出扩展（长期能力落地后）

Decision 行需能带：

- `forecast.source ∈ { short_model, seasonal, llm_direct, llm_residual, hybrid, scenario_only }`
- `model_disagreement`

- 兼容现状：`inference.py:158` 现有 `method` 字符串（`model_forecast(...)` / `scenario_quantile`）与 `scenario_only`（`inference.py:150`）；新增 `forecast.source` 为**结构化枚举**，与现有 `method` 并存（不破坏前端，因为前端只校验已声明字段，参考 `FRONTEND_INTEGRATION_HANDOFF.md:50-53`）。
- 单位：统一 `CNY/kg`（与 `inference.py:180` 一致；注意 `snapshot.py:141` 的"元/公斤"需在展示层统一，**不得造成契约分叉**）。

### 12.4 数字安全校验（要求 22，程序侧）

- 程序检查：`finite` / `required-positive` / `low <= point <= high` / 量级 / 单位。
- 异常 **reject**（不缓存、不输出）。
- **Hard sanity bounds 必须由历史分布推出**，**禁止手写"0–100 元"**。
  - 参考现有分位数做法：`inference.py:136 np.percentile(hv,[10,50,90])`、`inference.py:143`。
  - 可结合 `data_quality`（`inference.py:450`）与样本量 `n_obs/n_years`（`inference.py:185`）判定阈值来源是否充分。

### 12.5 锁定历史事实（要求 23）

- `current price / historical price / HRI / risk` 由**程序提供并锁定**，LLM **不得改写**，只能预测未来变量。
- 落地：Context Packet 中这些字段为**只读**；LLM 输出 schema（§4.2）**不含**历史字段的回写（对齐 `inference.py:117-187` 是程序算价，而非 LLM）。

---

## 13. 交付物清单（本轮之后要产出）

| 交付物 | 内容 | 依赖 |
|---|---|---|
| `LONG_HORIZON_MODEL_REPORT.md` | 各 benchmark 与统计模型的长 horizon 表现 | §5 |
| `LONG_HORIZON_METRICS.csv` | per crop×horizon×season×regime 指标 + worst-case | §7 |
| `LONG_HORIZON_REGISTRY.csv` | §8.2 字段 | §8 |
| `LLM_FORECAST_REPORT.md` | 两类实验分开报告 + 成本记录 | §2、§9.4 |
| `LLM_ABLATION_REPORT.md` | §11.1 消融 + gain source 分析 | §11.1 |
| `HYBRID_REPORT.md` | A/B/C + 残差三模式 + 权重选择依据 | §6 |
| `LONG_HORIZON_FREEZE_GATE.md` | 冻结判定：哪些 crop×horizon 进 `PRODUCTION_HYBRID`，其余 `SCENARIO_ONLY` | §8 |

---

## 14. 风险与不确定项

### 14.1 与现有工程的一致性风险

1. **horizon 扩展需改多处硬编码**：`models.py:25 HORIZONS`、`capabilities.py:26-28`、`build_features.py:206/:244`（审计 §2.2）。改错会导致新 N 落到默认 `scenario_only`（`capabilities.py:86-87`）。
2. **数据不足是根本约束**：N≥150 时 OOT 非重叠样本仅 7、fold3 仅 1（审计 §3）→ 长期"点预测"在统计上不可支撑，只能情景化。
3. **最近期数据口径未验证**：`market_daily.parquet` 记录 2026-09 站点改版登录制、数据止于 2026-09-14，fold3 样本口径一致性 `UNKNOWN`（审计 §8.3）。
4. **天气 CPP 与物候缺失**：目标 10 作物的城市级物候 `NOT_FOUND`（审计 §5）；物候/气候机制特征对长 horizon 的增益 `UNKNOWN`。
5. **单位口径分叉**：`CNY/kg`（`inference.py:180`）vs "元/公斤"（`snapshot.py:141`）——需在展示层统一，避免契约分叉。

### 14.2 LLM 特有不确定项

6. **Pretrained knowledge leakage 无法完全排除**（要求 6 明确）：blind + 相对时间索引只能**缓解**，结果解读必须限定。
7. **LLM 输出稳定性** `UNKNOWN`：需 §9.3 的重复方差测试才能定 temperature/ensemble 策略。
8. **provider 依赖** `UNKNOWN`：`requirements.txt:10-22` 无 `openai`；是否可用官方 SDK 未确认。
9. **市场 regime 定义** `UNKNOWN`：现有无 regime 字段，§7.3 需新建。
10. **MASE / Interval Score 实现** 缺失（`backtest.py:45-60`、`interval_calibration_summary.csv`）→ 需新建。

### 14.3 口径不确定项（沿用审计 UNKNOWN）

- 非重叠样本口径差异（主口径 vs 观测索引口径，审计 §8.1）。
- 每个未来 N 天日历窗口内实际观测数分布（审计 §8.2）。
- 窗口不完整丢弃规则对长 horizon 训练样本充分性的影响（审计 §8.6）。

---

## 附：关键引用索引

| 主题 | 文件:行号 |
|---|---|
| 能力分级（7/14/30 model；60/90 scenario） | `models/src/decision_engine/final/capabilities.py:26-28,78-87` |
| 生产推理入口 / 价格块 | `models/src/decision_engine/final/inference.py:316,117-187` |
| 区间 nominal 0.80 未达校准 | `models/src/decision_engine/final/inference.py:438-441` |
| 短期模型加载与预测 | `models/src/decision_engine/final/artifacts.py:26,77,95` |
| WR 折（point-in-time） | `models/src/decision_engine/models/backtest.py:13-20,23-27,45-60` |
| baseline 族 | `models/src/decision_engine/models/train_price.py:252-261` |
| 均值 target 参数化 | `models/src/decision_engine/final/build.py:122,150` |
| horizon 硬编码 | `models/src/decision_engine/final/models.py:25` |
| 稳定哈希 | `models/src/decision_engine/final/fcommon.py:48,70` |
| 后端决策契约 | `backend/app/services/final_model_service.py:171,199-206` |
| 后端路由装配 | `backend/app/main.py:133-137` |
| Daily 原子写/契约/快照哈希 | `data/daily/snapshot.py:69,105,255-307` |
| Daily 本地回退声明 | `data/daily/snapshot.py:341-349` |
| 区间校准现状 | `models/reports/final/tables/interval_calibration_summary.csv:2-5` |
| 多 horizon WAPE | `models/reports/final/tables/multi_horizon_WAPE.csv:1-8` |