# AgriScope 前端施工方案（AGRISCOPE_FRONTEND_PLAN）

## 0. iTeach 现有架构（继承自母版）

```text
src/app/          路由、外壳、转场、历史方向
src/domain/       领域规则
src/ai/           目标组树 / 教学决策（教育业务）
src/features/     各业务页面与工作区
src/graph/        知识图模型（教育业务）
src/scene/        Three.js 场景与相机（教育图专用）
src/services/     内容仓库与本地持久化
src/store/        分域状态
```

## 1. 保留 / 替换 / 新增

- **保留（技术层）**：`app/appHistory`、`app/RouteTransition`、`app/routeTransitions`、
  `app/pageNavigation`（事件名前缀改为 `agriscope:`）、`performance/qualityPolicy`、`performance/types`、
  `test/setup`、Vite/TS 配置骨架。
- **整体重写**：`app/routes`、`app/AppRouter`、`app/AppShell`、`main.tsx`、`index.html`、`design/**`。
- **整体删除**：全部教育业务域（见 `ITEACH_MIGRATION_MATRIX.md`）。
- **新增**：`domain/{geography,research,simulation}`、`services/ResearchRepository`、`features/{spatial,
  opening,liaoning,city,research,report,rainstorm,scenario,about}`、`components/**` 通用内容组件、
  `scripts/sync-shenyang-content.mjs`。

## 2. 新路由

| 路由 | 页面 | 说明 |
|---|---|---|
| `/` | Opening | 产品身份 + 空间入口，只有一句定位与一个主操作 |
| `/liaoning` | 省域空间 | Three.js 3D 行政区域沙盘 |
| `/cities/:cityId` | 城市研究空间 | ResearchTopic → ResearchPoint，点开先给 Summary |
| `/cities/:cityId/research/:researchId` | 交互研究 | 默认模式；`?mode=article` 为查看原文 |
| `/cities/:cityId/report` | 城市综合研究 | 使用索引中的整城问答，不重编章节 |
| `/shenyang-rainstorm` | 2026 暴雨专题 | 滚动叙事，核心问题是"为什么没有同等市场冲击" |
| `/scenario-lab` | 平行世界实验室 | 情景实验，必须显示模型可信边界 |
| `/about` | 关于 | 证据等级规范与方法学红线 |

## 3. 新 Domain

```text
src/domain/geography/    Province / City / GeoRegion + 辽宁 14 市注册表
src/domain/research/     ResearchTopic / ResearchPoint / ResearchFinding / ResearchEvidence /
                         ResearchFigure / ResearchTable / ResearchMethod / ResearchLimitation /
                         ResearchArticle + 证据等级与状态规范 + Adapter
src/domain/simulation/   Scenario / ScenarioParameter / ScenarioResult / CounterfactualExperiment
```

## 4. 数据接入方式

```text
shenyang 研究工程（只读，不修改）
        ↓  scripts/sync-shenyang-content.mjs（校验 + 路径归一化 + 正文切分）
public/research/shenyang/{index.json, articles/, figures/, tables/, manifest.json}
public/geo/liaoning.json
        ↓  ResearchRepository（唯一读取入口，带缓存）
React 组件（只消费领域模型）
```

- 发布时同步：`npm run sync`（手动）；`npm run build` 前需已同步。
- 禁止组件运行时访问研究工程相对路径；禁止把 `data/models/reports/outputs` 全量塞进前端。

## 5. 交互研究设计原则

- 默认模式是"交互研究"，不是 Markdown。
- 渐进披露：现象 → 分析 → 方法与限制；方法学名词不放在第一屏。
- 动画只服务数据解释，可暂停、可拖动时间。
- 无法快速交互化的图，第一阶段使用真实静态图 + Caption + 来源 + 证据标注，
  并如实标注前端开发状态（不是改写研究结论）。
- 阴性结果必须能漂亮表达：未发现稳定关系 / 证据不足 / 对设定敏感 / 机制尚未验证。

## 6. 施工阶段

Phase 0 输入审计 → Phase 1 复制 iTeach 并验证 baseline → Phase 2 新 Domain →
Phase 3 设计系统 → Phase 4 Opening + 辽宁 3D → Phase 5 城市研究空间 →
Phase 6 第一个交互研究样板 → Phase 7 抽象通用模板并接入其余研究点 →
Phase 8 查看原文双模式 → Phase 9 城市综合报告 → Phase 10 暴雨专题 →
Phase 11 情景实验 → Phase 12 研究解读 → Phase 13 清理旧术语 → Phase 14 验收。
