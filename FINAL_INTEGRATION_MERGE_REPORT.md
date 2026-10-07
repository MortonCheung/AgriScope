# FINAL_INTEGRATION_MERGE_REPORT

- 状态：**FINAL_INTEGRATION_MERGED**
- 日期：2026-10-07
- 范围：把 **Frontend + Backend + Final Model + Daily** 四块冻结/已验收资产合并为唯一、可运行、可版本管理的工程基线
- 本轮**未部署**、**未接 LLM**、**未重训模型**、**未扩 Daily 功能**、**未改前端产品逻辑**

---

## 1. 双后端：最终处置（§44）

| 项 | 结论 |
|---|---|
| `AgriScope/server/agriscope_api.py` | **REMOVED** —— 文件与其测试已删除，仅保留 `server/README.md` 作为历史说明（不含任何启动命令） |
| `backend/`（FastAPI） | **SOLE_PRODUCTION_BACKEND = YES** |
| 运行中的旧 bridge 进程 | 发现并**已终止**（原监听 127.0.0.1:8787，`server/agriscope_api.py … --frontend dist`）；否则前端会继续连旧后端 |
| 前端真实请求指向 | 浏览器 → Vite `/api` 代理(5173) → **正式 FastAPI(8787)** → `FinalDecisionEngine`（uvicorn 访问日志逐条对应） |

## 2. 四块基线的身份

| 基线块 | 仓库 | 分支 | commit / 版本 |
|---|---|---|---|
| Frontend（冻结） | `MortonCheung/AgriScope` | `feat/frontend-v5-restructure` | **`dc9a9c1c1ead11d184e9d4b527efd17fd5a0a40c`** |
| Frontend（集成） | 同上 | `release/final-integration` | `91830d3` |
| Frontend（main） | 同上 | `main` | **`aeac480e71da8ed43b9f799f0644e36df8dd2451`**（已 push，`origin/main` 同步） |
| Backend | 根目录新仓库 `/大数据分析` | `release/final-integration` | `86ef9e8` |
| Backend（main） | 同上 | `main` | **`c3563866452ac3e92a31dec58dcd2c10e57336be`** |
| Final Model | 冻结（只读） | — | `model_version=final_v1`，`code_fingerprint=5a5d68232b747549`，`generated_at=2026-10-07 19:45:00` |
| Daily | 冻结（只读） | — | `schema_version=daily_pipeline_version=1.1.0`，`data_version=5158f56ad7df596d`，`latest_data_date=2026-10-06`，`DELAYED` |

## 3. Git 结构决定（§22/§23/§24）

- 侦察事实：`/大数据分析` **原本不是 Git 仓库**；`AgriScope/` 是唯一仓库（remote `github.com/MortonCheung/AgriScope.git`）；`backend/`、`models/`、`data/` **不属于任何 Git**。
- 决定（保持 §24 的平级布局，避免为一次合并改写历史/搬迁 GB 级数据）：
  - **AgriScope 仓库** = 前端唯一仓库（保持独立与远端）；集成通过其 `release/final-integration` → `main` → push 完成。
  - **根目录仓库 `/大数据分析`** = 正式后端与基线仓库（新建，commit `be56daf` 起），只管理**源码与清单**。
  - `.gitignore` 排除 `AgriScope/`、`models/`、`data/`、`reference/`、`archive/`、`catboost_info/`、缓存与本机文件。
  - 冻结的模型/数据通过 [`RUNTIME_ASSETS.md`](RUNTIME_ASSETS.md) **以身份+校验信息固定**，不进源码仓库（§23：禁止 `git add ../data/raw` 之类）。
- 版本管理结论：**两个仓库、各自 main**；前端由 `AgriScope` 仓库 + remote 管理，后端与基线由根仓库管理；四块之间以 commit/版本/指纹互相固定。

## 4. 路由最终列表（唯一）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/health` | 存活探针 |
| GET | `/health/ready` | 真就绪（快照/数据/模型/元数据/daily） |
| GET | `/api/meta` | 版本矩阵（final / daily / runtime / backend） |
| GET | `/api/decision/capabilities?city=<slug>` | 城市决策能力（别名 `/api/capabilities`） |
| POST | `/api/decision` | **前端默认入口**（`HttpDecisionProvider` base） |
| POST | `/api/decision/evaluate` | 同上一契约的规范名（别名） |
| POST | `/api/decision/rank` | 别名（OpenAPI 不展示） |
| POST | `/api/decision/stress` | 压力情景（Final 原生 `_scenario_profit`） |
| GET | `/api/daily/latest?city=shenyang` | Daily 快照（原样返回，schema 1.1.0） |

