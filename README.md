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
| `llm/` | 长期预测层（Provider / Context / Prompts / Schemas） |
| `deploy/` | 部署配置（systemd / env 模板） |
| `runtime/` | `manifest.json`：大型运行时资产的 sha256 清单 |
| `scripts/` | `dev.sh` / `test_all.sh` / `acceptance.sh` |
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

./scripts/dev.sh          # 终端 A：启动正式后端(8787)；终端 B：npm run dev(5173)
./scripts/test_all.sh     # 前端 → 后端 → Final → Daily（+ Long-Horizon，待 Phase 7+）
./scripts/acceptance.sh   # 一键正式验收（禁止训练）
```

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
- 上一轮集成记录：`FINAL_INTEGRATION_MERGE_REPORT.md`