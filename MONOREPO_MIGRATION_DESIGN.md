# MONOREPO 迁移设计（AgriScope v1.0 · ONE OFFICIAL REPOSITORY）

> 本文件是**设计**，不是实现。依据：`REPOSITORY_ASSET_AUDIT.md`、`LONG_HORIZON_FEASIBILITY_AUDIT.md`、
> 以及项目 owner 的 v1.0 规范 §53–§72。
> 目标状态：**唯一正式仓库 = `github.com/MortonCheung/AgriScope`**，一次 `git clone` 即得全部**源码**。

---

## 0. 结论摘要

1. 迁移载体：从现有远端 `AgriScope` 的 `main`（当前 `aeac480`）新建分支 **`feat/monorepo-v1`**，验证通过后合入 `main`。**不 rewrite history、不 force push**。
2. 目录目标：前端 `git mv` 进 `frontend/`（保留历史）；`backend/`、`models/`(源码)、`data/`(源码)、`llm/`、`deploy/`、`docs/`、`scripts/`、`tests/`、`runtime/` 迁入同一仓库。
3. 大资产（≈107M 运行时必需 + 数 GB 原始/归档）**不进 Git**，由 `runtime/manifest.json` + release bundle 管理。
4. 路径统一：建立 `PROJECT_ROOT` 解析；清零生产代码里的本机绝对路径。
5. 旧根仓库 `/大数据分析/.git` 在 monorepo **push 且全测试通过**后标记 `RETIRED`，**不删除**。

---

## 1. 目标结构（§55）

```text
AgriScope/                        # = MortonCheung/AgriScope 仓库根
├── frontend/                     # 前端（原 AgriScope/ 内容，git mv 进来，保留历史）
├── backend/                      # 正式后端（FastAPI，已在根仓库）
├── models/                       # 只进「源码」：src/ config/ scripts/ tests/ docs/
│   ├── src/                      #   decision_engine 包（后端 import）
│   ├── config/ scripts/ tests/ docs/
│   └── README.md
├── data/                         # 只进「源码」：daily/ scripts/
│   ├── daily/                    #   daily 管道源码 + tests
│   └── scripts/                  #   数据管道源码
├── llm/                          # 【新建】长期层源码
│   ├── providers/ __init__.py    #   LLMProvider 抽象（OpenAI-compatible）
│   ├── context/                  #   ForecastContextPacket builder
│   ├── prompts/                  #   forecast_v1.md / residual_v1.md / scenario_v1.md / critic_v1.md
│   ├── schemas/                  #   结构化输出 JSON Schema
│   ├── cache/                    #   调用缓存（gitignore）
│   └── README.md
├── deploy/                       # 部署配置（systemd / nginx 示例 / env 模板）
├── runtime/                      # manifest.json（大资产清单，见 §6）
├── scripts/                      # dev.sh / test_all.sh / acceptance.sh
├── tests/                        # 跨层 E2E
├── docs/                         # 工程文档（含本设计与各审计报告）
├── README.md                     # 唯一入口（含一键启动/测试/验收）
├── REPOSITORY_ASSET_AUDIT.md
├── LONG_HORIZON_FEASIBILITY_AUDIT.md
├── LLM_EVALUATION_DESIGN.md
├── MONOREPO_MIGRATION_DESIGN.md
├── LONG_HORIZON_CONSTRUCTION_PLAN.md
└── .gitignore
```

> `models/final/` 的**冻结身份不变**（见 §5 的路径补丁决策）。目录调整只做最小必要移动，不为了好看大改冻结代码。

---

## 2. 不进 Git 的资产（§56 / §23）

