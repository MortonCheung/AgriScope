# FRONTEND_V4_PLAN

V4 施工计划。**先审计、后施工**；每个 Phase 走「现象 → 代码证据 → 根因 → 修改 → 验证」。

范围约束：只改前端（导航文案 / Loading / Error / Empty / 标题 / 模式名 / 研究树 UI / 来源展示 / 交互说明 / 动画 / 布局 / Three.js / 路由 / 状态）。
**不改** `SHENYANG_RESEARCH.md`、`SHENYANG_RESEARCH_INDEX.json`、研究方法、模型结果、科研结论与正文。

---

## Phase 0 — Baseline

| 项 | 内容 |
|---|---|
| 问题 | 无（记录基线） |
| 当前代码 | branch `main`，HEAD `2f2edd1`（与任务书写法一致，无需 reset） |
| 根因 | — |
| 参考 | — |
| 修改文件 | 无 |
| 修改方式 | `git status --short` / `branch --show-current` / `log -1 --oneline` / `npm install` / `npm run typecheck` / `npm test` / `npm run build` |
| 风险 | 工作区若有用户未提交改动不得覆盖 |
| 验收 | 四条命令全绿并记录输出 |

---

## Phase 1 — 城市按钮 P0（P0-1 / P0-2 / 十九）

| 项 | 内容 |
|---|---|
| 现象 | ① 辽宁页城市入口只剩文字，没有任何可点击的视觉；② 铁岭/朝阳/锦州/丹东/大连点击后完全无反应，路由不变。 |
| 当前代码 | `liaoning-page.css:23-31`：`.liaoning-city { padding: 8px 2px; border: 0; background: none; }`。<br>`SpatialShell.tsx:77-80`：`if (!city.hasResearch) { setNotice(...); return; }`。<br>`LiaoningPage.tsx:20-24`：`liaoning-page__hint` 整块。 |
| 根因 | ① V3 把城市入口「去卡片」时删过头，连基本可点击性（背景/边框/热区）一并删掉——违反 §五「用户不写也能看出来」的反面：现在**看不出来**。<br>② 「无研究数据」被当成「不可进入」，在 `handleSelectCity` 里提前 return，路由根本没发生。 |
| 参考 | ponytail：删除优于新增，但不能删掉可操作性；§十五/§十六 给出明确视觉规格 |
| 修改文件 | `LiaoningPage.tsx`、`liaoning-page.css`、`SpatialShell.tsx` |
| 修改方式 | ① 城市按钮恢复为直角矩形（`min-height:42px`、1px `--ag-rule` 边、`--ag-paper` 底、hover 变 `--ag-paper-deep` + ink，无 underline/glow/shadow/scale）；② 删除 hint 整块；③ `handleSelectCity` 删除 `hasResearch` 早退，统一 `Click → Camera Focus → Route /cities/:id`，无数据城市仍进页面，页面只显示城市名 + 「研究内容待接入」。 |
| 风险 | 移除早退后，无研究城市会进入 `CityResearchSpacePage`，该页现在对 `!city.hasResearch` 有单独分支——需同步改为「城市名 + 研究内容待接入」，否则显示「尚未接入」之类开发文案。 |
| 验收 | 六个按钮 `visible`、有背景、热区 ≥40px；`document.elementFromPoint` 命中的最上层就是按钮；六个城市逐个点击都发生路由变化；页面不再出现「拖动可旋转沙盘」「点击进入研究」「研究尚未接入」。 |

---

## Phase 2 — Header ‹ › ^（P0-6 / 八 / 九 / 十 / 十一 / 十二）

| 项 | 内容 |
|---|---|
| 现象 | Header 只有「← 返回」，没有前进与上一级。 |
| 当前代码 | `appHistory.tsx:29-34` `AppHistoryValue` 只有 `canGoBack` / `goBack`；`state.entries` / `state.index` 已存在。<br>`AppHeader.tsx:52-54` 使用 `AppBackButton label="返回"`。 |
| 根因 | 历史栈只记录了「可后退」，未暴露「可前进」；`^` 也从未与 `structuralParent()` 连接。 |
| 参考 | Apple Help 的层级定位；Windows Explorer 的前进/后退语义 |
| 修改文件 | `appHistory.tsx`、`AppHeader.tsx`、`app-header.css`、新增 `components/NavigationControls.tsx` + `navigation-controls.css` |
| 修改方式 | ① `AppHistoryValue` 增 `canGoForward` / `goForward`；`canGoForward = index < entries.length - 1`；`goForward` 设 `pending{direction:1}` 后 `navigate(1)`（`recordAppLocation` 的 PUSH 分支已经 `slice(0, index+1)`，前进栈在主动导航时自动废弃，符合 §九）。② 新增 `NavigationControls`：`‹` `›` `^` 三个无背景/无圆角/无边框控件，hover 只做 opacity + 1–2px 位移，禁用态 `opacity:.24 + pointer-events:none`（图标保留）；`^` 调 `structuralParent(pathname)`。③ Header 左侧改为 `[穹衡 AGRISCOPE] ‹ › ^`，移除「← 返回」文案。 |
| 风险 | `goForward` 依赖 react-router 的 `navigate(1)`；若前进目标不在 entries 内需保持不动。`^` 在 `/` 上应禁用。 |
| 验收 | 辽宁→沈阳→C5 后：`‹`→沈阳，`›`→C5，`^`→沈阳；沈阳页 `^`→辽宁；按钮禁用态仍可见。 |

