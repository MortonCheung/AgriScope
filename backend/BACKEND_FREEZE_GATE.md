# BACKEND_FREEZE_GATE · AgriScope Decision API

冻结门禁：以下全部通过方可宣布 `BACKEND_FROZEN`。

## A. 后端验收（`python3 backend/scripts/acceptance.py`）

| 项 | 结果 |
|---|---|
| backend 代码无 Mac 绝对路径 | ✅ |
| 无旧 v1 / archive 生产依赖 | ✅ |
| 未 import 前端目录（`AgriScope/`） | ✅ |
| `/health/ready` 真检查通过 | ✅ ready |
| 版本矩阵 `model_version=final_v1` | ✅ |
| 运行时快照状态明确 | ✅ LIVE @ extended_snapshot |
| Daily 版本矩阵可得 | ✅ 1.1.0 |
| evaluate 200（含默认入口 `/api/decision`） | ✅ |
| `request` 原样回显 | ✅ |
| `market_as_of` = 请求 as_of | ✅ |
| `batch.all` 状态属登记枚举 | ✅ |
| capabilities supported & 10 crops | ✅ |
| 大连 supported=false（不 fallback） | ✅ |
| stress 200 且 available | ✅ |
| daily `latest.json` 原样返回 | ✅ |
| 统一错误契约 + request_id | ✅ |
| OpenAPI 覆盖核心路径 | ✅ |
| **未修改 `models/`（canonical 只读）** | ✅ |
| 契约回归 `tests/test_e2e.py` | ✅ 17 passed |

**结果：19/19 → BACKEND_FROZEN**

## B. 前端真实 adapter 交叉验证（tsc 编译 `finalAdapter.ts` + `validation.ts` 后由 Node 调用）

27/27 通过：无输入 / 有输入 / 多作物 / 90d scenario_only / 大连不足 /
capabilities / stress（可用与不可用）/ daily / 错误契约 / `X-Request-ID`。

## C. 冻结资产复跑（Phase 14，后端建设后进行）

| 门禁 | 命令 | 结果 |
|---|---|---|
| Final Model | `PYTHONPATH=models/src python3 models/scripts/check_acceptance_final.py` | ✅ 38/38 |
| Daily Pipeline | `python3 data/daily/acceptance.py` | ✅ 33/33（DAILY_PIPELINE_FROZEN_WITH_KNOWN_LIMITATIONS） |
| Backend | `python3 backend/scripts/acceptance.py` | ✅ 19/19（BACKEND_FROZEN） |

## D. 不变式核对

- ✅ `models/` 未被写入（运行时审计 before/after 指纹一致，guard 根：`data/ models/ src/ config/`）
- ✅ 冻结报告 sha256 与 `FINAL_RUN_META.json.artifact_hashes` 一致（见 `CONTRACT_ALIGNMENT_REPORT.md`）
- ✅ 未改动 `AgriScope/`、`data/daily/`、`models/src/**`
- ✅ 无新增数据库 / 无 LLM 接入 / 无额外基础设施中间件

## E. 结论

**BACKEND_FROZEN** —— 前端可直接调用，服务器可按 `deploy/agriscope-api.service` 运行。