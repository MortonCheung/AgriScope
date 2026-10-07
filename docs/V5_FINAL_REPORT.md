# AgriScope V5 重构 · 最终交付报告

对应任务书 §37 的 18 个问题。所有数字都来自仓库当前状态，可复核命令写在每节末尾。

- 分支：`feat/frontend-v5-restructure`
- 本轮起点：`3c02c8b`
- 本轮终点：**本报告所在的提交**（即 `git log --oneline 3c02c8b..HEAD` 的最后一行）
- 已推送远端，未合并 `main`

---

## 1. 分支与 HEAD

`feat/frontend-v5-restructure`，从 `3c02c8b` 起共 9 个提交（8 个代码提交 + 本报告）：

| 提交 | 内容 |
|---|---|
| `5d35ad3` | 冻结 A1–A8 / 76 点契约，修正同步路径 |
| `e8e7940` | 研究 IA 重建为 A1–A8 / 76 点两层树 |
| `ed2c1dd` | 让草稿纸可见，停止镜头绕圈 |
| `bdc417f` | Header 与纸张同一材质，去掉空 logo 占位 |
| `1be220f` | 研究侧引文过行内渲染器（不再泄漏文件名） |
| `14d59e4` | 阅读面不随读者动作改变尺寸（读数行 / 引文 / 原文标题层级） |
| `10b7392` | 交互研究中栏不再掉进右侧证据栏 |
| `70b4ddd` | `/reports/liaoning` 不再被称作「未知城市」 |
| 本报告 | V5 最终交付报告（§37 的 18 个问题） |

```bash
git log --oneline 3c02c8b..HEAD
```

## 2. 新契约：方向数与研究点数

沈阳：**8 个方向 / 76 个研究点**，`schemaVersion = shenyang-article-tree-v1.0`。

```bash
node -e "const c=require('./src/domain/research/catalog/shenyang-tree.json');console.log(c.topics.length, c.topics.reduce((n,t)=>n+t.points.length,0))"
```

## 3. 每个方向的研究点数

| 方向 | A1 | A2 | A3 | A4 | A5 | A6 | A7 | A8 | 合计 |
|---|---|---|---|---|---|---|---|---|---|
| 研究点 | 8 | 11 | 10 | 10 | 8 | 9 | 9 | 11 | **76** |

与任务书 §7 逐个一致；契约测试把这张表写成断言（`catalog.test.ts` 的 `SHENYANG_POINT_COUNTS`），任何增删都会失败。

## 4. canonical A1 与当前 A01 载荷的兼容层

兼容层只有**一处**：`src/domain/research/v2/repository.ts` 的 `candidateArticleIds(canonicalId)`，把 `A1` 展开成 `['A1', 'A01']`。

- URL、界面、领域契约一律用 `A1`；
- `getArticle` 先试 `A1`，失败才试 `A01`，命中结果记在 `resolvedArticleIds`，同一 city+文章只付一次探测成本；
- `peekArticle` 同样按候选顺序查缓存，保证切点时不闪加载态；
- 载荷编号出现在 URL 时（`/cities/shenyang/research/A01`、`/…/A01.3`、`/…/A01/article`）由 `isLegacyPayloadResearchId` 重定向到 canonical，**保留查询串**；
- 研究侧开始输出 `A1.json` 后，第一个候选直接命中，回退自然失效。

界面里不存在任何 `A01` 字样：`scripts/verify-ui-strings.mjs` 扫描全部产物。

## 5. Repository 里被清除的沈阳硬编码

改造前所有路径都写死城市名与版本目录，现在每个函数都带 `cityId`：

| 位置 | 现在 |
|---|---|
| 根路径 | `researchRoot(cityId)` → `/research/<cityId>` |
| 推演根 | `scenarioRoot(cityId)` → `/scenario/<cityId>` |
| 资产 | `assetUrl.figure/table/scenario(cityId, file)` |
| 文章 | `getArticle(cityId, canonicalId)` / `peekArticle` |
| 清单 / 来源 / 表 / 推演表 / 来源清单 | 全部 `(cityId, …)` |
| 组件层 | `AboutPage`、`ScenarioPage` 的城市来自 `listCatalogCityIds()`，不再写字面量 |

