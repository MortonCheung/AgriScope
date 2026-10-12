# 产品农业决策契约 product-1

`POST /api/product/decision` 与 Final v1、长期 v2 分离；不改变原模型资产、白名单及旧响应。

输入字段：`contract_version:product-1`、`city_id`（六城）、`crop`、`area_mu`、`yield_kg_per_mu`、`cost_per_mu`、`sale_price_per_kg`、`sale_fraction`（0–1）、`budget_cny`（可空）、`target`（conservative/balanced/aggressive）、`sale_date`、`as_of`（有效日期或空）、`price_is_user`。数值必须有限；面积大于零，其余非负。

响应包含原样 request、二进制浮点规范化的 SHA-256 context_hash、合法 candidates、recommendation、内部 origin。候选的收入、成本、利润、保本价格均按用户亩产、成本、销售比例重新计算。建议面积不得超过输入面积或预算；显式用户价格不得被模型或语言模型覆盖。模型参考价与表单输入分开。

本城同作物/期限模型优先；缺覆盖时使用沈阳同目标参考及目标城市年度生产、历史再分析气候背景。来源城市、目标城市、实际模型基准日、版本和迁移策略均留在 origin。跨城参考不声称为本地正式预测，不复制源城市 HRI 或校准置信度。未登记的粮食作物使用经营核算及方案选择，不能套用其他蔬菜模型。短期未来若干天均价不能充当任意销售日的收获价。

语言模型接收合法候选、本地背景和用户条件，返回候选选择/排序、可选缩减面积及原因。context_hash、data_version、白名单、排序唯一性、预算与面积再次校验；所有金额由程序重算。拒绝自造金额、候选或过期输出。理由不得把历史气候当未来天气判断。

前端每次输入立即核算；350ms 合并有效条件后请求产品 API。缓存 TTL 120 秒、最多 64 项；服务最多 16 个不同在途请求。网络调用不持有模型推理锁；总调用有界，异常保留有效模型或公式结果。相同请求共享在途计算，最后一个消费者取消时停止网络工作。

配置沿用后端 AGRISCOPE_LLM_API_KEY、AGRISCOPE_LLM_BASE_URL、AGRISCOPE_LLM_MODEL。新增 AGRISCOPE_PRODUCT_LLM_ENABLED（默认 true）、AGRISCOPE_PRODUCT_LLM_TIMEOUT（默认 12 秒，上限 12）。密钥不进入前端或响应。httpx 为运行依赖。DeepSeek 专用传输使用官方非思考开关，保证受约束 JSON 选择的交互预算；其他兼容提供方保留通用请求。[DeepSeek API 文档](https://api-docs.deepseek.com/guides/thinking_mode/)
