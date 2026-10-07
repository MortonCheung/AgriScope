# 前端交接说明（FRONTEND_INTEGRATION_HANDOFF）

> 结论：**前端无需任何代码改动**。`AgriScope/src/providers/decision/index.ts` 的
> `HttpDecisionProvider` 默认 base 为 `/api/decision`，本后端已按该契约实现。
> 仅需在部署时提供 base URL（环境变量或反向代理）。

## 1. 前端需要提供的配置

| 变量 | 默认 | 说明 |
|---|---|---|
| `VITE_DECISION_API_URL` | `/api/decision` | 决策服务 base。后端同时提供 `/api/decision` 与 `/api/decision/evaluate` |
| `VITE_CAPABILITY_URL` | `<base>/capabilities` | 可选；默认推导为 `/api/decision/capabilities` |
| `VITE_STRESS_URL` | `<base>/stress` | 可选；默认推导为 `/api/decision/stress` |

Daily 前端（`features/daily`）调用 `/api/daily/latest?city=shenyang`，与后端一致。

**开发期（Vite）建议代理**，避免 CORS：

```ts
// vite.config.ts
server: { proxy: { '/api': 'http://127.0.0.1:8000' } }
```

跨域部署时在后端设置 `ALLOWED_ORIGINS`（逗号分隔）。

## 2. 契约（后端实现 = 前端既有期望）

### POST `/api/decision/evaluate`（= `/api/decision`）
请求体：`FinalDecisionRequest`（`contract_version='1'`）。

响应信封（`finalAdapter.adaptFinalDecision` 的权威要求）：

```jsonc
{
  "request":   { /* 原样回显请求（逐字段一致，前端 sameDecisionContext 校验通过） */ },
  "batch":     { "status": "...", "n": 3, "n_evaluable": 3, "ranking": [ { "crop": "..." } ], "all": [ /* 候选行 */ ] },
  "market_as_of": "2026-09-14",       // 必须等于 request…market_context.as_of
  "model_version": "final_v1",
  "data_version": "final_v1",
  "code_fingerprint": "5a5d68232b747549"
}
```

- `batch.status` 与每个候选行 `status` 均为 Final 登记枚举：
  `OK / LOW_CONFIDENCE / PARTIAL / SCENARIO_ONLY / USER_INPUT_REQUIRED /
   INSUFFICIENT_MARKET_DATA / NO_FEASIBLE_PLAN / NO_FEASIBLE_WINDOW /
   NO_CLEAR_WINNER / NO_DIVERSIFICATION_BENEFIT / MODEL_ERROR`。
- 候选行关键字段：`city`(标准名如“沈阳”) / `crop` / `area_mu` / `horizon_days` /
  `price{mid,low,high,unit:'CNY/kg',scenario_only}` / `scenario_range{status}` /
  `profit{available,profit,roi,break_even_price,cost_per_mu,expected_yield_per_mu,cost_source_class,yield_source_class}` /
  `confidence{overall_confidence,price_confidence,profit_confidence,risk_confidence}` /
  `hri{available,value}` / `market_risk{available,value}` / `climate_exposure{available,value}` /
  `harvest_date` / `warnings` / `reasons` / `proxy_flags`。

### GET `/api/decision/capabilities?city=shenyang`
`{ city_id, tier, supported, crops:[{id,label,horizons:[{days,mode}]}], market_as_of,
   model_version, data_version, code_fingerprint, limitation }`

- `city_id` **原样回显请求的 slug**（前端 `parseCapability` 会校验相等）。
- `supported=true` 时 `market_as_of` 必为日期、`crops` 非空。
- 大连/铁岭/丹东：`supported=false`、`crops=[]`、`tier=INSUFFICIENT_MARKET_DATA`（不 fallback）。

### POST `/api/decision/stress`
`{ request, candidate_id, changes }` →
`{ candidate_id, changes, available, profit_base, delta_cny, roi, note, model_version, data_version }`
- `changes` = `{price_pct[-100,0], yield_pct[-100,0], cost_pct[0,100], delay_days[0,60]整数}`；
- `available=false` 时 `profit_base/delta_cny/roi` **必为 null**（前端会拒绝携带收益的不可用结果）；
- 走 **Final 原生** `optimize._scenario_profit`（官方 SHOCKS）：仅支持单项压力
  （价格/亩产/成本）与两组官方综合压力（mild `-10/-5/+10`、severe `-20/-15/+20`）；
  **上市延迟（`delay_days>0`）与其他组合返回 `available=false`**（Final 无该重估接口，不自造映射）；
- `roi` **恒为 null**（源函数只返回基准收益）；`profit_base` 是**该压力情景的收益**，`delta_cny` 为相对原方案的变化。

### 请求校验（与前端约束一致，超出即 400）
精确键集（多余字段拒绝）、城市与作物白名单、`horizon_days ∈ 该作物支持的周期`、
`as_of ≤ 能力给出的最新数据日期`、`crop_preferences` 去重且 ≤20、JSON 体积 ≤64KB；
`NaN/Infinity` 一律清洗为 `null` 后才出网。

### GET `/api/daily/latest?city=shenyang`
原样返回 `latest.json`（前端 `domain/daily/adapter.ts` 自行按 schema 1.1.0 校验）。

## 3. 城市标识

前端 `city_id` 为 slug（`shenyang/tieling/chaoyang/jinzhou/dandong/dalian/...`），
后端负责 slug ↔ 标准名映射；响应中的 `batch.all[].city` 为标准名（如“沈阳”），
与前端 `getCity(city_id).shortName` 一致。

## 4. 交叉验证结果

用**前端真实 adapter**（`finalAdapter.ts` + `validation.ts`，经 tsc 编译后由 Node 调用）
对运行中的后端做端到端校验：**27/27 通过**，覆盖：

- 无输入 / 有输入 / 多作物 / 90d scenario_only / 大连不足 / capabilities / stress
  （可用与不可用）/ daily / 统一错误契约 / `X-Request-ID`。

后端自身：`tests/test_e2e.py` **17 passed**，`scripts/acceptance.py` **19/19 → BACKEND_FROZEN**。