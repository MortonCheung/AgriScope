# AgriScope 前端 V4 验收报告

日期：2026-10-10（Asia/Shanghai）。基线为 `feat/frontend-v3-phase3-rc / 5035668bab21785d392900f155ad548d2ece06ce`；交付分支为 `feat/frontend-v4-spatial-experience`。本轮完成 Phase 0–8 的实现与本地验收。没有 Push、Merge、Tag 或部署。

## 一、交付入口

- [源码基线审计](V4_BASELINE_AUDIT.md)、[空间源码落点](V4_SPATIAL_SOURCE_AUDIT.md)、[参考研究与选择](V4_REFERENCE_AND_SOURCE_AUDIT.md)、[需求影响矩阵](V4_CHANGE_IMPACT_MATRIX.md)。
- [V4 状态、布局、导航、镜头和六城实现](V4_DESIGN_NOTES.md)。
- [六城能力矩阵](CITY_DECISION_CAPABILITY_MATRIX.md)、[观测与功能能力合同](V4_OBSERVATIONS_API.md)。
- [镜头数学证明](CAMERA_PATH_PROOF.md)、[真实几何与移动端取景](RESPONSIVE_CAMERA_FIT.md)。
- [浏览器证据索引](BROWSER_EVIDENCE.md)、[Git 交付记录](V4_GIT_REPORT.md)。

## 二、逐阶段 Gate

### Gate 0：基线、来源与参考

通过。实际检出基线，确认产品仓干净、外层旧仓库含用户未提交改动；从实际源码及浏览器识别默认沈阳、双向 URL Effect、双层研究外壳、价格能力误作整城能力、118°旧镜头等根因。真实检查 runtime Registry、模型/快照、研究 CSV/JSON。参考阅读与可访问边界逐项记录，没有把年龄门槛之后未访问的原站交互写为已验证。

Phase 0 已在实现前提交 `1940681`。基线 391 项前端、74 项后端只作对照，以下数量来自 V4 本轮运行。

### Gate 1：观察状态与 URL

通过。浏览器实测 `/liaoning` 无查询参数、无选城；旧会话不补沈阳或14天。真实 Mesh hover 不选城；Mesh click 朝阳锁定；hover 锦州仍锁朝阳；列表切锦州、返回全省、Back/Forward、有参数刷新、无参数刷新均恢复正确状态。同一 SPA 过程保持同一 Canvas。URL 同步采用单向 hydrate，路径城市优先；StrictMode 与历史行为有定向回归测试。

证据：[province-flow-result.json](browser/province-flow-result.json)、[全省默认](evidence/province-default.png)、[Hover](evidence/province-hover.png)、[丹东选择](evidence/province-selected-dandong.png)。

### Gate 2：地图主体与省域/城市信息

通过。省域左右栏显示各城最近年度主要作物及2025共同完整年的气候范围；选城后改为本城真实面积、气候和行动入口。六城生产年份、区县/城市口径与单位分别标记，没有省域农业总量、均价或跨层级排名。

六种尺寸均实测完整地图标签在视口内、省域与决策无页面横向溢出。1024px桌面两侧不遮盖沙盘主体；768px与390px使用共用地图舞台及可滚动信息Sheet。截图逐张检查，并在路由过渡完成后重新拍摄。

### Gate 3：Opening 摄影机

通过。实际浏览器点击进入用时4962ms（4800ms导演时间轴加路由/浏览器开销），结束 `/liaoning`、0选城、同一Canvas。真实视频和关键帧可看到省域完整环绕、地块落定、升至正式机位。模型没有绕Y轴自转，纸面不是旋转遮罩。

独立轨迹证明使用实际GeoJSON 6896顶点、半径28.781682，721采样检查累计展开360°、相机高度、全地图视锥、纸面覆盖、速度与精确终态。手机/平板按实际43dvh舞台另验投影。单元测试使用真实简化几何检验移动端全过程。

