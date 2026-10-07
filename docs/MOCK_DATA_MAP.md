# MOCK_DATA_MAP

快照版本 `legacy-v2-20261007`。导出脚本只读外部模型文件，写入 AgriScope/public/decision/legacy-v2；运行时不读取研究工程目录，不在浏览器复制推荐引擎。

## 真实历史样例

来源为 `models/outputs/v2_recommendation.json` 与 `models/evaluation/cases/recommendation_examples.json`。manifest 保存来源 SHA256、每个精简快照 SHA256 与请求。4 份载荷加 manifest 总计 69,675 字节；只请求所需快照。

- baseline-100：沈阳，100 亩，50 万元，最早 2027-03-01 种植，最晚 2027-10-31 上市，均衡。
- steady-30：沈阳，30 亩，15 万元，2027-03-01 至 2027-08-31，稳健。
- balanced-50：沈阳，50 亩，25 万元，2027-04-01 至 2027-09-30，均衡。
- return-80：沈阳，80 亩，40 万元，2027-05-01 至 2027-10-31，收益优先。

精确匹配请求时，价格、三点利润、风险、面积、窗口、候选分数及推荐分数原样来自旧模型；ROI 与保本价按已提供成本/亩产作除法，不是新预测。没有重新排名。无法匹配的请求不会贴上真实模型标签。

基准样例推荐层 37.4/D 与候选原始 82.6/A 分别保留。首屏使用推荐层；候选分数在详情口径中展开。价格来自历史同月分位，未校准为概率区间；种植日历含推定；成本/亩产代理口径、成本缺人工/地租/折旧、利润异常偏高与无明确赢家提示保留。部分标签方案仅有基准利润，价格、上下界、成本等保持 null。

## 自定义条件的 Mock

默认 FixtureDecisionProvider 先检查精确样例；不匹配时才交给确定性 Mock。Mock 只选择最接近偏好/上市月份的历史样例作情景来源，过滤作物和真实窗口，使用实际成本/亩产覆盖，并按预算限制面积。没有价格预测、风险模型、置信度模型或推荐排序。

- price、risks：仍为选定历史窗口的源读数。不会随着单户面积改变，不借沈阳价格冒充其他城市。
- area_mu、inputs、profit、roi、break_even_price、confidence、strategies：data_quality.mock_fields 显式标记。收益 = 面积 ×（价格 × 亩产 − 亩均成本）。
- confidence：unknown、score=null，不能沿用高分冒充新条件推荐。
- recommendation.candidate_id：null；仅展示可比较选择，方向沿用源样例而非重新推荐。
- data_status：mock；价格保留历史来源语义，利润/ROI 为 formula_scenario 且 is_mock=true。
- 日期不平移。无匹配窗口/作物或城市不足时返回 no_data；不给空值补零。

## 压力与反事实

正常情景使用原方案。价格 -10/-20%、亩产 -20%、成本 +20%、上市延迟 7 天优先匹配旧模型压力结果；源上界缺失保持 null。基准之外，综合压力（价格 -20%、亩产 -20%、成本 +20%）及未提供的参数组合用公式演示，is_mock=true。

旧模型延迟 7 天的利润差值确为 0，但没有重新估价，常驻说明零变化不代表没有风险。其他延迟没有价格样例时不计算利润/ROI/差值，显示待评估。气候暴露没有转换成因果减产。参数和场景写入 URL，刷新/返回重新使用同一条件。

## 开发态异常样例

仅 Vite DEV 下 `?test_state=` 生效：normal、high_risk、low_confidence、insufficient_market_data、user_input_required、model_error、loading、empty、partial_data、proxy_only、no_clear_winner、scenario_only。loading 可取消，其余可组合 issues；normal 的 78/B 是明确标注的界面测试设定。

测试样例 data_status=mock、候选字段 mock_fields=[all]、范围和可信程度 is_mock=true。生产忽略 test_state，不把测试分数发布为模型结果。数据版本/模型版本/快照 ID 留在契约，来源与口径按需查看。

## 最终模型替换

`VITE_DECISION_PROVIDER=api`、`VITE_DECISION_API_URL=/api/decision` 切换到 HttpDecisionProvider。输入页自动显示正式提交说明，不提供旧样例按钮。接口请求/响应见 API_CONTRACT_V0；模型原生字段可在该 Provider adapter 转成契约。

失败、超时、格式错误及请求条件不一致均显式报错，绝不降级到 Mock。组件只使用 Provider 接口与 UI Contract；自然语言解析器未来提交同一 DecisionRequest，保留 input_source.kind/text。表单再次编辑提交会标为 structured。
