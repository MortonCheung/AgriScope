# LLM Ablation V2 Report（RC2）

状态：`BLOCKED_MISSING_EXTERNAL_SECRET`
外部阻塞：`REAL_LLM_EVALUATION_BLOCKED_BY_MISSING_SECRET`

仅检查合法环境变量是否存在；未输出、持久化或挪用任何 Secret。合法 API Key 缺失，真实调用 **0**，
token **0**，费用 **0**。未运行 stub 数值实验；Coding Agent 的推理不算被评估的生产模型。
Provider 配置的模型 ID `gpt-4o-mini` 尚未通过真实调用确认可访问；LLM 数值增益 **UNKNOWN**。

本轮所有历史 2024–2026 已被旧研究查看，2026 只能标 `retrospective_audit_reused`，
untouched metric 为 null、final independent n 为 0。未来评估起点不得早于 2026-10-08；必须等待真实标签成熟。
LLM / Hybrid 数值均为 `RESEARCH_ONLY`，禁止进入生产 Registry。

目标分别为 `cycle_market_average` 与 `harvest_market_price`，上市窗口只读取 development+tuning 冻结结果。
窗口锁状态：`{"harvest_definition":"harvest_post_14","selection_data":"development+tuning only","sha256":"a6b3424a952315e19360635ab7081a0a5e68953afa5109a106a6391a6817927f","source":"models/long_horizon/artifacts/v2/target_selection_lock.json"}`。

历史短期 context 仅用 cutoff-safe seasonal rule baseline，明确标为 proxy；从不调用全历史 refit 的 Final artifact。
HRI、Market Risk、气候、事件、城市日粒度物候均无可靠的逐 cutoff 来源，保持 `NOT_FOUND`。
Context benchmark 无法完全排除预训练历史记忆，与 blind 分开报告。


待真实调用执行：LLM only → seasonality → short PIT proxy → HRI/Market Risk → climate → events → Hybrid full。
每档使用实际不同渲染提示词与缓存键，并报告 paired WAPE、相对 baseline 输出偏差及逐档预测变化。
缺失上下文的档位如实标 NOT_FOUND，不能凭「加了一档」宣称来源有增益。
目前各档的真实表现、边际增益、复述 baseline 风险均 **UNKNOWN**。
