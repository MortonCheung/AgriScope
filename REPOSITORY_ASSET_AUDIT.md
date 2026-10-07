# AgriScope 仓库资产审计报告（只读）

- 审计对象：`/Users/morton_cheung/Desktop/比赛/大数据分析`
- 审计时间：2026-10-07
- 审计方式：只读 shell 测量（`du` / `find` / `stat` / `grep` / `git ls-files`），未修改任何文件
- 测量口径：macOS BSD `du -sh`（按块计费，可能与逻辑字节数略有出入）；文件数为 `find -type f` 计数

> 说明：本报告所有数字均来自真实命令输出。凡无法确认的项均标注 UNKNOWN。

---

## 1. 顶层体积概览

| path | files | size |
|---|---|---|
| `AgriScope/`（含 node_modules） | 14705 | 349M |
| `backend/` | 34 | 200K |
| `models/` | 613 | 711M |
| `data/` | 24537 | 2.1G |
| `reference/` | 8585 | 370M |
| `archive/` | 2000 | 475M |
| `catboost_info/` | 4 | 76K |
| `.pytest_cache/`（根） | 5 | 28K |
| `.git/` | — | 312K |
| 根级文件（README/RUNTIME_ASSETS/PROJECT_STATUS/FINAL_INTEGRATION_MERGE_REPORT/.gitignore/.DS_Store） | 6 | 28K |
| **仓库合计 `.`** | — | **4.0G** |

补充明细：

- `AgriScope/`：`node_modules` 307M、`output` 21M（playwright 产物）、`dist` 2.4M、`src` 1.4M、`public` 836K、`docs` 228K、`sources` 160K、`package-lock.json` 132K、`scripts` 84K，其余为配置/说明文件。排除 `node_modules` 文件数 2234，`node_modules` 内 12471。
- `models/` 子目录：`models/price` 480M、`models/final` 74M、`data/snapshots` 78M、`data/features` 23M、`data/processed` 19M、`evaluation` 33M、`outputs` 1.7M、`reports` 1.6M、`src` 680K、`scripts` 296K、`tests` 92K。
- `data/` 子目录：`raw` 1.8G、`research` 320M、`processed` 24M、`metadata` 16M、`model_ready` 3.6M、`scripts` 1.8M、`daily` 192K、`reports` 60K。
- `reference/`：`design-references` 357M、`iTeach` 13M。
- `archive/`：`old_marts` 264M、`historical` 76M、`backups` 74M、`migration` 24M、`data_reports` 13M、`build_artifacts` 10M、`audits` 10M、其余 <2M。

根级文件大小：`.DS_Store` 10244B、`FINAL_INTEGRATION_MERGE_REPORT.md` 10913B、`PROJECT_STATUS.md` 6782B、`RUNTIME_ASSETS.md` 3737B、`README.md` 3038B、`.gitignore` 857B。

---

## 2. 最大文件 Top 20

（排除 `AgriScope/node_modules` 内部；按字节降序）

