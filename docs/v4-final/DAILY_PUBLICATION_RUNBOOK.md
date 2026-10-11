# Daily 动态行情与增量发布准备

本轮仅准备代码、配置与临时目录验收。没有开启 cron/systemd，没有运行真实采集，没有调用全量 `publish_runtime.py`，没有重新训练或改写正式数据/模型/研究。

前台通过无缓存 Daily API 读取，进入页面、返回前台和手动刷新更新；失败保留上次有效观测及其真实日期。`publication_meta` 分别记录采集尝试、独立采集完成、观测截止、快照生成、运行时发布和模型报告生成。`SKIPPED` 或 0 条抓取不能以 `last_success_at` 冒充采集完成，未登记时间为 null。

外围链为 `scripts/run_daily_chain.py`：已有 Daily 采集与 QC → 独立长期任务 → `publish_daily_runtime.py`。只有成功或部分成功且校验通过的有效 Daily 可发布。Daily 失败不触发后续；长期失败仍可发布有效 Daily 并保留旧长期结果，API 将其标为过期；发布失败不改变当前运行时指针。退出码 2/3/4 由 Daily 传递，5 表示长期失败，6 表示运行时发布失败。

发布器只接收工作区 `data/processed/daily` 中的最新快照、监控记录和固定 23 个所需输入文件（22 份业务表及来源指纹），以及同截止日的有效长期快照。实际 whitelist 在共享发布契约中；不复制 raw、模型、研究或日志，不执行全量删除。市场表保持原多源质量标记，服务按已确认口径筛选；不能将未知单位或其他价格层级展示成正式批发价。

新版本在 runtime 的独立 generation 中写入、逐文件核对 SHA256、校验 JSON/Parquet、落盘，再原子切换 manifest 的 `daily_publication`。原 manifest 的模型/研究资产与全包发布时间保持原值。与上一不可变 generation 一致的文件使用内部硬链接，仅复制变化文件；不链接可变 worker 源文件。旧版本保留，可通过运维恢复完整旧 manifest 回退。单发布者文件锁避免并发切换；中断前的未完成 staging 不可被 API 读取。

API 每请求固定读取一个 generation；Final 模型只在启动时绑定其输入，不在请求间改写模型缓存。`deploy/agriscope-api-refresh.path` 监控 `/opt/agriscope/runtime/manifest.json`；后续部署时由进程管理器重启 API 绑定新输入。启用前后需要检查 ready 与版本矩阵。

运维准备的独立 worker 目录通过 `PROJECT_ROOT=/srv/agriscope-worker` 指定，必须预先具备已有 pipeline 要求的研发输入与匹配冻结模型资源。产品部署目录保持 `/opt/agriscope` 并独立提供 `runtime/`；运行时服务不读外层研发目录。不要把采集输出写进正式模型或研究资产。

计划触发点为北京时间 20:30 主任务与 23:30 安全网，属于工程调度，不是官方发布时间承诺。systemd 使用显式 Asia/Shanghai 的 OnCalendar；cron 使用 CRON_TZ。两种示例都运行真实外围链。安装、服务账户/目录权限、凭据和实际源连通性由后续部署验收处理。

验收只对 pytest 临时 worker/runtime 运行。`--dry-run` 也可能创建日志与目录，不能当作“零写入”检查正式工作区。原始在线采集与已部署调度未验证；不能宣称后端每天自动获得新数据。