- 前端 URL **未改**（§11）；`/api/decision`、`/api/decision/capabilities`、`/api/decision/stress`、`/api/daily/latest` 与冻结前端完全一致（§12/§13/§14/§15）。
- Vite 代理保持 `/api → 127.0.0.1:8787`（§21）。
- OpenAPI（`backend/openapi.json`）、README 与前端 Provider 三者表述一致（§12）。

## 5. Bridge vs Backend 功能对照（§8）

| FEATURE | FRONTEND_BRIDGE | BACKEND_FASTAPI | 判定 |
|---|---|---|---|
| capabilities | GET `/api/decision/capabilities?city=` | 同路径 | **SAME** |
| decision | POST `/api/decision` | 同路径（+`/evaluate`、`/rank` 别名） | **SAME** |
| stress | POST `/api/decision/stress`（Final `_scenario_profit`） | 同路径 + 同函数 | **SAME** |
| daily latest | GET `/api/daily/latest?city=shenyang` | 同路径 | **SAME** |
| 错误契约 | `{status,error}` | `{error_code,message,request_id,details}` | **BETTER**（前端不解析错误体；后端带 request_id） |
| 版本元数据 | 随响应内联 | 内联 + `/api/meta` | **BETTER** |
| health | 无 | `/health`、`/health/ready`（真检查） | **BETTER** |
| CORS | POST Origin 白名单 → 403 | `ALLOWED_ORIGINS` + CORSMiddleware | **SAME** |
| 运行时快照 | 进程内改 `common.ROOT`，单引擎+锁，逐请求版本校验 | 启动绑定一次 + 单 worker + 推理锁；`LIVE`/`FROZEN_FALLBACK` 状态 | **SAME（后端更可观测）** |
| NaN/Inf 清洗 | `clean_json` 全量清洗 | **已对齐**：`SafeJSONResponse` 全局清洗 | **SAME** |
| 严格请求校验 | 精确键集/白名单/`as_of≤market_as_of`/体积上限 | **已对齐**：同规则 + `/api/decision` 前缀统一 | **SAME** |
| 压力情景语义 | 单轴 + mild/severe；delay/其他组合 unavailable；roi 恒 null | **已对齐**：同上（原先自造的延迟映射已移除） | **SAME** |
| 静态 dist 同源托管 | 支持 `--frontend dist` | 不支持（交给 Vite/反代；§15 只要 `/api/daily/latest` 只读） | **MISSING（不需要）** |

> 结论：正式后端的路由与业务语义**完全覆盖**前端所需；更严谨的校验/清洗/错误契约已从 bridge **吸收**，bridge 因此无残留生产职责 → REMOVED。

## 6. Contract 闭环（§17/§18）

- 请求：前端 `FinalDecisionRequest`（`contract_version='1'`）→ 后端**原样回显** → Final 引擎入参（`plant_date=as_of`，确定性）。
- 响应：Final `evaluate_many` → 后端信封 `{request,batch,market_as_of,model_version,data_version,code_fingerprint}` → 前端 `adaptFinalDecision` → UI Contract v1。
- Daily：`latest.json`(schema 1.1.0) → `/api/daily/latest` 原样 → 前端 `adaptDailySnapshot`。
- 未发明第三套契约；真实运行结果已逐字段核对。

## 7. 验证结果（§26–§33）

| 验证 | 命令 / 方式 | 结果 |
|---|---|---|
| 后端验收 | `python3 backend/scripts/acceptance.py`（= `npm run test:api`） | **19/19 → BACKEND_FROZEN** |
| 后端 E2E | `pytest backend/tests/test_e2e.py` | **24 passed**（含 10 并发隔离、严格校验、NaN 清洗、体积上限） |
| 前端真实 adapter 交叉验证 | tsc 编译 `finalAdapter.ts`+`validation.ts` 后由 Node 调用运行中的后端 | **27/27** |
| 前端 typecheck | `npm run typecheck` | PASS |
| 前端测试 | `npm test` | **299 passed / 29 files** + verify:v2 + verify:integrity |
| 前端构建 | `npm run build` | PASS（含 verify:production-boundary + verify:ui） |
| Final Model | `check_acceptance_final.py` | **38/38** |
| Daily | `data/daily/acceptance.py` | **33/33**（FROZEN_WITH_KNOWN_LIMITATIONS） |
| 浏览器 E2E | Chrome DevTools 真实浏览器 | **12/12**（见下） |