| # | size | path |
|---|---|---|
| 1 | 210.2 MB | `models/models/price/韭菜_extra_trees_pooled.joblib` |
| 2 | 210.2 MB | `models/models/price/黄瓜_extra_trees_pooled.joblib` |
| 3 | 91.2 MB | `archive/old_marts/marts/fact_price_observation.csv` |
| 4 | 76.9 MB | `data/research/shenyang/case_studies/shenbei_2026_rainstorm_corn/02_raw/landcover/ESA_WorldCover_10m_2021_N42E123.tif` |
| 5 | 59.7 MB | `archive/old_marts/marts/fact_price_city.csv` |
| 6 | 58.6 MB | `models/models/price/韭菜_extra_trees_tuned_pooled.joblib` |
| 7 | 49.3 MB | `data/raw/web_captures/jinzhou/policy/round3/nync_ln_2024_xczx_pdf_retry.pdf` |
| 8 | 42.7 MB | `data/research/shenyang/case_studies/shenbei_2026_rainstorm_corn/02_raw/terrain/Copernicus_DSM_30m_N42E123.tif` |
| 9 | 29.6 MB | `data/raw/web_captures/shenyang/district_production/bulletins/辽中区/yearbook_2020_b54e92fd41.pdf` |
| 10 | 27.0 MB | `data/raw/web_captures/shenyang/district_production/bulletins/沈北新区/yearbook_2023_dccb624d8e.pdf` |
| 11 | 25.6 MB | `reference/design-references/lottie-web/.git/objects/pack/pack-dbc23ec7f33ebd42382532284a5229c5810be978.pack` |
| 12 | 25.2 MB | `data/raw/decision_engine_supplement_v3/production/liaozhong_2022_tjnj.pdf` |
| 13 | 23.5 MB | `archive/old_marts/staging/jinzhou_price_ocr.csv` |
| 14 | 21.0 MB | `models/models/final/沈阳_黄瓜_h30_extra_trees.pkl` |
| 15 | 20.8 MB | `data/research/shenyang/case_studies/shenbei_2026_rainstorm_corn/05_analysis/10_parallel_research/M2_STABILITY_MAP.geojson` |
| 16 | 19.7 MB | `reference/design-references/video-shotcraft/remotion/out/iteach-promo.mp4` |
| 17 | 18.8 MB | `reference/design-references/lottie-web/build/extension/bodymovin.zxp` |
| 18 | 18.8 MB | `models/models/final/朝阳_黄瓜_h7_extra_trees.pkl` |
| 19 | 16.2 MB | `data/research/shenyang/case_studies/shenbei_2026_rainstorm_corn/04_marts/M2_spatial_dataset.gpkg` |
| 20 | 16.0 MB | `archive/old_marts/marts/city_crop_week_panel.csv` |
| 21 | 15.8 MB | `models/data/snapshots/v1/city_data/dalian/data/price_observation.csv` |
| 22 | 15.8 MB | `data/raw/retained_source/city_data/dalian/data/price_observation.csv` |
| 23 | 15.8 MB | `archive/backups/round3_merge_20260923_125411/dalian__price_observation.csv` |
| 24 | 15.3 MB | `models/data/processed/decision_dataset_v1.csv` |
| 25 | 15.0 MB | `data/research/shenyang/case_studies/shenbei_2026_rainstorm_corn/06_models/M2_waterlogging_spatial/models/M2R_reconstruction.gpkg` |

> 注：为便于核对保留了 25 行（第 21–25 名）。真正的“Top 20”为第 1–20 行。

---

## 3. 模型产物 pkl 审计

目录：`models/models/final/`，`*.pkl` 共 **32 个**。

| 指标 | 字节 | 可读 |
|---|---|---|
| 最小 | 6,472 | 6.3 KB |
| 中位数 | 6,479 | 6.3 KB |
| 最大 | 22,030,584 | 21.0 MB (21,514.2 KB) |
| 合计 | 77,491,442 | 73.9 MB |

分布特征（按量级聚集）：

- **20 个** elasticnet 系 `~6.3 KB`（6472–6482 B）：`沈阳_*_h{7,14,30}_elasticnet[_tuned].pkl`、`朝阳_韭菜/茄子_*_elasticnet_tuned.pkl` 等。
- **4 个** catboost `~450–462 KB`：`朝阳_{黄瓜,青椒,芸豆,土豆}_h30_catboost.pkl`。
- **6 个** extra_trees_tuned `~5.5 MB`：`{朝阳,沈阳}_*_h{14,30}_extra_trees_tuned.pkl`。
- **2 个** extra_trees 最大件：`沈阳_黄瓜_h30_extra_trees.pkl` 22,030,584 B、`朝阳_黄瓜_h7_extra_trees.pkl` 19,701,815 B。

结论：体积高度不均衡，**2 个 extra_trees 文件即占 41.9 MB（占 32 个 pkl 总量的 ~54%）**，是运行时集合里唯一的体积大头。

