# server/（已退役 · RETIRED）

本目录历史上的只读 HTTP bridge（`agriscope_api.py` 及其 `tests/`）**已移除**，
不再承载任何业务实现。它已被唯一正式后端取代。

- 唯一正式后端：工程根目录的 **`backend/`**（FastAPI）—— 见 [`../backend/README.md`](../backend/README.md)
- 启动方式（在前端目录运行）：`npm run dev:api` → 实际启动 `backend.app.main:app`（127.0.0.1:8787）
- 前端契约与逐字段交接：`../backend/FRONTEND_INTEGRATION_HANDOFF.md`
- 双后端审计与最终处置：`../FINAL_INTEGRATION_MERGE_REPORT.md`
- 单仓库与长期层落地：`../MONOREPO_V1_MERGE_REPORT.md`
- 基线布局与运行时资产：`../RUNTIME_ASSETS.md`

> 提示：仓库 `MortonCheung/AgriScope` 现为**单仓库（monorepo v1）**，
> `frontend/` 与 `backend/` 同在根目录，一次 `git clone` 即得全部源码；
> 大型运行时资产按 `RUNTIME_ASSETS.md` 的清单单独提供。
> 本文件仅作历史说明，**不提供**任何 bridge 启动命令。