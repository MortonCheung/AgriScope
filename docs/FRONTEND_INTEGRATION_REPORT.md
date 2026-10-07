# AgriScope Final / Daily 前端冻结验收

基线：`feat/frontend-v5-restructure`，`2f7af6b83eaac9349e0b593f550394e8a6b86ef1`。本轮仅做正式集成与产品收口，未合并 main、未重设计。冻结状态：`FRONTEND_PRODUCT_FROZEN`。

## 实际发现与修正

真实工程问题包括：生产变量缺省静默 Fixture；手工输入把种植日和上市日混成窗口；正式运行状态/capability 不在 v0 中；模型压力由浏览器公式承担；价格轴无条件包含零；正式依据可能误套历史 A1.3/A6。均已修正。

产品层级问题包括：参考收益大数字抢占首层、泛化风险句没有信息、只展示笼统置信度、缺少今天市场背景。调整现有层级与标签，不另建视觉系统或 Daily 一级页面。

## 原有内容与 stash

Opening、地图材质/相机/单 Canvas、研究树、A01–A09、8 方向/76 点、原文/交互模式、暴雨推演、导航、颜色/字体/Motion tokens 保持。研究 43 文件 hash 与源一致，46 图绑定及 2 Explorer 通过。

stash@{0}：`7e6ce277c100a408478bc9df51705e9b59d506c0`，保存施工前研究/reference 路径迁移的 8 项。没有 pop/drop。

- RELEVANT，逐 hunk 整合：AGENTS.md、THIRD_PARTY_NOTICES.md、FRONTEND_REFERENCE_AUDIT_V4.md、INPUT_AUDIT.md、INTERACTION_REFERENCE_AUDIT.md、sync-shenyang-v2.mjs。
- CONFLICTING，保留未恢复：SHENYANG_V2_FRONTEND_AUDIT.md 含混杂旧表/不完整路径调整。
- SUPERSEDED，保留未恢复：scripts/legacy/README.md 已退役脚本的历史说明。
- UNKNOWN：0 项。原 stash 仍完整保留 8 项；本轮没有运行 sync 或改写发布研究。

## 真正的数据接入

重新读取最新 Schema/Registry/Meta、生产 inference/capabilities/optimize 与 Daily schema/config/生产代码，然后用真实引擎验证。Final `final_v1`，generated_at `2026-10-07 19:45:00`，fingerprint `5a5d68232b747549`。模型 capability 数据截至 **2026-09-14**；Daily 实际数据截至 **2026-10-06**，业务运行日 10 月 7 日，DELAYED。两者分别显示，不能用 Daily 日期冒充决策模型数据末日。

Daily schema/pipeline 1.1.0，snapshot_hash `2be17dcabbb72a1e`，Final 指纹与本次模型一致。snapshot 文件 SHA256 `553f7bc2df27dd75589bb83fc345ccfdab0087b4c08b5eef8828f542c7f8947b`。

正式入口为 `FinalDecisionEngine.evaluate/evaluate_many`；现有工程没有 HTTP 接口，新增仓库内只读标准库桥，不复制 models/data、模型文件或外部快照。桥有输入校验、同源 Origin 限制、no-store、64KB 请求上限、版本变化拒绝旧缓存。模型 common 的本机 ROOT 只在进程内配置，外部文件不改。Daily GET 只读 snapshot，不执行采集或写入 CLI。

Pipeline：Final API → FinalDecisionAdapter → UI Contract v1 → 现有组件；Daily API → DailyAdapter → 城市/当前作物背景。未来 Final Provider 或 LLM 仍用同一契约，页面不重做。

日期改为数据基准日 + 市场评估跨度，可选上市日只给历史气候参照；没有假农事窗口。Shenyang 支持 10 规范作物、7/14/30 天 model 与 60/90 天 scenario；Chaoyang 较弱能力如实从 registry 返回；Jinzhou 等无可用价格模型时不借沈阳数字。

利润缺少真实输入时保持缺失或“参考情景”，价格与具体模型风险信息为主。两项来源与用户成本/亩产都实际完整时提升收益层级；首层一项 overall score，其余进入披露。当前正式模型不执行预算/面积优化，UI 只提示已知超预算。