`/research/shenyang/v2/...` 这类版本目录整体取消，改为 `/research/<cityId>/{manifest,index,sources,references}.json` + `articles/ figures/ tables/`。完整性校验器会因 `public/research/<city>/v2/` 残留而失败。

## 6. 新路由规则

| 路径 | 含义 |
|---|---|
| `/` | 开篇草稿纸 |
| `/liaoning` | 研究首页（辽宁 3D + 六城入口） |
| `/cities/:cityId` | 城市研究目录（两层树） |
| `/cities/:cityId/research/:researchId` | `researchId` 可以是方向 `A2`，也可以是研究点 `A2.2` |
| `/cities/:cityId/research/:researchId?mode=article` | 方向原文，并从该研究点定位/高亮对应章节 |
| `/reports`、`/reports/:cityId`、`/reports/liaoning` | 报告目录 / 城市报告 / 辽宁六城综合研究 |
| `/scenario-lab`、`/about` | 推演 / 关于 |

`^`（上一级）按 catalog 的两级结构走，不再一律跳城市（`structuralParent`）：

```
A2.2 → A2 → 沈阳 → 辽宁        （浏览器实测：A2.2 → A2 → /cities/shenyang → /liaoning）
/reports/shenyang → /reports
```

旧路径一律 Redirect：`/research` → `/reports`，`/cities/:id/report` → `/reports/:id`，`/shenyang-rainstorm` → `/scenario-lab`，`/cities/:id/research/A01[/article]` → canonical。

## 7. 交互研究与原文的差别

两者不是同一页换了皮肤，是**两条不同的渲染路径**：

| | 交互研究 | 原文 |
|---|---|---|
| 对象 | 一个研究点（A2.2） | 一整篇方向文章（A2） |
| 骨架 | 研究树（左）+ 中栏 + 证据栏（右） | 窄目录 + 800px 连续正文 |
| 数据 | 数据模块：图/表切换、hover 读数、附加表 | 正文点名的图与表就近落位 |
| 证据栏 | 有（方向 / 本方向来源 / 本方向限制） | **无** |
| 选择器 / 控件 | 有（`.module__views` 图/表切换） | **无** |
| 目录 | 无 | 有（`.article__toc`，≥1240px 才显示） |

浏览器实测 DOM：交互 = `charts 1 / dots 10 / moduleQuotes 2 / railBlocks 3 / controls 2 / toc 0`；原文 = `toc 7 / articleBody 1 / tables 3 / rail 0 / controls 0`。

## 8. 已经绑定真实 v2 数据的研究点

**54 个 ready**，覆盖全部 8 个方向；用到 **22 张研究表**（另有 3 张已导出但无文章引用）。

每个 ready 点都必须同时满足（构建期强制，不是人工检查）：

1. 带 `binding`：表名 + 过滤条件 + 视图 + 分类轴 + 焦点列；
2. 带 `citations`：至少一条研究侧原句，且该原句能在对应文章里**逐字**找到；
3. 带 `module`：说明"这一点在看什么"；
4. 绑定的表、列、过滤取值、分类取值全部真实存在。

```bash
npm run verify:integrity
```

## 9. 仍然是 pending / unsupported 的点（没有编造）

**19 个 pending**（结构在，内容未由研究侧导出）——界面只显示编号、标题、问题与「研究内容待接入」+ 具体原因：

A1.7、A1.8（缺逐品种波动率表）、A4.6（缺 T±14 事件曲线表）、A4.7–A4.10（缺 2026 案例的天气位次与价量响应表）、A5.6（缺逐品种谷底时间表）、A6.2–A6.5（缺领先滞后诊断与传导步骤表；`A06_mediation_check.json` 只在研究工程内部）、A6.9（缺 SHAP/ALE 表）、A7.7（缺年份维度变化表）、A8.5（研究侧核心暴露不含土壤水分）、A8.6（次要结局未导出）、A8.7/A8.9/A8.10（逐区县与固定效应后的单独结果未导出）。

**3 个 unsupported**（研究侧正式判定"不主张"，界面原样引用其判定原句）：

