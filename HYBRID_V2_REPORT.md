# Hybrid V2 Report（RC2）

状态：`REAL_LLM_PILOT_PARTIAL_RETROSPECTIVE_ONLY`。真实接口调用 30 次；
Provider/model=`openai_compatible/deepseek-flash`；
token usage 已保存原始字段，不能确定的 estimated cost 记 unknown。
Token 汇总（排除 cache 与预算未调用）：`{"completion_tokens":236459,"prompt_tokens":353393,"total_tokens":589852,"unknown_call_count":2}`；
实际调用平均 latency_ms=`36932.505173466656`，cache hits=`0`。

所有结果为 reused retrospective pilot，untouched metric=null，final independent n=0，数值生产禁用。
Context 与 Blind 分开；Context 无法完全排除预训练历史知识。
数据/协议/target 锁、渲染 prompt hash、响应及反归一 metadata 见 `llm/artifacts/v2/`（不提交）。
快照 plan hash：`d9511d5b7be5bc84febd40caa214e59038bd13ee1ac5e47494c46d1860607d0b`。Pilot call cap=30；失败或预算不足保留显式记录。

HRI/Market Risk/climate/event/物候来源为 NOT_FOUND；short model 档仅为 PIT rule proxy。


Hybrid A/B/C：

```csv
experiment,crop,horizon,target_type,phase,n,baseline_WAPE,hybrid_B_WAPE,hybrid_C_WAPE,production_status,untouched_metric,hybrid_A_n,hybrid_A_WAPE
blind_numeric_forecast_v2,土豆,60,cycle_market_average,calibration,1,10.07075471698113,10.07075471698113,10.07075471698113,RESEARCH_ONLY,,0,
blind_numeric_forecast_v2,土豆,60,cycle_market_average,retrospective_audit_reused,1,4.304068522483925,4.304068522483925,4.304068522483925,RESEARCH_ONLY,,0,
blind_numeric_forecast_v2,土豆,60,cycle_market_average,tuning,1,6.962025316455728,6.962025316455728,6.962025316455728,RESEARCH_ONLY,,0,
blind_numeric_forecast_v2,土豆,60,harvest_market_price,calibration,1,15.913200723327293,15.913200723327293,15.913200723327293,RESEARCH_ONLY,,0,
blind_numeric_forecast_v2,土豆,60,harvest_market_price,retrospective_audit_reused,1,4.049295774647872,4.049295774647872,4.049295774647872,RESEARCH_ONLY,,0,
blind_numeric_forecast_v2,土豆,60,harvest_market_price,tuning,1,12.186379928315388,12.186379928315388,12.186379928315388,RESEARCH_ONLY,,0,
blind_numeric_forecast_v2,土豆,90,cycle_market_average,calibration,1,12.916171224732476,12.916171224732476,12.916171224732476,RESEARCH_ONLY,,0,
blind_numeric_forecast_v2,土豆,90,cycle_market_average,tuning,1,8.4547181760608,8.4547181760608,8.4547181760608,RESEARCH_ONLY,,0,
blind_numeric_forecast_v2,青椒,60,cycle_market_average,calibration,1,9.06489232310224,9.06489232310224,9.06489232310224,RESEARCH_ONLY,,0,
blind_numeric_forecast_v2,青椒,60,cycle_market_average,retrospective_audit_reused,1,10.440649179090398,10.440649179090398,10.440649179090398,RESEARCH_ONLY,,0,
blind_numeric_forecast_v2,青椒,60,cycle_market_average,tuning,1,22.61198795730316,22.61198795730316,22.61198795730316,RESEARCH_ONLY,,0,
blind_numeric_forecast_v2,青椒,60,harvest_market_price,calibration,1,55.703352769679256,55.703352769679256,55.703352769679256,RESEARCH_ONLY,,0,
blind_numeric_forecast_v2,青椒,60,harvest_market_price,retrospective_audit_reused,1,0.8945191313340275,0.8945191313340275,0.8945191313340275,RESEARCH_ONLY,,0,
blind_numeric_forecast_v2,青椒,60,harvest_market_price,tuning,1,24.458262671942734,24.458262671942734,24.458262671942734,RESEARCH_ONLY,,0,
blind_numeric_forecast_v2,黄瓜,60,cycle_market_average,calibration,1,17.84041342038847,17.84041342038847,17.84041342038847,RESEARCH_ONLY,,0,
blind_numeric_forecast_v2,黄瓜,60,cycle_market_average,retrospective_audit_reused,1,18.948597445993613,18.948597445993613,18.948597445993613,RESEARCH_ONLY,,0,
blind_numeric_forecast_v2,黄瓜,60,cycle_market_average,tuning,1,2.894581360414924,2.894581360414924,2.894581360414924,RESEARCH_ONLY,,0,
blind_numeric_forecast_v2,黄瓜,60,harvest_market_price,calibration,1,22.07122774133084,22.07122774133084,22.07122774133084,RESEARCH_ONLY,,0,
blind_numeric_forecast_v2,黄瓜,60,harvest_market_price,retrospective_audit_reused,1,34.085841694537336,34.085841694537336,34.085841694537336,RESEARCH_ONLY,,0,
blind_numeric_forecast_v2,黄瓜,90,cycle_market_average,tuning,1,1.3685191481859311,1.3685191481859311,1.3685191481859311,RESEARCH_ONLY,,0,

```

