# iTeach → AgriScope 迁移矩阵（ITEACH_MIGRATION_MATRIX）

分类：**保留 / 重命名 / 重写 / 删除**。所有删除项都已确认被新组件取代。

## 应用层

| iTeach 文件/模块 | 操作 | AgriScope 新模块 | 原因 |
|---|---|---|---|
| `src/app/routes.ts` | 重写 | `src/app/routes.ts` | 教育路由整体替换为城市/研究/情景路由 |
| `src/app/AppRouter.tsx` | 重写 | `src/app/AppRouter.tsx` | 移除 `migrateV9` 与教育页面树 |
| `src/app/AppShell.tsx` | 重写 | `src/app/AppShell.tsx` | 外壳改为"导航 + 单 Canvas 空间舞台" |
| `src/app/RootChromeShell.tsx` | 删除 | （并入 `AppShell`） | Pico/学习空间专属 chrome |
| `src/app/appHistory.tsx` | 保留 | 同路径 | 通用历史方向状态机 |
| `src/app/RouteTransition.tsx` | 保留 | 同路径 | 通用转场容器 |
| `src/app/routeTransitions.ts` | 重写 | 同路径 | 路由层级与空间路由改为 AgriScope 语义 |
| `src/app/route-transitions.css` | 重写 | 同路径 | 去掉 `context-nav` 分组 |
| `src/app/pageNavigation.tsx` | 保留 | 同路径（事件改名） | 通用导航与 View Transition 封装 |
| `src/app/ComingSoon.tsx` | 删除 | — | 教育占位页 |
| `src/design/tokens.css` … | 重写 | `src/design/{tokens,typography,layout,components}.css`、`motion.ts`、`chartTokens.ts` | 深色教育体系整体替换为暖白研究出版物体系 |
| `src/design/{app.css,landing.css,domainPalette.ts}` | 删除 | — | 教育视觉体系 |
| `src/styles.css` | 删除 | — | 深色全局样式被 `design/layout.css` 取代 |
| `src/motion/tokens.ts` | 重写 | `src/design/motion.ts` | 令牌收敛到新体系 |
| `src/performance/**` | 保留 | 同路径 | 通用性能策略（DPR / 画质档） |
| `src/test/setup.ts`、`src/vite-env.d.ts` | 保留 | 同路径 | 测试与环境声明 |

## 领域层

| iTeach 文件/模块 | 操作 | AgriScope 新模块 | 原因 |
|---|---|---|---|
| `src/domain/knowledge/**` | 删除 | `src/domain/research/**`、`src/domain/geography/**` | 知识域（KnowledgePoint/知识树）替换为研究域 |
| `src/domain/learning/**` | 删除 | — | 学习证据域不再存在 |
| `src/graph/**` | 删除 | `src/features/liaoning/liaoningGeometry.ts` | 知识图模型替换为行政区域几何 |
| `src/data/**`（含 `v6/**`） | 删除 | `public/research/shenyang/**` + `services/ResearchRepository` | 教育题库/知识库替换为研究索引 |
| `src/ai/**` | 删除 | （预留）`features/insight` 研究解读 | 组树/教学决策/学习推荐为教育逻辑 |
| `src/store/**` | 删除 | `features/spatial/spatialStageStore.ts` | 分域教育状态全部移除，只保留空间舞台状态 |
| `src/services/{content,persistence,resetDemoData}` | 删除 | `services/{ResearchRepository,csv,useCityResearch}` | 教育内容仓库替换为研究仓库 |

## 场景层

| iTeach 文件/模块 | 操作 | AgriScope 新模块 | 原因 |
|---|---|---|---|
| `src/scene/CameraController.tsx` | 删除 | `features/liaoning/LiaoningCanvas.tsx`（CameraRig） | 原实现绑定知识图 `SceneModel`，不可直接复用 |
| `src/scene/{KnowledgeCurves,KnowledgeNodeMesh,NodeHitField,NodePointField,BatchedKnowledgeEdges}` | 删除 | `features/liaoning/CitySolidMesh.tsx` | 知识节点/突触渲染替换为城市实体渲染 |
| `src/scene/{cameraFraming,entryShot,intro,reveal,neuronAppearance,ScenePresenceController,ScreenAnchorTracker}` | 删除 | — | 教育开场/揭示逻辑无对应业务 |
| `src/features/spatial/SpatialStageCanvas.tsx` | 重写 | `features/liaoning/LiaoningCanvas.tsx` | 保留"单 Canvas + 需求驱动渲染"思路 |
| `src/features/spatial/SpatialViewport.tsx` | 删除 | — | 遮挡测量服务于教育面板布局 |
| `src/features/spatial/transitions/**` | 删除 | — | 目标组树抽取动画为教育业务 |
| `src/features/spatial/spatialStageStore.ts` | 重写 | 同路径 | 舞台模式改为 opening/province/city/none |

