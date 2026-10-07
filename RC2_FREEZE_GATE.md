# RC2 冻结门禁

## 发布范围

`AGRISCOPE_V1_RC2_READY` 指软件、真实历史核算和**情景版**契约可交付。`LONG_HORIZON_V2_VALIDATED` 在本 RC2 中只表示双目标实现、成熟标签核算与历史结果经过验证；**不表示独立生产精度已通过**。科学门禁单列为 `RETROSPECTIVE_ONLY_NO_UNTOUCHED / PRODUCTION_GATE_NOT_PASSED`。

没有为了满足状态名称而放宽阈值。全部 120 项 Registry 的 final_effective_n=0、untouched_metric=null、confidence=low；30/60/90/120 情景，150/180 探索情景。LLM 状态 `REAL_LLM_EVALUATION_BLOCKED_BY_MISSING_SECRET`，LLM / Hybrid 不参与生产数值。

## 工程门禁：PASS

- 全量测试、正式验收、真实六档 HTTP 和浏览器联调通过；具体结果见 RC2_TEST_REPORT.md。
- Final live 指纹 b19b187268ee92db，施工前 173 个冻结文件零变化；原 Daily 核心没有算法或源码修改。
- 新接口使用上市窗口价，成本/亩产缺失不输出利润；跨度/日期由用户明确输入，支持范围以 Registry 为准。
- Daily 成功有效快照之后外围独立 Job 推理，无 fit；长期失败不污染 Daily，锁/原子发布/幂等/防回退经过测试。
- Registry、目标、训练版本、运行数据版本、观测基准、方法、回退、低可信度、Daily延迟、长期陈旧和 LLM 未评估均显式传到 UI。
- 不可变资产不能 refresh；清单包含 Final/Daily 源码、V2 权重/锁与评估证据、前端 dist 的全部静态数据，数量由实际条目计算。
- 发布文件凭据模式扫描、禁止文件和大文件扫描通过；原 rc1 与 stash 保留。

## 独立科学生产门禁：NOT PASSED

历史 2024/2025/2026 已参与 RC1 选择，重新 purging 和重算不能恢复 untouched。V2 修复了训练 label_end 越过 cutoff、阶段标签跨界和季节基线对齐错误，改善的是核算可信性；新方法的独立外推成绩仍未知。

预锁定要求保持：绝对 WAPE 改善至少 1pp、相对改善至少 5%、至少 3 个时期且 75% 胜率、最差时期退化不超过 2pp、至少 12 个独立未来 exposure blocks、配对 bootstrap 95% gain CI 下界大于 0。概率区间另需至少 20 个校准 exposure blocks，名义 80% 的独立覆盖落在 70–90%。

当前未来成熟预测为 0；没有达到条件的 crop×horizon×target，不能给中高可信度、生产点预测或概率区间。90/120/150 天农户决策改善尚无独立证据，历史市场价格 proxy 决策回放也未改善季节基线。

`scripts/evaluate_prospective_v2.py` 只评价 2026-10-08 之后、目标开始前及时发行、版本/hash/目标一致的不可覆盖历史预测，最早有效发行去重，逐项输出完整 Gate 组件；不足明确报 INSUFFICIENT，不自动改变 Registry。等待真实标签成熟属于观测证据限制，不能夜间虚构完成。

## 外部边界

真实 LLM Key 不存在：0 API / 0 token / 0费用，增益 UNKNOWN。框架和测试通过不等于 LLM_EVALUATED。

没有提供服务器地址和部署权限：部署包、操作说明、systemd timer/path、nginx 模板已准备，本机可验证，未宣称线上部署。Git 发布另以远端 ref 核对为准；不可在 main 同步前创建发布 tag。