正式压力调用官方纯计算函数，未调用写报告的研究 runner。固定综合压力为 -20% 价格/-15% 亩产/+20% 成本；没有任意多轴、延迟或在线 Minimax 的能力就返回 unavailable。原方案常驻对照，量尺由返回的模型值确定；从未用浏览器公式补正式结果。价格域不强制零，利润/ROI 保留零；不绘制不可用区间。

## 验证

前端 **299 tests / 29 files PASS**：原 197 项保留，新增 **102 项**。唯一旧测试调整是等待按需加载的历史 Stress 按钮，断言和原用例均保留；这样正式 bundle 可以去除公式演示。新增检查覆盖生产模式、全部正式状态、capability/不支持作物城市、日期、收益来源、置信度、区间、模型压力调用/迟到响应、Daily freshness/上海日期/空值/失败/取消。

API 桥 **20 项 PASS**，包含真实 Final 推理与官方压力计算。typecheck、npm test、build、verify:v2、verify:integrity、verify:decision、verify:ui 均 PASS。没有删旧测试或放松已有扫描规则。

真实计算：西红柿 60 亩、成本 20,000 元/亩、亩产 4,000kg/亩时，官方基准收益 -253,440 元；severe 为 -796,339.2 元。无实际投入时仍显示价格/风险，收益不造数。证据关联为空时自然说明，不固定套历史研究。

正式 Input/Result/Detail/Compare/Evidence/Stress/Daily city/Daily decision × 五档真实截图完成，另补实际投入 Result/Stress：1920×1080、1440×900、1366×768、768×1024、390×844，共 50 张。实际查看桌面、平板、移动端：作物仍为视觉主角，参考收益不抢占；Daily 文字/细线、比较两列逐行、压力高级条件折叠，无卡片墙或股票大屏；横向溢出 0、pageerror 0。

原首页/地图/城市/交互研究/原文/默认推演另做 6×5 回归。城市↔Decision 与 Esc/上一级链路通过，Canvas 始终为 1。键盘 Tab/Enter 提交、触屏比较/压力、reduced-motion、ARIA 读数、h1 焦点归属、失败清旧结果、取消/迟到结果、刷新参数恢复通过。屏幕阅读器检查为真实浏览器 ARIA 树与语义验证，未声称人工 VoiceOver 听读。

12 个开发状态及实际载荷失败在浏览器检查通过；正式 11 个状态由 Adapter 测试覆盖。Daily 四档 freshness、异常与模型不可用由 50 项单元/组件/Provider 测试覆盖，当前真实 DELAYED 在五档浏览器显示。正式 production 忽略 test_state，API 失败不回退。

生产构建分别验证：缺省/API；fixtures 且 demo=false；fixtures 且 demo=true。前两者不带演示快照/Mock/公式代码；最后只有显式历史 demo 才保留。最后产物为 API 模式。package-lock/依赖无变化。

主要 chunk raw / gzip（kB）：spatial 943.82 / 253.42、react 192.98 / 60.55、motion 127.11 / 41.79，均与基线完全相同；入口 160.56 / 51.73（基线 160.47 / 51.70）。DecisionPage 29.96 / 8.53、共享 decision 26.30 / 9.61、Stress 9.30 / 3.73、Daily 9.24 / 3.77；该功能组总 gzip 25.64，较基线 20.31 增 5.33kB，没有新增大型前端依赖。

截图/浏览器记录/临时检查均在 ignored output/playwright 或 .playwright-cli，不上传。没有真实 secret、大文件、无关二进制、生产代码本机绝对路径、node_modules/dist/cache 或 models/data 修改进入提交。

## 冻结边界

前端工程无遗留待施工项。外部模型 JSON Schema 比真实 runtime 窄，已明确记录并按生产代码适配；在线 Counterfactual/Minimax/任意延迟重估仍由模型能力决定，UI 如实 unavailable，不构成前端造数或待扩功能。本轮无 LLM、无上线部署、无 main 合并；剩余工作只有独立 LLM 层接入与最终部署。

上传以当前功能分支的 commit/push 及反向 HEAD 一致性检查为准；最终 SHA 在交付回复中给出，避免文档写入自身提交哈希的循环。