| 类别 | 路径 | 体积 | 处置 |
|---|---|---|---|
| C 大型运行时资产 | `models/models/final/*.pkl`（32 个） | 74M | manifest + bundle |
| C | `models/data/snapshots/final_v1/` | 9.5M | manifest + bundle |
| C | `data/processed/daily/` | 18M | manifest + bundle |
| C | `data/model_ready/` | 3.6M | manifest + bundle |
| C | `models/models/price/*.joblib`（含 2 个 210MB） | 480M | **完全不进**（后端不需要） |
| D | `data/raw/`（PDF/影像/年鉴） | 1.8G | 不进（原始证据留在服务器/归档） |
| D | `data/research/` | 320M | 不进 |
| D | `archive/` | 475M | 不进（§65） |
| D | `reference/` | 370M | 不进；只迁「当前产品真正使用且许可安全」的少量内容（§66） |
| D | `AgriScope/node_modules`、`dist`、`output`、`catboost_info/`、`*.log`、`.pytest_cache` | ~350M | 不进 |

**结论**：进入 Git 的源码总量约 **5MB**（backend 200K + models 源码 ~1.1M + data 源码 ~2.0M + llm/scripts/tests/docs 新增），相对 4.0G 仓库几乎零成本。

---

## 3. 迁移步骤（§61 / §62 / §63 / §64）

均在同一分支 `feat/monorepo-v1` 上、用**普通 Git 操作**完成，不使用 `filter-branch` / `--force`：

1. `git checkout -b feat/monorepo-v1`（从 `AgriScope` 仓库的 `main`）。
2. **前端入位**：`git mv <frontend 顶层内容> frontend/`（用 `git mv` 保留可追踪历史，**不复制后删除**）。
   - 注意：`frontend/` 内部已有自己的 `server/`（已退役说明），随之一并移动。
3. **迁入后端**：把根仓库 `backend/` 的 30 个文件复制进 `backend/`（同路径，无需改动）；`backend/app/config.py` 的 ROOT 推导 `parents[2]` 在新结构下**仍然正确**（`backend/app/config.py → parents[2] = 仓库根`）。
4. **迁入模型源码**：`models/src`、`models/config`、`models/scripts`、`models/tests`、`models/docs`、`models/README.md`、`models/reports/final/`（小型清单，B 类）。
5. **迁入数据源码**：`data/daily`（含 tests）、`data/scripts`。
   > 审计风险 #8.5：这两处目前**不在任何 Git 中**，是本次迁移必须补入的项。
6. **新建 `llm/`**（见 `LLM_EVALUATION_DESIGN.md`），本轮只放设计骨架（代码在后续 Phase 实施）。
7. **`deploy/`**：由 `backend/deploy/` 提升为根级部署目录（systemd 单元、env 模板、nginx 示例）。
8. **`runtime/manifest.json`**：见 §6。
9. **迁入前逐项扫描**（§64）：secret / cache / 本机绝对路径 / 临时物 / 产物 —— 复用 `REPOSITORY_ASSET_AUDIT.md` §8 的扫描口径，作为门禁脚本。

---

## 4. 路径修复（§67 / §68）

### 4.1 建立 PROJECT_ROOT

统一解析顺序（所有入口一致）：

```text
1) 环境变量 PROJECT_ROOT（部署时显式设置，如 /opt/agriscope）
2) 否则由文件位置推导（Path(__file__).resolve().parents[N]）
3) 禁止任何 /Users/... 字面量
```

- 后端：`backend/app/config.py` 已有等价实现（`AGRISCOPE_ROOT` + 文件位置推导），保留并补充 `PROJECT_ROOT` 别名，保持向后兼容。
- 前端：`frontend/package.json` 的 `dev:api` 改为**仓库内相对路径**启动后端（§69）。
- Daily / data 脚本：改为 `PROJECT_ROOT` 解析。

### 4.2 硬编码路径清零（审计实测）

| 位置 | 命中 | 处置 |
|---|---|---|
| `models/src/decision_engine/common.py:12` | `ROOT = Path("/Users/morton_cheung/Desktop/比赛/大数据分析")` | **见 §5 决策点**（生产关键） |
| `data/scripts/`（53 文件、172 行） | 大量同类 ROOT 与 `cd /Users/...`（含 `run_all.py`） | 改为 PROJECT_ROOT 解析（非冻结代码，可直接改） |
| `data/daily/acceptance.py:52`、`tests/test_daily.py` | `MAC_TOKENS` 哨兵 | **保留**（故意用于检测泄露） |
| `backend/scripts/acceptance.py:35` | `MAC_TOKENS` 哨兵 | **保留**（同上） |

