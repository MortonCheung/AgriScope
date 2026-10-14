# iTeach → AgriScope 迁移矩阵（ITEACH_MIGRATION_MATRIX）

## 七地区每日行情前端（2026-10-14）

以部署整合 `1b3bb96` 为基线，在独立工作树保留已完成的最终动效精修。本节先登记生产旧行情入口的替代关系：

- `displayMarket` 生产模块中的 V1 静态价格导入与 `INITIAL_DISPLAY_MARKET` 种子，由严格校验的 V3 / V2 API 完整快照接替；首次未取得有效快照时只展示真实缺项，更新失败保留最后有效快照，不加载演示价格。
- 原测试使用的静态初始行情，迁移到 `src/test/fixtures/marketDisplay.ts` 明确标记的测试样例；生产模块不得导入该目录。
- 三种价格口径继续保留，新增独立“监测均价”口径；不借用其他城市或口径补齐。
- 右侧纸面新增独立北京时间与实际行情观测、采集、发布时间。生产来源使用响应记录中验证通过的真实链接；已有其他页面来源入口保留。

仅修改前端源码、测试与说明。冻结研究、模型、运行时资产、后端、采集器与部署配置不变。

## 最终动效精修（2026-10-14）

本轮先核验真实代码，再按用户最新要求登记替代关系：

- `ReportNavigation` 中只跳转 `/about#methods` 的“方法与来源”重复入口退役；全局“关于”、报告真实来源与方法正文继续提供原功能。
- 决策城市与报告文章按钮叠加的左竖线、下划线，改为组内单一选中底纹；真实选择状态立即更新，首次进入直接落位，不恢复跨路由共享指示器。
- 首页行情两组按钮复用同一底纹反馈，保留固定操作区、独立数据滚动及既有价格口径；原数字换值继续使用 FlipValue。
- 展开控件补方向一致的揭开/收回与图标反馈；关闭语义、焦点和键盘处理立即生效，减少动画时直接完成。

本轮只调整前端细节，不改布局结构、研究原文、真实数据、模型、Runtime 或后端。

## Report 对齐精修（2026-10-11）

审计和修改映射已先存档到比赛工作区 `archive/agent_reports/report-aligned-polish-20261011/PROJECT_AUDIT_AND_MAPPING.md`。本节先登记替代关系，再实施。用户授权新增六城模拟行情，统一标注“模拟数据”。

- 主页旧 Daily 默认借用沈阳、缺城提示、重复品种列表、原生城市 select 和颜色方块，由独立六城模拟行情及共享方框城市按钮接替；全省采用六城等权模拟均价。模拟样例仅供主页，正式 Daily、市场、决策 API 与 Runtime 资产不改。
- `MarketOverview` 与 `CitySummary` 改为自解释的价格、单位、比较期、趋势和精简范围摘要，报告入口直达正式报告。只被旧主页引用的 `latestMarketRows` 随旧展示退役；正式 Daily 测试保留。
- 删除 `usePaperSelection` 延迟替换逻辑及旧延迟合同测试，共享可取消的内容淡入接替；城市立即同步 URL，双纸面保持 DOM 身份并独立滚动。
- Opening 手动“进入”按钮与样式由自动组装接替；保留跳过、减少动效、重入、取消保护。时间缩短到 1.8 秒、镜头起距加大，末帧仍与主页一致；旧手动入口测试由自动进入生命周期测试接替。
- `/research` 报告入口的静态流程、模块数量、策略树提示、“进入研究”和解释性段落，由六个直达正式报告的方框按钮接替；真实研究深链、跨城/综合研究与模型评估证据保留可达。
- Header 和报告内部链接接入既有转场导航；纸面进入、内容切换共用 Report 动效令牌，减少动效时关闭。
- 城市决策、研究与正式报告复用城市背景；背景空白单击返回父级，拖动、右键、纸面操作不触发返回。
- 同城基础市场观测缓存和独立能力状态修复决策菜单闪动；作物切换不清空已确认能力，中央加载与菜单分离，跨城请求仍取消。

验收以本轮测试和浏览器证据为准；不更改模型合同、研究原文、目录职责或运行包资产。

浏览器回归补充：`useFocusable` 的 Esc 在捕获阶段消费事件，避免关闭放大图表时同时触发工作台父级导航；图表仍使用原 DOM 和原有展开动画。新增事件生命周期测试，实际铁岭报告图表验证关闭后仍停留本页。

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

## V4 最终体验 Phase 5 控件与结果生命周期迁移（2026-10-11）

