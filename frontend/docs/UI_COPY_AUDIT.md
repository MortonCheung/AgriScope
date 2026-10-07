# UI_COPY_AUDIT

V4 §三十八–§四十三 的前端文案审计。扫描范围：`src/**/*.tsx`、`src/**/*.ts`（含 `.css` 中的伪元素文案，结果为空）。

分类定义：

| 分类 | 含义 |
|---|---|
| KEEP | 研究内容本体或用户完成任务必需的信息，保留原文 |
| REMOVE | 前端自造的「解释界面」文案与开发状态文案，直接删除 |
| REWRITE | 意图保留但措辞违规（内部字段名、冗余动词、操作说明），改写 |
| INTERNAL_ONLY | 只应存在于代码/数据里的字段名与注释，绝不进入 DOM |

判据：§五（内容 > 结构 > 空间 > 动效）、§三十九（禁用词表）、§四十一（删除前端生成的无效介绍）、§七十五 三问。

---

## 1. REMOVE — 已删除

| 文件 | 文案 | 依据 |
|---|---|---|
| `features/liaoning/LiaoningPage.tsx` | 拖动可旋转沙盘，点击城市进入 | §三十九（Phase 1 删除） |
| `features/liaoning/LiaoningPage.tsx` | 点击进入研究 | §三十九（Phase 1 删除） |
| `features/liaoning/LiaoningPage.tsx` | 研究尚未接入（`data-ready` 属性） | §三十九（Phase 1 删除） |
| `features/spatial/SpatialShell.tsx` | `spatial-notice` 整块提示 | §十七（Phase 1 删除） |
| `features/city/CityResearchSpacePage.tsx` | 选择左侧任一研究点查看摘要。 | §三十九 |
| `features/research/ResearchPointPage.tsx` | 查看研究依据 →（正文底部重复入口） | §四十二 |
| `features/research/ResearchArticleView.tsx` | 打开交互图 →（正文底部重复入口） | §四十二 |
| `features/research/ResearchArticleView.tsx` | 研究原文（与「原文」Tab 重复的模式标签） | §四十二/§四十三 |
| `features/research/widgets/ResearchModules.tsx` | 下面的图表数据来自本研究点真正使用的研究表；可以切换品种、变量或滞后窗，重新观察研究过程。 | §四十一 原文点名的例子 |
| `features/report/CityReportPage.tsx` | 以下 N 问来自城市研究索引，问题与答案原文呈现，未做改写。 | §四十一（以下……） |
| `features/report/CityReportPage.tsx` | 进入研究点可查看交互研究表与原始图表。 | §四十一 |
| `widgets/CropVolatilityChart.tsx`、`PhenologyChart.tsx`、`TrendChart.tsx`、`EventContrastChart.tsx` | 悬停 / 点选品种查看完整读数 ×4 | §四十一（控件自明，不需要说明控件） |
| `widgets/registry.tsx` | 同一个研究页面上切换品种与变量，不需要为每个品种复制十个页面。 | §四十一（前端工程理由，对用户无意义） |
| `components/ResearchFigure.tsx` | 交互数据正在接入（Badge） | §十七（不得显示开发状态） |
| `components/ResearchFigure.tsx` | `interactiveState` prop 与 `data-state` 属性 | 删掉 Badge 后成为死抽象，一并删除 |
| `features/research/article.css`、`research-point.css` | `.article-backlink`、`.research-point__backlink` | 随入口删除，避免死样式 |

## 2. REWRITE — 已改写

