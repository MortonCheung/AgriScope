# PROJECT STATUS · AgriScope

> **历史文档（SUPERSEDED）**：本文件记录的是 2026-10-07「结构收口」阶段的状态，
> 其中的单仓库 / 分支 / 模型冻结状态**已过时**。
> 当前状态请看：`README.md`（入口）、`LONG_HORIZON_FREEZE_GATE.md`（长期层）、
> `backend/BACKEND_FREEZE_GATE.md`（后端）、`models/reports/final/FINAL_MODEL_FREEZE_GATE.md`（Final Model）。

> 本文件由 2026-10-07 全项目只读审计 + 结构收口任务生成。
> 所有结论均以**实际文件 / 实际代码 / 实际运行结果**为准（不采信旧 Agent 的“完成”声明）。
> 机器审计产物见 `archive/audits/project_structure_20261007/`。

---

## 1. AgriScope 现在是什么？

**一句话**：面向辽宁农业场景的**交互式数据研究产品** —— 回答“辽宁不同城市的农业与市场如何面对气象与市场风险、哪些风险会传导、改变化肥/气候/市场条件后可能发生什么”，结构为 省域（`/liaoning`）→ 城市研究空间 → 研究点。

---

## 2. 我们现在有什么？

| 类别 | 位置 | 内容 |
|---|---|---|
| **产品** | `AgriScope/` | React 19 + Vite 7 前端；`src`(268 文件) / `public`(研究+推演载荷) / 独立 Git 仓库（分支 `feat/frontend-v5-restructure`） |
| **数据** | `data/` | `raw` 23,278 文件 / 1.75GB；`processed` 50 张 parquet（14 主题）；`model_ready` 19 张 parquet；`research` 六城；`metadata` 6 类治理；`scripts` 175 文件 |
| **研究** | `data/research/` | 沈阳 A01–A09 **全部齐备**（COMPLETE）；朝阳/锦州/大连/铁岭/丹东 仅保留 sources 与元数据（未展开研究） |
| **模型** | `models/` | 价格模型(10 作物) + HRI + Market Risk + Climate Exposure + Profit + Recommendation + Optimization + Portfolio + Counterfactual + Backtest + Registry + Tests(46) |
| **参考** | `reference/` | iTeach + design-references（11 个第三方 Git 仓库；非产品依赖） |
| **历史** | `archive/` | old_marts / data_legacy / data_reports / audits / backups / migration / temp |

---

## 3. 已经完成什么？（严格区分 VERIFIED / UNVERIFIED）

| 阶段 | 状态 | 证据 |
|---|---|---|
| 数据采集 | `DONE_VERIFIED` | `data/raw/` 23,278 文件 + 源登记 235 条 |
| 数据治理（Data Foundation） | `DONE_VERIFIED` | 从零重建成功；`FINAL_STATS` 声明逐项复核属实（price_observation 143030、nonstandard 4600、yearbook 3519、RECOVERABLE 33004） |
| 数据 pipeline 幂等 | `DONE_VERIFIED` | 连续两次重建，111 文件中 108 个逐字节一致；3 个 `metadata/inventory/*` 因**包含自身哈希**（自引用）而不同，行数一致 |
| 研究（沈阳 A01–A09） | `DONE_VERIFIED` | 9 篇 article/report/tables/figures/metrics 齐备；前端 `verify:integrity` 43 文件哈希一致 |
| Model v1 | `ENGINEERING_COMPLETE / NOT_FINAL` | 实跑 `check_acceptance.py` = **32/32** |
| Model v2 | `ENGINEERING_COMPLETE / NOT_FINAL` | 实跑 `check_acceptance_v2.py` = **35/35** |
| 模型单元测试 | `DONE_VERIFIED` | `pytest models/tests` = **46 passed** |
| 前端 | `DONE_VERIFIED` | `npm run typecheck` 通过；`npm test` 157 passed + 载荷/完整性校验通过；`npm run build` 成功 + `verify:ui` 通过 |
| 断链扫描 | `DONE_VERIFIED` | active code 旧路径引用 = **0** |
| 竞赛报告 / PPT / 视频 / 答辩 | `NOT_STARTED` | 根目录无相应产物 |

