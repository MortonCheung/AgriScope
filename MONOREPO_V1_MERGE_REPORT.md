> 历史 RC1 合仓记录，SUPERSEDED_BY_RC2。当前状态、资产数量与验收见 RC2_FINAL_REPORT.md；此处保留当时事实。

# 单仓库 v1 合并与长期层落地报告（MONOREPO_V1_MERGE_REPORT）

> 本轮范围：**只做「合并与统一」+ Long-Horizon 研究层**。
> **未部署**、**未接生产 LLM**、**未重训 Final**、**未改 Daily 功能**。

---

## 0. 最终状态

```text
AGRISCOPE_V1_TECHNICAL_RC_READY
MONOREPO_MERGED
FINAL_INTEGRATION_MERGED
LLM_NOT_IN_PRODUCTION
```

---

## 1. Git 结构（唯一正式仓库）

| 项 | 值 |
|---|---|
| 远端 | `github.com/MortonCheung/AgriScope` |
| 分支 | `main` |
| 集成分支 | `feat/monorepo-v1` @ `5ea9961` |
| main 合并提交 | `d8377ca`（`merge: integrate the monorepo v1 long-horizon release into main`） |
| 发布标签 | `v1.0.0-rc1` → `d8377ca` |
| local main == origin/main | ✅ `d8377ca` |
| working tree | ✅ clean |
| stash | ✅ 保留 1 条（`stash@{0}`，未 pop / 未 drop） |

单仓库布局：

```text
AgriScope/                 # = 唯一正式仓库（frontend/ 与 backend/ 并列）
├── frontend/              # React/Vite 前端（git mv 保留历史）
├── backend/               # 唯一正式 FastAPI 后端（SOLE_PRODUCTION_BACKEND = YES）
├── models/                # 冻结模型工程 src/config/scripts/tests/reports
│   └── long_horizon/      # 【新】长期研究层（只读冻结数据）
├── llm/                   # 【新】长期预测实验层（Provider/Context/Prompts/Schemas/Cache/Eval）
├── data/
│   ├── daily/             # Daily 管道源码（只读冻结）
│   ├── scripts/           # 数据基座管道源码
│   └── long_horizon/      # 【新】Long-Horizon Forecast Job
├── runtime/manifest.json  # 大型运行时资产 sha256 清单（195 件）
└── scripts/               # dev / test_all / acceptance / verify_assets / verify_long_horizon
```

`main` 与 `feat/monorepo-v1` 使用同一棵树（`aeac480` 是 `5ea9961` 的祖先，`--no-ff` 合并）。

---

## 2. 四块基线的身份

| 基线 | 身份 | 验证证据 |
|---|---|---|
| Frontend | 来源 commit `dc9a9c1c1ead11d184e9d4b527efd17fd5a0a40c`（`feat/frontend-v5-restructure`），`git mv` 进 `frontend/` | typecheck ✅ · **315 tests** ✅ · build ✅ · verify:ui ✅ · boundary ✅ |
| Backend | `backend/`（FastAPI，api_version `1.0.0`） | acceptance **19/19** ✅ · pytest E2E **28 passed** ✅ |
| Final Model | `model_version=final_v1`，`data_version=final_v1`，`code_fingerprint=b19b187268ee92db` | `check_acceptance_final.py` **38/38** ✅ |
| Daily | `daily_pipeline_version=1.1.0` | `data/daily/acceptance.py` **33/33** ✅ |

Final Model 与 Daily 的**算法、权重、数据、产物均未改动**；`models/src`、`models/reports/final`、
`data/daily` 在本轮 diff 中为 **0 改动**。

---

## 3. 双后端：最终处置

| 问题 | 结论 |
|---|---|
| `AgriScope/server/agriscope_api.py` 最终状态 | **REMOVED**（文件已不存在；`frontend/server/` 仅剩 README + 空 tests） |
| `backend/` 是否为唯一生产后端 | **SOLE_PRODUCTION_BACKEND = YES** |
| `npm run dev:api` 现在启动什么 | 正式 FastAPI：`python3 -m uvicorn app.main:app --app-dir ../backend --host 127.0.0.1 --port 8787 --workers 1` |
| 前端真实请求到达哪里 | 浏览器 → Vite(5173/…)/api 代理 → **`backend/` FastAPI:8787** → FinalDecisionEngine / Long-Horizon 快照 |
| 业务逻辑是否被复制 | 否（bridge 无任何残留实现） |

