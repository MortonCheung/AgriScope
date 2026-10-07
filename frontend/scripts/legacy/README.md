# legacy/：已退役的 v1 同步管线与校验

`sync-shenyang-content.mjs` 属于 **v1 内容管线**：它读 `SHENYANG_RESEARCH_INDEX.json` /
`SHENYANG_RESEARCH.md`，用 `splitResearchDoc()` 切分 markdown，并把研究点编号限制为 `G1–G10` / `C1–C7`。

按 V5 §4/§9：

- 该管线**已退役**，不再被 `npm run sync` 调用，也**不允许**在运行时被引用；
- 保留在此仅作历史留档，等 v2 数据层完全接管（V5 Phase 6）后一并删除；
- 唯一的研究来源是 `city_data/shenyang/workspace/research_v2/exports/frontend/` 与
  `city_data/shenyang/reports/v2/`，由 `scripts/sync-shenyang-v2.mjs` 同步。

`verify-content.mjs` 校验的是 **v1 载荷**（`public/research/shenyang/index.json`、
`manifest.json`，17 个研究点 / 6 个专题 / G·C 编号）。V5 退役 v1 载荷后这些文件已不存在，
脚本随之退休：

- 其中仍然有价值的那一条（不得出现被禁 AI 营销文案）已搬进 `scripts/verify-v2-payload.mjs`，
  而且检查面更全（覆盖全部 9 篇 v2 正文）；
- 其余 7 条检查的对象（v1 索引、专题覆盖、G/C 编号）在新架构里已经没有对应物。