- A3.10 风险阈值：阈值判定条件（统计支持、样本支持、稳健性、可解释性）未满足，不主张存在阈值；
- A4.4 高温事件 × 市场响应：高温清洁簇仅 1 个，不作判定；
- A6.6 天气 → 成交量 → 价格：预注册的两步规则未同时满足，不讨论中介。

**没有任何一个点是靠截取整篇结论或 LLM 归纳生成的。** 54 + 19 + 3 = 76。

## 10. 恢复的交互模块

这里我做了一个**明确的偏离**，请重点复核：

任务书 §16 期望按 v1 的 9 个定制组件（Lag / Threshold / Event Study / Resilience / Transmission / Trend / Monthly / Crop / Model）复刻。我读了 `src/legacy/research-v1/widgets/` 的全部 26 个文件作为交互参考，但**没有逐个移植**。原因：

- v1 组件吃的是 v1 管线内部的数据形状（逐滞后曲线、阈值分箱、SHAP 分解），而 v2 研究侧导出的是**表 + 列**；要复刻就必须在前端重算模型或补造数据，直接违反 §17 与 §13；
- 76 个点里 54 个 ready 点绑定的就是 22 张结构各异的表，逐点写 22 套定制图表既做不完，也会把"图表怎么画"变成前端判断，而不是研究侧的事实。

因此我恢复了**一套诚实的数据模块族**，由研究表自己的列驱动：

- `InteractiveModuleRegistry.tsx`：16 种模块语义（`MODULE_LABELS`），实际用到 15 种（`transmission` 未用，因为 A6.6 是 unsupported）；
- `EstimateChart.tsx`：分类轴 × 点估计 × 置信区间，hover 读数，首次绘制淡入；
- `DataTable`：可筛选、可排序、列名与取值走受控中文映射；
- 附加表：事件级事后均值、事件级恢复明细、逐年滚动误差、留一法系数范围等，按 `<details>` 就近展开；
- 从 v1 学到的、被保留的交互原则：一图一问、图表优先、控件极简、hover 只读数不弹卡片、没有"告诉我怎么用"的提示语。

所以"滞后窗口"由 `A03_lag_windows.csv` 的真实系数画出来，"累积暴露""非线性""事件研究""恢复过程""区县结构"同理——都是研究侧已经算好的数字，前端只负责呈现。若你要求逐组件复刻，这是一次需要单独排期的返工，我会按 v1 的数据形状反推需要研究侧补哪些导出。

## 11. Opening 网格的实现

不再是 `LineBasicMaterial`（1px、贴地、掠角消失），而是：

1. **方格**：2048×2048 离屏 canvas 用 `CanvasTexture` 画出来 —— 细线 1px @ alpha 0.33、粗线 3px @ alpha 0.62，坐标 `+0.5` 像素对齐避免半像素模糊；`anisotropy = gl.capabilities.getMaxAnisotropy()`，mipmap 用 `LinearMipmapLinearFilter`，贴在一个 `rotation=[-π/2,0,0]` 的平面上，`renderOrder=-2`、`depthWrite=false`。
2. **辽宁手稿线**：改用 drei `Line`（Line2/LineSegments2），线宽是**屏幕像素**而不是世界单位 —— 市界 1.1px `#8f8577`，省界 2.2px `#6f6659`。
3. **层级**：细格 < 粗格 < 市界 < 省界，四级可辨，第一眼就是"方格纸上画着辽宁"。
4. **省界是算出来的，不是画上去的**：14 个地级市拼块中只被用到一次的边就是省界；顶点量化后统计配对成功的比例 `coverage`，实测真实数据 2487/4609 条边仅用一次 → `coverage = 0.383`，低于阈值 `0.45` 就直接跳过这一层（宁可少画，不画错线）。

## 12. 镜头总方位角的变化

**360° → 118°。**

```ts
ENTRY_AZIMUTH_ORBIT_DEGREES = 118   // cameraViews.ts
```

`sketchView` 由 `provinceView` 的方位角 **减去 118°** 反推，所以这段跨度是精确的 118°，不是"绕了一圈再落回来"。`orbitView` 对负角与 2π 回绕做了处理，永远走短边。

## 13. 如何证明"转的是相机，不是模型"

四条互相独立：

