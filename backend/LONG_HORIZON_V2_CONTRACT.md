# Long-Horizon v2 HTTP 契约

长期服务只读取预生成 `lh_forecast_v2` 快照，不训练、不抓取；旧 `/api/decision` 和 `/api/daily/latest` 保持原语义。

- `GET /api/forecast/capabilities?city=shenyang`：每个作物的每个跨度仅列一行，`targets` 分别登记两个目标的方法和状态。`n_final_effective` 与兼容字段 `n_nonoverlap` 表示真正最终独立样本；当前为 0，不使用历史窗口数冒充。
- `POST /api/forecast/long-horizon`：接受 `contract_version='1'|'2'`、`city_id?`、`crop`、`horizon_days`、`target_type?`。目标默认 `harvest_market_price`；始终同时返回 `targets.harvest_market_price` 和 `targets.cycle_market_average`。显式请求周期目标只改变顶层选中结果。
- `POST /api/decision/long-horizon`：独立结构化决策 v2，以上市窗口价格计算收入/利润情景，不调用短期 v1 排序。

```json
{
  "contract_version": "2",
  "user_context": {
    "city_id": "shenyang",
    "area_mu": 10,
    "budget_cny": 30000,
    "risk_preference": "conservative",
    "crop_preferences": ["土豆", "西红柿"],
    "actual_inputs": {
      "土豆": {"cost_per_mu": 1000, "yield_kg_per_mu": 1000},
      "西红柿": {"cost_per_mu": 2000, "yield_kg_per_mu": 3000}
    },
    "market_context": {"expected_harvest_horizon_days": 120}
  },
  "input_source": {"kind": "structured"}
}
```

`market_context` 至少有用户明确选择的 `expected_harvest_horizon_days` 或 `expected_harvest_date`。支持 30/60/90/120/150/180 天；日期以最新长期快照 `as_of` 为基准精确换算，不能自动吸附到附近档位。如果日期与跨度同时给出，两者必须一致。可选 `as_of` 只能等于当前快照基准日；预生成接口不冒充任意历史日期推理，也不根据作物名称猜生育期。

`actual_inputs` 中每个作物的成本、亩产允许正的有限数值或 null。仅两者都存在时计算实际投入收益情景。缺失时收入和利润为 null，排名依据为 `harvest_relative_market_environment`，即上市价格相对当前价格的变化；不比较跨作物绝对价格来冒充利润。所有可比较候选都有完整投入时，排名依据为 `profit_scenario`；稳健偏好使用下行利润，其他偏好使用基准利润。超出预算的候选显式标记且不进入可行排序。

`current_market_context` 返回 Daily 中的当前价格、HRI、市场风险、等级、来源和日期，不声称是上市时未来风险。气候缺少可靠截止日来源时返回 `climate_exposure.available=false` 与 `NO_CUTOFF_SAFE_CLIMATE_SOURCE`。`risk_preference_usage` 说明实际使用规则，未来风险不使用未经验证的加权系数。

两个目标均透出 `actual_method`、`fallback_used`、`production_status`、`confidence`、`target_window` 和模型分歧。没有真实 LLM 时 `llm_status=LLM_UNAVAILABLE`，仍使用统计结果；只有实际执行回退才标记 `fallback_used=true`。

新鲜度同时检查快照全局日期和作物的观测锚点。长期落后 Daily 时返回 `LONG_HORIZON_STALE`；Daily 延迟通过 `daily_delayed` 显示；Daily 缺失时返回 `DAILY_UNAVAILABLE`。不静默宣称“最新预测”。当前没有合法 untouched 最终样本，因此只有弱情景比较，不作强推荐。

无长期快照、格式错误或双目标不完整：返回明确错误信封和 503；未知作物 404、不支持城市 422、无效输入 400。失败不影响短期或 Daily。

验证：`python3 backend/scripts/acceptance.py`，独立测试为 `python3 -m pytest backend/tests/test_long_horizon_v2.py -q`。`backend/openapi.json` 包含严格的 v2 请求 schema。