## 特性层（教育业务页面）

| iTeach 目录 | 操作 | AgriScope 新模块 | 原因 |
|---|---|---|---|
| `features/library`、`library-builder` | 删除 | `features/city` | 知识库 → 城市研究空间 |
| `features/knowledge-tree*`、`knowledge-point-builder` | 删除 | `features/research` | 知识树编辑 → 研究点交互研究 |
| `features/landing` | 删除 | `features/opening` | 星座开场 → 暖白 Opening |
| `features/practice`、`study`、`teaching`、`tutor` | 删除 | — | 学习/教学业务 |
| `features/progress` | 删除 | `features/report` | 学习进度 → 城市综合研究 |
| `features/universe` | 删除 | `features/liaoning` | 知识宇宙 → 省域 3D 沙盘 |
| `features/workspace`、`pico` | 删除 | — | 编辑工作区与 Pico 助手 |
| `components/**`（教育组件） | 删除 | `components/{EvidenceBadge,KeyNumberGrid,AsyncState,ResearchFigure}` | 教育 UI 替换为研究内容组件 |
| `functions/api/{chat,speech}.ts` | 删除 | — | 教育聊天/语音后端 |

## 其它

| iTeach 文件/模块 | 操作 | AgriScope 新模块 | 原因 |
|---|---|---|---|
| `e2e/**`、`playwright.config.ts` | 删除 | — | 用例全部针对教育流程 |
| `public/lottie/mastery-check.json`、`public/models/Pico.glb` | 删除 | — | 教育素材 |
| `AGENTS.md`、`README.md` | 重写 | 同路径 | 描述 AgriScope 产品边界 |
| `docs/**` | 删除 | `docs/**`（本目录） | 旧教育文档不覆盖新产品边界 |

## 保留的通用命名

`RouteTransition`、`pageNavigation`、`appHistory`、`PerformancePolicy`、`qualityPolicy`、
`SpatialStage（重写后）`、`CameraRig（新增）`、`MotionToken` —— 属于技术层，可继续使用。

## V3 收口：`src/legacy/` 目录清理记录

**删除日期：2026-10-09**（分支 `feat/frontend-v3-arch-consolidation`，Phase 7）。

上表有的行标注「删除」是 iTeach → AgriScope 的第一次迁移；本节的「删除」是 V3 架构收口时，
对**已经完成迁移、确认零生产引用**的过渡目录做最终移除。删除前多路取证，全部命中才执行。

| 被删目录/文件 | V3 替代物 | 删除依据 |
|---|---|---|
| `src/legacy/city-v1/`（`CityResearchSpacePage`、`CityReportPage`、`city-space.css`） | `features/research-v2/CityResearchPage.tsx`、`features/report/ReportPage.tsx` | 无 import / 无路由 / 无测试 / 无文档必需引用；内部 import 目标已不存在 |
| `src/legacy/research-v1/`（含 `widgets/`、`tree/`、`workspace/`、`data/`） | `features/research-v2/`（`ResearchArticleView`、`ResearchTree`、`TopicExplorer`、`InteractivePointView`、`EvidenceRail`、`DataTable`、`Figure`、`ResearchSources`） | 同上；`../research/**` 源目录已不存在 |
| `src/legacy/components-v1/`（`AsyncState`、`EvidenceBadge`、`KeyNumberGrid`、`ResearchFigure`、`SourceCitation`） | `features/research-v2/{Figure,ResearchSources,blocks}.tsx`、`services/asyncState.ts`、`features/evidence/EvidenceDrawer.tsx` | 同上；`components/{AsyncState,ResearchFigure,SourceCitation,EvidenceBadge,KeyNumberGrid}.tsx` 均已不存在 |
| `src/legacy/insight-v1/`（`ResearchInsightDock`、`researchContextStore`） | `features/evidence/{EvidenceDrawer,useEvidenceLayers}.tsx` | 同上，零引用 |
| `src/legacy/rainstorm-v1/`（`RainstormPage`） | `features/scenario/{ScenarioPage,ScenarioSimulation}.tsx` | 同上；`/shenyang-rainstorm` 已改为 `Navigate → /scenario-lab`（见 `AppRouter.tsx`），不再渲染旧页 |
| `src/legacy/scenario-v1-{data.ts,ScenarioLabPage.tsx,.css}` | `features/scenario/{ScenarioPage,ScenarioSimulation,useScenarioSimulation}.ts` | 同上；`ROUTES.scenario` 指向新 `ScenarioPage` |

**验证方式（删除当时全部通过）**：

