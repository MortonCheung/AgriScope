# 连续行情展示发布

该派生资产保证首页行情连续展示，独立于严格真实观测 `/api/market/display`。不会改写原始数据、冻结模型或研究内容，也不会把推理结果写入官方观测输入。

## 生成

在产品根执行：

```sh
python3 pipelines/publishing/publish_market_presentation.py \
  --project-root /path/to/research-workspace \
  --runtime-root /path/to/AgriScope/runtime
```

读取已有注册 Parquet 和可选只读 observation SQLite，调用当前 Runtime 的冻结模型。优先级为今日真实观测、可执行冻结模型校准结果、无模型时的数据库历史保底。没有采集网络请求，没有训练。可通过 `--feed-db` 指定已具备真实来源收据的只读数据库。生产默认的 `AGRISCOPE_ROOT` 为当前产品；仅开发核验可显式指向另一份已校验模型 Runtime 所属产品。

权威发布是 `runtime/data/market/presentation/current.json` 单一原子指针，指向 `releases/<实际字节sha256>.json` 不可变完整包。发布先完整校验224格、写入新不可变文件，再原子切换一个指针；指针切换前失败仍使用旧代，切换后 API 与重启校验均使用完整新代。`latest.json` 只是兼容导出，刷新失败不影响权威包，重复执行会修复它。相同实际输入、模型结果、算法及计算日返回 `UNCHANGED`，保留发布时间与权威文件字节。这里不修改 `runtime/manifest.json` 或已有观测发布指针。

首次从真实研发资产构建时，发布器额外精选当前真实源及单独的最长真实趋势源，输出 `inputs/<sha256>.json`，最多保留各源128个实际点和必要身份/时间/来源证据。它不是全量数据库或Parquet。后续worker即使没有外层历史数据，也能校验并读取这份Runtime小anchor，叠加新采集资产再运行冻结推理。原始路径只是后台血缘字段，恢复过程不访问这些旧路径。anchor按内容hash命名、不可变；损坏或越界拒绝更新并保留旧行情。

独立 `current.json` 收据记录所指不可变完整包的实际字节hash与唯一当前anchor的路径/hash。构建包显式校验并收录指针、当前完整包、当前anchor及匹配当前代的latest.json兼容导出这四个文件，不携带旧回滚全集，也不需要改冻结base manifest。打包持有发布事务锁，选择后当前代发生变化会拒绝产生不完整包。提取包后仍校验文件身份；每日合法更新只对已验证的operational指针与兼容别名采用当前校验，源码、冻结资产、immutable完整包和anchor不豁免hash。中断留下旧的有效兼容别名不影响当前代读取；新打包之前须重跑发布器使别名与当前代一致。错配、损坏、symlink或缺少anchor会拒绝打包或验收。前端基底导出与下一轮worker都通过 `committed_path()` 读取权威代，不依赖别名。

更新真实采集数据库后应再次执行此命令。只启动 API 不会暗中采集或推理；浏览器时钟也不会触发该发布流程。API 会轻量叠加已有严格观测发布中今天的真实报价；旧观测不会覆盖已计算的新参考。部署任务应在真实采集与规范化完成后调用发布器，失败不撤销现有首页快照。

`scripts/run_daily_chain.py` 的正式顺序为七地区采集、严格V3行情发布、沈阳Daily、Long Horizon、Daily Runtime发布、独立 `presentation_publication`。全部沿用整链锁和进程组超时；两次普通发布也各自在独立子进程中受 `AGRISCOPE_PUBLICATION_TIMEOUT_SECONDS`（默认60秒）约束，Presentation受 `AGRISCOPE_PRESENTATION_TIMEOUT_SECONDS`（默认300秒）约束。Presentation显式读取七地区桥接器的checkpointed快照和相邻SHA256收据；没有新快照时仍可恢复已有Runtime anchor，不能默默读取一个无收据的活跃数据库。

非dry-run时，无论采集是否成功均尝试使用现有资产发布Presentation；`--no-collect`跳过采集和严格行情重发，但仍允许模型链和Presentation。`--dry-run`不发布任何数据。采集摘要分别记录进程退出码、地区业务结果、插入/更新数量，`NO_NEW_PUBLICATION`不冒充新采集，`UNCHANGED`保留发布代身份；临时来源失败不撤销已验证的采集器配置。Daily、Runtime发布、严格行情发布、行情采集、长周期错误优先保留；仅Presentation失败时返回9，独立行情采集失败返回10，避免二者混淆。阶段独立记录在现有 `chain_status.json`/attempts 中，计算成功不代表采集成功。日常阶段只更新Runtime，不重新导出或修改冻结前端构建基底。

## API

`GET /api/market/presentation` 支持 `region`、`product`、`price_level` 精确筛选；默认完整 224 格。正常产品路径自包含。开发联调可以显式设置 `AGRISCOPE_MARKET_PRESENTATION_PATH` 指向另一个已发布 JSON，接口仍进行相同完整校验；该覆盖不是生产默认依赖。

顶层字段：`schema_version="presentation-1"`、`regions`、`products`、`price_levels`、`published_at`、`input_hash`、`records`、后台 `provenance`。

每行：

- `region/product/price_level/price/unit`：七地区、八商品、四价型，有限正价与 `元/kg`。
- `display_date`：实际观测日或本次计算日；不是采集时间。
- `observed_at/collected_at`：真实输入时间，缺项保留 `null`，日期精度的采集记录保留日期，不补造时分秒。
- `history`：该最新源真实历史，或只有一个真实计算日的计算记录；末点与当前价格、展示日期一致。
- `comparison_basis`：`previous_same_source_observation` 或 `latest_only`，单点不能解释为真实持平。
- 可选 `trend_history`：另一个真实同地区、商品、价型的完整长期源序列抽取，最多128个实际点，保留真实首尾。它不拼接当前源与长期源，不伪造月份、不混价型；完整研究/历史 API 不变。
- `sources`：实际使用的来源链接，按真实来源身份列出最近证据链接。可选 `trend_sources` 专门保留长期源链接。缺 URL 不补造。
- `origin`：`kind`、`history_kind`、`anchor_date`、真实模型身份和目标、校准输入、趋势身份、完整时间范围等后台血缘。

四种 `origin.kind`：

1. `observed`：计算日真实观测。
2. `historical`：同城市、商品、价型的已有真实观测，时间原样保留。
3. `model_estimate`：已注册沈阳/朝阳冻结模型的未来7天窗口价格参考，经真实本地商品 anchor 比值或共同商品价格面校准，再转换到目标展示价型。后台始终保留原模型城市、价型、目标和日期，不将其宣称为当日官方报价。
4. `calibrated_history`：没有对应冻结模型时，使用真实同城市商品 anchor 和由成对价格推导的价型面计算。

价型面由真实同地区商品的价型对拟合：优先同日，缺同日时最多31日内证据。没有固定批零倍率。不存在本地单品 anchor 时使用该地区与模型地区其他共同商品的真实标准化比值中位数；没有任何这类证据则明确失败并保留上一完整快照。

## 正式前端基底

前端可通过 `--frontend-bootstrap frontend/src/domain/market/publishedPresentation.json` 导出公开字段，或调用 `public_snapshot(payload)`，作为正式生产离线基底，与 API 使用同一 DTO 校验。不得将测试 Fixture 作为该基底。公开投影剥离私有路径、完整来源证据表和校准输入，保留真实来源URL、模型身份/目标/价格、趋势身份与范围。完整证据留在 Runtime 发布中，不需要成为用户页面文字。
