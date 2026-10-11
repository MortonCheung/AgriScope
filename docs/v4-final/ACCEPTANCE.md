# V4 最终体验本地验收

验收日期：2026-10-11。基线 `db48827`；施工分支 `codex/frontend-v4-final-experience`。本记录描述最终施工手册 Phase 0–8 的产品行为、验证结果与交付边界。过程审计、截图、录像和运行日志保存在工作区外层 archive，产品运行不读取该目录。

## 产品行为与完成状态

以下均已实现并经过本轮源码、自动化测试与真实浏览器核验：

- 稳定 Header：AGRISCOPE、Back / Forward / Up 与主页、决策、报告、关于四个入口；URL 上下文恢复，抽屉先消费 Esc。
- 主页：真实已发布市场观测、单 Canvas 地图与两张资料纸。六个研究城市使用独立身份色；其他八城无选择反馈。选择写入 URL，hover 独立，不借用其他城市价格。
- 空间：实际地块 bbox 与可见窗口决定聚焦；两张纸的位置保持稳定。Opening 采用 2800ms 同步推进与组装，共用省域最终机位；Skip、重复点击、reduced motion 和卸载取消正常。
- 统一工作空间：决策、研究、正式报告共用纸面、左目录、中央内容与右侧读数/依据；同城切换不重挂纸面和 Canvas。
- 决策：经营计划、市场观察、短期市场比较、上市窗口情景四模块；直接作物按钮与能力约束的离散周期滑块。URL、请求、结果和摘要保持一致，取消旧请求并阻止过期响应覆盖。
- 报告：六城 A09 与跨城 A11 实际正文、图表、限制和来源可读；DRAFT 与外审待复核状态如实保留。研究点待接入及不支持状态没有被包装为已完成。
- 关于：九章节、六城来源、12 个历史指标锚点、真实短期注册记录与时间切分、逐作物/期限基线对照、架构及更新链路；不把报告生成时间当作训练完成时间。
- Daily：白名单增量发布、不可变 generation、原子 manifest 切换、失败不推进、请求固定 generation，以及不同业务时间的独立展示。此链路在临时目录验证，正式发布及服务器定时任务尚未启用。

## 真实能力边界

- 六城：均可进行用户条件下的经营核算、保本计算、方案比较，以及已发布的生产结构/历史气候分析。
- 本城市场观察：沈阳、朝阳、锦州已有正式序列；不同市场、品种、单位和原始观测日期保留。其余城市不生成替代行情。
- 短期模型：仅沈阳、朝阳，当前模块只接受 7 / 14 / 30 天。朝阳是扩展模型，稳定性与覆盖范围限制保留。
- 长期情景：仅沈阳，节点为 30 / 60 / 90 / 120 / 150 / 180 天。30–120 天为 SCENARIO_ONLY，150/180 天为 EXPLORATORY_SCENARIO_ONLY；不是经过独立未来检验的预测。
- 主页 Daily：当前只发布沈阳批发市场的十种蔬菜。观测截止 2026-10-06、快照生成 2026-10-08、运行时发布 2026-10-09；最近采集尝试为 SKIPPED，独立采集完成时间未登记。
- 长期独立复算通过，但 untouched_n=0。既有研究中 pending 19、unsupported 3 如实保留；不在本轮改写科学结论或扩展模型覆盖。

## 本轮验证

- 前端：60 个文件、585 项 Vitest 全通过；A01–A09 载荷、43 份研究资产 Hash、46 个图绑定与 2 个 Explorer 的轴唯一性检查通过。
- 后端及发布/长期链路：149 项测试通过；API 验收 19/19，其中后端契约回归 109 项通过。Daily/增量发布专项临时目录测试 84 项通过；这些测试集合存在重叠，不累加为独立总数。
- LLM 边界：21 项本地测试通过；没有请求外部模型服务或把生成文字作为数值依据。
- 冻结模型回归：70 项通过、2 项因旧 v1 资产未部署而跳过；4 条既有 pandas FutureWarning，没有修改冻结模型代码。
- TypeScript 与生产构建通过；生产 API 边界通过；41 个产物文件的禁用文案为 0。
- 真实浏览器：六种窗口尺寸、七类路由共 42 项，横向溢出为 0、Canvas 数量始终为 1、pageerror 为 0；六城切换和移动端抽屉焦点核验通过。
- 实际地图指针：14/14 通过，六城正常 hover/选中，八城无选择反馈。实际 7/14/30 天交错响应时最终保留 30 天；Back 恢复 14 天，Forward 恢复 30 天。
- Opening：桌面和移动端末帧至主页首帧 positionJump=0、targetJump=0，保持同一 Canvas；组装中离开后无迟到导航，reduced motion 入口可直接进入。
- 949 份冻结 Runtime/研究文件无变化，173 份正式模型代码/报告文件无变化；manifest 20/20 通过；当前正式代码指纹 b19b187268ee92db。
- 长期独立复算：586000 条预测、3840 个指标分组通过，最大误差差值小于 1e-8；只把复算输出写入临时目录，正式 Runtime 保持原值。
- 工作区与历史 Secret scan 无命中；另检查 1314 个源码、构建及相关产物文件，无命中。

## 可重复的本地检查

在 frontend 执行 `npm test` 和 `npm run build`。后者包含 TypeScript、Vite、生产边界与 UI 文案检查。

在产品根目录执行：

```sh
PYTHONPATH=.:backend python3 -m pytest backend/tests pipelines/publishing/tests pipelines/long_horizon/tests tests --import-mode=importlib -q
PYTHONPATH=.:backend python3 -m pytest pipelines/daily/tests pipelines/publishing/tests --import-mode=importlib -q
python3 backend/scripts/acceptance.py
python3 scripts/check_final_freeze.py
python3 scripts/verify_assets.py
python3 scripts/verify_long_horizon.py
python3 scripts/secret_scan.py
```

模型回归需要 `PROJECT_ROOT="$PWD/runtime"` 及 `PYTHONPATH=pipelines/modeling/src:pipelines/modeling:pipelines/modeling/tests:pipelines`，然后执行 `python3 -m pytest pipelines/modeling/tests --import-mode=importlib -q`。LLM 本地边界测试执行 `python3 -m pytest llm/tests -q`。

旧总验收入口包含真实 Daily 落盘、模型清单写入和 Runtime 复算输出写入。本轮采用各层独立检查、临时目录测试与只读独立复算，不运行会改写正式资产的总入口。

## 尚未验证或启用

服务器 cron/systemd、真实在线采集成功后的发布、跨浏览器设备实测与低端设备性能剖析尚未验证；部署模板与运行手册已经准备。本地浏览器采用 Chrome/Chromium，不能据此宣称 Safari/Firefox 已验收。

用户未要求的外部动作没有执行：未 Push、Merge、Tag、Deploy，未重训或迁移研发数据/模型。后续服务器启用步骤参见 [Daily 发布运行手册](DAILY_PUBLICATION_RUNBOOK.md)；产品和研究约束参见 [体验合同](EXPERIENCE_CONTRACT.md) 与 [市场观测合同](MARKET_OBSERVATIONS_CONTRACT.md)。
