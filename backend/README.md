# AgriScope Decision API（后端）

把两个**已冻结**的资产收口成前端可直接调用、服务器可运行的 HTTP 服务：

| 资产 | 来源 | 后端如何使用 |
|---|---|---|
| **Final Model**（推理） | `models/src/decision_engine/final/inference.py` → `FinalDecisionEngine.evaluate / evaluate_many` | 只读调用，不重训、不改算法 |
| **Daily**（市场脉搏） | `data/processed/daily/snapshots/latest.json`（schema 1.1.0） | 原样转发，不改写 |

## 硬约束（已遵守）

- 不改 Final / Daily 任何冻结代码；不重训；不改前端 `AgriScope/`；
- 不接 LLM、不加数据库、不加额外基础设施中间件（仅 CORS + request_id）；
- **canonical 数据只读**：`models/data/**`、`data/model_ready/**`、`models/reports/final/**` 全只读；
- 不改写任何冻结报告 / 哈希交付物（见 `CONTRACT_ALIGNMENT_REPORT.md` 的 Phase 2 说明）。

## 目录

```
backend/
├── app/
│   ├── main.py                # 装配：lifespan 绑定快照 + 预加载引擎 + CORS + 错误契约 + request_id
│   ├── config.py              # 路径/版本/CORS（ROOT 由文件位置推导，可用 AGRISCOPE_ROOT 覆盖）
│   ├── runtime_snapshot.py    # 启动时**绑定一次**运行时快照（安全集成，见下）
│   ├── dependencies.py        # 城市映射 / 推理锁 / 引擎单例 / request_id
│   ├── errors.py              # 统一 Error Contract {error_code,message,request_id,details}
│   ├── schemas.py             # 对外响应模型（OpenAPI）
│   ├── services/              # final_model / capability / daily / meta 服务
│   └── routes/                # health / meta / capabilities / decision / daily
├── tests/test_e2e.py          # 16 项契约 + 1 项并发（17 passed）
├── scripts/acceptance.py      # 正式验收（19/19 → BACKEND_FROZEN）
├── deploy/agriscope-api.service
├── openapi.json               # 生成的 OpenAPI 规范
├── requirements.txt / .env.example
├── README.md
├── FRONTEND_INTEGRATION_HANDOFF.md
├── CONTRACT_ALIGNMENT_REPORT.md
├── BACKEND_FINAL_REPORT.md
└── BACKEND_FREEZE_GATE.md
```

## 安装与运行

```bash
python3 -m pip install -r backend/requirements.txt

# 开发
cd backend
python3 -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload

# 生产（必须单 worker；见安全集成）
python3 -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --workers 1
```

环境变量见 `.env.example`（`AGRISCOPE_ROOT` / `ALLOWED_ORIGINS` /
`AGRISCOPE_SNAPSHOT_POLICY` / `AGRISCOPE_INFERENCE_LOCK`）。

## 接口一览

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/health` | 存活探针 |
| GET | `/health/ready` | **真**就绪检查（快照/数据/模型/元数据/daily） |
| GET | `/api/meta` | 版本矩阵（model / daily / runtime / backend） |
| GET | `/api/decision/capabilities?city=shenyang` | 城市决策能力（别名 `/api/capabilities`） |
| POST | `/api/decision/evaluate` | 决策评估主契约（别名 `/api/decision`、`/api/decision/rank`） |
| POST | `/api/decision/stress` | 压力情景 |
| GET | `/api/daily/latest?city=shenyang` | Daily 快照（原样返回，schema 1.1.0） |

OpenAPI 文档：`/docs`、`/redoc`、`/openapi.json`（仓库内另有 `openapi.json` 快照）。

## 安全集成方式（为什么可以并发）

审计发现两处风险：

1. `decision_engine/common.py` 的 `ROOT` 为本机绝对路径；
2. Final 引擎使用**模块级** `SNAPSHOT_DIR` 与**类级/模块级**缓存
   （`_Data`、`artifacts._CACHE`），若在请求级改写全局则并发不安全。

本后端的解法（**零改动冻结代码**，见 `runtime_snapshot.py`）：

- **启动时**先校正 `decision_engine.common.ROOT/DE`，**再** import `final.*`，使其派生路径一次正确；
- **启动时绑定一次**运行时快照，写入所有 `decision_engine.final.*` 子模块的 `SNAPSHOT_DIR`；
  之后请求级只读 → 天然并发安全；
- 快照选择：优先 Daily 的 `data/processed/daily/final_input/extended_snapshot`
  （其 `.source_fingerprint.json` 需与当前 Final 的 `code_fingerprint`/`model_version` 兼容），
  否则回退冻结 `models/data/snapshots/final_v1` 并标记 `runtime_data_status=FROZEN_FALLBACK`；
- 单 worker + 推理锁串行化；**Daily 更新后由 systemd 重启后端**以重新绑定。

`/api/meta` 的 `runtime.runtime_data_status` 明确区分 `LIVE` / `FROZEN_FALLBACK`。

## 验收

```bash
python3 backend/scripts/acceptance.py     # 19/19 → BACKEND_FROZEN
python3 -m pytest backend/tests/test_e2e.py -q   # 17 passed
```

契约另用**前端真实 adapter**（`finalAdapter.ts` + `validation.ts`）交叉验证：
27/27 通过（详见 `FRONTEND_INTEGRATION_HANDOFF.md`）。