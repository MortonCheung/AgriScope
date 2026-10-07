# CURRENT_FRONTEND_AUDIT

审计日期：2026-10-07。Phase 1 只读完成后记录。以现役源码、运行截图为准，旧文档仅作背景。

## 当前结构

完整文件清点：src 178 个文件、public 46 个文件、docs 20 个文件。逐层扫描现役入口、领域、数据、组件、样式、空间与性能实现；legacy 是未挂路由的历史实现。

- `/`：草稿地图、AGRISCOPE 字标、单一进入操作。Opening 每次回首页重置，118° 相机轨迹与行政区落定共用 progress。
- `/liaoning`：实体辽宁沙盘，六城入口、hover/focus 与地图联动。
- `/cities/:cityId`：固定纸面窗口，研究树与预览各自滚动。沈阳 8 个方向、76 个研究点；选择不导航，右侧入口才导航。其余城市如实待接入。
- `/cities/:cityId/research/:researchId`：研究点/方向同路由，默认三栏交互研究，`mode=article` 为原文。
- `/reports`、`/reports/:cityId`：城市正式报告及待接入省域报告。
- `/scenario-lab`：三组真实暴雨推演表及常驻门控说明。目前没有现役可调参数模拟器。
- `/about`：来源、口径、证据及方法边界。

## 视觉与空间

暖白纸面、宋体展示标题、系统正文、等宽元信息、直角、细线与留白。深度来自纸张和地图实体，不来自彩色卡片。参见 VISUAL_BASELINE.md。

单 Canvas 在 SpatialShell 中跨路由存活，工作页隐藏 Canvas。城市进入先导航，相机和纸面同步展开；退出等相机与 fold 信号，带兜底。导航为研究/报告/推演/关于，决策必须仍属于城市上下文。

现役依赖：Motion、Three/R3F/Drei、Zustand。没有 GSAP、Anime.js、Lottie。继续现有职责分工；研究参考库不等于安装依赖。

## 数据与复用

研究 catalog 是受完整性校验的内容契约，Repository 负责静态载荷和缓存。43 个文件 hash 与源一致；54 ready、19 pending、3 unsupported。决策不能改写或冒充研究结论。

复用：TransitionLink、结构返回、AnimatedUnderline、Motion Token、ag-button、ag-state、ag-skeleton、系统排版及原生 details/select。图表采用现有 SVG 区间语言，不能把价格情景叫统计置信区间，也不能让缺失值变成 0。研究 MetricValueView 绑定研究字段字典，不把决策字段强塞进去。

旧模拟器导入已退役路径，不直接恢复；新压力测试进入现役推演容器。研究价格有元/500g，决策模型价格为元/kg，不混用。

## 已运行检查

本地 127.0.0.1:5173。观察首页、进入动画、地图 hover、沈阳窗口、研究点、原文和推演，截图在 output/playwright/baseline-*.png。

修改前：typecheck 通过；157 tests 通过；build、research integrity、UI verify 通过。主空间包 943.82 KB（gzip 253.42 KB），本轮不扩大三维运行时。

## 痛点与约束

- 部分旧文档仍描述旧页面/圆角/相机流程，以源码为准。
- 当前推演偏静态表，决策可增加条件切换，但必须保留默认研究。
- 真实 v2 推荐样例有 proxy、利润可能高估、推荐置信度 37.4/D 和无明确赢家提示；不能只挑好看的数。
- 模型/数据另一条工作线可能变化，本轮只复制选定历史输出快照，不运行研究 sync，不写 models/data。
- 保留开始时已有的未提交修改，不覆写这些文件。