---

## Phase 3 — 综合研究路由（P0-5 / 十三 / 十四）

| 项 | 内容 |
|---|---|
| 现象 | 顶部「研究」跳到 `/cities/shenyang/report`，把沈阳报告冒充省域综合研究。 |
| 当前代码 | `AppHeader.tsx:22-26`：`{ to: ROUTES.report('shenyang'), label: '研究', match: … }`；`routes.ts` 无 `/research`。 |
| 根因 | 产品层级错误：V2 时期「研究」被定义为「正式研究内容」，V4 明确「研究 = 辽宁六城综合研究」。 |
| 参考 | §七十二 信息架构 |
| 修改文件 | `routes.ts`、新增 `features/research/ProvinceResearchPage.tsx`、`app/AppRouter`（挂路由）、`AppHeader.tsx` |
| 修改方式 | ① `ROUTES.provinceResearch = '/research'`；② 新建页面 Shell：标题「辽宁综合研究」+ 六城清单（真实城市名）+ 内容区空/「内容待接入」一句；**不复制沈阳报告、不造研究内容**；③ `structuralParent('/research') = '/'`；④ Header「研究」指向 `/research`，Active 只匹配 `/research*`；「辽宁」Active 收回 `/liaoning`、`/cities/*`、`/shenyang-rainstorm`。 |
| 风险 | 必须避免 `/research` 与 `/cities/:id/research/:rid` 的路由前缀冲突（React Router 按完整路径匹配，无冲突，但需实测）。 |
| 验收 | 点「研究」到 `/research`；`/cities/shenyang/report` 不再让「研究」高亮，而是「辽宁」高亮。 |

---

## Phase 4 — Parallax 重写（P0-3 / P0-4 / 二十 / 二十一）

| 项 | 内容 |
|---|---|
| 现象 | 鼠标移动时辽宁一开始会倾斜，约 0.44s 后不再响应；且进入 `/liaoning` 后完全没有视差。 |
| 当前代码 | `LiaoningCanvas.tsx:44-49`：`ParallaxGroup` 用 `useAnimationFrames(moving, MOTION_DURATION.slow)`（slow=0.44s）驱动；`enabled={mode === 'opening'}`。 |
| 根因 | 用**固定时间帧窗口**驱动一个本应持续响应 pointer 的动画：窗口关闭后即使 `running` 仍为 true，也不会重启；且 `enabled` 只允许 opening。 |
| 参考 | §二十 伪代码；ponytail：不加物理引擎，用已有 `invalidate` |
| 修改文件 | `LiaoningCanvas.tsx`、`design/motion.ts`（新增 parallax 强度 token） |
| 修改方式 | ① `pointermove` → 写 `target` → 立即 `invalidate()`；② `useFrame` 中 `rotation` 向 target lerp，**未收敛**（>0.0002）继续 `invalidate()`，收敛即停；③ `enabled` 改为 `opening || province`，Opening ±1.2–1.6°、Province ±0.5–0.8°，city reader 关闭；④ **不出现任何「拖动时暂停视差」文案**。 |
| 风险 | 与 CameraControls 拖动共存时可能出现「双重旋转」观感，需现场调强度；不得引入逐帧常驻渲染（必须收敛即停）。 |
| 验收 | Province 页持续移动鼠标 5–10s，模型始终平滑跟随；停止移动后帧率回落（不再 invalidate）。 |

---

## Phase 5 — UI Copy Audit（三十八 ~ 四十三）

