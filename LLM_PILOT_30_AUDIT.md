# LLM 30-call 真实 Pilot 审计（LLM_PILOT_30_AUDIT）

> 审计对象：用户已实际执行的 `python3 -m llm.run_real_pilot --max-calls 30 --max-anchors 1 --repeats 3`
> 证据来源（全部真实读取，未重跑）：
> `llm/artifacts/v2/real_call_records.json`、`real_evaluation_status.json`、`real_metrics.csv`、
> `hybrid_metrics.csv`、`hybrid_selection_lock.json`、`ablation_deltas.csv`、`repeatability.json`、
> `pilot_plan_frozen.json`，以及根目录三份真实报告。
>
> 结论先行：**这 30 次调用是「管线连通性验证」，不是一次评估**。
> 它证明了 API/契约/匿名化/泄漏审计可用，但每个统计单元只有 **n=1**，且只覆盖
> blind+forecast 一种实验，因此**不能得出任何关于 LLM 预测能力的结论**。

---

## 1. 调用总账（真实数字）

| 指标 | 值 |
|---|---|
| 计划网格单元 | 222 |
| 实际 API 调用 | **30** |
| 预算未调用（`api_called=false`） | 192 |
| 成功响应 | **28** |
| 失败响应 | **2** |
| 有效率 | 28/30 = **93.3%** |
| 平均延迟 | **36.9 s**（最小 5.0 s / 最大 64.6 s） |
| prompt tokens | 353,393（均值 12,621，范围 7,731–18,354） |
| completion tokens | 236,459（均值 8,445，范围 3,278–15,916） |
| **其中 reasoning tokens** | **224,699（占 completion 95.0%，均值 8,025）** |
| total tokens | **589,852**（均值 21,066） |
| `prompt_cache_hit_tokens` | **0**（全程未命中 DeepSeek 上下文缓存） |
| `estimated_cost_usd` | `unknown`（未配置官方单价，按规则不猜） |
| 覆盖 | 作物 3（土豆/青椒/黄瓜）× horizon 2（60/90）× target 2 × phase 4 |
| 实际到达的实验 | **只有 `blind_numeric_forecast_v2` + `forecast`** |

> 192 个未调用单元的原因**不是失败**，而是 `BudgetedProvider` 的硬预算上限
> （`--max-calls 30`）在网格走完前耗尽；原始记录把这种情况也写成了
> `llm_unavailable:LLMUnavailable`，与真实失败混在一起 —— 这是本轮要修的缺陷之一。

---

## 2. 28 个 valid 是哪些、2 个 invalid 为什么失败

**28 valid**：全部为 `blind_numeric_forecast_v2 / forecast`，分布
土豆 10、黄瓜 10、青椒 8（H=60 与 H=90；H=120/150/180 从未执行）。

**2 invalid（逐条已定位）**：

| # | crop | H | target | phase | anchor | 延迟 | 判定 |
|---|---|---|---|---|---|---|---|
| 1 | 黄瓜 | 60 | harvest_market_price | tuning | 2024-01-01 | **60.8 s** | **超时**：provider `timeout=60`，本次真实耗时 60.8 s → `transport_error` |
| 2 | 土豆 | 90 | cycle_market_average | retrospective_audit_reused | 2026-01-05 | 5.0 s | **快速失败**（非超时）：5 s 内返回，属确定性失败（HTTP 4xx / 截断 / 拒绝 / 解析），**原始原因已被 harness 丢弃** |

**结论**：失败原因**无法从现有产物完全确定**，因为 `llm/evaluation/harness.py` 只写
`errors=["llm_unavailable:LLMUnavailable"]`，丢掉了 `str(e)`。
这正是本轮第一批修复项（详见第 5 节）；修复后同类失败会记录为
`...:transport_error:TimeoutError_attempt_3`、`...:incomplete_response_finish_reason:length`、
`...:http_429` 等可区分原因。

---

## 3. 各实验模式的真实表现

| 模式 | 是否有真实结果 | 说明 |
|---|---|---|
| **Blind（直接预测）** | ✅ 28 条 | 唯一被执行的实验 |
| **Context** | ❌ 0 条 | 预算耗尽，未执行 |
| **Residual** | ❌ 0 条 | 未执行 |
| **Hybrid A/B/C** | ⚠️ 只有 baseline | 见下 |
| **Ablation** | ❌ 0 条（表格全 0） | `ablation_deltas.csv` 的 `valid_n=0 / paired_n=0` |
| **Repeatability** | ❌ 0 条 | `repeatability.json` 三条记录 `valid_n=0`（重复调用时预算已耗尽） |