---

## 4. API 路由最终列表

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/health`、`/health/ready` | 存活 / 真就绪 |
| GET | `/api/meta` | 版本矩阵 |
| GET | `/api/decision/capabilities`（别名 `/api/capabilities`） | 城市决策能力 |
| POST | `/api/decision/evaluate`（别名 `/api/decision`、`/api/decision/rank`） | 决策主契约 |
| POST | `/api/decision/stress` | 压力情景（Final 原生） |
| GET | `/api/daily/latest` | Daily 快照（原样返回 schema 1.1.0） |
| GET | **`/api/forecast/capabilities`** | **【新】**长期能力（crop × horizon × method × production_status） |
| POST | **`/api/forecast/long-horizon`** | **【新】**长期预测（N 天窗口均价情景；只读预生成快照） |

`/api/decision` 语义**未改动**；新增路由独立，`OpenAPI`/`README`/前端 Provider 三处已表达一致
（`backend/openapi.json` 已重新生成，10 条路径）。

---

## 5. Contract 对齐

| 链路 | 对齐内容 | 证据 |
|---|---|---|
| Frontend request ↔ Backend Pydantic ↔ Final runtime | 逐字段一致；`request` 原样回显；`market_as_of == 请求 as_of` | acceptance 19/19（含回显与 as_of）+ E2E 28 |
| Final runtime ↔ Backend response ↔ Frontend adapter | `batch.all` 状态属登记枚举；单位 `CNY/kg`；无 NaN/Infinity | E2E 23/25 |
| Long-Horizon snapshot ↔ Backend ↔ Frontend adapter | `low <= point <= high`、单位固定、`source` 属登记枚举、`fallback_used` 显式 | E2E 22/23/24 + 前端 adapter 单测 8 + 门禁 |
| Error Contract | `{error_code,message,request_id,details}` + `X-Request-ID`；新增 `FORECAST_UNAVAILABLE`/`LLM_UNAVAILABLE` | E2E 24 + 浏览器实测 400/422 |

**未新增第三套 Contract**：Final internal → Backend public → Frontend adapter 三段式保持不变。

---

## 6. Long-Horizon 研究层（Phase 7–18 摘要）

- **正式长期 target = `full`**：未来 (t, t+N] 窗口均价（与 Final 短期目标同口径），
  由 Phase 7 程序化判定（5 种候选 × 4 horizon × 3 baseline，`decision_score = mean_WAPE + 0.5·std`）。
  对照证据：端点口径误差 8.3%→42.0%（7→180d 单调升），窗口均价口径 5.3%→14.7%（30d 后趋于平台）。
- **Error Growth Curve（正式 target，跨 10 作物平均）**：

  | horizon | 30 | 60 | 90 | 120 | 150* | 180* |
  |---|---|---|---|---|---|---|
  | best 方法 WAPE | 12.0 | 15.9 | 16.5 | 15.9 | 15.6 | 14.7 |
  | last_value WAPE | 12.0 | 17.6 | 22.9 | 28.0 | 32.1 | 36.7 |
  | 非重叠样本 | 68 | 34 | 22 | 17 | 13 | 11 |

  （*150/180 为**探索级**，OOT 样本不足，不作为上线依据。）
- **Registry**：`LONG_HORIZON_REGISTRY.csv` 60 行（30–180 × 10 作物）；
  `PRODUCTION_POINT 28` · `SCENARIO_ONLY 12` · `EXPLORATORY_SCENARIO_ONLY 20`；
  区间仅 23 行达覆盖校准带宽（→`prediction_interval`），其余一律 `scenario_range`。
- **LLM**：Provider/Schema/Cache/Prompt/ContextPacket（确定性 `context_hash` + 四类时间戳泄漏审计）/
  blind+context+residual+hybrid+ablation harness 全部落地。
  **无合法 API key → 使用确定性 stub（`is_real_llm=false`），LLM 数值增益一律「未评估」**，
  `LLM_UNAVAILABLE`/`fallback_used` 语义已实现；**LLM 不参与正式数值链路**。
- **部署形态**：Option B 预生成（`data/processed/long_horizon/snapshots/latest.json`，
  `snapshot_hash=e424539908c5b77fa5d1a0c75eee4f80`，as_of `2026-09-14`），
  独立 Job，不塞进 Daily 采集逻辑；LLM 挂掉不影响 Daily/短期 Final/前端。

---

## 7. 真实运行验证（浏览器 E2E）

实测环境：后端 `scripts/dev.sh`(8787, uvicorn) + 前端 `vite`(5175) + Chrome。

| 检查 | 结果 |
|---|---|
| `POST /api/decision` | 200 |
| `GET /api/daily/latest?city=shenyang` | 200 |
| `GET /api/forecast/capabilities?city=shenyang` | 200 |
| `POST /api/forecast/long-horizon` | 200（响应头 `server: uvicorn`，`X-Request-ID` 存在） |
| 请求体回显 | `{"contract_version":"1","city_id":"shenyang","crop":"土豆","horizon_days":120}` 原样 |
| 面板渲染 | `.long-horizon` 显示「长期情景 · 120 天窗口均价 / 正式长期估计 / 1.76–2.05–2.13 元/kg / 模型分歧 2.24%」 |
| 无 fixture / mock / 旧 bridge | ✅（生产 Provider 只有 HTTP；`is_real_llm=false` 的 stub 只在离线 harness） |
| Console 错误 | 0（仅 1 条既有 a11y 提示） |
| 刷新后 | 面板仍正常；移动视口（≤500px）无横向溢出 |
| 失败隔离 | 未登记城市 422 `UNSUPPORTED_CITY`；非法 horizon 400 `VALIDATION_ERROR`，均带 `request_id` |

---

## 8. 全量回归结果

| 项目 | 结果 |
|---|---|
| Frontend typecheck / tests / build / verify:ui / boundary | ✅ 315 tests，34 产物文件禁用字样 0 |
| Backend acceptance | ✅ 19/19 → `BACKEND_FROZEN` |
| Backend E2E（pytest） | ✅ 28 passed |
| Final Model acceptance | ✅ 38/38 |
| Daily acceptance | ✅ 33/33 |
| Long-Horizon 一致性门禁 | ✅ registry=60 / entries=60 |
| 运行时资产清单 | ✅ 195/195 |
| `scripts/acceptance.sh` | ✅ `ACCEPTANCE_PASS` |

---

## 9. 本轮顺带修复的既有缺陷

`data/daily/acceptance.py` 会**真实重跑 Daily 管道**，从而改写 `data/processed/daily/**`
（日志追加、快照含 `generated_at`）。原 `verify_assets.py` 把这些**派生资产**也做 sha256 强校验，
导致「每一次 `acceptance.sh` 之后的下一轮运行必然误报哈希不符」。

已修正为两类语义（见 `RUNTIME_ASSETS.md` §4）：

- **强校验**：`models/**`、`data/model_ready/**`、`data/metadata/**`、`data/reports/**`、`data/raw/**`
  —— 事实来源，任何不符直接 FAIL；
- **可刷新（派生）**：`data/processed/**` —— 由管道重新生成，只读校验时仅提示，
  用 `python3 scripts/verify_assets.py --refresh` 刷新其哈希（manifest 记录 `refreshed_at` / `refresh_note`）。

强校验部分**未被放宽**：195/195 全绿，`models/` 等 canonical 资产仍逐件 sha256 比对。

---

## 10. 已知限制（如实列出）

1. 长期能力是**「N 天窗口均价」的情景化估计**，**不得**表述为第 N 天点位预测；
2. 150/180 为探索级（OOT 非重叠样本 13/11），不得作为上线依据；210/240 明确不研究；
3. Long-Horizon 快照基于**冻结 Final 数据**（anchor `2026-09-14`），与 Daily 实时快照
   （截至 `2026-10-06`）**不同步**；Daily 更新后需重跑 Long-Horizon Job；
4. 城市级作物物候 `NOT_FOUND`（仅省级/区域级月粒度日历），长期机制特征未接入；
5. LLM 数值增益**未评估**（无 key）；`fallback_used` 语义为「未走 LLM 数值链路」；
6. 本轮**不部署**、**不接生产 LLM**、**不重训**；`v1.0.0-rc1` 为候选版本，非最终版。

---

## 11. 下一步（不在本轮）

```text
1) 部署（服务器 / systemd / nginx）—— 本轮明确不做
2) 提供合法 LLM key 后，重跑 LLM harness（blind/context/residual/hybrid/ablation）并接入真实评估
3) Daily 更新后重跑 Long-Horizon Forecast Job（或纳入调度，位于 Daily 之后）
4) 视需要把 150/180 的探索级样本补齐后再评估是否可升级
```