---

## 5. 决策点（需 owner 确认，§5 vs §68 的冲突）

**冲突**：`models/src/decision_engine/common.py` 是 Final Model **冻结代码**（其内容参与 `code_fingerprint=5a5d68232b747549` 的计算）；
但 §68 要求生产代码硬编码路径为 **0**。

| 方案 | 做法 | 优点 | 代价 |
|---|---|---|---|
| **方案 1（推荐）** | 把 `common.py:12` 改为 `ROOT = Path(os.environ.get("PROJECT_ROOT") or Path(__file__).resolve().parents[2])` | 一次性消除唯一的生产硬编码路径；换机/上服务器可用 | 改变 `code_fingerprint` → 需**重新声明**冻结指纹（`FINAL_RUN_META.json` 的 `code_fingerprint` 字段 + Daily `.source_fingerprint.json`）；**不涉及**重训、权重、算法、数据、pkl 内容 |
| 方案 2 | 不动 `common.py`，依赖运行时 `PROJECT_ROOT` 环境变量 + 后端进程内 patch（当前行为） | 冻结文件零改动 | 生产代码仍留 1 处硬编码路径，违反 §68；任何绕过后端的调用都可能踩坑 |

> 建议：**方案 1**，并按「**PORTABILITY_PATCH（可移植性补丁）**」而非「模型变更」记录：
> 明确声明「算法/权重/数据/产物 pkl 全部未变，仅路径解析方式改变，指纹因此重算」。
> 交叉验证要求（§118）：需第二人/第二次独立复算确认 `git_fingerprint()` 只随该文件变化，且 32 个 pkl 的 sha256 与 `FINAL_RUN_META.artifact_hashes` 全部不变。

---

## 6. runtime/manifest.json（§57 / §59）

大资产以 manifest 固定，字段：

```json
{
  "generated_from": "models/reports/final/FINAL_RUN_META.json",
  "model_version": "final_v1",
  "code_fingerprint": "5a5d68232b747549",
  "assets": [
    {"path": "models/models/final/沈阳_西红柿_h30_elasticnet_tuned.pkl",
     "sha256": "...", "size": 6480, "model_version": "final_v1",
     "required": true, "destination": "models/models/final/"}
  ]
}
```

要求：
- `sha256` 与 `size` 必须**实测**（回归 `FINAL_RUN_META.artifact_hashes` 校验）。
- 32 个 pkl **逐件**登记（审计显示体积极不均衡：2 个 extra_trees 占 54%）。
- Deep 校验脚本：`scripts/verify_assets.sh`（只读比对，不下载）。
- 恢复流程写入 `README.md`：`clone → 下载/拷贝 bundle → 校验 manifest → 启动`。

---

## 7. pkl 是否进 Git（§58）

| 事实 | 值 |
|---|---|
| 32 个 pkl 合计 | 77,491,442 B（≈73.9 MiB） |
| 最小/中位 | 6.3 KB |
| 最大 | 22.0 MB（`沈阳_黄瓜_h30_extra_trees.pkl`） |
| 2 个 extra_trees 占比 | ≈54% |

**建议：不进 Git，走 manifest + bundle。** 理由：二进制一旦进历史便永久增大 clone 体积且难以回收；而 74MB 中 54% 是 2 个可重建的树模型。若 owner 坚持入库，替代方案是用 Git LFS（引入额外依赖与配额成本，本设计不推荐）。

---

## 8. 根级脚本与前端脚本（§69 / §70 / §71 / §72）

根级（新建）：

```bash
scripts/dev.sh          # 启动后端(FastAPI) + 前端(Vite)，前后端同仓库内路径
scripts/test_all.sh     # frontend → backend → Final → Daily → Long-Horizon → LLM schema
scripts/acceptance.sh   # 一键正式验收（禁止训练）
```

前端（`frontend/package.json`）：

```jsonc
"dev":     "vite",
"dev:api": "python3 -m uvicorn backend.app.main:app --app-dir .. --host 127.0.0.1 --port 8787 --workers 1",
"test:api":"python3 ../backend/scripts/acceptance.py"
```

