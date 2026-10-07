# AgriScope · 穹衡

辽宁农业气候风险交互研究与种植选择前端。

本仓库只负责**前端产品、交互研究与研究成果呈现**：把研究过程变成用户可以观察、操作和理解的数据体验。
数据采集与模型工程位于外部研究工程，前端只读取研究成果，不修改任何研究结论。

## 本地运行

```bash
npm install
npm run sync      # 从外部研究工程同步研究索引 / 选定图表 / 研究正文 / 辽宁几何
npm run dev
```

Decision 和 Daily 正式接入时，另一个终端运行 `npm run dev:api`；Vite 将 `/api` 代理到本地只读桥。桥调用外部冻结模型并读取已发布 Daily，不采集、不训练、不修改研究。
默认 Provider 为 API；连接失败显示不可用，不回退历史样例。显式生产演示必须同时设置 `VITE_DECISION_PROVIDER=fixtures`（或 `mock`）与 `VITE_ENABLE_DEMO=true`。

生产构建：

```bash
npm run sync
npm run build
npm run preview
```

完整本地生产验证可用 `python3 -B server/agriscope_api.py --frontend dist` 同源提供网页与 API。实际部署与模型依赖见 [server/README.md](server/README.md)；正式数据契约见 [API_CONTRACT_V1.md](docs/API_CONTRACT_V1.md)。已发布研究不需要为 Decision/Daily 接入重新同步。

## 验证

```bash
npm run typecheck
npm test
npm run build
```

## 当前产品入口

- `/`：Opening。只有产品身份与空间入口。
- `/liaoning`：辽宁省域 3D 沙盘；点击沈阳进入研究空间。
- `/cities/shenyang`：沈阳研究空间（8 个方向 → 76 个研究点），侧栏可进入种植选择。
- `/cities/shenyang/decision`：条件输入、方案、收益与风险、两方案比较及研究依据。
- `/cities/shenyang/research/:researchId`：交互研究（默认）；`?mode=article` 为查看原文。
- `/reports/shenyang`：沈阳城市综合研究；旧城市报告路径兼容重定向。
- `/scenario-lab`：沈阳暴雨研究推演；从方案进入 `?mode=decision` 查看种植压力情景。
- `/about`：证据等级规范与方法学红线。

当前阶段只完整打磨沈阳；铁岭、朝阳、锦州、丹东、大连在地图上保留入口与元数据，
研究内容沿用同一套模板，待研究工程产出后接入。

## 核心边界

- 默认入口是**交互研究**，第二入口是**查看原文**；两者共享同一个 `ResearchPoint`，并支持双向跳转。
- 阴性结果是正式结论，必须能被正面表达：未发现稳定关系 / 证据不足 / 对设定敏感 / 机制尚未验证。
- 动画服务数据表达；图表允许用户重新观察研究；情景结果一律标记为实验性。
- 前端禁止把相关性写成因果、把再分析天气写成气象站实测、把成交量写成吨、
  把模型情景写成历史事实、为页面效果制造不存在的数值。
- 研究内容只能来自 `ResearchRepository`；组件不直接访问研究工程目录。

## 目录

```text
scripts/            内容同步脚本（研究工程 → public/research）
public/research/    同步产出的研究索引、原文、图表（运行时读取）
public/geo/         辽宁省域几何
src/app/            路由、外壳、历史方向与转场
src/domain/         geography / research / simulation 领域模型
src/services/       ResearchRepository 与 CSV 解析（唯一数据入口）
src/design/         设计令牌、排版、布局、动效、图表令牌
src/components/     通用内容组件（证据徽标、核心数据、研究图、异步状态）
src/features/       opening / liaoning / city / research / report / rainstorm / scenario / insight / about
docs/               施工方案、架构、内容契约、设计系统、迁移矩阵
```

## 文档

- [本轮前端交付与验证](docs/FRONTEND_FINAL_REPORT.md)
- [Decision Contract v0](docs/API_CONTRACT_V0.md)
- [真实样例与 Mock 字段](docs/MOCK_DATA_MAP.md)
- [现役视觉基线](docs/VISUAL_BASELINE.md)
- [实际参考使用记录](docs/REFERENCE_USAGE_REPORT.md)
- [前端架构](docs/FRONTEND_ARCHITECTURE.md)
- [研究内容契约](docs/RESEARCH_CONTENT_CONTRACT.md)
- [设计系统](docs/DESIGN_SYSTEM.md)
- [施工方案](docs/AGRISCOPE_FRONTEND_PLAN.md)
- [iTeach 迁移矩阵](docs/ITEACH_MIGRATION_MATRIX.md)
- [输入资源审计](docs/INPUT_AUDIT.md)