- `grep -rn "legacy/" src/{app,features,domain,providers,components,services}` 与按目录名
  （`city-v1|components-v1|insight-v1|rainstorm-v1|research-v1|scenario-v1`）检索 → 外部引用 **0**；
- `frontend/scripts/*.mjs`、`vite.config.ts`、`tsconfig*.json`、`index.html` 均不引用 legacy
  （仅 `tsconfig.app.json` 有 `"exclude": ["src/legacy"]`，此排除项一并移除）；
- `legacy/**` 内部 import 指向的目标（`components/AsyncState`、`components/ResearchFigure`、
  `../research/**`）**早已不存在**，说明该目录即便保留也无法编译；
- 删除前后 `npx vitest run` 均为 **43 files / 389 passed**（不变）；
- `npx tsc --noEmit -p tsconfig.app.json`、`npm run build`、`verify:v2`、`verify:integrity`、
  `verify:decision` 全部通过。

**明确保留（规范 §10.2：仍作 fallback / 兼容 schema / 历史迁移必须文件，不得删）**：这些**不在**
`src/legacy/` 内，与本轮清理无关 —— `src/providers/decision/legacyAdapter.ts`（旧决策 fixture →
正式契约的适配器，仍被 demo/mock provider 与测试使用）、`public/decision/legacy-v2/**`（决策兼容
样例）、`public/research/shenyang/**`（唯一沈阳研究兼容 schema）、`src/app/routes.ts` 的
`legacyCityReport` / `legacyRainstorm` 重定向别名、以及 `LEGACY_FALLBACK` 状态机。

## V4 清理记录（2026-10-10）

用户明确删除讲解模式；源码审计确认它是固定步骤导航/旁白/高亮浮窗，与业务无独立能力。删除前已检索全生产引用：AppShell 的挂载已移除，其他引用仅在自身目录与旧 README 中。

- 删除 `src/features/presentation/GuidedPresentation.tsx`、`GuidedPresentation.test.tsx`、`steps.test.ts`、`guided-presentation.css`、`steps.ts`：功能整体退役，其生命周期测试随已删除产品功能移除；V4 Opening/URL/六城经营测试覆盖新主流程。
- 删除 `src/app/context/ContextBar.tsx`、`context-bar.css`：AppHeader 已停止挂载；省域城市选择由真实地图和六城选择栏承担，作物/周期在相应决策工具内渐进呈现。
- 保留 `src/domain/decision/presentation.ts` 与决策视图：名称相似，但属于正式决策业务，不能删除。
- 保留 Three.js 几何、单 Canvas、研究原文、模型和 runtime 资产；没有数据/模型迁移。

后续以 V4 验收报告中的实际测试数量和浏览器证据为准，旧 V3 数量不是本轮验证。

## V4 最终体验 Phase 1 导航迁移（2026-10-10）

先登记替代关系，再删除等价入口。正式研究正文、模型、Runtime 和局部抽屉操作保留。

- `AppHeader` 的三个 V3 入口替换为主页、决策、报告、关于；统一 Header 常驻，品牌返回辽宁主页。
- `NavigationControls` 在城市路由隐藏的上一级替换为常驻禁用/可用图标；全局三个控件统一承担历史和父级导航，不等待纸面收起。
- 删除 `DecisionPage` 顶部“查看研究”“概览”和工作台自述；顶部全局报告与上一级接替它们。
- 删除 `CityResearchPage` 顶部“进入决策”“概览”、重复工作台标题与方向/研究点数量；全局决策与上一级接替它们。保留研究目录与证据抽屉的局部开关。
- 删除 `city-research__close` 整体旋转及关联样式；相应按钮已移除，普通文字不再跟随图标旋转。
- 同城工作空间切换不再演出整页转场，复用实体纸面与既有局部内容更新。研究、决策业务布局在后续阶段调整。

验证使用新的四入口、父级、刷新/历史和报告定位检查，不再保留断言旧重复入口存在的测试。

## V4 最终体验 Phase 2 主页迁移（2026-10-10）

先登记再删除。主页的历史农业研究被正式报告接替；生产与气候数据资产、研究正文和 API 保留。

- `LiaoningPage` 中年度生产格局、主要作物面积、年度气温降水、操作教学和底部悬停说明退出主页；左纸条改用正式 Daily 最新批发价格，保留来源、单位和有效观测日期。
- 删除底部 `liaoning-city-rail` 与 `liaoning-map-footer`；右纸条内唯一城市选择控件接替键盘选择与 WebGL 失效时的入口，地图 Mesh 与控件共用正式六城选择函数。
- `CitySummary` 的历史气候、经营教学和主次不等的跳转替换为当前观察摘要与同规格“决策 / 报告”。
- 删除 `ProvinceThemes.tsx`：唯一生产引用为主页，重复研究跳转由全局报告和城市纸条报告入口接替。
- 删除以上已移除 DOM 的专用 CSS；两纸条外层保持挂载，只有内容做短过渡。取消城市 key 强制重新挂载。
- 保留完整十四城几何；八个未开放研究城市不绑定悬停或选择事件。六城颜色表达城市身份，与风险颜色分离。
- 城市机位从有限平移改为真实 bbox / FOV / 可见舞台取景；保留同一 Canvas、已有相机控制器和请求清理机制。本阶段不修改 Opening。