---

## 4. 后端运行时必需集合体积

| path | files | size |
|---|---|---|
| `models/src` | 60 | 680K |
| `models/reports/final` | 81 | 1.6M |
| `models/models/final` | 32 | 74M |
| `models/data/snapshots/final_v1` | 22 | 9.5M |
| `data/processed/daily` | 40 | 18M |
| `data/model_ready` | 20 | 3.6M |
| **必需集合合计** | **255** | **≈107M** |

补充说明：

- `models/reports/final` 中含 `tables/` 1.4M、`FINAL_MODEL_REGISTRY.csv` 36K、`_clean_repro.log` 32K、`FINAL_RUN_META.json` 12K 及若干报告 md/csv。
- `data/processed/daily` 含 `daily_market_price.csv` 5.9M、`features_daily.csv` 1.6M、`features_daily.parquet` 628K、`final_input/extended_snapshot/`（约 9.6M，含 `datasets/decision_dataset_{沈阳,朝阳}.parquet`）、`market_signal.json`、`qc_daily.csv` 等。
- `data/model_ready` 含 `chaoyang_extended/`、`shenyang_core/`、`jinzhou_extended/`、`climate/`、`hri/`、`profit/`、`recommendation/`、`FEATURE_SOURCE_MAP.csv`。
- 另有 `data/daily`（192K，17 文件）为 daily 管道**源码**目录（`acceptance.py`、`tests/` 等），未在上述必需运行时集合中，但属于源代码范畴（见第 8 节风险）。

> 结论：后端运行真正需要的大体积资产 = `models/models/final`（74M）+ `data/processed/daily`（18M）+ `models/data/snapshots/final_v1`（9.5M）+ `data/model_ready`（3.6M）+ 小型清单/源码（约 2.3M），**总计约 107M**，相对仓库 4.0G 只占 ~2.7%。

---

## 5. 资产分类（A/B/C/D）

分类定义：**A**=源码必须进 Git；**B**=体积合理的小型运行时资产可考虑进 Git；**C**=大型运行时资产不进 Git（用 manifest/release bundle 管理）；**D**=原始/归档不进 Git。