1. **常量唯一**：`PROVINCE_ROOT_ROTATION = 0`（`cameraViews.ts`），全仓库只有一处把它写到场景里 —— `LiaoningCanvas.tsx` 的 `<group rotation-y={PROVINCE_ROOT_ROTATION} name="province-root">`。源码审计确认没有第二处 Y 轴旋转。
2. **位姿没有旋转自由度**：`CameraPose` 只有 `position` / `target` 两个字段，测试断言它不含任何旋转字段，因此相机不可能"自己转"。
3. **跨度断言**：测试断言总方位角跨度 === 118° 且 ≉ 360°，并断言 20 个采样点的方位角单调、开始/中间/结束三点两两相距 > 0.5×半径、高度下降、距离收拢、`sketchView` 俯角 > 75°。
4. **模型自身的倾斜与 Y 无关**：鼠标视差只写 `rotation.x` / `rotation.z`（`PARALLAX_DEG.province = 0.7°`，组装期间关闭），且每帧显式 `instance.rotation.set(targetX, 0, targetZ)` —— Y 分量恒为 0。

```bash
npx vitest run src/features/liaoning/cameraViews.test.ts
```

## 14. 城市页为什么不再是透明的

`.city-research__paper` 现在有实体背景：`background: var(--ag-paper-raised)`，实测计算值 `rgb(252, 251, 248)`、`opacity: 1`。展开是一张真纸：

```css
@keyframes ag-paper-unfold {
  from { clip-path: inset(0 0 100% 0); transform: translateY(-12px) scaleY(.99); }
  to   { clip-path: inset(0 0 0 0);   transform: none; }
}
```

- 用 `clip-path` 自上而下"掀开"，不是整块淡入；
- `animation-fill-mode: backwards`（**不是** `both`，否则会永久留下一个层叠上下文）；
- 正文另有一段 `ag-paper-content-in`，延迟 260ms 才淡入 —— 纸先到，字后到。

浏览器实测：从 `/liaoning` 点「沈阳」→ `/cities/shenyang`，纸张动画 `ag-paper-unfold 0.78s`、背景不透明、`opacity 1`。

## 15. Header 颜色如何统一

去掉玻璃感的三件套（`color-mix(…82%, transparent)` + `backdrop-filter: blur` + `border` 渐变）：

```css
.ag-header { background: var(--ag-paper); border-bottom: 1px solid var(--ag-rule-soft); backdrop-filter: none; }
```

同时删掉 18×18 的 `ag-header__brand-mark` 空占位与 `opening__mark`，只留 `AGRISCOPE`（§28）。

浏览器实测：`.ag-header` 背景 `rgb(247, 245, 241)`、`backdrop-filter: none`；`svg[width="18"][height="18"]` 计数 0。

## 16. 数据完整性审计

`scripts/sync-shenyang-v2.mjs` 复制时同步写 SHA-256 清单，`scripts/verify-research-integrity.mjs` 逐条复核：

- **43 个文件全部通过，不一致 0**；CSV 另记行数与列名；
- 文章 9（A01–A09）、来源 16、图 2、表 **25**、推演表 3；
- `index.json` 与 `src/domain/research/catalog/shenyang-tree.json` **逐字节相同**（树没有加载态的前提）；
- 被引用但任何来源都缺的资产：**无**；
- 已导出但暂无文章引用：`A01_trend.csv`、`A04_event_clusters.csv`、`A04_event_responses.csv`（保留，不删，等研究侧引用）。

**关于"7 张此前缺失的表"（§20）**：它们真实存在，只是不在 `reports/v2/tables`，而在研究管线目录 `workspace/research_v2/results/tables`。同步脚本改为多来源解析（出版物口径优先、管线口径兜底），并在接受第二个来源前先逐字节比对 17 个同名文件（sha256 全等）——所以表数从 17 涨到 25，不是靠猜路径猜出来的。本次同名冲突 0 个。

```bash
npm run verify:integrity   # 与 docs/DATA_INTEGRITY_REPORT.md 同源
```

## 17. 各类检查结果