跳过按钮获得焦点，键盘Enter可立即完成；减少动效不未经用户点击导航；中途离开后旧时间轴不再次导航。见 [opening-result.json](browser/opening-result.json)、[Opening录屏](evidence/opening.webm)、[关键帧](evidence/opening-keyframes.png)、[稳定性结果](browser/resilience-result.json)。录屏仅去掉操作开始前的闲置时间，保留完整环绕及进入省域的过程。

### Gate 4：导航与六城外壳

通过。六城研究统一 `CityResearchPage` 外壳，五城模块组件只输出内容，不嵌套第二个main/paper/chrome。城市页面仅一个返回概览，移除重复上一级；后退和前进按访问历史。研究Esc回本城地图选择；证据抽屉Esc只关抽屉，不退出经营页。390px与768px仍可选A07并显示真实本城研究。

深链接直接访问、刷新和Back/Forward已实测。沈阳保留策展树，五城保留模块级正文与探索；没有把缺策展资产伪装成同一颗粒度。

### Gate 5：六城实际经营

通过。六城各自完成玉米10亩、亩产500kg、成本1000元/亩、假设销售价4元/kg、销售比例80%的核算，利润6000元；保存方案A，再将假设价改5元/kg，利润即时改10000元。六城都有生产结构与2010–2025历史气候、三因素敏感性、保本价格/亩产和方案对比。

只有沈阳/朝阳开放短期市场比较，只有沈阳开放探索上市窗口；其他四城不显示不存在的价格工具。生产构建浏览器还实际提交两城14天、西红柿、用户亩产/成本条件，正式API均200、`model_version=final_v1`、结果页正常，未使用fixtures/mock。

证据：[六城流程结果](browser/city-flow-result.json)、[生产构建结果](browser/production-result.json)、[丹东完整核算页面](evidence/dandong-decision-full.png)。零值、缺输入、负数、销售比例超界、非有限数和溢出有测试，不显示Infinity或残留旧利润。

### Gate 6：研究与经营往返

通过。六城从经营“为什么”进入本城观测证据，再进入本城完整研究；返回经营后假设价格5、利润10000和方案A保留。同一城市按作物独立保存条件，城市之间独立保存，不串用另一城输入或正文。

额外实测 `city=dandong / crop=玉米 / horizon=30 / as_of=2026-10-06` 往返，四要素保留。刷新恢复经营输入与核算结果。缓存资源测试验证前城迟到响应不会覆盖新城，缓存命中首帧不显示上城正文。

证据：[稳定性结果](browser/resilience-result.json)、[完整往返录屏](evidence/decision-journey.webm)。

### Gate 7：清理与精修

通过。先更新迁移矩阵，随后删除讲解模式5个文件及ContextBar 2个文件；AppShell无Launcher、轮询和相关快捷键。顶栏只保留三入口与历史导航，手机仍显示品牌并通过菜单进入三条主线。研究字段映射既有中文指标标签，研究原文和科学限制不改。

实际修复了地图空白DOM层拦截Mesh、边线位于底面、纸面受tone mapping变灰、同位姿相机永远等待rest、五城双层外壳、朝阳错误请求长期模型、旧URL反写、研究迟到响应等问题。详情见下节。

### Gate 8：完整测试与本地交付

通过。以下命令均本轮实际运行，日志存入 [validation](validation/)。生产文本另递归检查，因为现有secret脚本的目录附加项并不会自动递归扫描构建文件；不把该脚本的0命中误称为已扫描全部产物。

## 三、命令与真实结果

