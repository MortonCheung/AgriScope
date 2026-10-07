# AgriScope · 穹衡（v1.0 单仓库）

辽宁农业气候风险与种植决策系统。**唯一正式仓库**：`github.com/MortonCheung/AgriScope`。
一次 `git clone` 即得**全部源码**（前端 / 后端 / 模型 / Daily / LLM / 契约 / 部署 / 脚本 / 文档）；
大型运行时资产不进 Git，由 [`runtime/manifest.json`](runtime/manifest.json) 固定。

## 目录

| 目录 | 职责 |
|---|---|
| `frontend/` | 前端产品（React/Vite；原仓库根内容，`git mv` 保留历史） |
| `backend/` | 唯一正式后端（FastAPI：Final Model 推理 + Daily 快照） |
| `models/` | 冻结模型工程：`src/`（decision_engine）、`config/`、`scripts/`、`tests/`、`reports/final/`（清单） |
| `data/` | 数据与研究：`daily/`（Daily 管道源码）、`scripts/`（数据基座管道源码） |
| `models/long_horizon/` | **长期研究层（30–180d 窗口均价）**：target 研究 / baseline / 回测 / Registry（只读冻结数据，不重训 Final） |
| `llm/` | 长期预测实验层（Provider / Context / Prompts / Schemas / Cache / 评估 harness） |
| `data/long_horizon/` | Long-Horizon Forecast Job（独立预生成，前端只读；不塞进 Daily） |
| `backend/deploy/` | 部署配置（systemd 单元 / env 模板） |
| `runtime/` | `manifest.json`：大型运行时资产的 sha256 清单 |
| `scripts/` | `dev.sh` / `test_all.sh` / `acceptance.sh` / `verify_long_horizon.py` |
| `docs/` + 根 `*.md` | 审计、设计、计划与冻结报告 |

## 运行时资产（不进 Git）

`models/models/`、`models/data/`、`data/raw|processed|model_ready|metadata|reports` 体积大（本机实测必需集合 ≈111MB），
由 [`runtime/manifest.json`](runtime/manifest.json) 逐件记录 `sha256/size/model_version`。

恢复步骤：

```bash
# 1) 把资产包解到仓库根（保持 manifest 里的相对路径）
# 2) 校验
python3 scripts/verify_assets.py        # 逐件比对 sha256（只读）
```

冻结身份：`model_version=final_v1`，`code_fingerprint=b19b187268ee92db`
（**PORTABILITY_PATCH**：仅路径解析方式改变，算法/权重/数据/模型产物均未改动）。

## 一键开发 / 测试 / 验收

```bash
# 依赖
python3 -m pip install -r backend/requirements.txt
cd frontend && npm install && cd ..

./scripts/dev.sh          # 终端 A：启动正式后端(8787)；终端 B：cd frontend && npm run dev
./scripts/test_all.sh     # 前端 → 后端 → Final → Daily → Long-Horizon（一致性门禁）
./scripts/acceptance.sh   # 一键正式验收（禁止训练）
```

Long-Horizon（长期研究层）重建与验证：

```bash
# 一键重建 Phase 7→18（目标研究 / baseline / Registry / LLM harness / 预测快照）
PROJECT_ROOT=$PWD PYTHONPATH=models/src:models:. python3 -m long_horizon.run_long_horizon

# 只生成长快照（前端读它）
PROJECT_ROOT=$PWD PYTHONPATH=models/src:models:. python3 -m data.long_horizon.run_long_horizon_job

# 一致性门禁（只读）
python3 scripts/verify_long_horizon.py
```

长期预测 API（**独立于** `/api/decision`，不改变其语义）：

```bash
GET  /api/forecast/capabilities?city=shenyang
POST /api/forecast/long-horizon     # {contract_version, city_id, crop, horizon_days}
```

LLM 层无 API key 时自动使用确定性 stub（`is_real_llm=false`），
所有 LLM 数字结论一律标注**未评估**；LLM 不参与正式数值链路。

手动等价：

```bash
python3 -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8787 --workers 1
cd frontend && npm run dev        # Vite 将 /api 代理到 127.0.0.1:8787
```

## 硬性约定

- 数据真实性优先：禁止编造/随机生成/无来源数字；缺失如实标注 `NOT_FOUND / NOT_PUBLIC / USER_INPUT_REQUIRED`。
- `models/data/**`、`data/model_ready/**`、`models/reports/final/**` **只读**。
- 生产代码硬编码本机路径为 0；统一由 `PROJECT_ROOT` / 文件位置推导。
- 唯一正式后端是 `backend/`；`frontend/server/` 仅保留 bridge 退役说明。
- 部署链路见 `deploy/`。

## 相关文档

- 资产审计：`REPOSITORY_ASSET_AUDIT.md`
- 长期可行性：`LONG_HORIZON_FEASIBILITY_AUDIT.md`
- 单仓库迁移设计：`MONOREPO_MIGRATION_DESIGN.md`
- LLM 评估设计：`LLM_EVALUATION_DESIGN.md`
- 施工计划（Phase 7–22）：`LONG_HORIZON_CONSTRUCTION_PLAN.md`
- 长期目标研究：`LONG_HORIZON_TARGET_STUDY.md`（由 `models/long_horizon/target_study.py` 生成）
- 长期模型报告：`LONG_HORIZON_MODEL_REPORT.md`
- 长期 Registry：`LONG_HORIZON_REGISTRY.csv`
- LLM 预报/消融/Hybrid：`LLM_FORECAST_REPORT.md` / `LLM_ABLATION_REPORT.md` / `HYBRID_REPORT.md`
- 长期冻结门禁：`LONG_HORIZON_FREEZE_GATE.md`
- 上一轮集成记录：`FINAL_INTEGRATION_MERGE_REPORT.md`