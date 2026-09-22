# legacy/：已退役的 v1 同步管线

`sync-shenyang-content.mjs` 属于 **v1 内容管线**：它读 `SHENYANG_RESEARCH_INDEX.json` /
`SHENYANG_RESEARCH.md`，用 `splitResearchDoc()` 切分 markdown，并把研究点编号限制为 `G1–G10` / `C1–C7`。

按 V5 §4/§9：

- 该管线**已退役**，不再被 `npm run sync` 调用，也**不允许**在运行时被引用；
- 保留在此仅作历史留档，等 v2 数据层完全接管（V5 Phase 6）后一并删除；
- 唯一的研究来源是 `city_data/shenyang/workspace/research_v2/exports/frontend/` 与
  `city_data/shenyang/reports/v2/`，由 `scripts/sync-shenyang-v2.mjs` 同步。
