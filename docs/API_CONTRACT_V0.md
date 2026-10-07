# API_CONTRACT_V0

历史演示契约，仅用于显式 fixtures/mock。正式 Final Model 使用 [API_CONTRACT_V1.md](API_CONTRACT_V1.md)；下面保留上一轮 v0 的原始说明。

权威 TypeScript 结构：src/domain/decision/types.ts。请求/响应均 contract_version="0"；这是 UI 展示契约，不假设最终模型内部 Schema 与旧 v2 相同。

## 请求

user_context：city_id（地理注册 ID）、area_mu（亩）、budget_cny（元）、risk_preference、结构化 planting_window/harvest_window（ISO 日期，闭区间）、crop_preferences、按作物的 actual_inputs（成本元/亩，亩产 kg/亩）。input_source 支持 structured 与 natural_language；本轮不连接 LLM。自然语言解析器未来提交同一请求，组件不需要感知解析器。

请求校验：城市合法、数字有限且正、日期真实且有序、种植不晚于上市、成本/亩产按作物提供。省域没有同口径数据时不借沈阳结果冒充。

## 响应

- status 为 ok/no_data/user_input_required/model_error；issues 可组合，低可信/proxy/无明确赢家不是互斥错误。
- candidates：稳定方案 ID、作物/面积/窗口、方向 strategies、price/profit/roi 三点情景、保本价、三类风险、候选置信度、输入来源、数据质量/代理标记/mock_fields、warnings/reasons、研究背景链接和压力场景。
- recommendation：candidate_id 可空；confidence 是推荐层，不能被候选原始置信度替代；无明确赢家仍可展示默认比较方案，文案不能写强烈推荐。
- ScenarioRange 的 low/base/high 可 null，真实 0 不缺失。单位固定 CNY/kg、CNY、ratio；semantics 区分历史同月/模型情景/公式情景；is_calibrated_interval 与 is_mock 必须显式。
- data_status 为 legacy_model_fixture/mock/model；model_version/data_version/fixture_id 随结果保留。部分 Mock 字段在 data_quality.mock_fields 和范围 is_mock 中标记。
- confidence.level 来自 Provider 语义，UI 不新发明分数阈值。旧 A/B→high、C→medium、D→low 为 Adapter 对源 grade 的展示映射；分数仍原样保留。

HRI 是跟风/扩种诱因的评分，市场风险是历史市场条件评分，气候暴露是历史同期暴露。三个指标均非事件发生概率或损失概率。

## Provider 边界

DecisionProvider.decide(request, {signal}) → Promise<DecisionResult>。可选 data_mode 和 listSamples({signal}) 提供输入说明/样例元数据，组件不导入 Mock 或快照文件。配置在 src/providers/decision/index.ts 一处替换。Legacy 返回精确匹配请求的历史快照，自定义请求进入确定性 Mock，不声称重新执行模型。正式 API 适配器通过 parseDecisionResult 校验，拒绝 NaN、单位错误、错序范围、重复 ID、悬空推荐及不完整压力参数。

HTTP POST endpoint 来自 VITE_DECISION_API_URL，默认 /api/decision；15 秒超时，可 AbortSignal 取消。响应必须回显同一 user_context，按字段比较，不依赖 JSON 属性顺序。终止状态不带候选；部分结果用 status=ok 与 issues=[partial_result]。API 失败不回退 Mock。仅有效请求存入 sessionStorage，刷新重新调用 Provider；旧请求响应不能覆盖新条件。

压力结果是 what-if，非概率或气候因果。旧真实情景按源数值呈现；组合与高级参数是明确的 Mock 公式。延迟没有价格重估时返回空值/说明，不捏造涨跌。

压力场景 ID 不依赖旧模型命名。界面的固定预设按四项 changes 精确匹配模型返回情景，保留源收益、ROI、差额、is_mock 和说明，仅统一界面预设 ID/名称以稳定切换与 URL。区间校准说明使用 is_calibrated_interval，data_status=model 不标为演示。