先登记再删除；所有真实输入验证、六城经营公式、方案 A、能力门禁和科学口径保留。

- 经营、市场、短期/长期及结果方向的主要作物原生下拉由共享直接选择按钮接替；生产背景历史气候指标同样直接选择。保留原支持列表、自定义作物与多作物比较能力，按钮可换行、键盘操作并显示选中状态。
- 短期周期下拉由 7 / 14 / 30 天离散索引滑块接替；长期只用能力接口真实登记的 30 / 60 / 90 / 120 / 150 / 180 天节点。长期未选期限保持未选，不替用户推断生长周期，不再显示重复周期按钮。
- URL 是作物/周期/基准日的恢复入口；有效条件提交后，周期改变重新读取正式结果，候选作物改变选择响应内真实候选快照。完整请求条件及能力版本参与请求身份，切换时清空旧读数，Abort 与最新请求身份共同防止竞态覆盖。
- 经营作物 URL 只保留已有明确期限，不创造默认 14 天；市场作物用 URL 驱动本城正式市场请求。后退/刷新恢复选择，城市和口径继续隔离。
- 完整比较表默认收起，主图和主读数优先。费用字段/单位/验证保留，长费用教程和散落依据跳转由右侧统一“方法与数据”接替；历史观测、模型情景/预测、情景估算、用户假设分别标明，不把长期情景区间当概率区间。

### V4 Final · Phase 6（实施前映射）

- 删除报告目录中仅沈阳可读的硬编码 PUBLISHED 白名单；改读真实 runtime catalog 的六城 A09 和跨城 A11，保留 ACCEPTED、DRAFT、外审待复核的原状态。
- 删除 `/reports/liaoning` 不实的“研究内容待接入”；实际复用已有跨城 A11 正文、图表和来源，不编新省级结论。
- 删除方向页、预览栏、证据栏重复的研究点数量/状态数量；保留真实点列表、单条支持状态与依据。内容切换不触发纸面/预览整块入场动画。
- 原关于页的沈阳来源/参考文献及指标锚点保留；扩充六城来源和实际数据处理、冻结模型及验证证据、架构与更新边界。非沈阳来源加城市前缀，防止来源编号碰撞。

## 产品化 V2（2026-10-11，修改前登记）

用户新要求覆盖旧研究展示文案约束；保留数据、模型、API 和研究资产。

- 主页 scope/模拟状态/样例说明/总览标题由“最新行情 + 价格单位 + 趋势”和单一城市入口接替。
- DecisionPage 四模块目录/结果tab/能力状态由同一农业决策工作台的常驻输入与实时结果接替；复用经营公式、数值校验、城市隔离会话，旧模型接口保留。
- PlanningWorkbench 的提交、折叠背景/方法教程与重复比较入口由直接字段与推荐/预计收益/经营风险/销售窗口读数接替。
- /reports 与 /research 双目录统一到报告工作台，六城及综合/比较/方法入口使用既有正文资产；旧研究深链保留。
- ReportPage、ResearchArticleView、EvidenceRail、综合/比较页的限制/内部状态只从用户渲染删除，不修改运行资产或研究结论。
- 关于页验证状态、技术发布、元数据、限制区由项目介绍/数据来源/方法说明接替，保留数据与指标锚点。
- 左右移动/溶解 route 转场由共享顶部揭开/反向收起接替；一个活 Outlet 与 Canvas，减少动态立即完成。

## 产品精修 V3（2026-10-12，修改前登记）

以 a19bd08 与用户最新模型/API要求为基线；详细审计及施工方案保存于外层 archive，不成为运行依赖。

- 业务组件自动 ag-paper-enter 由路由统一动画 owner 和 data-paper-surface 结构标记接替；工作台城市/视图只轻量更新，native、fallback、POP 与冷启动各只播放一次。
- 首页逐行批发价/趋势与右侧重复城市选择由单一票头、八作物价格/涨跌、日期比例趋势、可键盘及 WebGL 降级的地图入口接替；内部来源保留。
- 马铃薯/土豆重复选项由统一作物身份与来源 ID 解析接替；保留完整旧草稿、显式价格及城市隔离。
- 现有即时经营核算保留；新增独立产品决策契约接入本城或沈阳同作物模型参考、合法方案核算与受约束 LLM 选择。冻结 Final v1 与模型资产不改。
- 报告城市及综合入口首屏保留；共享纸宿主、现有交互研究入口、角色宽度和真实图片尺寸接替重复标题、嵌套目录及固定占位比例。原文科学限定和原图资产保留。