- `cd frontend && npm run typecheck`：通过。
- `npm run test`：47测试文件、517测试通过；9文章/43摘要哈希、8主题/76研究点、46图表绑定与2Explorer完整性通过。
- `npm run build`：通过，39产物文件；production boundary通过；UI禁用字样0。未增加npm依赖。
- `bash scripts/acceptance.sh`：`ACCEPTANCE_PASS`。资产20/20；Backend验收19/19通过；Final 38/38；Daily 33/33；长期Registry120条工程门禁通过。
- acceptance内 `python3 -m pytest backend/tests -q`：99通过；长期/运行时边界26通过；建模70通过、2跳过、4已有pandas FutureWarning；LLM21通过。
- 独立重算：586000预测行、3840指标组，`INDEPENDENT_RECALCULATION_PASS`，最大WAPE浮点差2.84e-14；没有新未触碰历史窗的科学验证声明。
- `node docs/v4/CAMERA_PATH_PROOF.mjs`：真实几何轨迹证明通过。
- `python3 scripts/secret_scan.py`：已跟踪工作树0命中、全历史0命中、`SECRET_SCAN_CLEAN`。另递归扫描全部55个构建文本文件，0命中。
- `git diff --check`：通过；源码、文档和证据按阶段本地提交。
- Playwright CLI：省域Mesh/列表/历史流程、六城完整核算与研究往返、六种尺寸、开场/跳过/减少动效/卸载、四要素/刷新、8轮快速往返、异常降级和生产构建正式模型调用全部通过。正常六城和尺寸流程pageerror/console error均0。

六种尺寸：1920×1080、1440×900、1280×800、1024×768、768×1024、390×844。每种都有省域、决策和研究截图，手机研究模块切换与Esc已操作；不是只缩小桌面截图。

## 四、实际缺陷与修复

- 默认省域被store→URL Effect改成沈阳14天：改为单向URL hydrate与显式事件写URL，无参数刷新实测通过。
- 地图Mesh点击没有响应：DOM路由容器覆盖Canvas，即使内部窗口透明也截获事件；改DOM空白层pointer-events:none，真正面板恢复auto，实测Mesh hover/click通过。
- 地块行政边界不明显：outline放在底面被实体挡住；移到顶面，真实截图确认。暖白纸面关闭tone mapping，避免被ACES映射成灰块。
- 同位姿setLookAt(true)不触发rest：改以Promise及序号结束移动状态，取消旧移动回调；隐藏工作台关闭输入/视差监听。静止采样1秒RAF请求0、当前WebGL1、Canvas1。
- 五城研究出现两层返回/关闭：模块页改body-only，全城统一外壳；不以CSS遮掉重复按钮。浏览器检查每城只有一处返回。
- 四城被价格supported阻断全部工具、朝阳请求沈阳长期：新增功能级能力，确定性经营与模型分开，短期/长期各按真实支持门禁。
- 研究切换可能一帧上城正文、迟到请求覆盖：资源按key存状态，同步读取目标缓存并隔离旧请求；定向回归通过。
- 初期取证脚本仅等待URL而未等待View Transition完成：加强DOM状态等待与截图动画等待，重新取证。该问题不作为产品“错城”缺陷，最终JSON同时记录正确URL与选城。
- 新资源hook测试初次漏jsdom环境注释、中文指标import在热更新短暂未就绪：已补齐，最终全517测试、typecheck、生产构建和正常浏览器流程通过。另修复情景入口错误路由常量，几何研究城市集合断言不依赖GeoJSON顺序；最终复跑后才更新交付日志，失败运行没有计入最终通过数量。

异常验证分别注入几何503、观测503、`webglcontextlost/restored`事件，证明明确错误与恢复分支，并恢复测试拦截。它们的预期网络错误不混入正常流程“控制台0错误”。context事件测试不宣称覆盖所有物理GPU故障、浏览器或驱动。

## 五、保留的真实限制

未通过的本轮产品Gate：无。建模的2项既有skip和4项pandas警告仍如实保留；没有为让验收全绿而改动模型测试。

短期模型仅沈阳/朝阳；日度市场仅沈阳；长期仍沈阳探索情景、untouched_n=0。六城经营公式依赖用户实际输入或明确假设，不保证未来收益；生产面积年份/地理范围不同，不用它们跨城直接排名。气候为ERA5再分析，完整年截至2025，不能预测未来损失或夸大天气价格因果。

浏览器本轮为本机Chromium/Chrome、上述六种视口；数学和合同测试覆盖更多状态，但本轮未声称完成Safari/Firefox、真实触屏设备或全驱动矩阵验收。