| 文件 | 原文案 | 现文案 | 依据 |
|---|---|---|---|
| `components/AsyncState.tsx` + 全仓 25 处 `AsyncBoundary` 调用点 | `label="正在读取城市研究索引 / 研究原文 / 研究表 / …"` | 加载态改为**无文字骨架条**（`role=status` + `aria-label="加载中"`），`label` 参数整体移除 | §三十九 + §四十四 |
| `workspace/ResearchEvidenceRail.tsx` | 来源声明 | 来源 | §四十（内部字段名） |
| `workspace/ResearchEvidenceRail.tsx`、`components/SourceCitation.tsx` | 来源未在当前前端索引中声明 | 来源待补充 | §五十四（Phase 9 再改结构） |
| `features/research/ResearchPointPage.tsx` | 查看原文（Tab） | 原文 | §四十三（「查看」是冗余动词） |
| `features/opening/OpeningPage.tsx` | 查看辽宁 | 进入 | §三十七（Opening = 品牌 + 进入）、§四十三 |
| `widgets/ResearchModules.tsx` | 交互数据正在接入。 | 该研究点没有登记可交互的研究表。 | §三十九/§四十一 |
| `widgets/ResearchModules.tsx` | TableExplorer 的「图形交互正在接入…」note | 删除该 prop（`note` 本身可选） | §四十一 |
| `features/rainstorm/RainstormPage.tsx` | （研究索引记录：A = x，B ≈ y） | （A = x，B ≈ y） | §四十 |
| `features/rainstorm/RainstormPage.tsx` | 研究工程输出的传导第一阶段热力图，用于查看各品种 × 窗口的估计结果。 | 传导链第一阶段：各品种 × 窗口的估计结果。 | §四十一（用于查看……） |
| `widgets/modulesG.tsx` ×3 | 切换价格与成交量，逐个品种核对……／在年化波动率与变异系数之间切换，查看……／切换口径、天气变量与响应变量，核对…… | 价格与成交量的逐品种斜率、区间与显著性。／年化波动率与变异系数的逐品种描述统计。／不同口径与天气变量下的交互项与 FDR 显著计数。 | §四十一 |
| `widgets/registry.tsx` ×3 | 把 15 个天气变量逐一和响应配对；切换暴露变量查看……／在真实分箱之间切换，同时看到……／拖动时间或播放，逐日重看…… | 15 个天气变量与响应逐一配对的滞后曲线。／研究表的真实分箱，以及各档样本数量与结果稳定性。／2026 事件窗口的逐日气象序列。 | §四十一 |
| `widgets/ThresholdBinExplorer.tsx` | 阈值档来自研究表的真实分箱。**拖动只在既有分箱之间切换**，不做插值；…… | 阈值档来自研究表的真实分箱，不做插值；……（保留实质结论，去掉操作说明） | §四十一 |
| `widgets/CropVolatilityChart.tsx`、`PhenologyChart.tsx` | 悬停或点选任一品种，查看…… | 尚未选择品种。 | §四十一（空态陈述状态，不下指令） |
| `widgets/YearlyProductionChart.tsx` | 悬停任一行查看该组合的相关系数读数。 | 尚未选择组合。 | §四十一 |
| `features/rainstorm/RainstormPage.tsx` ×3、`features/scenario/ScenarioLabPage.tsx` ×1 | yLabel「悬停查看某日降水 / 某日降水与基线 / 湿度与 VPD / 某品种的缺口与置信区间」 | 去掉「悬停查看」前缀：某日降水 / 某日降水与基线 / 湿度与 VPD / 某品种的缺口与置信区间 | §四十一（坐标轴标签不是操作说明） |
| `domain/research/adapters.ts` | 注释里的旧文案 | 同步为「来源待补充」 | 一致性 |

## 3. KEEP — 保留（含理由）