| 项 | 内容 |
|---|---|
| 现象 | 页面出现大量「告诉用户界面是什么」的前端包装文案与开发态文案。 |
| 当前代码 | `liaoning-page__hint`（拖动可旋转沙盘/点击进入研究/研究尚未接入）；`city-space__hint`（选择左侧任一研究点查看摘要）；`AsyncBoundary` 的「正在读取…」；`research-point__backlink`（查看研究依据）；`ResearchInsightDock` 的「下面的图表…」；`EvidenceRail` 的「来源声明」等内部标题。 |
| 根因 | 前端在 V1–V3 累积了「解释界面」的文字，违反 §五/§七十五。 |
| 参考 | ponytail：删除优于新增；§七十五 的三问 |
| 修改文件 | 全量扫描 `src/**/*.tsx`；`docs/UI_COPY_AUDIT.md`（新建） |
| 修改方式 | 逐条二分 KEEP / REMOVE / REWRITE / INTERNAL_ONLY；删除 §三十九 明列项；内部字段名（前端一句话/来源声明/sourceOfTruth/frontendText/provenance）只停止渲染，不改源文件。 |
| 风险 | 删过头会失去必要的空态/错误态指引——Error 与 Empty 必须保留可理解的一句话。 |
| 验收 | 页面文本中不再出现 §六十七 E2E 4 的禁用词表。 |

---

## Phase 6 — 文章切换体验（四十四 / 四十五 / 四十六）

| 项 | 内容 |
|---|---|
| 现象 | 切研究点时旧内容消失 →「正在读取…」→ 新内容出现，刷新感强。 |
| 当前代码 | `ResearchPointPage` 的 `useArticle` 在 `articleId` 变化时 `setState({status:'loading'})`，`AsyncBoundary` 整块替换。 |
| 根因 | 正文加载态与外壳耦合；无缓存、无预取。 |
| 修改文件 | `services/ResearchRepository.ts`（内存缓存 + 预取）、`ResearchPointPage.tsx`、新增 crossfade 容器 |
| 修改方式 | ① 进入城市后 `requestIdleCallback`（fallback `setTimeout 0`）预取 17 篇 article；② 文稿缓存命中即同步渲染；③ 未命中时**保留旧正文**，仅在正文区做 120–180ms crossfade；④ Research Tree 与 Evidence Rail 不重置；⑤ 大 CSV 只在图表区出局部 skeleton。 |
| 风险 | 预取 17 篇会增加首次进入城市的并发请求；需限制并发并复用既有 fetch 封装。 |
| 验收 | C3 → G9 切换时 Research Tree 保持、无整页 Loading、无空白。 |

---

## Phase 7 — Figure Zoom（四十七 / 四十八 / 四十九）

| 项 | 内容 |
|---|---|
| 现象 | 需要点「放大」按钮才能放大；图片放大后可能被裁切。 |
| 当前代码 | `ResearchFigure.tsx` / `ChartFrame`：`useFocusable` + `.ag-focus-toggle` 文字按钮；`focus.css` 的 `[data-expanded]` 为 `inset:24px` + `overflow:auto`。 |
| 根因 | Focus 的触发被绑定到按钮而非图像本体；且放大容器未限定 `object-fit: contain` 与视口上限。 |
| 修改文件 | `ResearchFigure.tsx`、`research-figure.css`、`design/focus.css` |
| 修改方式 | ① ResearchFigure 正常态 `cursor: zoom-in`，点击图像本体 → 同一元素进入 focus；**删除「放大」文字按钮**；② focus 内 `object-fit: contain; max-width: calc(100vw - 64px); max-height: calc(100vh - 80px)`，禁止 cover / overflow:hidden / 固定比例；③ 保留标题与来源；④ 关闭＝点击背景 / ESC / `×`，**`‹` 不用于关闭**。 |
| 风险 | ChartFrame 是交互图表，不应被「点图放大」误触发；仅 ResearchFigure 走点击放大。 |
| 验收 | 点击静态图片直接放大、完整无裁切、ESC 可关。 |

---

## Phase 8 — Hover / Typography QA（五十 / 五十一 / 五十二）

| 项 | 内容 |
|---|---|
| 现象 | 图表 hover 时容器高度变化导致鼠标反复进出抽搐；SVG 标签重叠。 |
| 当前代码 | `widgets.css` 的 readout 行高度随内容变化；`primitives.tsx` 各图表把效应值/p/CI/n 一起塞在图内。 |
| 根因 | hover 改变布局几何尺寸；图内信息密度过高。 |
| 修改文件 | `widgets.css`、`primitives.tsx`、各 chart 组件 |
| 修改方式 | ① 新增全局规则：hover 不得改变布局几何；Tooltip `position:absolute; pointer-events:none`；readout 预留下固定 `min-height`（如 72px），无 hover 时显示 `—`；② 图内只留最重要一个读数，p / CI / n / HAC SE 移入固定读数区；③ 1280/1440/1512/1728 四档检查长标题、按钮、研究树、Evidence Rail。 |
| 风险 | 缩小图内标签可能丢失必要信息——统一移到读数区而非删除。 |
| 验收 | 同一图表进出 20 次，bounding box 无上下跳动。 |

---

## Phase 9 — Source UI Contract（五十三 / 五十四 / 五十五）