| path | size | category | tracked? | runtime_required? | reason |
|---|---|---|---|---|---|
| `backend/` | 200K | A | 是（根仓库 30 文件） | 是 | 正式后端源码/部署/契约 |
| 根级文档 `.gitignore` `README.md` `RUNTIME_ASSETS.md` `PROJECT_STATUS.md` `FINAL_INTEGRATION_MERGE_REPORT.md` | 28K | A | 是（各 1 文件） | 否 | 工程说明与运行时清单索引 |
| `data/scripts/` | 1.8M | A | **否**（`/data/` 被忽略） | 否 | 数据管道源码，当前未入库（风险见 §8） |
| `data/daily/` | 192K | A | **否**（`/data/` 被忽略） | 否 | daily 管道源码+测试，当前未入库（风险见 §8） |
| `models/src/` | 680K | A | 否（`/models/` 被忽略） | 是 | 决策引擎源码，被后端 import |
| `models/config/` | 16K | A | 否 | 是 | yaml 配置 |
| `models/scripts/` `models/tests/` `models/README.md` `models/docs/` | ~430K | A | 否 | 否 | 源码/文档 |
| `AgriScope/src` `server` `public` `scripts` `sources` `docs` + 配置/`package.json`/`package-lock.json` | ~3.0M | A | 否（根仓库忽略；由独立仓库追踪） | 否 | 前端源码，归 `MortonCheung/AgriScope` |
| `models/reports/final/` | 1.6M | B | 否 | 是 | 小体积运行时清单/报告，可选入库或随 release bundle |
| `models/models/registry/` | 64K | B | 否 | 否 | 模型注册表，小体积 |
| `catboost_info/` | 76K | D | 否 | 否 | catboost 训练日志/临时目录 |
| `models/models/final/` | 74M | C | 否 | 是 | 32 个生产 pkl，体积大，必须用 manifest/bundle |
| `models/data/snapshots/final_v1/` | 9.5M | C | 否 | 是 | 运行时快照数据 |
| `data/processed/daily/` | 18M | C | 否 | 是 | daily 运行时输入/输出 |
| `data/model_ready/` | 3.6M | C | 否 | 是 | 模型就绪特征 |
| `models/models/price/` | 480M | C | 否 | 否 | 价格训练产物（非后端必需） |
| `models/data/snapshots/`（除 final_v1） | 78M | C | 否 | 否 | 历史快照 |
| `models/data/features/` `processed/` | 42M | C | 否 | 否 | 中间特征/数据集 |
| `models/evaluation/` | 33M | D | 否 | 否 | 评估产物 |
| `models/outputs/` | 1.7M | C | 否 | 否 | 训练输出 |
| `data/raw/` | 1.8G | D | 否 | 否 | 原始采集（PDF/影像等） |
| `data/research/` | 320M | D | 否 | 否 | 研究案例原始数据 |
| `data/processed/`（除 daily） | 6M | C | 否 | 否 | 处理后中间数据 |
| `data/metadata/` `data/reports/` | 16M | D | 否 | 否 | 元数据/报告 |
| `reference/` | 370M | D | 否 | 否 | 第三方设计参考/素材 |
| `archive/` | 475M | D | 否 | 否 | 历史归档/备份 |
| `AgriScope/node_modules/` | 307M | D | 否（被 AgriScope `.gitignore` 忽略） | 否 | 依赖目录 |
| `AgriScope/dist/` | 2.4M | C | 否（被忽略） | 否 | 前端构建产物 |
| `AgriScope/output/` | 21M | D | 否（被忽略） | 否 | playwright 测试日志/产物 |
| `.pytest_cache/`（根/backend/models） | 60K | D | 否（被忽略） | 否 | 缓存 |
| `*.log`（152 个） | 2.8M | D | 否（被忽略） | 否 | 日志（多位于 AgriScope/output） |

---

## 6. 建议纳入 Git 的最小集合

基于“源码与清单进 Git、大体积资产走 bundle”的既有基线：

1. **后端源码与契约**：`backend/`（已追踪）。
2. **根级工程文档与清单**：`README.md`、`RUNTIME_ASSETS.md`、`PROJECT_STATUS.md`、`FINAL_INTEGRATION_MERGE_REPORT.md`、`.gitignore`（已追踪）。
3. **模型侧源码（强烈建议补入）**：`models/src/`、`models/config/`、`models/scripts/`、`models/tests/`、`models/README.md`、`models/docs/`。
4. **数据侧管道源码（强烈建议补入）**：`data/scripts/`、`data/daily/`。
5. **小型运行时清单**：`models/reports/final/`、`models/models/registry/`（B 类，可入库或随 bundle）。
6. **前端**：不进入根仓库，由独立仓库 `MortonCheung/AgriScope` 管理，根仓库通过 `RUNTIME_ASSETS.md` 记录其 commit 固定。

> 最小集合（不含前端）源码体积约 **4.9MB**（backend 200K + models/src 680K + models 其他源码 ~430K + data/scripts 1.8M + data/daily 192K + reports 1.6M + registry 64K），对 4.0G 仓库几乎无成本。

---

## 7. 必须用 runtime manifest 管理的资产

以下资产为后端运行必需、但体积不宜进 Git，应由 deployment bundle / manifest 固定版本与校验和：

| 资产 | size | 管理方式建议 |
|---|---|---|
| `models/models/final/*.pkl`（32 个） | 74M | bundle + manifest（记录相对路径、字节数、sha256） |
| `models/data/snapshots/final_v1/` | 9.5M | bundle + manifest |
| `data/processed/daily/` | 18M | bundle + manifest（含 `latest`/snapshot 语义） |
| `data/model_ready/` | 3.6M | bundle + manifest |
| `models/reports/final/`（清单/表） | 1.6M | 可入 Git，或随 bundle 发布 |

