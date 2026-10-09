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
