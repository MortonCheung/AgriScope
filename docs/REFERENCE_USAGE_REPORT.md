# REFERENCE_USAGE_REPORT

本轮参考用于延续现有设计，不覆盖 AgriScope 自身的视觉基线。记录实际访问/读取范围，不把静态网页抓取冒充完整镜头测量。

## 第一组：实站及截图

- [Anthropic](https://www.anthropic.com/)：实站暖底与黑色大标题、正文层级、大留白。决策页沿用本项目暖白/宋体/墨色，并压缩首层文案。没有搬入其珊瑚色或圆角卡片。截图 ref-anthropic。
- [Kimi](https://www.kimi.com/)：实站观察中心单任务、主输入与次操作的层级和几何对齐。用于条件页少量必要输入、补充参数后置；未观察数据比较页，不声称复用它的数据图表。截图 ref-kimi。
- [Apple](https://www.apple.com/)：实站一产品一焦点、短标题与留白，结合本地 apple/DESIGN.md 的主/次操作结构。用于一次看一个方案、收益/风险/压力渐进切换；不复制蓝按钮、字体或造型。截图 ref-apple。
- [USAvionix](https://www.usavionix.com/)：实站滚动前后同一飞行器持续存在，从倾斜主体转到俯视规格场景。只学习主体连续和注意力转移。AgriScope 已有地图镜头保持；新压力场景使用同一收益区间对象变化，保持基准线。没有搬航空、HUD、粒子。截图 ref-usavionix、ref-usavionix-scroll；未量测其精确缓动数值。

## 本地关键实现

- iTeach：src/app/appHistory.tsx、RouteTransition.tsx、features/workspace/useWorkspaceOrigin.ts；复用已迁入 AgriScope 的历史/方向/来源上下文，深链接用稳定 URL 与决策请求恢复，不再造路由框架。
- GSAP/gsap-skills：src/ScrollTrigger.js，以及 gsap-scrolltrigger、gsap-timeline 文档；研究 scrub 可逆、统一时间轴、cleanup/refresh。当前无新增大型镜头需要，不安装 GSAP，现有 Camera 继续独占地图。
- Anime.js：src/timeline/position.js、src/layout/layout.js 及 nested timeline 示例；研究标签/相邻时间定位及图形状态关系。决策 SVG 用已安装 Motion，同一元素不交给两套动画。
- Motion：本地 README/CLAUDE.md、现役 ResearchTree/EstimateChart/AnimatedUnderline。参考库 checkout 只有顶层资料，未声称读取不存在的 packages；实际产品验证基于已安装实现。复用 layoutId、reduce、同节点 morph。
- Lottie：player/js/renderers/SVGRendererBase.js 的 viewBox/响应绘制；没有合适现有资产，不引入 Lottie。
- Inspira UI：MorphingTabs.vue；其 SVG goo/filter 与动态 margin 不适合既有直角文字选择，保留 AgriScope 的共享底线。
- Ponytail：skills/ponytail/SKILL.md、examples/modal-dialog.md、number-formatting.md；已有组件→原生 details/select/Intl→已安装依赖→最小实现。主流程工作页，无新增模态系统。
- taste-skill：minimalist-skill、现有参考审计；只采用编辑式留白与语义用色。其 bento/圆角/漂浮背景/全块入场与本项目冲突，不采用。
- awesome-design-md：claude/apple DESIGN.md；借鉴 token 分类说明方式，所有真实 token 仍来自 src/design，不引入其颜色/字体/圆角。
- UI UX Pro Max：ux-guidelines.csv 交互、错误反馈、键盘、触摸、reduced-motion；用于五档实测和请求状态验证，不使用模板化配色。

reference 完整目录清点还含 archify、morphicons、impeccable、video-shotcraft；它们本轮没有解决新增产品流程中的必要缺口，不增加运行依赖。

## 第二组及访问局限

[Noomo](https://noomoagency.com/)、[Lusion](https://lusion.co/)、[Neoconda](https://neoconda.com/)、[Awwwards](https://www.awwwards.com/) 已访问内容结构，作为叙事主角和克制入口的旁证；没有复刻其视觉或声称量测完整动画。React Bits 页面是客户端渲染，静态抓取为空，本轮不采用组件。morton.morton.xin 访问失败，未根据猜测补写用户个人偏好。

外部参考资料不是模型/农业数据来源。截图保存在 output/playwright，不进入正式 bundle。
