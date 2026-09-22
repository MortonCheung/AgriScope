# Phase 0 · 输入资源审计（INPUT_AUDIT）

审计时间：施工开始前。工作根目录 `/Users/morton_cheung/Desktop/比赛/大数据分析`。

## 1. 输入资源清单

| 资源 | 路径 | 状态 | 用途 |
|---|---|---|---|
| iTeach 前端母版 | `frontedpage/iTeach` | 存在，`npm run build` 通过 | AgriScope 的技术骨架来源 |
| 设计参考库 | `frontedpage/design-references` | 存在（GSAP / anime / motion / impeccable / inspira-ui / ponytail / taste-skill 等） | 设计语言与工程规范参考 |
| 沈阳研究工程 | `shenyang` | 存在 | 唯一研究内容来源 |
| 研究结构化索引 | `shenyang/SHENYANG_RESEARCH_INDEX.json` | 存在，54 KB | 前端内容主源 |
| 研究正文 | `shenyang/SHENYANG_RESEARCH.md` | 存在，96 KB，194 个标题 | "查看原文"来源 |
| 研究图 | `shenyang/outputs/figures` | 55 张 PNG | 图表来源 |
| 研究表 | `shenyang/outputs/tables` | 114 张 CSV | 交互数据来源 |
| 辽宁省 GeoJSON | 需外部获取 | 网络可得 | 3D 省域沙盘几何 |

## 2. 研究索引结构（实测）

顶层字段：`city / title / window / panel / crops / n_crops / price_unit / volume_unit /
evidence_levels / status_values / structure / topics / summary_blocks / city_conclusion /
methodology_notes / red_lines / source_of_truth`。

- `topics`：17 个研究点（G1–G10 基础两两关系、C1–C7 复杂关系）。每个研究点含
  `id / layer / category / title / question / why / data / method / summary / conclusion /
  evidence_level / status / figure / figures[] / tables[] / frontend_text / limitations[] / key_numbers{}`。
- `summary_blocks`：6 个专题（S1–S6），通过 `covers[]` 指向研究点。
- `city_conclusion`：沈阳整城 7 问 + 3 条 caveat。
- `evidence_levels`：A 直接观测 / B 统计关联（含阴性结果）/ C 机制一致证据 / D 模型或情景推演 / Unsupported。
- `status_values`：supported / null_result / descriptive / exploratory / unsupported。
- `red_lines`：8 条方法学红线，前端内容层必须遵守。

## 3. 图表引用关系（实测）

- 研究点引用的图：44 张（占 55 张的 80%）。
- 研究点引用的表：64 张（占 114 张的 56%）。
- 所有被引用的图/表文件均存在，无缺失。
- 结论：按"索引真正引用到的"同步，而不是把 55 图 114 表全量塞进前端。

## 4. 研究正文结构（实测）

正文按 `## G1 ... ## C7` 切分，每个研究点内固定小节：
`### 研究问题 / 为什么研究 / 数据 / 方法 / 结果 / 结论 / 证据等级 / 局限 / 前端一句话`。
因此"查看原文"可以按研究点结构化呈现，无需前端重写学术正文。

## 5. iTeach 技术骨架审计

- 构建：`npm install && npm run build` 通过（baseline 已验证）。
- 技术栈：React 19 + Vite 7 + TypeScript 5.8 + react-router 7 + Three.js 0.179 +
  @react-three/fiber 9 + @react-three/drei 10 + @react-three/postprocessing + GSAP + motion + zustand。
- 可继承的通用技术：单 Canvas 生命周期、相机连续运动（drei CameraControls + 缓动位姿）、
  性能策略（`performance/qualityPolicy`）、路由转场与历史方向（`app/appHistory`、`RouteTransition`、
  `pageTransitions`）、`prefers-reduced-motion` 处理、Playwright/vitest 基础设施。
- 必须替换/清除的教育业务：`ai/**`、`data/v6/**`、`domain/knowledge/**`、`domain/learning/**`、
  `graph/**`、`scene/Knowledge*`、`store/**`、`features/{library,library-builder,knowledge-tree,
  knowledge-tree-builder,knowledge-tree-editor,knowledge-point-builder,landing,practice,progress,
  study,teaching,tutor,universe,workspace,pico}`、`components/**` 教育组件、`functions/api/{chat,speech}`。

## 6. 风险与结论

| 风险 | 处理 |
|---|---|
| 教育业务命名扩散到路由与存储 | 整体重写 `routes.ts`，清除 `store/**` 与 `migrateV9` 迁移逻辑 |
| 缺省辽宁几何数据 | 使用公开行政区划 GeoJSON，投影后挤出生成 3D 沙盘 |
| 前端直接绑定研究目录 | 建立 `scripts/sync-shenyang-content.mjs`，只同步必要内容到 `public/research/shenyang` |
| 把阴性结果当成"没有发现"淡化 | 状态徽标 + 结论文案统一表达，阴性结果与阳性结果同等正式 |

结论：输入资源齐全，可以开始施工。
