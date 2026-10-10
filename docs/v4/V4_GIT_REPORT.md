# V4 Git 交付报告

产品仓：`AgriScope/`。分支：`feat/frontend-v4-spatial-experience`。
基线：`feat/frontend-v3-phase3-rc / 5035668bab21785d392900f155ad548d2ece06ce`。

## 已完成的实现提交

- `1940681 docs(v4): audit baseline sources references and city capabilities`
- `b8079c9 feat(v4): expose six-city observations and scoped feature capabilities`
- `451d5dd feat(v4): choreograph full province orbit with responsive camera proof`
- `678bb70 feat(v4): unify province selection and six-city planning research flow`
- `1d6fe12 fix(v4): validate scenario entry and six-city map metadata`

源码、合同、真实几何证明与实现文档已提交。最终浏览器证据、日志与本报告单独提交为 `docs(v4): deliver verified browser evidence and acceptance reports`；该提交的SHA由 `git log -1`读取，报告不尝试嵌入自身提交SHA。

## 工作区与边界

本轮开始时产品仓干净；以下改动均属V4施工。完成证据提交后以 `git status --porcelain` 空输出验收产品仓干净。外层旧仓库已有用户未提交删除及README改动，本轮未清理、暂存或提交它们。

没有Push、Merge、Tag、Deploy，没有建立PR。未修改runtime、模型Registry、正式模型源码、研究原文或研发态data/models；正式资产通过20/20与Final freeze 173文件只读校验。未新增npm依赖或更改锁文件。

## 变更文件清单

下列状态相对基线：A新增、M修改、D删除。包括最终证据和验收日志，不仅列主组件。

