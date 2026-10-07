# AgriScope RC2 最终技术报告

日期：2026-10-08。唯一正式仓库 `MortonCheung/AgriScope`，施工分支 `feat/long-horizon-v2-hybrid-final`，起点 main `12bf22796bc4f1da615b37a9d64baf1cbd5a1a84`。发布对象为情景版 RC2；最终 main/tag SHA 由 `git rev-parse main v1.0.0-rc2^{commit}` 核对，不能在报告写入自身 commit hash。

## 农户真正的问题

目前**不能证明** AgriScope 能比简单基线更可靠地估计 90/120/150 天后的上市价格并改善种植决策。没有任何 crop×horizon 通过真正未见生产门禁。该结论既来自独立样本为 0，也来自历史决策回放的实际结果；不靠改目标、继续挑模型或降低阈值获得漂亮答案。

现在可用的是明确标记的低可信度上市情景比较。用户输入上市跨度/日期，比较上市窗口价格；仅在提供实际亩均成本和亩产时计算收益情景。周期市场均价独立显示，不能代替上市成交价。批发市场价不等于农户最终到手价。

## 原状态审计与修复

旧 RC1 的 PASS 只证明原软件门禁。当时发现三项会影响新任务的问题：训练仅过滤 origin 而未过滤未来目标成熟日；季节基线对齐决策月而非未来销售窗口；Daily 后任务默认重新训练且不消费新 Daily 价格。此外 2024–2026 已参与过目标/模型选择，不能再标完全未见。

V2 对所有阶段执行 label_end≤train_end、测试目标终点≤phase_end；选择阶段、校准阶段和回顾核验角色分开，先写 target/model/config 锁。非正或非有限候选预测显式 fallback 到 PIT LastValue，不做任意价格 floor。切换审核成绩前纠正过一次训练/运行回退口径不一致，初始协议归档在 artifacts/v2/attempt1_pre_audit_correction；后续没有根据 2026 结果改窗口或权重。

Final 与 Daily 核心保留。源码 fingerprint 实算 b19b187268ee92db，施工前 173 个源码/报告/pkl 哈希完全一致。旧 RC1 根报告迁至 docs/archive/rc1，历史 LLM stub 报告标 SUPERSEDED，不再作当前证据。

## 双目标与样本

cycle_market_average：t 后第 1 至 H 天真实市场价格均值，即 (t,t+H]。

harvest_market_price：正式窗口 harvest_post_14，即 [t+H,t+H+14)，第 H 至 H+13 天，共 14 个日历日。研究比较 endpoint、centered/post 7/14/30 和周期目标；只有开发/调参参与窗口选择。30 天销售期未获得业务确认，不能为了更平滑而作为默认。

数据为 2021-01-01–2026-09-14、沈阳同口径批发、10 作物，每作物 1410 真实观测，缺失日不生成价格。development2023、tuning2024、calibration2025、retrospective_audit_reused2026；全部 2026 成绩明确复用历史，untouched=null。120 Registry、3840 指标、586000 预测、480 样本核算，训练失败 0。

Harvest 2026 每作物保守 exposure blocks：30/60/90/120/150/180 天为 5/3/2/1/1/1；实际独立 final 样本全部 0。不同作物不能把同一市场时期乘成 10 倍独立证据，full-history nonoverlap 也不能替代 final sample。CSV 提供每阶段首末 origin、成熟日期、calendar/observed/nonoverlap/exposure 数量。

## 实际历史结果

以下是逐作物均值的 2026 回顾 WAPE%，不称独立准确率：

- 30 天：周期 10.50，上市 14.66。
- 60 天：周期 13.76，上市 14.77。
- 90 天：周期 9.37，上市 16.20。
- 120 天：周期 8.67，上市 16.26。
- 150 天：周期 10.14，上市 21.18。
- 180 天：周期 9.71，上市 26.04。

作物与方法完整见 LONG_HORIZON_V2_METHOD_MAP.md / REGISTRY.csv；MAE、sMAPE、MASE、偏差、方向、最差阶段、基线增益与区间统计见 METRICS.csv 和评价报告。当前 80 项 SCENARIO_ONLY、40 项 EXPLORATORY_SCENARIO_ONLY，全部 low / scenario_range，生产点预测 0、生产概率区间 0。

独立公式重算 586000 预测、3840 组指标，WAPE 最大差 2.842e-14pp；这是核算复核，不是新的 independent test。

## 决策回放

同日期/同10作物/同上市 outcome，按预测 Harvest/current price−1 比较相对市场价格方向，regret=事后最佳方向−策略方向。不是跨作物绝对元/kg比较，不模拟未知产量成本或真实农业利润。

统计长期策略 / 季节基线的平均 regret：30 天 0.0681/0.1702、60 天 0.0665/0.0817、90 天 0.0765/0.0525、120 天 0.0867/0.0785、150 天 0.2431/0.0962、180 天 0.2828/0.1946。30/60 回顾描述较好但独立证据不足；90/120/150/180 未改善季节基线。最差/downside/排名/换作物/集中度完整见 DECISION_LONG_HORIZON_BACKTEST.md 与 CSV。