| V4 最终地图视差 | ParallaxGroup 指针倾斜 | 固定沙盘姿态，避免非研究地块与后方研究城拾取投影变化 | 删除窗口监听和逐帧旋转；城市选择仍有真实相机聚焦 |

## V4 最终体验 Phase 3 Opening 迁移（2026-10-11）

先登记替代关系再删除；省域几何、单 Canvas、正式数据和模型保留。

- 删除旧 `OPENING_TIMELINE` 四段镜头、360° CatmullRom 环绕和独立收尾段；同一条 2.8 秒线性进度同时驱动镜头推近与地块下落，最后一组地块与镜头约在 0.92 到位。
- 删除 `progress / 0.45` 的提前组装映射；实体直接读取同一条进度，仅保留少量确定性错峰。
- 省域页专用 `.liaoning-page__window` 相机测量由共享、不可交互的 CSS 几何锚点接替。Opening 与主页使用相同舞台、安全区及 `provinceStageView` 末帧位姿。
- 删除 Opening 自动导航的整页 `viewTransition`；同一 Canvas 连续保留，完成后直接显示信息纸条。
- 保留三态状态机、重复点击保护、跳过、减少动效、重入与可取消 RAF。旧环绕测试由同步时间轴、实际几何投影和共同末帧检查接替；历史环绕验收不作为本轮结果。

## V4 最终体验 Phase 4 工作空间迁移（2026-10-11）

先登记替代关系再删除；六城公式核算、模型合同、研究文章/图表/来源与 Runtime 资产保留。

- `city-research.css` 的纸面、三栏、独立滚动及移动抽屉规则由共享 `components/workbench/WorkbenchLayout` 和样式接替；决策与两种研究目录使用相同外壳，切模块保留纸面和左目录 DOM。
- `DecisionPage` 顶部横排工具导航改为固定四项左目录：经营计划、市场观察、短期市场比较、上市窗口情景。能力不支持项显示简短理由并禁用，不借用其他城市模型。
- `PlanningWorkbench` 内部双栏大页面改为中央条件/敏感性/方案比较与右侧经营读数；保留原公式、数值验证、城市隔离、方案 A 与真实历史背景。
- `DecisionCenter` 原垂直市场/短期/长期大页面由独立的市场观测与现有短期/长期工具接替；市场观察只读取本城正式价格序列，长期能力和暴雨专题不再嵌入市场观察。
- 短期结果和上市窗口结果的嵌套侧栏拆为共享右栏 slot；保留真实区间、风险、实际投入与必要科学边界。移除短期结果侧栏内重复 Daily / 长期面板。
- 五城模块研究中交互模式的来源、方法与限制移入右栏；完整文章与正式 NOT_SUPPORTED 状态保持原文。
- 主作物按钮、离散周期滑块及 URL/cache 更新留 Phase 5，本阶段保留现有周期控件与真实请求合同。
- 正式 `/reports/:cityId` 长页接入同一工作台：左侧原文章节目录、中央连续原文与图表、右侧真实来源/方法；省级未发布状态保留。研究深链校验合入 `CityResearchPage`，路由使用同组件以保留目录与纸面，旧载荷编号重定向和不存在条目状态保留。

## V4 最终体验 Phase 4 空间外壳动画退役（2026-10-11）

先登记替代关系再删除。Header 已直接处理历史与结构导航；页面 Esc 先关闭局部面板再立即导航，无生产入口再请求旧折纸退出。

- 删除 `features/spatial/cityExit.ts` 与只检查旧协调器的 `cityExit.test.ts`；历史、父级导航及新空间外壳行为检查接替旧“纸面 + 相机结束后再导航”合同。
- `SpatialShell` 删除退出信号订阅、1200ms 等待兜底、整纸 unfold/fold 标记与动画结束回调；旧 history state 也不再能重放整纸动画。
- 删除 `spatial-shell.css` 的 `ag-paper-unfold`、`ag-paper-fold` 及针对整张纸全部子内容的统一淡入淡出。业务已有局部内容动画、抽屉与地图强调保留。
- 保留单 Canvas、共享 CSS 取景锚点、相机移动、六城选择与 `RouteTransition` 包装；导航不再等待相机或纸面动画信号。