### 浏览器 E2E 明细（§28）

| # | 用例 | 证据 |
|---|---|---|
| 1 | 沈阳 Capability | 页面显示"模型数据截至 **2026-10-06**"（bridge 只会给 2026-09-14） |
| 2 | 沈阳正常 Decision | `POST /api/decision` 200；结果页"西红柿 60 亩" |
| 3 | 无真实 cost/yield | 比较全部 10 作物；显示"收益待补充实际投入"，不造数 |
| 4 | 有真实 cost/yield | profit_basis=user_input；"131 万元" |
| 5 | 90d scenario_only | 下拉"90 天 · 仅情景"；结果标注 `90 天 · 仅情景` |
| 6 | 大连 insufficient | "这个城市暂不支持种植决策"；**无 POST**（仅 capability） |
| 7 | Stress | `POST /api/decision/stress` 200；"-28.5 万元"，ROI 显示"—" |
| 8 | Daily latest | `/api/daily/latest` 200；"西红柿最新市场 4.4 元/kg" |
| 9 | Daily DELAYED | 页面"发布延迟" |
| 10 | Backend unavailable | 停后端后刷新 → "模型暂时无法返回结果，请重试。"（无 fixture/mock 回退） |
| 11 | 前端刷新 | 刷新后自动重跑并恢复结果 |
| 12 | 手机视口 | 390×844 布局正常、无横向溢出 |

- Network 检查（§29）：`/api/**` 路径/状态/载荷均正确；响应头 `server: uvicorn`、`x-request-id`；**无 bridge 特有格式**。
- 控制台：无 error（仅 1 条 Chrome 关于表单 id 的无障碍提示）。

## 8. 安全与边界（§4/§35/§36）

- 无 secret（无 `.env`、无 API Key/Token）；`.env.example` 仅为示例。
- 无大文件误提交：`models/`(≈744MB)、`data/`(≈2.2GB)、`node_modules` 均被忽略；后端提交 30 文件 / 2,862 行。
- 无 Mac 绝对路径（后端静态扫描通过）。
- **未使用** `git push --force` / `git reset --hard`。
- Frontend `stash@{0}` **保留未动**（§35）。
- 冻结报告哈希未改动（差异记录在 `backend/CONTRACT_ALIGNMENT_REPORT.md`，§34）。
- 旧 bridge 进程已终止，未再启动。

## 9. 合并后状态

```
大数据分析/                    ← Git 仓库（基线：backend + 清单 + 报告）
├── .gitignore                 ← 排除 AgriScope/models/data/...
├── README.md                  ← 唯一正式开发流程（§20）
├── RUNTIME_ASSETS.md          ← 运行时资产清单（§23）
├── FINAL_INTEGRATION_MERGE_REPORT.md
├── backend/                   ← 唯一正式后端（FastAPI）
├── AgriScope/                 ← 独立仓库（前端，main = aeac480）
├── models/ · data/ · reference/ · archive/   ← 冻结/参考资产（不入源码仓库）
```

```bash
# 唯一正式流程
python3 -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8787 --workers 1
cd AgriScope && npm run dev
```

## 10. 已知限制（如实保留）

- 后端 **必须单 worker**；Daily 更新后需重启后端以重新绑定运行时快照。
- 本轮不做鉴权/限流/持久化；不新建远端仓库（根仓库为本地基线仓库）。
- 前端 UI 是否展示 60/90 天由 Final 能力决定（`scenario_only`），与 device 无关。
- 根仓库与前端仓库是两个独立版本单元；四块以 commit/版本/指纹互相固定，详见 `RUNTIME_ASSETS.md`。

## 11. 结论

**FINAL_INTEGRATION_MERGED** —— 四块基线在同一本地环境下已真实跑通，双后端问题已消除，契约与路由统一，全部验收通过。