short-only 对照是 cutoff-safe 30 日季节规则 proxy，不能用全历史 refit 的 Final 权重回溯冒充 PIT 预测。因此本报告不声称打败真实完整 Short Decision v1。未知成本/亩产/设施/可种性使经济收益不可验证；LLM/hybrid 对照为 NOT_EVALUATED。

## 真实 LLM / Hybrid

合法环境密钥缺失：0 API、0 token、0费用，Provider model 的可访问性尚未验证，预测增益 UNKNOWN。状态 REAL_LLM_EVALUATION_BLOCKED_BY_MISSING_SECRET；LLM 与 Hybrid 数值关闭，不以 Coding Agent 自身或 stub 提供预测成绩。

真实入口具备匿名 CITY_A/CROP_A、相对时间、所有价格 current=1 归一、上下文 cutoff 校验；host 留存反归一元信息，Provider 不见真实身份与边界。schema/hash/单位/有限数校验，失败响应不缓存；缓存绑定 Provider/model/rendered prompt/schema/context/temperature/seed，重复试验绕过缓存。记录原始 usage、latency 和未知单价；不会猜 API 费用。

Residual、权重融合、regime selector、ablation 与重复性 Pilot 的代码已准备，参数只从 development 学习；实际效果与费用结果保持缺失。详见三份 V2 LLM 报告。

## Daily、API 和前端

实跑 no-collect 编排为 CHAIN_SUCCESS；Daily 最新观测 2026-10-06，partial / DELAYED / contract_valid；长期同步到同日。冻结历史只追加已发布 Daily、沈阳 wholesale、同口径、QC OK、正且有限、新于冻结历史的记录，并限制日期≤北京时间今天及 committed snapshot。Daily 核心没有改写。

独立 Job 加载冻结权重，无 fit；flock、防并发、temp/fsync/replace、数据/Registry/hash 幂等、backfill 不回退 latest，不可覆盖 history。Daily 未成功/dry-run/采集失败不触发；长期失败单列退出码 5，Daily 仍保留。20:30 主任务、23:30 安全网按 Asia/Shanghai 的 systemd timer，更新 Daily 后 API path/service 重新绑定运行数据。

新增 POST /api/decision/long-horizon v2，保持旧 POST /api/decision；GET /api/forecast/capabilities 与 POST /api/forecast/long-horizon 返回双目标和版本/日期/状态/方法/回退。完整 schema 在 backend/openapi.json，契约说明在 backend/LONG_HORIZON_V2_CONTRACT.md。

前端 /cities/shenyang/decision?view=long-horizon 输入面积、预算、风险偏好、作物、实际投入、上市跨度/日期；不猜生育期，不吸附相邻跨度。风险是当前 Daily 背景，不预测 H 天后 HRI。缺 cutoff-safe 气候来源明确 available=false。稳健偏好仅在实际投入齐全时按下行情景收益排序，未发明未来风险权重。预算不满足的作物不纳入可行排序。

实际浏览器验证了原短期、六档长期、收益公式、城市不支持、陈旧、Daily延迟、无LLM、后端503重试、刷新、空跨度和390px。结果只作弱方向比较，不作强推荐。

## 验收、资产和部署

全量 ALL_TESTS_PASS 与正式 ACCEPTANCE_PASS：前端 322，Python 全层 168 + Daily84，Backend19/19、Final38/38、Daily33/33、长期28/28。详见 RC2_TEST_REPORT.md；日志/截图保存在本机 output 和临时日志，不伪造线上 CI 状态。

清单 722 项：immutable617、generated41、external64、optional0，总 755,551,311 bytes。Final/Daily 运行源码、长期60权重/index/锁/评估证据、前端全部 dist（含CSV）均登记。generated 可以显式 refresh，immutable/hash 缺失不可放宽。为完整旧回归恢复 143 项原 Model v1/v2 资产，618,247,150 bytes，逐字节复制，没有重训或使用它们替换 Final；legacy_regression_assets.json 单列来源。

部署包生成命令 scripts/build_deploy_bundle.py，排除真实 .env、LLM response cache、node_modules/raw 全集，只包含必需资产与已有 Daily 原始响应。实际解压到独立目录后，722项资产、Backend19/19+52tests、Final173哈希与长期120条推理均通过；详见 RC2_DEPLOY_BUNDLE_REPORT.md。部署配置和详细步骤在 deploy/README.md。没有提供服务器地址/SSH授权环境，不能称已部署。

## 冻结与后续证据

模型 long_horizon_v2_rc2；训练数据 f04b01b9b8399c15；Registry312185ede862136a；配置3259aaad287e25b757c62e9bb293aaf0471a0bca34ffb5fae5a82f1ef8d7affe。方法/窗口/阈值冻结，不根据旧审计继续调参。

情景版工程可交付；生产科学门禁 NOT PASSED。未来从 2026-10-08 起只接受及时、事先发行且版本/hash一致的预测，等待窗口真实成熟，再按预锁定完整 Gate 评价；现有成熟预测 0。达到 Gate 也不自动修改 Registry。详见 RC2_FREEZE_GATE.md 与 LONG_HORIZON_PROSPECTIVE_STATUS.json。

Git 先提交完整报告与代码，push施工分支，确保测试/报告/clean 后合 main；main 远端同步后才创建 v1.0.0-rc2。保留 v1.0.0-rc1→d8377ca 和原 stash，不 force push/reset，也不移动 rc1。