现状：`RUNTIME_ASSETS.md`（根，3737B）已作为清单索引存在，但其是否含 sha256/字节数校验需人工确认（本审计未解析其内容 → 校验字段 UNKNOWN）。

---

## 8. 风险清单

### 8.1 Secret / 凭据
- **未发现任何真实密钥**。
- `.env` 实际文件：**0 个**；仅发现 5 个模板：
  `AgriScope/.env.example`、`backend/.env.example`、`data/daily/.env.example`、`archive/historical/research-reference-projects/gpt-researcher/.env.example`、`reference/design-references/ponytail/.env.example`。
- 证书/私钥（`*.pem`/`*.key`/`*.p12`/`*.pfx`/`*.crt`/`id_rsa*`）：**0 个**。
- 源码关键字扫描（`api_key|token|password|secret`）：命中均为**误报**，语义是“数据 token/设计 token/测试哨兵”，非凭据。典型：
  - `backend/tests/test_e2e.py`（`NaN`/`Infinity` token 校验）、`backend/scripts/acceptance.py`（`MAC_TOKENS`/`FORBIDDEN_TOKENS` 哨兵表）
  - `models/src/decision_engine/final/audit.py`（`bad_tokens` 数据校验集合）
  - `data/daily/acceptance.py`、`data/daily/tests/test_daily.py`（哨兵表）
  - `data/scripts/` 8 个文件（价格解析“token/字段 token”）
  - `AgriScope/src/` 32 个文件（design token，如 `design/sceneTokens.ts`）
- `data/daily/.env.example` 明确注释：“真实 secret 不要提交到版本库；本数据源为公开接口，无 API Key / Cookie / 密码。”

### 8.2 硬编码本机绝对路径（真实风险）
统计范围：`backend/`、`models/src/`、`data/daily/`、`data/scripts/`。

| 目录 | 命中文件数 | 命中行数 | 说明 |
|---|---|---|---|
| `models/src/` | 1 | 3 | **`models/src/decision_engine/common.py:12` `ROOT = Path("/Users/morton_cheung/Desktop/比赛/大数据分析")`** —— 生产源码硬编码，**高优先级风险**；此前已知项，本次确认 models/src 内**无其他文件**硬编码 |
| `data/scripts/` | 53 | 172 行 | 大量 `ROOT = Path("/Users/morton_cheung/Desktop/比赛/大数据分析")`（含 `run_all.py`、`crop_lexicon.py` 等）、`v3_wrapup.sh` 内 `cd /Users/...`。为数据管道脚本，迁移/换机即失效 |
| `data/daily/` | 2 | 2 | `acceptance.py:52`、`tests/test_daily.py` 的 `MAC_TOKENS` 哨兵表（**故意**用于检测泄露，非真实依赖） |
| `backend/` | 1 | 1 | `backend/scripts/acceptance.py:35` `MAC_TOKENS = ["/Users/", "morton_cheung", "/Desktop/"]`（**故意**哨兵） |

分模式命中（4 目录合计）：
- `/Users/morton_cheung`：53 个文件、58 处
- `Desktop`：56 个文件、61 处
- `大数据分析`：54 个文件、59 处

**核心结论：真正的硬编码依赖集中在 `models/src/decision_engine/common.py`（生产路径，唯一且关键）与 `data/scripts/`（53 个管道脚本）；`backend/`、`data/daily/` 的命中是安全哨兵，属预期行为。**

