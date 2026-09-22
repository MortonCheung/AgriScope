# KNOWLEDGE_SOURCE_GAPS

「研究与知识来源」的缺口（V5 §52）。

好消息：研究工程自带 `references.md`，其中 **43 条参考文献全部带已核验 DOI**，
并按「用途」标注（方法 / 数据 / 指标…），所以「关于」页可以**直接转述**，不需要前端编 DOI。

缺口在另一处：**方法的一句话定义**。`references.md` 只给「文献 + 类型 + 用途 + DOI」，
没有给出这些方法「是什么」的一句话说明。§52 要求「名称 + 一句定义 + 参考来源」，
因此这里只登记缺口，前端不自行撰写定义。

| 知识 / 方法 | 界面出现处 | 参考来源 | 缺失 |
|---|---|---|---|
| STL 稳健分解 | A01 方法、About | references.md（方法类） | 一句定义 |
| HAC / Newey-West 稳健标准误 | A01–A08 方法、About | references.md（方法类） | 一句定义（正文有用法，无独立定义段） |
| Benjamini–Hochberg FDR | A01–A08、About | references.md（方法类） | 一句定义 |
| Event Study（事件研究） | A04、About | references.md | 一句定义 |
| 安慰剂检验（Placebo） | A04 | references.md | 一句定义 |
| Wild bootstrap | A08 | references.md | 一句定义 |
| 聚类稳健标准误 | A08 | references.md | 一句定义 |
| 面板回归 / 固定效应 | A08 | references.md | 一句定义 |
| ALE / SHAP | 未出现 | references.md 有 ALE 相关条目 | v2 export 未使用，界面不出现 |
| z-score 标准化 | A02–A06 | 无独立引用 | 一句定义 |
| 反事实框架 | 推演 | references.md | 一句定义 |

## 现状处理

- About 的「研究与知识来源」**原样渲染** `references.md` 的参考文献表（文献 / 类型 / 用途 / DOI），
  即 §52 的「名称 + 参考来源」；
- 每个方法的「一句定义」缺席时**不补写**；等研究侧在 `references.md` 增加定义列后，
  About 会自动显示（前端无需改动）；
- 指标类的定义缺口另见 `docs/METRIC_GAPS.md`。