| 项 | 内容 |
|---|---|
| 现象 | 界面把 `trend_by_crop.csv`、`SHENYANG_RESEARCH.md` 这类**技术血缘**当成「数据来源」显示；缺失时显示开发文案「来源未在当前前端索引中声明」。 |
| 当前代码 | `SourceCitation.tsx` 直接把字符串数组当来源；`adapters.ts` 的 `provenance` 来自 `sourceOfTruth`（文件路径）；`ResearchEvidenceRail` 用「来源声明」列出文件路径。 |
| 根因 | 未区分 **Source**（用户可见的机构/数据集）与 **Lineage**（技术血缘）。索引里只有 lineage，没有 SourceRef metadata。 |
| 修改文件 | 新增 `domain/research/sourceRef.ts`（`SourceRef` / `LineageRef` 类型 + 从索引安全映射）、`SourceCitation.tsx`、`ResearchEvidenceRail.tsx` |
| 修改方式 | ① 定义 `SourceRef{organization,dataset?,title?,url?,accessedAt?,type}` 与 `LineageRef{artifact?,table?,figure?}`；② 正式 UI 只渲染 `SourceRef`；Lineage 只出现在开发模式/技术折叠区；③ **无 metadata 时 Production 不显示来源块（或「来源待补充」），不显示开发文案，也绝不由 Agent 猜网站**；④ 开发态 `console` 输出 `Missing SourceRef: <point>/<figure>` 并登记 `docs/SOURCE_GAPS.md`。 |
| 风险 | 索引目前没有 SourceRef，正式界面来源块会普遍为空——这是**如实**结果，不得用 lineage 顶替。 |
| 验收 | 正式页面不出现 `.csv` / `.md` 作为来源；不出现「来源未在当前前端索引中声明」。 |

---

## Phase 10–12 — Opening 重构（二十二 ~ 三十七）

| 项 | 内容 |
|---|---|
| 现象 | 现有 Opening 是自动播放：轮廓自动画 → 自动隆起 → 标题 → 查看辽宁。 |
| 当前代码 | `OpeningPage.tsx` 用 reveal 进度自动驱动；`LiaoningCanvas` 的 `mode==='opening'`；`openingSession.ts` 只播一次。 |
| 根因 | 缺少「用户触发」这一环；没有 sketch 状态，也没有以“市”为单位的组装。 |
| 参考 | Awwwards/Illoca 的草图与纸面；Gil 的对象连续性 |
| 修改文件 | 新增 `features/opening/OpeningPage.tsx`(重写)、`SketchPaper.tsx`、`openingPhase.ts`；`LiaoningCanvas.tsx`、`CitySolidMesh.tsx` |
| 修改方式 | ① 状态机 `type OpeningPhase = 'sketch'|'assembling'|'settling'|'ready'|'exiting'`（不堆布尔）；② Sketch：暖白纸 + 极浅暖灰方格（minor .035–.055 / major .07–.10）+ 手稿级市界，Extrude≈0 或只留 Edges，**无 Label/按钮/研究状态**；③ 点击「进入 →」才 assembling；④ 以 14 个地级市为单位按「到沈阳 centroid 距离」确定性错峰下落（`Y + dropHeight`，rotX/Z ±2°→0，opacity 0→1，落地轻微过冲），dropHeight 由比例决定，不用固定 50；⑤ Camera：Sketch 近垂直俯视 → Assembly 后退+抬升 → Settling 收敛到 `/liaoning` 完全一致的位姿；⑥ 纸面网格与原始边界**始终留在下方**；⑦ 同一个 Canvas / 同一组 Mesh，路由切到 `/liaoning` 不重挂；⑧ Header 在 Opening conceal、进入 `/liaoning` 平滑出现；⑨ Reduced Motion 直接呈现完成态。 |
| 风险 | ① Camera 终点必须与 province 完全一致，否则路由切换会跳；② 14 块同时下落的帧成本，需 `frameloop="demand"` 下有限帧窗口；③ `useAnimationFrames` 是有限窗口，Opening 时长超出窗口会静止——需为 assembling 单独驱动到收敛。 |
| 验收 | §六十八 全流程：无闪白、无第二张地图、无突然切 Camera。 |

---

## Phase 13 — Visual Polish

材质、Grid opacity、drop timing、Camera easing、Parallax strength、Typography reveal 统一收敛。

---

## 全局风险与约束

1. **不新增依赖**（GSAP/anime/lottie/物理引擎一律不引入）。
2. 只改前端；研究 JSON 与结论不动。
3. 每 Phase 结束必须 `typecheck → test:unit → build`，不允许全部写完再修。
4. 工作区若有用户未提交改动，不得覆盖。
5. 外部参考站本轮未能完整抓取，动效结论沿用 V2 审计（已在 `FRONTEND_REFERENCE_AUDIT_V4.md` 注明）。
