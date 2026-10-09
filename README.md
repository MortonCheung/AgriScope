# AgriScope · 穹衡

辽宁农业气候风险与种植决策研究系统。唯一正式仓库为 [MortonCheung/AgriScope](https://github.com/MortonCheung/AgriScope)。一个 clone 包含前端、后端、模型源码、Daily、LLM、契约、部署和验收脚本；运行时数据与模型资产另由 `runtime/manifest.json` 管理。

当前长期层区分两个问题：

- `cycle_market_average`：从决策后到 H 天结束的整个周期市场价格中枢。
- `harvest_market_price`：用户预计 H 天左右上市时，正式选定销售窗口的市场价格。

正式销售窗口见 `HARVEST_WINDOW_REPORT.md`。H/上市日期由用户输入；没有可信沈阳日粒度物候，不按作物名猜生育期。价格是同口径批发市场价，不等于农户实际到手价。

历史 2024/2025/2026 已参与 RC1 选型。V2 重新清洗标签并分离选择/校准/历史核验，但不能把已查看历史恢复为 untouched：最终未见成绩为空，当前长期结果只作低可信度情景；150/180 天为探索结果。LLM 数值增益仍未完成真实 API 评估，不参与正式数值。详细证据以 `RC2_FINAL_REPORT.md` 与 `RC2_FREEZE_GATE.md` 为准。

## 目录

- `frontend/`：现有 React/Vite 产品，双目标展示与独立上市决策入口。
- `backend/`：唯一 FastAPI 后端，短期 Final、Daily、长期只读推理与决策 API。
- `pipelines/data_foundation/`：raw → processed → model_ready 数据处理与治理。
- `pipelines/daily/`：每日价格采集、更新、Daily 特征与信号。
- `pipelines/modeling/`：`decision_engine` 源码、训练/调参/评估脚本与测试。
- `pipelines/long_horizon/`：V2 目标研究、标签成熟清洗、Registry、评估与显式重训。
- `pipelines/research/`：六城与跨城市正式可复现研究。
- `pipelines/publishing/`：从外层 data/models 挑选正式资产生成 `runtime/`。
- `runtime/`：产品运行时最小资产快照（data/models/manifest）；产品只读此处。
- `llm/`：真实 Provider、匿名归一化上下文、严格校验、缓存与实验。
- `deploy/`：systemd、20:30/23:30 timer、nginx、环境模板与操作说明。
- `scripts/`：启动、完整验收、Daily编排、独立指标重算、未来预测核验、资产和发布审计。
- `docs/archive/rc1/`：明确已被取代的历史报告，不能作当前结论。

## 安装与启动

```bash
git clone https://github.com/MortonCheung/AgriScope.git
cd AgriScope
python3 -m venv .venv
.venv/bin/pip install -r backend/requirements.txt
cd frontend
npm ci
cd ..
# 将运行时资产包解到仓库根，再验证；源码 clone 本身不包含模型权重。
.venv/bin/python scripts/verify_assets.py
```

两个终端：

```bash
# 终端1
PYTHONPATH=backend .venv/bin/python -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8787 --workers 1
# 终端2
cd frontend
npm run dev
```

浏览器打开 Vite 给出的地址。`/api` 代理到唯一后端 8787。服务器配置见 `deploy/README.md`，运行前始终校验不可变资产。后端保持单 worker；Daily 更新后通过服务重启重新绑定短期运行数据。

## 日常推理与人工重训

```bash
# Daily成功快照后启动独立长期推理；失败不污染Daily
python3 scripts/run_daily_chain.py
# 无网络采集，只用已有原始证据重建Daily并触发长期
python3 scripts/run_daily_chain.py --no-collect
# 单独长期推理（仅加载模型，无fit）
python3 pipelines/long_horizon/run_long_horizon_job.py
# 人工显式长期模型研究/重训，不改短期Final
PYTHONPATH=pipelines/modeling/src:pipelines python3 -m long_horizon.v2 --retrain
# 只核验事先发行的未来预测，不自动升级Registry
python3 scripts/evaluate_prospective_v2.py
```

20:30 主任务、23:30 安全网按 Asia/Shanghai 运行外围编排。相同数据/模型/Registry 不重复发布；flock、temp/fsync/replace、防latest回退，并保留不可覆盖的预测历史。不能把 retrain 命令放进 Daily cron。

## API

```text
POST /api/decision                   旧短期契约保持兼容
GET  /api/daily/latest?city=shenyang  原Daily快照
GET  /api/forecast/capabilities
POST /api/forecast/long-horizon      crop/horizon_days；返回两个target
POST /api/decision/long-horizon      contract_version=2；结构化上市决策
```

长期决策使用用户城市、面积、预算、风险偏好、作物、实际成本/亩产、预计上市跨度或日期。日期必须精确对应登记跨度，不静默选最近档位。收益情景只使用 Harvest Price；缺完整实际投入时比较相对当前市场价格环境，不伪造利润。`actual_method`、`fallback_used`、`LONG_HORIZON_STALE`、Daily延迟、LLM不可用全部显式传给前端。长期或LLM失败不会关闭短期与Daily。

## 验收与报告

```bash
./scripts/test_all.sh
./scripts/acceptance.sh
python3 scripts/smoke_rc2.py --base-url http://127.0.0.1:8787
python3 scripts/audit_release_files.py
python3 scripts/build_deploy_bundle.py
```

使用已安装相同版本依赖的 Python 执行；若使用 `.venv`，先激活它。完整验收不训练。各指标由代码/预测记录重算，不能采信历史报告的 PASS。资产 `--refresh` 仅刷新显式 generated，模型、Registry、schema、prompt和运行代码哈希不允许刷新放宽。发布时显式 `scripts/freeze_runtime_manifest.py` 冻结当前版本。

正式科学报告：`LONG_HORIZON_V2_TARGET_REPORT.md`、`LONG_HORIZON_V2_EVALUATION_REPORT.md`、`LONG_HORIZON_V2_METRICS.csv`、`LONG_HORIZON_V2_REGISTRY.csv`、`LONG_HORIZON_SAMPLE_ACCOUNTING.csv`、`PRODUCTION_GATE_REPORT.md`、`DECISION_LONG_HORIZON_BACKTEST.md`。真实 LLM 报告：`LLM_REAL_EVALUATION_REPORT.md`、`LLM_ABLATION_V2_REPORT.md`、`HYBRID_V2_REPORT.md`。Stub仅用于软件测试，不能说明LLM预测能力。