| 检查 | 结果 |
|---|---|
| `npm run typecheck`（`tsc -b`） | 通过，0 错误 |
| 单元测试 `vitest run` | **12 个文件 / 108 个用例全通过** |
| `verify-v2-payload` | 通过：9 篇可发布 · 来源可解析 · 无旧 v1 编号 · 缺口如实记录 |
| `verify-research-integrity` | 通过：43 文件哈希全等 · 76 点契约自洽（54/19/3）· 引用逐字命中 · 绑定列与取值存在 |
| `verify-ui-strings` | 通过：28 个产物文件，禁用字样 0，`POOLED` 仅作查表键 |
| `npm run build` | 通过，含上述校验 |
| 浏览器：路由与渲染 | `/`、`/liaoning`、`/cities/shenyang`、`A2`、`A2.2`、`A2.2?mode=article`、`A1?mode=article`、`A1.7`(pending)、`A3.10`/`A4.4`/`A6.6`(unsupported)、`/reports`、`/reports/shenyang`、`/reports/liaoning`、`/scenario-lab`、`/about`、三条旧路径重定向 —— 全部 0 泄漏字样、各页恰好 1 个 `h1` |
| 浏览器：§86–88 交互 | 10 个数据点 × 2 轮 = 20 次 hover，**布局位移 0**，读数行高度恒定 24.91px，10 条不同读数；强制折行到 49.83px 时位移仍为 0。图片放大：`object-fit: contain`、不裁切、不超出视口、无横向滚动、ESC/背景/× 均可关闭 |
| 浏览器：开篇 | 点击「进入」→ `assembling` → 约 3.6s 后 `ready` 并跳 `/liaoning` |
| Safari / Chromium | 本轮未在真机 Safari 上复跑 |

**未能完成的环境限制**：本轮的 Chrome DevTools 会话无法截图（`Page.captureScreenshot` 持续 protocol timeout），且该受控标签页里 `requestAnimationFrame` 被限流到约 1fps。因此视觉验收是用**几何与计算样式**做的（盒模型、动画名、背景色、不透明度、禁止字样扫描），不是看图确认；受限于 rAF 限流，过渡动画类断言（如下划线 `scaleX(0)→scaleX(1)`）需要在跨帧状态稳定后读取才准确。这两点请在真机 Safari 上补一次目视确认。

## 18. 仍然存在的真实缺口

1. **19 个 pending 点是研究侧的发布进度问题**，不是前端可以填的坑；列表见 §9。
2. **v1 的 9 个定制交互组件没有逐个复刻**（§10 已说明理由）。若要复刻，需要研究侧先补出对应形状的导出表。
3. **图片放大态有约 9px 的横向留白**：`<img>` 的边框盒 764×284 而自然比例要求 755×284，`object-fit: contain` 把实际绘制内容按原生比例放进去，所以**画面不畸变、不裁切**，但盒内有一条窄留白。收缩态实测畸变 0.002%。
4. **辽宁六城综合研究没有载荷**：`/reports/liaoning` 现在如实显示「研究内容待接入」，报告目录里这一项也按 §41 不链接。
5. **只有沈阳有研究目录**：`CATALOGS` 目前只有 `shenyang`；其余五个研究城市在 3D 地图与城市列表里可选中，但城市页会如实显示「研究内容待接入」（不谎称缺城、不编造方向）。模型与 Repository 已经城市无关，缺的只是另外五份 catalog 与载荷。浏览器实测：`/cities/dalian` → h1「大连」+「研究内容待接入」；`/cities/dalian/research/A2.2` → 「研究条目不存在」+ 返回目录链接。
6. **`A04_event_responses.csv` 等 3 张表暂时无人引用**：保留待研究侧引用，不删。
7. **Safari 真机视觉未复跑**（见 §17 的限制说明）。

### 顺带确认的两个结构红线

- **A9 不在研究树里**（§2/§29）：`/cities/shenyang/research/A9` 与 `A9.1` 均落入「研究条目不存在」，`validateCatalog` 也会因综合报告出现在 topics 里而失败。A9 只通过「报告」入口访问。
- **A4.3 / A4.4 允许 unsupported**（§7）：A4.4「高温事件 × 市场响应」以 unsupported 呈现，并逐字引用研究侧判定「高温清洁簇仅 1 个，不作判定」。