| 位置 | 文案 | 理由 |
|---|---|---|
| Opening | 穹衡 / AgriScope / 辽宁农业气候风险分析与情景研究 / 进入 | 品牌与唯一入口，§三十七 明确保留 |
| Header | 辽宁 / 研究 / 情景实验 / 关于 | §七 固定结构 |
| 辽宁页 | 六个城市名 | 唯一导航内容 |
| 研究点页 Tab | 交互研究 / 原文 | §四十三 推荐模式名 |
| 研究树 | 城市 → 专题 → 研究点编号与标题 | 研究结构本体 |
| 正文分节 | 现象 / 分析 / 方法与限制 / 核心数据 | 渐进披露骨架，不是界面解释 |
| Evidence Rail | 证据 / 时间 / 来源 / 方法 / 限制 | §四十 允许的中文短标签（非字段名） |
| 图表 note | 陈述研究结论的句子（如「正值代表极端日更高；多数单元并不显著，且显著者多为负向。」「波动存在清晰的品类分层，但品种间异质性缺乏统计支持……」） | 属研究结论陈述，不是前端介绍；§一 禁止前端改写结论 |
| 图表读数区 | 品种 / 单位 / 均值 / 标准差 / 变异系数 CV / 年化波动率 / IQR / P05–P95 / p 值 / R² / 样本 …… | 读数的语义标签，删掉即失去可读性 |
| 证据徽标 | 实际观测 / 模型估计 / 情景模拟 | 数据性质的中文表述 |
| Error 态 | 错误信息 + 重试 / 未知城市 / 研究点不存在 | §五：错误必须可理解、可恢复 |
| Empty 态 | 研究内容待接入（`/cities/:id`）/ 内容待接入（`/research`）/ 尚未选择品种 | §十七 要求六城可进入并如实说明；§十三 禁止 `/research` 造内容 |
| 城市页按钮 | 综合报告 / 暴雨专题 / 城市研究空间 / 2026 暴雨专题 | 唯一正式入口 |

## 4. INTERNAL_ONLY — 不得进入 DOM

| 名称 | 现状 |
|---|---|
| `前端一句话` | 代码中不存在任何渲染点（仅数据字段 `frontendText` 作为研究内容被渲染，标题永不显示） |
| `frontendText` | 仅作数据取值；字面量不出现在 UI |
| `sourceOfTruth` | 仅 `adapters.ts` 内部取值；不渲染 |
| `provenance` | 仅用于取中文标签与 `data-*` 属性；字段名不渲染 |
| `Lineage`（`.csv` / `.md` 文件名） | 仍由 `SourceCitation` 渲染 → **转 Phase 9** 按 Source/Lineage 契约分离 |
| 全部 JSDoc 与 `//` 注释 | 不进入 bundle 输出 |

## 5. 遗留问题（转后续 Phase）

1. `放大` 按钮仍存在于 `ResearchFigure.tsx` / `widgets/primitives.tsx` → Phase 7 删除，改为点击图片本体放大。
2. `SourceCitation` 仍以字符串数组接收来源，会把 `.csv` / `.md` 血缘当来源显示 → Phase 9。
3. `LoadingState` 已无文字，但切换研究点时仍是**整块替换**（刷新感的根源）→ Phase 6 预取 + crossfade。

## 6. 验收（§六十七 E2E 4 词表）

页面文本中不得出现：`拖动可旋转`、`点击进入`、`正在读取研究`、`选择左侧`、`查看研究依据`、`打开交互图`。
另加 §四十 字段名：`前端一句话`、`来源声明`、`sourceOfTruth`、`frontendText`、`provenance`。

### 6.1 静态扫描

`src/**` 中上述词表命中数为 0。另按 §三十九「全仓搜索：正在读取」做了一次泛化扫描：
`PhenologyChart` 的 note 三元里还留有一句 `正在读取物候交互表。`（表格未就绪时显示），
已改为未就绪时不输出 note —— 图表区的局部骨架已经说明在加载（§四十六）。
现在 `正在读取` / `正在加载` 在**可渲染文案**中命中数为 0（仅剩 `AsyncState` 里的注释）。

### 6.2 浏览器实测（同源 iframe 加载真实路由并读取 `document.body.innerText`）