> 说明：**“Agent 说完成”≠“验证完成”**。上表全部通过**重新实际运行**确认，而非读取旧报告。

---

## 4. 现在进行到哪一步？

**阶段：结构与数据底座收口完成（Structure & Data Foundation Consolidation Done）。**

数据层与模型工程、前端均已**可运行、可验证、路径稳定**；但模型是在**旧数据快照**上训练的，尚未基于最终治理后的数据重训。

---

## 5. 已知问题

1. **`KNOWN_MODEL_ISSUE`：Balanced 策略未实现更强的跟风抑制。**
   实跑结果：沈阳 `C_agriscope_balanced` 高-HRI 推荐率 = **13.0%**，反而 **高于** `A_profit_only` = **8.7%**（阈值 P90=73.2；来源 `models/evaluation/recommendation/herding_suppression.csv`）。
   → 与“Balanced 应更强抑制追高”的预期不符，是下一轮模型重点。**本轮不修算法。**
2. **模型与最终数据不同步。** Model v1/v2 的输入是 `models/data/snapshots/v1`（2026-10-04 冻结），而 Data Foundation 在其后又有治理与补充 → v1/v2 均为 **NOT_FINAL**，需基于最终数据重训 + 重回测。
3. **跨城市价格边界。** 各城 `price_level` 口径不同，**禁止混用**；跨城联动不可行（可比较重叠覆盖率 <8%）。大连/铁岭/丹东市场数据不足 → 返回 `insufficient_market_data`。
4. **proxy / 缺口数据。** 缺口状态：`PROXY_ONLY` 9 · `PUBLICLY_UNAVAILABLE` 7 · `LOW_PRIORITY` 3 · `USER_INPUT_REQUIRED` 1；proxy 数据使用必须降权并标注。
5. **推荐 confidence。** 区间方法历史覆盖率约 66–74%（名义 80%），**未达校准标准**，只能称 scenario range，不得称 prediction interval。
6. **前端 `public/research/shenyang/integrity.json` 的 `source` 字段**仍记录迁移前的绝对路径（`city_data/...`）；该校验对缺失源**静默跳过**，不影响构建，属待刷新的元数据（重建 `npm run sync` 可刷新）。
7. **旧代脚本**（`data/scripts/pipeline/**`、`collectors/**`、`parsers/**`、`transformers/**`、`validators/**`）标注为 `LEGACY_CODE`：属采集期历史脚本，已被 `data/scripts/data_foundation/` 取代；其内部注释/历史引用保留，不属 active broken。

---

## 6. 版本状态

```text
Data Foundation        VERIFIED / FROZEN_CANDIDATE（可重建、幂等、声明属实）
Model v1               ENGINEERING_COMPLETE / NOT_FINAL（原因：训练后又发生数据治理与补充）
Model v2               ENGINEERING_COMPLETE / NOT_FINAL（同上）
AgriScope 前端         RUNNABLE / VERIFIED（typecheck·test·build 全通过）
```

---

## 7. 接下来应该做什么？（严格顺序，本轮不执行）

```text
Phase 1  Final Data Audit          —— 对最终 data/ 做一次独立数据审计
Phase 2  Freeze Data v1            —— 冻结数据版本（元数据/schema/hash）
Phase 3  Full Model Retraining     —— 基于最终数据重训价格模型 + 回测
Phase 4  HRI / Recommendation 修正 —— 解决 KNOWN_MODEL_ISSUE（Balanced 跟风抑制）
Phase 5  Independent Model Audit   —— 独立复算、公平时间回测复核
Phase 6  AgriScope Integration     —— 最终数据/结论接入前端
Phase 7  Competition Report / PPT / Video
Phase 8  Final Defense Validation
```

**下一步第一件事：`Phase 1 Final Data Audit`（基于已收口的 `data/`）。**

---

## 8. 目前还有哪些 BLOCKER？

**无 P0 BLOCKER。** 数据可重建、模型可运行且测试全过、前端可构建、active 断链为 0。
仅有上述“已知问题”（非阻断），以及待下一轮处理的模型重训与算法修正。