## 产品精修 V4（2026-10-12，修改前登记）

- Native View Transition、Router旧转场缓存与DOM双轨守卫由 paperNavigation + RouteTransition 唯一 WAAPI 纸张 owner 接替；保留 lazy、快速取消、历史、减少动画与同工作台轻量过渡。
- 地图 HTML button/白框及为重复标签触点设置的移动补丁由 mesh 单一 pointer + 非交互文字细线状态 + focus 可见语义城市导航接替；WebGL fallback 保留且入口互斥。
- 首页左票整块 crossfade 由共享 FlipValue 局部数据过渡接替；右票补充现有行情派生统计，数据资产不变。
- 决策与报告大方块入口由共享城市文字索引、细线 hover/active 与44px目标接替；实际实时经营核算/API与每城草稿保留。
- 报告固定三栏由报告专用比例及响应式依据栏接替；决策结果常驻，真实图片比例与已有放大保留，真实交互能力在正文标题旁直达。
- 土豆归一只承认外部马铃薯 alias，保留旧双alias草稿和显式价格；不改模型/研究/后端。

- 浏览器实测确认：独立“研究局限/研究限制”章节与目录从产品展示隐藏；研究结果内必要限定、原始研究资产不变。Canvas fallback 不以挂载effect判定故障，由真实 WebGL2 能力/渲染错误/context loss 驱动同一语义入口。

## 最终交付：导航与动效（2026-10-12，修改前登记）

- 普通向上返回开场 `/` 的父级规则由正常 `/liaoning` 首页与全省终点禁用接替；明确开场访问保留，历史后退/前进独立。
- 相同 from/to 重启收纸由可复用的 pending 导航意图接替；不同目的地才取消，cancel 的 finished 拒绝不再当作完成，失败恢复裁切与操作。
- 纸张 opacity + inset 动画由四顶点 polygon 纯几何裁切接替；共享节奏初始收起0.34秒、展开0.46秒，顶边固定，文字不缩放，减少动画立即完成。
- WorkbenchLayout 对整块 column/rail 的 opacity .35 淡化退役；保留稳定纸面、侧栏、局部抽屉、真实内容身份和数据隔离。共享局部 content hook只保留小幅位移，数字与下划线动效保留。

## Final delivery research and homepage (registered before replacement)

- Existing explorer flags / modules[0] and per-view filters are replaced by one publication-validated presentation list; source articles, states and negative findings remain.
- City reports reuse shell-free research content and default to verified interaction. Full articles remain secondary; exactly one stable Workbench shell.
- Excluded entries explicitly replace deep links to a valid same-city selection while retaining business context.
- Cold assets use prefetched identity-keyed caches and reserved loading regions, never mislabeled old-city data.
- Homepage retains bounded viewport and two independent scroll containers, promotes its single action group and truthfully labels sample data without changing values/dates.

## V5 final polish (registered before replacement)

- Flat city links plus a separate current-city research menu are replaced by one publication-backed city/topic/point tree. Missing point metadata is not invented.
- Router notification completion is separated from the actual new DOM commit; exit masks stay on the old surface until acknowledgment.
- Eight native selects are replaced by a shared keyboard-accessible combobox/listbox. Business values and actual source options remain.
- Chart focus uses the same live chart DOM and native top layer, with truthful series/range controls; existing readout, missing-value handling, morph and source rows remain.
- Developer sample wording becomes accurate product language (scenario reference price/date); internal simulation identity and source values/date remain.
- One persistent environment remains visible for all main tasks; nonspatial backgrounds are read-only.
- The report tree uses a compact ID/title grid with touch-sized rows; About uses the shared raised paper surface so the persistent map cannot overlap its text.
- Without JavaScript, a native disclosure list offers the six actual city report payloads for download; interactive calculations and charts still require JavaScript.

## Homepage market publication

- Homepage-only fixed samples are replaced by a compact real-price publication generated by publishing; the historical sample module remains isolated from the product path.
- A complete city/product/price-type publication replaces per-selection network loads; a validated bundled publication and last-good cache keep the first view and failed refreshes complete.
- The strict research/decision observations API remains unchanged. The independent display API applies explicit fallback priorities with lineage retained in backend assets.
- Existing paper layout, map, FlipValue, trend toggle and research views remain. Price-type buttons and a shared product selector operate on the same paper DOM; trends use actual selected-source dates and prior observations.