### Hybrid 为何等于 baseline
`hybrid_selection_lock.json` 中每个组合都是：
`status = INSUFFICIENT_DEV_FALLBACK_BASELINE`、`weights_stat_season_llm = [1.0, 0.0, 0.0]`、
`regime_choice` 全为 `baseline`、`development_n = 1`。
即：development 响应只有 1 条，**未达 `>=3` 的权重学习门槛**，程序按设计退化为纯 baseline。
所以 `hybrid_metrics.csv` 里 `baseline_WAPE == hybrid_B_WAPE == hybrid_C_WAPE`，
这是**正确行为**（诚实回退），不是 bug。

---

## 4. LLM 是否优于 baseline、是否只是在复述 baseline

- 统计单元 **n=1**（`requested_n=1, valid_n=1`），因此 WAPE 只是单点误差比，
  **不具统计意义**（例：土豆 H=60 cycle，calibration 折 LLM 0.72% vs baseline 10.07%；
  development 折 LLM 19.54% vs baseline 6.44% —— 同一作物同 horizon 正负互现，即噪声）。
- 单点胜负：**LLM 更接近真实值 13/28**，与随机无异。
- **复述检查**：`real_metrics.csv` 的 `output_vs_baseline_abs_pct` 中位数约 10–25%
  （即 LLM 输出相对统计 baseline 有实质改动，不是简单复述）；
  但在 n=1 下无法判断这些改动是增益还是噪声。
- **诚实结论**：本轮 **不能** 回答「LLM 是否改善预测」。任何以此 28 条为依据的
  「LLM 有效/无效」表述都不成立。

---

## 5. 已确认的 4 个工程缺陷（本轮修复清单）

| # | 缺陷 | 证据 | 修复 |
|---|---|---|---|
| 1 | **失败原因被吞**（只能看到 `LLMUnavailable`） | 2 条 invalid 全为同一字符串 | `harness._call_once` 改为记录 `异常类型:明细` |
| 2 | **超时过短**（`timeout=60`，真实均值 36.9 s、峰值 64.6 s） | 失败 #1 恰好 60.8 s | 默认 180 s，可用 `AGRISCOPE_LLM_TIMEOUT` 覆盖 |
| 3 | **prompt 过大**：packet 携带 cutoff 前**全量逐日价格**（≈1400 行） | prompt 均值 12,621 tokens | 压缩为「最近 120 个逐日观测 + 更早月份聚合」，并保留全量 `price_bounds` 供量级校验 |
| 4 | **预算耗尽与真实失败混淆**，且网格顺序使预算集中消耗在首个作物 | 192 条 not-called 记成 `llm_unavailable` | 预算原因显式化；网格改为 **phase 最外层**，保证每个 crop×horizon×target 先拿到 development 响应 |

另外两项非缺陷但需说明：

- **reasoning token 占 completion 的 95%**：`deepseek-flash` 是推理型模型，
  固定 `temperature=0` 下仍产出 3.0k–15.4k reasoning tokens。
  这是延迟与 token 的主因，**不是 prompt 冗余**；本轮不改用未经验证的 provider 参数，
  仅提供可选 `AGRISCOPE_LLM_MAX_TOKENS` 与显式截断错误分类。
- **prompt cache 命中 0**：系统提示词与 packet 结构已固定，理论上应命中 DeepSeek 上下文缓存；
  实测 `prompt_cache_hit_tokens=0`，作为观察项记录，不据此下结论。

---

## 6. 对下一阶段的直接影响

1. 修复后必须先跑 **小复验**（≈40–50 calls），确认：有效率高、延迟可接受、token 明显下降；
2. 正式实验必须**显式选定单元**（crop × horizon × target × phase × anchors>1），
   而不是依赖预算截断 —— 否则会重演「只有 H=60/90、只有 blind」的偏斜；
3. Hybrid 要真正可评估，**必须保证每个组合有 ≥3 条 development 响应**；
4. 任何结论仍受 `RETROSPECTIVE_ONLY_NO_UNTOUCHED` 约束（2024–2026 已被研究使用，
   `final_effective_n = 0`），**不得**因真实 LLM 回顾结果好看而升级生产状态。

---

## 7. 状态标记

```text
LLM_REAL_PILOT_30 = PLUMBING_VALIDATED_ONLY
LLM_NUMERIC_GAIN   = UNKNOWN          # n=1/单元，且仅覆盖 blind+forecast
LLM_PRODUCTION     = FALSE
HYBRID_PRODUCTION  = FALSE
EVIDENCE_STATUS    = RETROSPECTIVE_ONLY_NO_UNTOUCHED
```