> 现状（`../backend`）在单仓库里变为**仓库内相对路径**，但语义仍是「从 `frontend/` 找到同仓库 `backend/`」——满足 §60「一个 clone 得到所有源码、README 不再指向仓库外」。
> 更干净的做法（实施时二选一，需交叉验证）：在根 `scripts/dev.sh` 里以 PROJECT_ROOT 启动，前端脚本仅作快捷方式。

---

## 9. .gitignore 设计（单仓库）

```gitignore
node_modules/
dist/
output/
__pycache__/
*.py[cod]
.pytest_cache/
.venv/
.DS_Store
*.log
.env
# 大资产（由 runtime/manifest.json 管理）
models/models/
models/data/
data/raw/
data/research/
data/processed/
data/model_ready/
archive/
reference/
catboost_info/
llm/cache/
```

> 注意：`models/reports/final/`（1.6M 清单）与 `models/src|config|scripts|tests|docs` 要**保留在 Git 中**，不要被 `models/models/`、`models/data/` 的规则误伤。

---

## 10. 旧仓库退役流程（§110 / §111）

1. monorepo `feat/monorepo-v1` 完成全部验证（§73：Frontend 299+ / Backend 24+ / Final 38/38 / Daily 33/33）。
2. 合入 `main` 并 **push** `MortonCheung/AgriScope`。
3. 校验 `runtime/manifest.json`（`scripts/verify_assets.sh` 通过）。
4. 之后才允许把 `/大数据分析/.git` 标记为 **RETIRED**（写一个 `RETIRED.md` 说明）。
5. **永不** `rm -rf .git`；在 v1.0 正式发布前保留为安全备份。

---

## 11. 版本与发布（§114）

- monorepo 合并完成后打 **`v1.0.0-rc1`**。
- **不**直接打 `v1.0.0`；待部署 + 生产验收完成后才正式发 `v1.0.0`。

---

## 12. 执行顺序（与 §99 Phase 0–6 对应）

| Phase | 内容 | 产出/门禁 |
|---|---|---|
| 0 | 全项目只读扫描 | 本目录 4 份审计/设计文档 |
| 1 | Repository Asset Audit | `REPOSITORY_ASSET_AUDIT.md` ✅ 已完成 |
| 2 | 单仓库迁移设计 | 本文件 |
| 3 | 建 `feat/monorepo-v1` | 分支建立 + 空提交基线 |
| 4 | Frontend/Backend/Model/Daily 源码统一 | `git mv` + 复制，迁移扫描门禁通过 |
| 5 | 路径修复 | §4 清单清零（含 §5 决策点落地） |
| 6 | 全旧系统回归 | Frontend 299+ / Backend 24+ / Final 38/38 / Daily 33/33 **全绿** |

> Phase 7–21（Long-Horizon + LLM）见 `LONG_HORIZON_CONSTRUCTION_PLAN.md`。
> **本轮不部署**；部署留待下一轮。

---

## 13. 风险与不确定项

1. **§5 决策点未定**：`common.py` 是否打可移植性补丁，会改变 `code_fingerprint`；建议按 PORTABILITY_PATCH 处理并需 owner 确认。
2. **`git mv` 到 `frontend/` 的路径耦合**：前端内部可能引用 `../` 相对路径（需在 Phase 4 用 grep 全量核对，当前未逐一验证 → UNKNOWN）。
3. **`data/scripts/` 53 个脚本的硬编码路径**：改动量大，需逐个替换并用回归验证（`run_all.py` 幂等重建）。
4. **`reference/` 许可安全**：只迁当前产品真正使用的内容；具体白名单待定 → UNKNOWN。
5. **`models/models/price/*.joblib`（480M）是否被非后端流程读取**：审计判为不需要；若未来长期层复用旧 price 产物，需重新评估。
6. **远端只有 `MortonCheung/AgriScope`**：不得新建第二个正式远端（§54）；根仓库 `/大数据分析/.git` 仅作本地备份直至退役。