### 8.3 缓存 / 临时物
| 类型 | 数量 | 体积 | 备注 |
|---|---|---|---|
| `__pycache__` | 0 | 0 | 全仓库（含 node_modules）为 0 |
| `*.pyc` | 0 | 0 | — |
| `.pytest_cache` | 3 目录（`./`、`backend/`、`models/`） | 60K | 已被根 `.gitignore` 忽略 |
| `*.log` | 152 文件 | 2.8M | 多位于 `AgriScope/output/playwright`（被 AgriScope `.gitignore` 忽略） |
| `*.tmp` | 0 | 0 | — |
| `node_modules` | 8 个目录（顶层 1 + 嵌套 7） | 307M | `AgriScope/node_modules`，被忽略 |
| `dist` | 4 个目录 | `AgriScope/dist` 2.4M + reference 内 3 个 | `AgriScope/dist` 被忽略 |

### 8.4 大文件
- 单文件 >200MB：**2 个** `models/models/price/{韭菜,黄瓜}_extra_trees_pooled.joblib`（各 210.2MB，共 420MB）。
- 单文件 50–100MB：4 个（archive 2 个、data tif、price joblib）。
- 顶层单目录最大：`data/` 2.1G、`archive/` 475M、`reference/` 370M、`AgriScope/node_modules` 307M。
- `reference/design-references/lottie-web/.git/…pack` 25.6MB —— **第三方参考目录内嵌套 `.git`**，属应清理项。

### 8.5 工程结构风险
- **源码位于被忽略目录**：`data/scripts/`（1.8M）与 `data/daily/`（192K）为源码，却落在被 `/data/` 整体忽略的路径下，**当前未进任何 Git 仓库** → 有丢失风险。
- **嵌套独立仓库**：`AgriScope/` 自身是 git 仓库（含 `.git`）；`reference/design-references/lottie-web/` 也含 `.git`。根仓库已用 `/AgriScope/` 忽略前者；后者仍可能造成误提交或体积膨胀。

---

## 9. 结论与不确定项

### 结论
1. 仓库实测 4.0G；后端运行真正需要的资产约 **107M（~2.7%）**，集中在 `models/models/final`（74M）、`data/processed/daily`（18M）、`models/data/snapshots/final_v1`（9.5M）、`data/model_ready`（3.6M）。
2. 根仓库工作流正确：仅追踪 `backend/`（30 文件）+ 5 个根文档 + `.gitignore`，共 35 个文件；大体积 `models/`、`data/`、`reference/`、`archive/`、`catboost_info/`、`AgriScope/` 均被忽略。
3. **无真实 secret**；硬编码本机路径的真实风险点只有 2 处：`models/src/decision_engine/common.py`（生产关键）与 `data/scripts/` 53 个脚本；`backend/`、`data/daily/` 的命中是安全哨兵。
4. 32 个 pkl 体积极度不均衡，2 个 extra_trees 文件占其中 ~54%，适合 manifest 逐件校验。
5. 缓存/临时物体积可控（`*.log` 2.8M、`.pytest_cache` 60K、`node_modules` 307M、`output` 21M 均在忽略范围内）。

### 不确定项（UNKNOWN）
- **`RUNTIME_ASSETS.md` 内容**：未解析其是否包含 pkl/快照的 sha256 与字节数校验字段 → 校验完备性 **UNKNOWN**。
- **`AgriScope` 独立仓库的真实追踪/提交状态**：本次只读根仓库与文件系统，未进入 `AgriScope/.git` 做 commit 级核对；其 remote、当前 commit、实际 tracked 清单 **UNKNOWN**（背景中“remote=github.com/MortonCheung/AgriScope”按已知背景采信）。
- **`models/models/price`（480M）是否被任何非后端流程运行时读取**：按“后端运行时仅读 `models/models/final`”的已知背景判定为**非运行时必需**；若存在其他消费方则需复核。
- **`du` 块计费差异**：macOS `du` 按块统计，与文件逻辑字节总数略有出入（如背景称 models≈744MB，本次 `du -sh` 得 711M；data≈2.2GB，本次得 2.1G）。差异源于口径，非数据缺失。
- **`reference/` 与 `archive/` 的内部逐文件构成**：仅统计到一级子目录级，未逐文件枚举。