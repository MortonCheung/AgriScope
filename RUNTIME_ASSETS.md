# 运行时资产清单（RUNTIME_ASSETS）

本仓库（根目录）只管理**源码与清单**。下表列出基线运行时依赖的**冻结资产**：
它们体积大且各自有独立冻结版本，**不进入本仓库**，按本清单定位与校验。

## 1. 四块基线的身份（唯一真源）

| 基线块 | 身份 | 路径 | 版本/指纹 |
|---|---|---|---|
| Frontend | **本仓库**（`git mv` 保留历史；来源 commit `dc9a9c1c1ead11d184e9d4b527efd17fd5a0a40c` @ `feat/frontend-v5-restructure`） | `frontend/` | typecheck / 315 tests / build / verify:ui 全绿 |
| Backend | **本仓库** | `backend/` | api_version `1.0.0`；`backend/openapi.json` |
| Long-Horizon | **本仓库**（研究层，只读冻结数据） | `models/long_horizon/`、`llm/` | `model_version=long_horizon_v1`；预测快照 `data/processed/long_horizon/snapshots/latest.json` |
| Final Model | 冻结（不得重训） | `models/` | `model_version=final_v1`，`data_version=final_v1`，`code_fingerprint=b19b187268ee92db`（PORTABILITY_PATCH：仅路径解析改变，算法/权重/产物未改动） |
| Daily | 冻结（不得扩功能） | `data/processed/daily/` | `schema_version=daily_pipeline_version=1.1.0`，`data_version=5158f56ad7df596d`，`model_version=final_v1` |

## 2. 不进仓库的资产（被 `.gitignore` 排除）

| 路径 | 体积（本机实测） | 说明 |
|---|---|---|
| `models/` | ≈ 743.7 MB | Final 冻结模型、快照 `models/data/snapshots/final_v1/`、`models/models/final/*.pkl`（32 个）、冻结报告 |
| `data/` | ≈ 2215.7 MB | 原始证据 `data/raw/`、canonical `data/model_ready/`、Daily 产物 `data/processed/daily/` |
| `AgriScope/` | （含 `node_modules` ≈ 307.8 MB） | 前端独立仓库，见上表 commit 固定 |
| `reference/`, `archive/`, `catboost_info/` | — | 参考资料 / 旧层归档 / 训练缓存 |

> 决策依据：§23 —— 禁止 `git add ../data/raw` 之类把 GB 级数据塞进源码仓库；
> 模型/数据以「部署包 / 明确服务器目录」管理，源码仓库只保存身份与校验信息。

## 3. 后端运行必需的最小集合

正式 Backend 启动时只读以下文件（其余资产可不随包发布）：

```
models/src/                                          # decision_engine 包（只读）
models/reports/final/FINAL_RUN_META.json             # 版本真源
models/reports/final/tables/price_model_selection.csv
models/reports/final/tables/scenario_range_by_crop_horizon.csv
models/reports/final/tables/profit_grading.csv
models/models/final/*.pkl                            # 32 个冻结 ML 产物
models/data/snapshots/final_v1/datasets/decision_dataset_{沈阳,朝阳}.parquet
models/data/snapshots/final_v1/model_ready/**        # market_daily / climate / profit / ...
data/processed/daily/final_input/extended_snapshot/  # 可选：Daily 实时输入快照（指纹需与 Final 兼容）
data/processed/daily/snapshots/latest.json           # Daily 对外快照（schema 1.1.0）
```

若 `extended_snapshot` 缺失或其 `.source_fingerprint.json` 与当前 Final 不兼容，
后端自动回退冻结 `models/data/snapshots/final_v1/`，并在 `/api/meta` 标注
`runtime.runtime_data_status=FROZEN_FALLBACK`。

## 4. 校验方式

```bash
# 模型/数据身份（无需重训即可确认）
python3 - <<'PY'
import json
m=json.load(open("models/reports/final/FINAL_RUN_META.json"))
d=json.load(open("data/processed/daily/snapshots/latest.json"))
print(m["model_version"], m["code_fingerprint"])
print(d["daily_pipeline_version"], d["data_version"])
PY

# 后端就绪（会真检查快照/数据/模型/元数据/daily）
curl -s http://127.0.0.1:8000/health/ready

# 运行时资产清单校验（强校验 canonical/模型；派生资产可刷新）
python3 scripts/verify_assets.py
python3 scripts/verify_assets.py --refresh   # 管道重跑后刷新 data/processed/** 的哈希
```

### 强校验 vs 可刷新（重要）

- **强校验**：`models/**`、`data/model_ready/**`、`data/metadata/**`、`data/reports/**`、`data/raw/**`
  —— 事实来源，任何 size/sha256 不符直接 FAIL。
- **可刷新（派生）**：`data/processed/**` 由 Daily / Final 管道**重新生成**（日志会追加、
  快照含 `generated_at`），每次管道运行都可能变化。只读校验时若漂移只提示；
  用 `--refresh` 刷新其哈希（会在 manifest 记录 `refreshed_at` / `refresh_note`）。

  > 背景：`data/daily/acceptance.py` 会真实重跑 Daily 管道，从而改写 `data/processed/daily/**`；
  > 若无该机制，`scripts/acceptance.sh` 的每一步都会在下一次运行时因日志追加而误报失败。

## 5. 部署时的资产获取

本清单不改变资产来源：`models/`、`data/` 由既有冻结流程产出（`models/scripts/run_final.py`、
`data/daily/run_daily.py`），或由既有服务器目录直接提供。
后端通过 `AGRISCOPE_ROOT` 指向这些资产所在的项目根；**不需要**把它们复制进本仓库。