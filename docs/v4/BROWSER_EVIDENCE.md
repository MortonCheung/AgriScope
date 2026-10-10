# V4 浏览器证据

本机Chrome/Chromium实际操作，使用Playwright CLI。数据来自正式API和runtime，未用mock演示代替正常流程。故障分支使用明确的503/事件注入，单独记录。媒体保存在本仓库 `docs/v4/evidence`，无需依赖临时output目录。

## 开场与地图

- [完整Opening录屏](evidence/opening.webm)：原始录屏仅去掉开头闲置，保留草稿、组装、完整360°摄影机环绕、正式全省落位；[关键帧](evidence/opening-keyframes.png)。
- [无选城全省默认](evidence/province-default.png)、[真实Mesh Hover](evidence/province-hover.png)、[丹东锁定](evidence/province-selected-dandong.png)、[地图失败仍可选城](evidence/map-fallback.png)。
- [省域操作JSON](browser/province-flow-result.json)：Hover与Selected独立，返回全省、Back/Forward、同Canvas。刷新断言在可重复脚本中。
- [开场操作JSON](browser/opening-result.json)：4962ms、`/liaoning`、0选城、同Canvas。跳过、减少动效和卸载见稳定性JSON。

## 六城实际页面

[六城18页联系图](evidence/six-city-contact.png)用于快速比较，以下均提供原始截图。

- 沈阳：[城市概览](evidence/shenyang-overview.png)、[经营工作台](evidence/shenyang-decision.png)、[研究工作台](evidence/shenyang-research.png)。
- 铁岭：[城市概览](evidence/tieling-overview.png)、[经营工作台](evidence/tieling-decision.png)、[研究工作台](evidence/tieling-research.png)。
- 朝阳：[城市概览](evidence/chaoyang-overview.png)、[经营工作台](evidence/chaoyang-decision.png)、[研究工作台](evidence/chaoyang-research.png)。
- 锦州：[城市概览](evidence/jinzhou-overview.png)、[经营工作台](evidence/jinzhou-decision.png)、[研究工作台](evidence/jinzhou-research.png)。
- 丹东：[城市概览](evidence/dandong-overview.png)、[经营工作台](evidence/dandong-decision.png)、[完整核算与敏感性](evidence/dandong-decision-full.png)、[研究工作台](evidence/dandong-research.png)。
- 大连：[城市概览](evidence/dalian-overview.png)、[经营工作台](evidence/dalian-decision.png)、[研究工作台](evidence/dalian-research.png)。

[六城结果JSON](browser/city-flow-result.json)：每城利润6000→改价10000、方案A保留、研究返回保留输入和结果、正确价格/长期权限、同Canvas、正常pageerror及console error均0。截图中的核算条件是明确的用户输入，六城利润相同来自同一测试条件，并非六城真实收益相同。

[完整丹东往返录屏](evidence/decision-journey.webm)、[往返结果](browser/journey-result.json)：选城→经营核算→保存A→改价→观测证据→正式研究→经营结果→本城概览。

## 六种屏幕尺寸

- 1920×1080：[省域](evidence/province-1920x1080.png)、[决策](evidence/decision-1920x1080.png)、[研究](evidence/research-1920x1080.png)。
- 1440×900：[省域](evidence/province-1440x900.png)、[决策](evidence/decision-1440x900.png)、[研究](evidence/research-1440x900.png)。
- 1280×800：[省域](evidence/province-1280x800.png)、[决策](evidence/decision-1280x800.png)、[研究](evidence/research-1280x800.png)。
- 1024×768：[省域](evidence/province-1024x768.png)、[决策](evidence/decision-1024x768.png)、[研究](evidence/research-1024x768.png)。
- 768×1024：[省域](evidence/province-768x1024.png)、[决策](evidence/decision-768x1024.png)、[研究A07](evidence/research-768x1024.png)。
- 390×844：[省域](evidence/province-390x844.png)、[决策](evidence/decision-390x844.png)、[研究A07](evidence/research-390x844.png)。

[尺寸JSON](browser/layouts-result.json)保存每种视口实际标签坐标、无页面横向溢出、决策进入、研究切换及Esc结果。手机研究模块区本身可滚动，未把目录隐藏掉。长经营页允许纵向滚动；不是要求全部工具挤进一屏。

## 稳定性与正式模型

[稳定性JSON](browser/resilience-result.json)：跳过、减少动效不自动导航、开场卸载清理、四要素往返、Back/Forward、刷新、8轮快速往返、静止RAF请求0、1个Canvas/1个当前WebGL、正常pageerror0、几何/观测失败提示、context事件恢复。WebGL故障测试为事件注入，不等同于所有GPU驱动测试。

[生产构建JSON](browser/production-result.json)、[沈阳正式模型页](evidence/production-shenyang.png)、[朝阳正式模型页](evidence/production-chaoyang.png)：在Vite production preview 4173调用两城真实 `POST /api/decision`，均200、`final_v1`，没有fixtures/mock。丹东正式构建仍提供经营工具且无价格入口。

## 可重复操作

脚本在 [browser](browser/)：`province-flow / city-flow / layouts / opening / journey / production / resilience.playwright.js`，均为Playwright `async(page)=>…`函数。启动正式后端8787、Vite5173；production脚本另需 `npm run preview -- --host 127.0.0.1 --port 4173`。从产品根目录运行CLI `run-code --filename docs/v4/browser/<脚本>`。

resilience脚本安装getContext计数包装，须在新浏览器会话运行一次，避免反复安装同一包装导致重复计数；它自己填写经营条件。故障测试完成后恢复route拦截。原录屏包含操作前短暂闲置；Opening交付片段只裁剪闲置，没有改动动画帧或替换地图。
