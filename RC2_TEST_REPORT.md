# RC2 实跑验收

2026-10-08，仓库根执行 `./scripts/test_all.sh`，最终 **ALL_TESTS_PASS**；`./scripts/acceptance.sh` 最终 **ACCEPTANCE_PASS**。均不训练。

- Frontend：32 files / **322 tests PASS**，TypeScript typecheck、build、研究载荷完整性、决策 fixture schema、生产 mock 边界和 UI 字符串验证全部通过。
- Backend：正式 **19/19**；pytest **52 passed**（原短期 28 + 新长期契约 24）。实际 OpenAPI 包含新 v2 决策输入 schema。
- Final：**38/38** 正式验收；独立计算 live code_fingerprint=b19b187268ee92db，施工前冻结文件 **173/173** 哈希未变。
- Daily：**33/33** 正式验收；独立进程 pytest **84 passed**。
- 长期产物：**28/28**；120 Registry / 120 snapshot，窗口、单位、正值、方法、fallback、状态与版本一致。
- 全层 Python：backend/tests + models/tests + models/long_horizon/tests + llm/tests + tests，**168 passed**。其中包括完整旧版 Model v1/v2 测试、Final、V2 的标签成熟/目标边界、未来发行、原子发布、防回退/锁与资产保护。
- 正式验收脚本中另跑的长期/LLM/运行时/后端子集：**96 passed**；这是上面全层集合的子集，不额外累加成总数。
- LLM 安全回归：**21 passed**，mock transport 只验证代码，不是 LLM 预测成绩；额外 9 个真实历史 packet cutoff/匿名/价格归一检查通过。
- 独立指标实现重算 **586000** 条预测的 **3840** 组指标，最大 WAPE 差 2.842e-14 pp；label_maturity 与阶段目标终点检查通过。
- 实际 HTTP smoke：六档双目标 + 120 天新结构化决策 + Daily + readiness 全部通过。
- 实际 Daily no-collect → Long-Horizon 独立子进程：CHAIN_SUCCESS，latest_data_date 两层均 2026-10-06。
- 浏览器：原短期表单、六档长期、实际投入收益、城市不支持、刷新/空跨度、390px、陈旧和 503 恢复路径通过，详见 RC2_BROWSER_E2E_REPORT.md。
- 资产：最终清单按真实条目统计，所有 required 资产和 immutable 哈希通过；源码/schema/prompt/Registry/pkl 不能通过 refresh 放宽。
- Git diff --check 和发布文件模式凭据扫描通过；疑似凭据、禁止文件、Git 超 10MiB 文件均 0。

过程错误保留：扩大回归首次遇到 importlib 同名测试/帮助模块路径，以及迁仓时未复制的旧版 Model v1/v2 runtime fixtures。最终用显式 PYTHONPATH、Daily 独立进程和原始资产逐字节恢复解决，没有删除/跳过测试或改断言，也没有把旧版数据冒充 Final。

剩余 4 个 FutureWarning 来自冻结旧候选代码的 pandas groupby API，测试通过；为了保持 Final 源码指纹没有改它们。

上述验证证明软件行为和历史核算一致；不替代真正未见的长期预测效果验证，也不证明 LLM API 已被实际评估。
