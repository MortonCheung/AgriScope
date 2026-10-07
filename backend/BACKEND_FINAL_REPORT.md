# BACKEND_FINAL_REPORT · AgriScope Decision API

- 交付物：`backend/`（FastAPI）
- 目标：把 **已冻结** 的 Final Model（推理）与 Daily（市场脉搏）收口为前端可直接调用、
  服务器可运行的 HTTP 服务
- 状态：**BACKEND_FROZEN**（验收 19/19；契约回归 17 passed；前端真实 adapter 交叉验证 27/27）
- 生成时间：2026-10-07

---

## 1. 冻结资产（只读，未改动）

| 资产 | 版本真源 | 值 |
|---|---|---|
| Final Model | `models/reports/final/FINAL_RUN_META.json` | `model_version=data_version=final_v1`，`code_fingerprint=5a5d68232b747549`，`generated_at=2026-10-07 19:45:00` |
| Final 入口 | `decision_engine.final.inference.FinalDecisionEngine` | `evaluate` / `evaluate_many` |
| Daily | `data/processed/daily/snapshots/latest.json` | `schema_version=daily_pipeline_version=1.1.0`，`latest_data_date=2026-10-06`，`data_freshness=DELAYED`，`recommendation=null` |

## 2. 阶段执行与结果

| 阶段 | 内容 | 结果 |
|---|---|---|
| 0 | 全项目后端只读审计（结构/入口/契约/依赖） | 完成；`backend/` 原不存在，无 FastAPI 存量 |
| 1 | Final / Daily 冻结状态实测 | Final `38/38`；Daily `33/33` |
| 2 | 跨报告矛盾审计 | 完成；**不改冻结产物**，登记于 `CONTRACT_ALIGNMENT_REPORT.md` |
| 3–4 | 版本矩阵 + 契约真源 | `/api/meta` 四组版本；契约真源见交接文档 |
| 5 | 安全集成（消除并发风险） | 启动时绑定运行时快照一次 + 单 worker + 推理锁 |
| 6–8 | API 设计 / 实现 / OpenAPI | 7 条路由；`openapi.json` 已生成 |
| 9–11 | 并发 / 生命周期 / E2E | 10 并发隔离通过；E2E 17 passed |
| 12–13 | 部署配置 + 文档 | systemd 单元 / `.env.example` / README / 交接文档 |
| 14 | 冻结门禁复跑 | Final `38/38`、Daily `33/33`、Backend `19/19` |

## 3. 关键设计决策

1. **零改动冻结代码**：不改 `models/**`、`data/daily/**`、`AgriScope/**`。
   后端通过 Final 的公开入口调用，并在启动时修正 `decision_engine.common.ROOT`
   与绑定 `SNAPSHOT_DIR`（见 `README.md`「安全集成方式」）。
2. **请求原样回显**：`POST /api/decision/evaluate` 的 `request` 字段**逐字段回显**请求体
   （不做 Pydantic 重建，避免新增 `text:null` 等键破坏前端 `validateRequest`）。
3. **诚实降级**：不支持城市返回 `INSUFFICIENT_MARKET_DATA`（不跨城 fallback）；
   无成本/亩产返回 `USER_INPUT_REQUIRED`（不输出虚假利润）；90d 标注 `scenario_only`。
4. **压力情景走 Final 原生**：`decision_engine.final.optimize._scenario_profit`（官方 SHOCKS）。
   仅支持单项压力与两组官方综合压力；上市延迟与其他组合返回 `available=false`（不自造映射）；
   `roi` 恒为 null（源函数只返回基准收益）。

## 4. 交付清单

```
backend/app/{main,config,runtime_snapshot,dependencies,errors,schemas}.py
backend/app/services/{final_model_service,capability_service,daily_service,meta_service}.py
backend/app/routes/{health,meta,capabilities,decision,daily}.py
backend/tests/test_e2e.py
backend/scripts/acceptance.py
backend/deploy/agriscope-api.service
backend/{openapi.json,requirements.txt,.env.example,README.md}
backend/{FRONTEND_INTEGRATION_HANDOFF,CONTRACT_ALIGNMENT_REPORT,BACKEND_FINAL_REPORT,BACKEND_FREEZE_GATE}.md
```

## 5. 已知限制（如实保留）

- **单 worker 约束**：Final 引擎含模块级/类级缓存 → 必须 `--workers 1`；
  Daily 更新后需重启后端以重新绑定运行时快照（systemd 已给方案）。
- **不做鉴权 / 限流 / 持久化**：本轮为「冻结资产收口」，边界之外。
- **压力情景的延迟映射**是情景假设（非线性、非预报），已在 `note` 标注。
- **前端 `AgriScope/` 未改**：本后端以既有前端契约实现，无新增前端字段。
- 报告口径差异（HRI raw/robust、§34 组合结论、schema 交付物）见
  `CONTRACT_ALIGNMENT_REPORT.md`，未修改任何冻结文件。

## 6. 一键复现

```bash
python3 backend/scripts/acceptance.py                 # 19/19 → BACKEND_FROZEN
python3 -m pytest backend/tests/test_e2e.py -q        # 17 passed
PYTHONPATH=models/src python3 models/scripts/check_acceptance_final.py   # 38/38
python3 data/daily/acceptance.py                      # 33/33
```