Development 冻结权重/门控：

```json
[{"crop":"土豆","development_n":1,"experiment":"blind_numeric_forecast_v2","horizon":"60","production_status":"RESEARCH_ONLY","regime_choice":{"high":"baseline","low":"baseline","mid":"baseline"},"selection_label_end":"2023-03-03","status":"INSUFFICIENT_DEV_FALLBACK_BASELINE","target_type":"cycle_market_average","weights_stat_season_llm":[1.0,0.0,0.0]},{"crop":"土豆","development_n":1,"experiment":"blind_numeric_forecast_v2","horizon":"60","production_status":"RESEARCH_ONLY","regime_choice":{"high":"baseline","low":"baseline","mid":"baseline"},"selection_label_end":"2023-03-16","status":"INSUFFICIENT_DEV_FALLBACK_BASELINE","target_type":"harvest_market_price","weights_stat_season_llm":[1.0,0.0,0.0]},{"crop":"土豆","development_n":1,"experiment":"blind_numeric_forecast_v2","horizon":"90","production_status":"RESEARCH_ONLY","regime_choice":{"high":"baseline","low":"baseline","mid":"baseline"},"selection_label_end":"2023-04-02","status":"INSUFFICIENT_DEV_FALLBACK_BASELINE","target_type":"cycle_market_average","weights_stat_season_llm":[1.0,0.0,0.0]},{"crop":"青椒","development_n":1,"experiment":"blind_numeric_forecast_v2","horizon":"60","production_status":"RESEARCH_ONLY","regime_choice":{"high":"baseline","low":"baseline","mid":"baseline"},"selection_label_end":"2023-03-03","status":"INSUFFICIENT_DEV_FALLBACK_BASELINE","target_type":"cycle_market_average","weights_stat_season_llm":[1.0,0.0,0.0]},{"crop":"青椒","development_n":1,"experiment":"blind_numeric_forecast_v2","horizon":"60","production_status":"RESEARCH_ONLY","regime_choice":{"high":"baseline","low":"baseline","mid":"baseline"},"selection_label_end":"2023-03-16","status":"INSUFFICIENT_DEV_FALLBACK_BASELINE","target_type":"harvest_market_price","weights_stat_season_llm":[1.0,0.0,0.0]},{"crop":"黄瓜","development_n":1,"experiment":"blind_numeric_forecast_v2","horizon":"60","production_status":"RESEARCH_ONLY","regime_choice":{"high":"baseline","low":"baseline","mid":"baseline"},"selection_label_end":"2023-03-03","status":"INSUFFICIENT_DEV_FALLBACK_BASELINE","target_type":"cycle_market_average","weights_stat_season_llm":[1.0,0.0,0.0]},{"crop":"黄瓜","development_n":1,"experiment":"blind_numeric_forecast_v2","horizon":"60","production_status":"RESEARCH_ONLY","regime_choice":{"high":"baseline","low":"baseline","mid":"baseline"},"selection_label_end":"2023-03-16","status":"INSUFFICIENT_DEV_FALLBACK_BASELINE","target_type":"harvest_market_price","weights_stat_season_llm":[1.0,0.0,0.0]},{"crop":"黄瓜","development_n":1,"experiment":"blind_numeric_forecast_v2","horizon":"90","production_status":"RESEARCH_ONLY","regime_choice":{"high":"baseline","low":"baseline","mid":"baseline"},"selection_label_end":"2023-04-02","status":"INSUFFICIENT_DEV_FALLBACK_BASELINE","target_type":"cycle_market_average","weights_stat_season_llm":[1.0,0.0,0.0]}]
```

残差边界只使用 train_end 前完整成熟的 label_end；不足时显式 baseline fallback。