```text
M	README.md
M	backend/app/main.py
A	backend/app/routes/observations.py
M	backend/app/schemas.py
M	backend/app/services/capability_service.py
A	backend/app/services/observation_service.py
M	backend/openapi.json
A	backend/tests/test_v4_observations.py
A	docs/v4/BROWSER_EVIDENCE.md
A	docs/v4/CAMERA_PATH_PROOF.md
A	docs/v4/CAMERA_PATH_PROOF.mjs
A	docs/v4/CAMERA_PATH_PROOF.svg
A	docs/v4/CAMERA_PATH_SAMPLES.json
A	docs/v4/CITY_DECISION_CAPABILITY_MATRIX.md
A	docs/v4/RESPONSIVE_CAMERA_FIT.md
A	docs/v4/V4_ACCEPTANCE_REPORT.md
A	docs/v4/V4_BASELINE_AUDIT.md
A	docs/v4/V4_CHANGE_IMPACT_MATRIX.md
A	docs/v4/V4_DESIGN_NOTES.md
A	docs/v4/V4_GIT_REPORT.md
A	docs/v4/V4_OBSERVATIONS_API.md
A	docs/v4/V4_REFERENCE_AND_SOURCE_AUDIT.md
A	docs/v4/V4_SPATIAL_SOURCE_AUDIT.md
A	docs/v4/browser/city-flow-result.json
A	docs/v4/browser/city-flow.playwright.js
A	docs/v4/browser/journey-result.json
A	docs/v4/browser/journey.playwright.js
A	docs/v4/browser/layouts-result.json
A	docs/v4/browser/layouts.playwright.js
A	docs/v4/browser/opening-result.json
A	docs/v4/browser/opening.playwright.js
A	docs/v4/browser/production-result.json
A	docs/v4/browser/production.playwright.js
A	docs/v4/browser/province-flow-result.json
A	docs/v4/browser/province-flow.playwright.js
A	docs/v4/browser/resilience-result.json
A	docs/v4/browser/resilience.playwright.js
A	docs/v4/browser/scenario-entry-result.json
A	docs/v4/evidence/baseline-dandong-decision.png
A	docs/v4/evidence/baseline-opening.png
A	docs/v4/evidence/baseline-province.png
A	docs/v4/evidence/baseline-siena-reference.png
A	docs/v4/evidence/chaoyang-decision.png
A	docs/v4/evidence/chaoyang-overview.png
A	docs/v4/evidence/chaoyang-research.png
A	docs/v4/evidence/dalian-decision.png
A	docs/v4/evidence/dalian-overview.png
A	docs/v4/evidence/dalian-research.png
A	docs/v4/evidence/dandong-decision-full.png
A	docs/v4/evidence/dandong-decision.png
A	docs/v4/evidence/dandong-overview.png
A	docs/v4/evidence/dandong-research.png
A	docs/v4/evidence/decision-1024x768.png
A	docs/v4/evidence/decision-1280x800.png
A	docs/v4/evidence/decision-1440x900.png
A	docs/v4/evidence/decision-1920x1080.png
A	docs/v4/evidence/decision-390x844.png
A	docs/v4/evidence/decision-768x1024.png
A	docs/v4/evidence/decision-journey.webm
A	docs/v4/evidence/jinzhou-decision.png
A	docs/v4/evidence/jinzhou-overview.png
A	docs/v4/evidence/jinzhou-research.png
A	docs/v4/evidence/map-fallback.png
A	docs/v4/evidence/opening-keyframes.png
A	docs/v4/evidence/opening.webm
A	docs/v4/evidence/production-chaoyang.png
A	docs/v4/evidence/production-shenyang.png
A	docs/v4/evidence/province-1024x768.png
A	docs/v4/evidence/province-1280x800.png
A	docs/v4/evidence/province-1440x900.png
A	docs/v4/evidence/province-1920x1080.png
A	docs/v4/evidence/province-390x844.png
A	docs/v4/evidence/province-768x1024.png
A	docs/v4/evidence/province-default.png
A	docs/v4/evidence/province-hover.png
A	docs/v4/evidence/province-selected-dandong.png
A	docs/v4/evidence/research-1024x768.png
A	docs/v4/evidence/research-1280x800.png
A	docs/v4/evidence/research-1440x900.png
A	docs/v4/evidence/research-1920x1080.png
A	docs/v4/evidence/research-390x844.png
A	docs/v4/evidence/research-768x1024.png
A	docs/v4/evidence/shenyang-decision.png
A	docs/v4/evidence/shenyang-overview.png
A	docs/v4/evidence/shenyang-research.png
A	docs/v4/evidence/six-city-contact.png
A	docs/v4/evidence/tieling-decision.png
A	docs/v4/evidence/tieling-overview.png
A	docs/v4/evidence/tieling-research.png
A	docs/v4/validation/camera-proof.log
A	docs/v4/validation/frontend-build.log
A	docs/v4/validation/frontend-tests.log
A	docs/v4/validation/frontend-typecheck.log
A	docs/v4/validation/product-acceptance.log
A	docs/v4/validation/production-secret-scan.json
A	docs/v4/validation/secret-scan.log
M	frontend/docs/ITEACH_MIGRATION_MATRIX.md
M	frontend/src/app/AppHeader.tsx
M	frontend/src/app/AppRouter.tsx
M	frontend/src/app/AppShell.tsx
M	frontend/src/app/app-header.css
D	frontend/src/app/context/ContextBar.tsx
M	frontend/src/app/context/appContext.ts
D	frontend/src/app/context/context-bar.css
A	frontend/src/app/context/provinceSelection.ts
A	frontend/src/app/context/useContextUrl.test.tsx
M	frontend/src/app/context/useContextUrl.ts
M	frontend/src/components/NavigationControls.tsx
A	frontend/src/domain/decision/planning.test.ts
A	frontend/src/domain/decision/planning.ts
M	frontend/src/domain/decision/types.ts
M	frontend/src/domain/geography/cities.ts
A	frontend/src/domain/observations/types.ts
A	frontend/src/domain/observations/useObservations.test.tsx
A	frontend/src/domain/observations/useObservations.ts
M	frontend/src/domain/research/runtime/catalog.ts
A	frontend/src/features/decision/CityDecisionEntry.tsx
M	frontend/src/features/decision/DecisionCenter.test.tsx
M	frontend/src/features/decision/DecisionCenter.tsx
M	frontend/src/features/decision/DecisionPage.tsx
A	frontend/src/features/decision/PlanningWorkbench.test.tsx
A	frontend/src/features/decision/PlanningWorkbench.tsx
M	frontend/src/features/decision/decision.css
M	frontend/src/features/decision/decisionFlow.test.tsx
A	frontend/src/features/decision/planning.css
M	frontend/src/features/decision/useDecisionCenter.ts
M	frontend/src/features/evidence/EvidenceDrawer.test.tsx
M	frontend/src/features/evidence/EvidenceDrawer.tsx
M	frontend/src/features/evidence/useEvidenceLayers.ts
M	frontend/src/features/liaoning/CitySolidMesh.tsx
M	frontend/src/features/liaoning/CitySummary.tsx
M	frontend/src/features/liaoning/LiaoningCanvas.tsx
M	frontend/src/features/liaoning/LiaoningPage.tsx
M	frontend/src/features/liaoning/MarketOverview.tsx
M	frontend/src/features/liaoning/PaperGround.tsx
M	frontend/src/features/liaoning/ProvinceThemes.tsx
M	frontend/src/features/liaoning/cameraViews.test.ts
M	frontend/src/features/liaoning/cameraViews.ts
M	frontend/src/features/liaoning/liaoning-page.css
M	frontend/src/features/liaoning/liaoningGeometry.test.ts
M	frontend/src/features/opening/OpeningPage.tsx
M	frontend/src/features/opening/opening.css
M	frontend/src/features/opening/openingReplay.test.tsx
D	frontend/src/features/presentation/GuidedPresentation.test.tsx
D	frontend/src/features/presentation/GuidedPresentation.tsx
D	frontend/src/features/presentation/guided-presentation.css
D	frontend/src/features/presentation/steps.test.ts
D	frontend/src/features/presentation/steps.ts
M	frontend/src/features/research-v2/CityModulesWorkspace.tsx
M	frontend/src/features/research-v2/CityResearchPage.tsx
M	frontend/src/features/research-v2/NotSupportedResearchState.tsx
M	frontend/src/features/research-v2/ResearchRoutePage.tsx
M	frontend/src/features/research-v2/city-research.css
M	frontend/src/features/research-v2/cityResearch.test.tsx
M	frontend/src/features/research-v2/module-workspace.css
M	frontend/src/features/research-v2/researchLayout.test.tsx
M	frontend/src/features/research-v2/useV2.ts
M	frontend/src/features/scenario/ScenarioPage.tsx
M	frontend/src/features/scenario/ScenarioSimulation.tsx
M	frontend/src/features/spatial/SpatialShell.tsx
M	frontend/src/features/spatial/spatial-shell.css
A	frontend/src/providers/decision/capabilityFeatures.test.ts
M	frontend/src/providers/decision/index.ts
A	frontend/src/services/useCachedResource.test.tsx
M	frontend/src/services/useCachedResource.ts
```

