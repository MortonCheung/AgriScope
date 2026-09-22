# AgriScope 前端架构（FRONTEND_ARCHITECTURE）

## 1. 页面与路由

| 路由 | 页面组件 | 数据 | 说明 |
|---|---|---|---|
| `/` | `features/opening/OpeningPage` | 无（静态身份） | 产品身份 + 空间入口 |
| `/liaoning` | `features/liaoning/LiaoningPage` | `public/geo/liaoning.json` | 省域 3D 沙盘 |
| `/cities/:cityId` | `features/city/CityResearchSpacePage` | `research/<city>/index.json` | 研究专题 → 研究点 |
| `/cities/:cityId/research/:researchId` | `features/research/ResearchPointPage` | index + articles + tables | 交互研究（`?mode=article` 为查看原文） |
| `/cities/:cityId/report` | `features/report/CityReportPage` | index（整城 7 问） | 城市综合研究 |
| `/shenyang-rainstorm` | `features/rainstorm/RainstormPage` | case2026 表 + figures | 2026 暴雨滚动叙事 |
| `/scenario-lab` | `features/scenario/ScenarioLabPage` | counterfactual 表 | 平行世界实验室 |
| `/about` | `features/about/AboutPage` | 无 | 证据等级与方法学红线 |

## 2. 外壳与空间舞台

```text
main.tsx
└── AppRouter（createBrowserRouter）
    └── AppShell                      // AppHistoryProvider + AppHeader + SpatialShell
        └── SpatialShell              // 一个 WebGL Canvas + DOM Outlet + RouteTransition
            ├── LiaoningCanvas(R3F)   // 省域几何、相机、标签
            └── RouteTransition       // View Transition / 降级淡入
```

- 全站只有一个 Three.js Canvas，路由只切换相机位姿与可见性；进入具体研究后 Canvas 隐藏，
  页面自然过渡到 DOM 研究体验（路由层 `routeTransitions.ts` 把 `/`、`/liaoning`、`/cities/:id`
  视为共享 Canvas 的空间路由，不做页面切换动画）。
- 城市选择由 `SpatialShell` 统一处理（`CitySelectionContext`）：3D 点击与 DOM 城市列表共用同一逻辑，
  点击非研究城市给出提示而不跳转。
- 相机用 `drei CameraControls` 的 `setLookAt(..., smooth)`，`prefers-reduced-motion` 时退化为瞬时。

## 3. Domain

```text
domain/geography    Province / City / GeoRegion；辽宁 14 市注册表（adcode 对齐 GeoJSON）
domain/research     ResearchTopic / ResearchPoint / ResearchFinding / ResearchEvidence /
                    ResearchFigure / ResearchTable / ResearchMethod / ResearchLimitation /
                    ResearchArticle；证据等级与状态规范；raw → domain 的 Adapter
domain/simulation   Scenario / ScenarioParameter / ScenarioResult / CounterfactualExperiment
```

## 4. Research Repository 与同步管道

```text
shenyang 研究工程（只读）
  SHENYANG_RESEARCH_INDEX.json ─┐
  SHENYANG_RESEARCH.md ─────────┤
  outputs/figures/*.png ────────┤   scripts/sync-shenyang-content.mjs
  outputs/tables/*.csv ─────────┘   （字段校验 + 路径归一化 + 正文按研究点切分）
                                        ↓
public/research/shenyang/{index.json, manifest.json, articles/*.json, figures/*, tables/*}
public/geo/liaoning.json
                                        ↓
services/ResearchRepository（唯一读取入口，Promise 缓存）
  getManifest / getCityIndex / getResearchArticle / getResearchTable / findPoint / findTopicForPoint
                                        ↓
services/useCityResearch（React Hook）→ 组件
```

- 组件从不拼接研究工程路径，只调用 Repository 具名方法。
- 同步只收录索引真正引用到的图（44/55）与表（64/114），并写 `manifest.json` 记录计数。

## 5. 交互研究

```text
ResearchPointPage
├── 头部：id/专题/题目/问题/证据徽标/状态徽标/核心数据
├── 模式切换：交互研究 | 查看原文（同一 ResearchPoint，双向跳转）
├── InteractiveResearchBody（渐进披露）
│   ├── 01 现象    真实研究图 + 一句话解读
│   ├── 02 分析    registry 匹配的交互模块（图表 / 研究表浏览器）
│   └── 03 方法与限制
└── ResearchInsightDock（研究解读，仅解释页面已有内容）
```

- `widgets/registry.tsx` 通过 `point.id` + `point.tables` 决定模块，不写城市判断；
  `modulesG.tsx` / `modulesC.tsx` 分别登记 G 系列与 C 系列的补充模块。
- 图表原语全部是自建 SVG（`primitives.tsx`）：`XYChart`（线 + 置信带 + 标注 + 悬停读数）、
  `BarChart`、`ChartFrame`。零新增图表依赖。
- 未做交互化的研究图以真实静态图 + Caption + 来源 + 证据等级呈现，并标注"静态图"。

## 6. 情景实验

- `ScenarioLabPage` 严格区分 实际观测 / 模型估计 / 情景模拟，并常驻显示模型可信边界
  （门槛 `gate_min_r2=0.1`，价格 R²=-0.4683、成交量 R²=0.0839，未过门槛）。
- 参数可选集合全部从真实表推导（`severity_mult`、`buffer_frac`）；取不到的值 clamp 到最近真实取值并标注，不插值。

## 7. 未来城市

- 页面全部由 `cityId` / `researchId` / Repository 驱动；除 `shenyang-rainstorm` 这类真正城市专属的专题外，
  不存在散落的 `if (city === 'shenyang')`。
- 新增城市只需：1) 在研究工程产出同构索引；2) 在同步脚本配置城市；3) 在 `domain/geography/cities.ts` 打开 `hasResearch`。

## 8. 性能

- 继承 `performance/qualityPolicy`：按设备解析画质档与 DPR，页面隐藏或降低动效时降到 performance 档。
- Canvas 使用 `frameloop="demand"`（Three.js 按需渲染）。
- 构建分包：`spatial-runtime`（three/R3F/drei/gsap）、`react-runtime`、`motion-runtime` 独立成块，
  三维运行时只在需要时加载。