| 路由 | 命中 | 文本长度 | 备注 |
|---|---|---|---|
| `/liaoning` | 无 | 68 | 只剩 Header + 六城名，无任何提示文案 |
| `/cities/tieling` | 无 | 56 | 铁岭 + 研究内容待接入 |
| `/research` | 无 | 80 | 辽宁综合研究 + 内容待接入 + 六城 |
| `/cities/shenyang` | 无 | 644 | |
| `/cities/shenyang/report` | 无 | 2576 | 删掉两处「以下…／进入研究点可查看…」 |
| `/shenyang-rainstorm` | 无 | 2294 | |
| `/scenario-lab` | 无 | 2187 | |
| `/about` | 无 | 718 | |
| `/cities/shenyang/research/C5` | 无 | 2311 | Tab = 交互研究 / 原文 |
| `/cities/shenyang/research/C5?mode=article` | 无 | 2624 | 「前端一句话」heading 已不渲染 |
| `/cities/shenyang/research/G1` | 无 | 8685 | |
| `/cities/shenyang/research/G1?mode=article` | 无 | 3397 | |

只有 `放大` 仍命中（`C5` 4 处、`G1` 8 处、`scenario-lab` 4 处），属 §四十七，按计划在 **Phase 7** 删除按钮并改为点击图片本体放大。

### 6.3 附带发现（非文案，已记录）

- `ROUTES.scenarioLab = '/scenario-lab'`；直接访问 `/scenario` 会被 `*` 兜底重定向到 `/`。这是路由表既有行为，不是缺陷，但说明核对路径时必须用真实路由常量。
- `放大` 之外的按钮命名已统一：`情景实验`（原「平行世界实验室」）与顶部导航一致。

---

# V5 §83–§88 文案终审与图表 QA

V4 部分保留为历史记录。以下是 V5 重建后的审计，扫描对象从"旧研究点页面"换成了"研究出版物"。

## V5-1 §83/§84：界面自造文案

V5 已经不存在"解释界面"的文案：正文、图表编号、城市名、导航词全部是研究侧内容或结构词。逐条核对结果：

| 位置 | 结论 |
|---|---|
| Opening | 只剩 `AGRISCOPE` + 辽宁农业气候风险研究 + `进入 →`；中文品牌「穹衡」已按 §18 删除 |
| 研究树 / 模式切换 | `交互研究` / `原文`，§43 推荐名 |
| 报告目录 | 编号 + 城市 + 报告全称，没有「开发中 / Coming soon」 |
| 证据栏标签 | 研究对象 / 关键词 / 限制 / 来源，均为中文短标签 |
| 图表读数 | 走在受控列名映射里（§76），不出现英文列名 |
| 空态 | 统一为「研究内容待接入」（§85），报告与推演页原本的「报告内容待接入」「情景结果待接入」已改掉 |

被删掉的 V5 遗留项：

| 文件 | 原文案 | 处理 |
|---|---|---|
| `features/report/ReportPage.tsx` | 报告内容待接入 | 改为 `研究内容待接入`（§85 只允许一句） |
| `features/scenario/ScenarioPage.tsx` | 情景结果待接入 | 同上 |
| `features/opening/OpeningPage.tsx` | 穹衡 | 删除，改为 Logo slot + `AGRISCOPE`（§18/§19） |
| `features/about/AboutPage.tsx` | `**分开**呈现` | 字面量星号改为 `<strong>` |
| `features/about/AboutPage.tsx` | 记入 `METRIC_GAPS` | 开发文档名不再对读者出现 |

## V5-2 §76：英文工程字段

这是本轮工作量最大的一项。研究正文里大量使用英文标识符，处理规则见
`src/domain/research/v2/metrics.ts` 的"正文术语"一节：