源代码与既有产品文件变更数量：77。完整范围：165个文件（包含轨迹采样、截图、录屏、日志、JSON与文档）。统计在最终报告提交前生成，最终提交的精确统计以 `git diff --stat 5035668..HEAD` 为准。

## 删除文件

- `frontend/src/app/context/ContextBar.tsx`
- `frontend/src/app/context/context-bar.css`
- `frontend/src/features/presentation/GuidedPresentation.test.tsx`
- `frontend/src/features/presentation/GuidedPresentation.tsx`
- `frontend/src/features/presentation/guided-presentation.css`
- `frontend/src/features/presentation/steps.test.ts`
- `frontend/src/features/presentation/steps.ts`

先在 `frontend/docs/ITEACH_MIGRATION_MATRIX.md`记录退役理由再删除；不存在仅隐藏仍可操作的讲解Launcher或第二层关闭壳。

## 复核命令

```bash
git status --porcelain
git log --oneline 5035668..HEAD
git diff --stat 5035668..HEAD
git diff --name-only 5035668..HEAD -- runtime pipelines/modeling runtime/models
```

最后一条应为空。详细测试结果见 `V4_ACCEPTANCE_REPORT.md`；真正提交后的状态在最终交付时复核，不把“已暂存”写成“工作区干净”。
