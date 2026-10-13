# AgriScope · 穹衡

面向**辽宁农业市场与种植决策**的数据分析与决策辅助平台。它把气象、批发市场价格、产量与区县生产结构
放进同一条证据链，回答三个问题：**现在市场处在什么状态**（看现在）、**给定条件下该不该种、怎么卖**（帮判断）、
**这个判断有什么依据**（证明依据）。

唯一正式仓库：[MortonCheung/AgriScope](https://github.com/MortonCheung/AgriScope)。
一次 clone 得到前端、后端、模型/管线源码、契约、部署与验收脚本。**运行时数据与模型资产不在源码里**：
它们由 `pipelines/publishing/` 从研发态的 `data/`、`models/` 挑选生成到 `runtime/`，并登记在
`runtime/manifest.json`；产品只读 `runtime/`。

## 四个产品入口

一级导航为主页、决策、报告、关于（定义见 `frontend/src/app/navItems.ts`）。

- **主页** `/liaoning`：辽宁空间地图、六城价格概览和功能入口。展示已发布真实价格，支持商品及批发、超市、集市口径切换；按统一规则补齐展示，保留实际观测日期。
- **决策** `/decision`、`/cities/:cityId/decision`：选择城市并直接输入经营条件，盈亏核算即时更新；已验证的模型建议按现有接口参与结果。
- **报告** `/reports`：城市与综合入口工作台。城市按钮只展开目录，选择正式研究主题或研究点才进入交互内容；完整文章和城市全文保留为次级视图。
- **关于** `/about`：项目介绍、数据来源、方法与指标定义。

旧研究地址继续兼容。被发布清单排除的深链会替换为同城有效研究，并保留作物、参考日期和周期条件。

## 核心能力

- **短期预测 7 / 14 / 30 天**：`POST /api/decision`（Final Model `final_v1`），同时给出区间与风险项。
- **长期情景 30–180 天**（30/60/90/120/150/180）：`POST /api/forecast/long-horizon`，双目标
  `cycle_market_average`（周期市场均价）与 `harvest_market_price`（选定销售窗口价），只读预生成快照。
- **风险剖面**：由真实数值派生的横向条，每条都附「为什么 / 来源 / 研究链接」，不追加主观判断。
- **情景模拟（现实 vs 模拟）**：左「现实世界」= `/api/daily/latest` 的已发布观测；右「模拟世界」=
  `/api/forecast/long-horizon` 的情景估计。只调整模型真正支持的变量（作物 × 评估跨度），
  现实数据与用户假设不混为一谈。
- **六城研究 / Cross-city / Synthesis**：沈阳、朝阳、锦州、大连、丹东、铁岭六城，以及跨城市比较与
  六城综合专题；逐条给出研究问题、方法、数据与局限。跨城页与综合专题是研究中心的视图，无独立路由。
- **Evidence Drawer**：推入式证据抽屉，主页面不离开、不跳路由，把每个数字连回研究正文与来源。
- **空间观察与六城经营**：初始全省概览、连续城市选择、真实生产/历史气候观测、用户条件盈亏核算与敏感性比较。开场沿真实地图完整环绕一周，支持跳过与减少动效。
- **上市窗口决策**：`POST /api/decision/long-horizon`（契约 v2）。用户给城市、面积、预算、风险偏好、
  作物、实际成本/亩产与预计上市跨度或日期；日期必须精确对应已登记跨度，**不静默选取最近档位**。

## 仓库结构

- `frontend/`：React 19 + Vite 7 产品前端（空间观察 + 六城经营 + 研究证据层）。
- `backend/`：唯一 FastAPI 后端（短期 Final、Daily、长期只读推理与决策、研究只读产物）。
- `pipelines/`
  - `data_foundation/`：raw → processed → model_ready 数据处理与治理；
  - `daily/`：每日价格采集、更新、Daily 特征与信号；
  - `modeling/`：`decision_engine` 源码、训练/调参/评估脚本与测试；
  - `long_horizon/`：V2 目标研究、标签成熟清洗、Registry、评估与显式重训；
  - `research/`：六城与跨城市正式可复现研究；
  - `publishing/`：从外层 `data/`、`models/` 挑选正式资产生成 `runtime/`（见「`runtime/` 与 `publishing`」）。
- `runtime/`：产品运行时最小资产快照，`manifest.json` 登记发布项；产品只读此处。
- `llm/`：真实 Provider、匿名归一化上下文、严格校验、缓存与实验；其 `llm/artifacts/v2/` 三份评估证据是发布资产。
- `deploy/`：systemd、20:30/23:30 timer、nginx、环境模板与操作说明（见 `deploy/README.md`）。
- `scripts/`：启动、全量测试、完整验收、Daily 编排、独立指标重算、资产/发布审计与密钥扫描。
- `frontend/docs/`：前端设计、审计与迁移文档；`frontend/docs/ITEACH_MIGRATION_MATRIX.md` 记录迁移分类与
  本轮 `src/legacy/` 清理。
- 工程文档：`docs/ARCHITECTURE.md`、`docs/API.md`；模型与局限报告在 `docs/models/`；
  `docs/archive/rc1/` 是已被取代的历史报告，**不能作当前结论**。

## 安装

```bash
git clone https://github.com/MortonCheung/AgriScope.git
cd AgriScope
python3 -m venv .venv
.venv/bin/pip install -r backend/requirements.txt
cd frontend && npm ci && cd ..
```

源码 clone **不含**运行时数据与模型权重。把运行时资产包解到仓库根后校验清单：

```bash
.venv/bin/python scripts/verify_assets.py
```

## 运行

两个终端。后端是唯一 FastAPI，固定端口 **8787**、单 worker；前端 Vite dev server 把 `/api` 代理到 8787。

```bash
# 终端 1 · 后端
.venv/bin/python -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8787 --workers 1
# 等价快捷脚本（本地开发）
./scripts/dev.sh

# 终端 2 · 前端
cd frontend && npm run dev
```

前端另有 `npm run build`（← `tsc -b` + `vite build` + 生产边界检查 + `verify:ui`，产出 `frontend/dist/`）
与 `npm run preview`（本地预览 dist）。两个终端打开 Vite 给出的地址即可。服务器配置见 `deploy/README.md`。

后端在**启动时一次性绑定**运行时快照；推理有锁，保持单 worker。因此 Daily 更新数据后需**重启后端**以重新绑定。
`actual_method`、`fallback_used`、`LONG_HORIZON_STALE`、Daily 延迟、LLM 不可用都会显式传给前端；
长期或 LLM 失败**不会**关闭短期与 Daily。

### `runtime/` 与 `publishing`

`runtime/manifest.json` 由 `pipelines/publishing/publish_runtime.py` 生成，登记 **21 个发布项**
（字段：`source` / `destination` / `description` / `status`）。先生成研究和首页行情产品件，再登记运行资产：

```bash
# 1) 研究产品件：从 monorepo 根 data/research 按选择发布到 runtime/research/product/ 与 research_catalog.json
python3 pipelines/publishing/publish_research.py

# 2) 首页行情：仅选择8商品的有效真实价格与血缘，发布runtime载荷及同内容前端首屏快照
python3 pipelines/publishing/publish_market_display.py

# 3) 运行资产：从根 data/、models/ 发布模型、Daily、长期与 LLM 证据，并登记上述产品件
python3 pipelines/publishing/publish_runtime.py
```

发布不删除或修改源数据。研究完整源在 monorepo 根 `data/research`，运行时副本在 `AgriScope/runtime/`。
首页接口 `/api/market/display` 只读紧凑发布件，原严格 `/api/market/observations` 保持研究和决策语义。
商品、类型与城市切换使用完整缓存；接口失败时保留已验证的发布快照。采集时间和观测日期沿来源保留，补齐路径与口径差异存于后台血缘，不用当前发布时刻替换历史日期。
发布器同时支持已提供的采集观测 SQLite 快照：默认读取外层 `data/raw/market_feed/42ef2fd/market-feed-sevenday.sqlite`，也可传 `--feed-db <快照路径>`；旁置 `provenance.json` 必须记录匹配的 SHA256。数据库以只读方式读取，逐条验证身份、内容哈希、来源、单位和采集任务；原始数据库不进入运行包。新观测与既有来源沿同一四级规则选择，同来源与规格的历史才可计算涨跌。单期卡片显示“最新”，平均变动仅统计有实际前次观测的商品。
发布项的路径与含义见 `docs/ARCHITECTURE.md`。

## 测试与验收

```bash
# 前端
cd frontend
npm run typecheck          # tsc -b
npm run test:unit          # vitest run；实际测试计数以本次输出为准
npm test                   # vitest + verify:v2（研究载荷）+ verify:integrity（研究完整性）
npm run build              # tsc -b + vite build + verify-production-boundary + verify:ui（禁用字样须为 0）
npm run preview            # 预览 dist

# 后端
python3 -m pytest backend/tests -q

# 全层（只读校验 + 各层验收；禁止训练）
./scripts/acceptance.sh
./scripts/test_all.sh      # 更全：前端 typecheck+test+build + 各层 pytest + 独立指标重算
```

`scripts/acceptance.sh` 依次跑：0 运行时资产清单校验 → 1 Backend 验收 → 2 Final Model 验收 →
3 Daily 验收 → 4 Long-Horizon 一致性门禁 → 5 各层 pytest 与独立指标重算，最后打印 `ACCEPTANCE_PASS`。
完整验收**不训练**；各指标由代码/预测记录重算，不采信历史报告的 PASS。发布时重新生成并校验运行时清单：
`python3 pipelines/publishing/publish_runtime.py` 后 `python3 scripts/verify_assets.py`。
密钥扫描：`python3 scripts/secret_scan.py`（须为 `SECRET_SCAN_CLEAN`）。

## API（唯一后端）

```text
GET  /health                                 存活探针
GET  /health/ready                           就绪探针（真检查：快照 / 数据集 / 模型 / Daily）
GET  /api/meta                               版本矩阵（model / daily / runtime / backend）
GET  /api/capabilities                       城市决策能力（作物 × 跨度）
GET  /api/decision/capabilities              同上（兼容别名）
POST /api/decision                           短期 Final 推理（评估 / 压力，契约 v1）
POST /api/decision/evaluate | /rank | /stress  同族别名
GET  /api/daily/latest?city=shenyang         Daily 市场脉搏最新快照（schema 1.1.0）
GET  /api/forecast/capabilities?crop=…       长期可用跨度与生产状态
POST /api/forecast/long-horizon              长期预测（crop / horizon_days，双目标）
POST /api/decision/long-horizon              上市窗口种植决策（结构化契约 v2）
GET  /api/research/catalog                   研究总索引（轻量，不含正文）
GET  /api/research/cities                    已发布研究城市与模块概况
GET  /api/research/llm-evaluation            LLM 回溯评估证据（真实产物派生，只读）
GET  /api/research/{city}/manifest.json      城市研究清单
GET  /api/research/{city}/articles/{id}.json 研究模块正文
GET  /api/research/{city}/tables/{file}      研究数据表（CSV，按需加载）
```

完整字段与请求/响应示例见 `docs/API.md`。`/api/decision` 的 `data_status` 只允许
`model` / `mock` / `legacy_model_fixture`；正式 HTTP 通道**拒绝**把历史样例（mock / legacy）伪装成模型结果。

## 前端交互验收边界

- 页面纸面转场等待实际 DOM 提交，冷加载期间保留旧纸面的关闭遮罩；内部报告选择和条件变化保持工作台 DOM。
- 下拉控件共用 combobox/listbox，支持方向键、Home/End、Enter、Escape 和中文检索。图表放大使用原生 dialog 顶层与同一组 SVG 节点；Escape 先关闭下拉，再关闭放大视图。
- 图例只控制真实数据系列；时间范围只对有效的实际时间轴提供，不补齐研究点或生成数值。无 JavaScript 时提供六城静态报告下载入口。
- 验收覆盖七种屏幕宽度、六城图表、连续 20 次报告切换与决策输入、减少动画及无 WAAPI。浏览器自动化与截图、过程报告归档在外层 `archive/`，运行资产由 `runtime/manifest.json` 登记。

## 科学边界（不得弱化）

- **LLM 与 Hybrid 一律 `RESEARCH_ONLY`，不进入生产 Registry**；决策中心不得用 LLM 作为正式生产模型。
  真实回溯评估（`REAL_LLM_EVALUATED_RETROSPECTIVE_ONLY`，356 次真实调用 / 360 条有效响应 / 0 失败）：
  匿名**盲测 −4.71pp（无增益）**；带 PIT 上下文的 context 相对基线 **+4.62pp，但无法完全排除预训练历史知识**；
  Hybrid A/B/C 均未过门禁（`HYBRID_NO_GAIN_STATISTICAL_FALLBACK_ACTIVE`）。
- **无独立样本**：2024–2026 历史已被既有研究查看，`untouched_metric=null`、`final_effective_n=0`，
  本轮历史属 **reused retrospective**；当前长期结果只作**低可信度情景**。
- **150 / 180 天为长期探索情景**（`EXPLORATORY_SCENARIO_ONLY`），不是生产点预测。
- **销售最优不成立**：平台不给出最优销售路径推荐（`NOT_SUPPORTED`）；**跟风种植**只给
  HRI = chase-price / expansion-risk environment，**不是**农户行为概率。
- **天气不直接决定价格**：天气默认不进入价格模型（见 `docs/models/LEAKAGE_VALIDATION.md`）。
- **WAPE ≠ 准确率**：它是加权绝对百分比误差；个别档位 `sample_n` 很小，不能当作预测能力。

H / 上市日期由用户输入；没有可信的沈阳日粒度物候，因此**不按作物名猜生育期**。价格是同口径批发市场价，
**不等于农户实际到手价**。详细证据以 `RC3_FINAL_REPORT.md`、`LLM_REAL_EVALUATION_REPORT.md`、
`LLM_ABLATION_V2_REPORT.md`、`HYBRID_V2_REPORT.md`、`RC3_TEST_REPORT.md`、`PROJECT_STATUS.md` 为准。

## 报告与文档索引

前端 V4 的实现、逐阶段验收和浏览器证据见 [V4 设计说明](docs/v4/V4_DESIGN_NOTES.md)、[V4 验收报告](docs/v4/V4_ACCEPTANCE_REPORT.md)、[六城能力矩阵](docs/v4/CITY_DECISION_CAPABILITY_MATRIX.md)。默认从全省观察进入；六城均支持用户条件经营核算，正式短期价格仅沈阳/朝阳，沈阳长期保留探索情景语义。

- 长期目标 / 评估 / 门禁 / 回测：`pipelines/long_horizon/artifacts/v2/`
  （`LONG_HORIZON_V2_TARGET_REPORT.md`、`LONG_HORIZON_V2_EVALUATION_REPORT.md`、
  `PRODUCTION_GATE_REPORT.md`、`DECISION_LONG_HORIZON_BACKTEST.md`、`LONG_HORIZON_V2_METRICS.csv`）；
  运行时副本在 `runtime/research/long_horizon/`。
- 正式销售窗口：`pipelines/long_horizon/artifacts/v2/HARVEST_WINDOW_REPORT.md`。
- 模型与局限：`docs/models/`（`MODEL_LIMITATIONS.md`、`HRI_REPORT.md`、`PRICE_MODEL_REPORT.md`、
  `DECISION_ENGINE_SPEC.md` 等）。
- 工程文档：`docs/ARCHITECTURE.md`（结构、数据流、`runtime` 与 `publishing`）、`docs/API.md`（端点）。
- 前端工程：`frontend/docs/**`；部署：`deploy/README.md`。