| 情形 | 处理 | 例 |
|---|---|---|
| 有受控中文名的列名 / 取值 | 换成中文（列名与表格永远一致） | `` `temp_max` `` → 日最高气温 |
| 研究写成「标识符（中文定义）」 | 留下中文定义，丢掉冗余英文名 | `` `growing_season_precip`（生长季累计降水，mm） `` → 生长季累计降水，mm |
| 括号里不是定义（品种清单等） | 绝不展开 | `` `precip_7d`（韭菜、黄瓜） `` → 7 日累积降水（韭菜、黄瓜） |
| 只在叙述出现的指标名 | 用 `PROSE_TERMS`（每条都抄自研究自己的同义表述） | `` `price_z` `` → 价格异常 |
| 内部路径 / URL / 键值标记 | 连同包住它的括号一起不渲染 | `（表 `x.csv` 的 `_loo` 对照见 `data/….parquet`）` |
| 公式与统计记号 | **原样保留**（§76 允许：STL / HAC / R² / z / ERA5 …，且处在中文语境） | `y_t = α + φ·y_(t-1) + …` |
| 其余不认识的英文工程名 | 不渲染 | — |
| 研究自己的证据状态词表 | 支持 / 部分支持 / 未获支持 / 仅描述；`POOLED` → 总体 | A09 §1 |

守卫方式（不靠目视）：`src/features/research-v2/markdown.test.tsx` 把**全部 9 篇正文的每一段**
渲染一遍，去掉被保留的公式后再查泄漏，命中即失败。

## V5-3 §86：图表 QA

逐表核对（研究正文里的表格由受控映射渲染）：

| 项 | 结论 |
|---|---|
| 表题 | `表 N · 章节名`，编号来自资产落位顺序（§35） |
| 表头 | 全部走 `COLUMN_META` 中文名；未登记列不渲染并记入 `docs/TABLE_SCHEMA_GAPS.md` |
| 重复表头 | A03 的 `window` 与 `window_key` 曾同名「滞后窗口」；现 `window_key` 标为 `internal`，不再占一列 |
| 单位 | 真实物理量带单位（公顷 / 公斤/公顷 / %）；成交量沿用「单位未披露」口径，**绝不写吨** |
| 口径注 | 只在出现成交量类表时出现一次（`VOLUME_UNIT_NOTE`） |
| 行数与截断 | 表下如实写「共 N 行 / 仅显示前 N 行」 |
| 图 | 只有编号（`图 N`）；研究侧没有给图题、图注、图级来源，因此不编（§34 的现实约束） |
| 来源 | 统一的来源段落在文末，条目来自研究侧 `sources.json` |

`scripts/verify-v2-payload.mjs` 现在会在**载荷层面**失败的条件：重复可见表头、
分类取值缺中文、（新）载荷出现被禁 AI 营销文案。

## V5-4 §87：Hover 不得改变布局

在 `/cities/shenyang/research/A03`（3 张表）连续 hover 20 次（表格行、表头、树节点、
筛选控件、链接各若干次），前后对比：

```
before { w:1470, h:6761, scrollH:6761, mainH:6761 }
after  { w:1470, h:6761, scrollH:6761, mainH:6761 }   → 完全一致
```

## V5-5 §88：静态图放大

`/cities/shenyang/research/A01`（唯一一张 PNG，1417×533）：

| 项 | 实测 |
|---|---|
| 常态 `object-fit` | `contain` |
| 常态纵横比失真 | **0.00%**（渲染 2.6586 / 原始 2.6585） |
| 点击 | `data-expanded` 置位，出现背板与关闭按钮 |
| 放大态 `object-fit` | `contain`，纵横比保持，尺寸不超出视口 |
| 关闭 | ESC / 背板 / × 均可 |

过程中发现并修掉了一个真问题：`.research-figure` 的基础样式原本随 v1 组件一起归档了，
导致图片以 `object-fit: fill` 被拉伸。已按 §88 在 `research-note.css` 重建最小样式。

## V5-6 构建产物字符串守卫

`npm run build` 末尾执行 `scripts/verify-ui-strings.mjs`：扫描 `dist/assets/*`，
下列字样命中即构建失败（结果：24 个产物文件，0 命中）：

`技术血缘` `sourceOfTruth` `frontendText` `provenance` `workspace/` `outputs/`
`无量纲` `正在读取` `本页面` `本模块` `穹衡` `拖动可旋转` `点击城市进入`

另加一条：`POOLED` 只允许出现在 `POOLED:"总体"` 这种查表位置，不允许被直接渲染。


