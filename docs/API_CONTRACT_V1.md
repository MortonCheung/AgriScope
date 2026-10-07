# Final Decision / Daily Contract v1

权威前端类型为 `src/domain/decision/types.ts`。正式输入的时间含义已变化，因而升级为 v1；v0 只供显式历史演示。前端不绑定 Python 的内部字段，所有响应必须经过 Provider、Adapter 与校验再进入组件。

## 输入与能力

`GET /api/decision/capabilities?city=<cityId>` 返回 `city_id/tier/supported/crops/market_as_of/model_version/data_version/code_fingerprint/limitation`。作物为模型规范名称；每个作物的 `horizons` 含 `days` 与 `mode=model|scenario_only`。城市不支持时不显示可提交表单；不借用沈阳样例。UI 用支持作物的交集跨度，任一作物仅情景时展示该限制。

`POST /api/decision`：

```json
{
  "contract_version": "1",
  "user_context": {
    "city_id": "shenyang",
    "area_mu": 60,
    "budget_cny": 300000,
    "risk_preference": "balanced",
    "crop_preferences": ["西红柿"],
    "actual_inputs": {
      "西红柿": {"cost_per_mu": 20000, "yield_kg_per_mu": 4000}
    },
    "market_context": {
      "as_of": "2026-09-14",
      "horizon_days": 30,
      "harvest_date": null
    }
  },
  "input_source": {"kind": "structured"}
}
```

日期示例取本次真实模型 capability。部署时必须按其返回日期更新，不能用网页今天替代。`as_of+horizon_days` 是模型市场比较口径；可选 `harvest_date` 只选择历史气候月份。没有农事种植窗口或可行上市期优化。桥将 `plant_date=as_of` 作为默认气候参照，不制造农业日历。预算当前只回显；UI 可用已返回成本提示超预算，但不改变模型面积、排序或结论。

面积、预算及实际成本/亩产必须是正的有限数字；缺失投入用 null。空作物偏好比较 capability 中全部作物。未来 LLM 提交同一结构，并设置 `input_source={kind:"natural_language",text:"原始情况"}`；桥不解析或生成文本，UI 无聊天模块。

## Final Adapter

桥返回 `{request,batch,market_as_of,model_version,data_version,code_fingerprint}`，其中 `batch` 是官方 `evaluate_many()` 原始输出。Adapter 保留 `all` 中有效价格/风险，使用模型 `ranking`，不在浏览器重新评分。

已覆盖正式 runtime 的 `OK/LOW_CONFIDENCE/PARTIAL/SCENARIO_ONLY/USER_INPUT_REQUIRED/INSUFFICIENT_MARKET_DATA/NO_FEASIBLE_PLAN/NO_FEASIBLE_WINDOW/NO_CLEAR_WINNER/NO_DIVERSIFICATION_BENEFIT/MODEL_ERROR`。前端稳定为 `ok/no_data/user_input_required/model_error` 加独立 issues，保存 `model_status` 便于追溯。无可行窗口、无明确赢家、无分散收益分别表达；不能全部当没有数据。

缺少投入时，官方 batch 可能为 `NO_FEASIBLE_PLAN`，但所有行是 `USER_INPUT_REQUIRED`，价格和风险仍有效。前端显示这些市场情景、收益为 null、不声明推荐。某些候选有有效收益时，仍使用官方 ranking；不会根据输入缺项自行重排。

`overall_confidence` 是当前作物评分，首层只展示一个。`price/profit/risk` 与可选 `data` 放在原有披露中；当前 runtime 没有独立 `data_confidence`，不补造。没有模型提供的 A/B/C/D 或高低分级时，显示“模型评分”；不自造等级阈值。

正式收益只含基准与 ROI，没有利润上/下界，均保持 null。只有请求中真实成本和亩产完整、且模型两项 source 都是 user_input，才提升收益层级。参考/缺失收益为次级说明。正式 Evidence 仅用响应实际关联，当前为空，不默认绑定 A1.3/A6。

价格只在 `scenario_range/scenario_range_widened` 时绘制范围；unreliable、no_range 或未知状态隐藏上下界，保留有效基准。情景不标 80% prediction interval。价格坐标使用数据域与留边，利润/ROI 保留有实际含义的零点。

## 压力与每日背景

`POST /api/decision/stress` 接受 `{request,candidate_id,changes}`。正式桥调用同作物官方 `evaluate()` 与 `_scenario_profit()`，返回 `available/profit_base/delta_cny/roi/note` 与版本。UI 不调用公式演示，也不补算 ROI 或上/下界。

模型支持单轴变化、mild（-10%/-5%/+10%）、severe（-20%/-15%/+20%）。上市延迟或其他多轴组合明确不可用、结果 null。当前无不写报告的在线 Minimax Regret / Counterfactual 接口；不会把离线代表场景套成用户方案。原暴雨研究推演仍是独立、明确的历史平行情景。

`GET /api/daily/latest?city=shenyang` 只读已发布 schema 1.1.0 snapshot；默认 `/api/daily/latest`，可配置 `VITE_DAILY_URL`。只在城市与当前作物上下文展示。价格为官方 wholesale，变化是比例值，`change_1d` 称“前一观测”；无原始时间序列时不绘制假趋势线，不重算 Signal 或推荐。

显示实际 `latest_data_date/data_date`，以上海业务日期重新判断 freshness：0 天 FRESH、1–2 天 DELAYED、3–7 天 STALE、更久或未知 MISSING。保留来源 freshness 与版本/指纹；旧快照不会因为旧 FRESH 标签而冒充最新。模型不可用时，真实价格仍可显示，信号保持未评估；不回退 Legacy。

## 生产边界

未配置 Provider 默认 API；未知模式或未经允许的生产 demo 为 unavailable。显式生产演示必须同时设置 fixtures/mock 与 `VITE_ENABLE_DEMO=true`。API 失败、超时、响应条件不一致绝不回退；正式 v1 请求拒绝 mock/legacy 来源。

正式 `npm run build` 排除 `dist/decision` 和演示代码，并通过 bundle 边界检查；源快照与旧测试保留。DEV 的 `test_state` 在 production 不生效。请求使用 v1 独立 session key，只保存输入；取消与迟到响应不能回填。

外部 JSON Schema 目前仍保留较窄的旧枚举及 profit.expected 字段，与正式 Python runtime 有差异。本轮按真实生产入口、capability 和运行结果适配，保留版本与测试；没有修改模型工程。桥部署、接口限制与 Python 验证见 `server/README.md`。
