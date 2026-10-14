# AgriScope Linux 部署准备

本轮完成本地整合与隔离验证，不连接阿里云、不安装远端服务、不启用定时任务。部署对象是包含已构建前端与精选运行资产的完整产品包；没有完整研发工程也能启动 API 和页面。

## 路径与依赖

产品代码、前端及已发布资产放 `/opt/agriscope`，`AGRISCOPE_ROOT=/opt/agriscope`。新增每日原始证据、加工结果、日志、锁放独立 `/srv/agriscope-worker`，`PROJECT_ROOT=/srv/agriscope-worker`。API 不写 worker；冻结模型、canonical 输入和研究只从产品 `runtime/` 读取，不训练、不覆盖。

Linux 集成基准为 Python 3.11、glibc 2.24 以上（建议 Ubuntu 22.04/24.04 或等价环境）、系统 CA 证书与 `libgomp`。采集入口保留系统信任库并加载固定certifi的Mozilla CA，始终验证证书链及主机名；私有CA仅用显式AGRISCOPE_SOURCE_CA_FILE配置，不用verify=False。按 `backend/requirements.txt` 安装既有固定版本，不为部署升级模型依赖。实际 pandas 2.3.3 的 CPython 3.11 Linux wheel 使用 manylinux 2.24/2.28；云主机架构与系统版本需在正式部署时确认。

已构建 `frontend/dist` 由 Nginx 直接提供，运行服务器无需 Node。仅从源码构建时需要 Node 20.19 以上或 22.12 以上；建议固定 Node 22 LTS 的兼容版本，执行 `npm ci` 与 `npm run build`。

长期推理所需的正式运行资产已完成精选发布：`pipelines/publishing/publish_long_horizon_models.py` 按既有冻结索引选择并逐项核对 SHA256，将 61 份索引与注册权重复制到 `runtime/models/models/long_horizon`，在 manifest 中逐文件登记。当前运行资产共 82 项，长期模型缺包已解决；没有重新拟合，也没有更改源权重。这个发布步骤属于新 release 的构建准备，不属于每日采集，不应在已部署版本内改写冻结模型。重新生成 release 时需沿用经 registry 确认的模型源目录，不能猜文件或全量复制外层 models。

## 生成和核验交付包

完成提交后，在产品仓运行：

```sh
python3 scripts/verify_assets.py
python3 scripts/build_deploy_bundle.py --label YOUR_RELEASE --output-dir /ABSOLUTE/ARCHIVE/OUTPUT
```

不指定输出目录时，包写入产品父级的 `archive/build_artifacts/deployment/<label>`，不污染产品目录。默认拒绝未提交工作区；仅本地隔离测试可显式 `--allow-dirty`，状态会进入清单。

包包含已构建页面、源码、必需 runtime、当前 Daily/行情 immutable generation，并附 `deployment-manifest.json`：每个文件的大小与 SHA256、源码提交与工作区状态、当前发布代。`.env`、私钥、node_modules、虚拟环境和未发布 LLM 实验资产不进入包；内部 symlink 直接拒绝，避免本机绝对路径混入 Linux。

在独立临时目录解包后，再运行包内 `python3 scripts/verify_assets.py`；它同时核验独立部署文件清单和运行资产。旧 runtime manifest 无 SHA 字段仍保持存在校验，交付包文件清单提供完整字节校验。运行清单的基底单独作规范 JSON 哈希，只允许 `daily_publication`、`market_publication`、`publication_rollbacks` 三个已定义运行字段变化；当前发布指针仍须通过各自严格解析器、逐文件哈希与来源合同校验。正常每日发布不会使 API 重启因旧 manifest 字节哈希失败；资产列表、模型、源码和研究仍不能变动。不要直接对生产目录运行研发态 `scripts/acceptance.sh`，它包括 worker/pipeline 验收；完整工程测试必须使用隔离 worker。

## 正式部署时的步骤

以下供获准部署时执行，本轮不执行。先只读核对现有进程、端口、磁盘、Python/架构、Nginx 和容器；不停止其他项目，不复用被占用端口。

1. 为新版本创建独立 release 目录，核对下载包 SHA256，在该目录解包。保存上一完整 release 和其部署文件清单。
2. 创建专用 `agriscope` 用户。源码、冻结模型、研究与 canonical 输入由管理员持有，`agriscope` 只有读取和目录遍历权限。由管理员将产品读取组设为 `agriscope` 并赋予组读取和目录遍历权限（例如 `chgrp -R agriscope <release>`、`chmod -R g+rX <release>`），不赋予整个产品组写权限。Nginx用户还须能遍历release/frontend路径并读取frontend/dist；前端公开文件设0644、公开目录0755，API私有运行资产不因此开放写权限。仅 worker 新增区、runtime 的发布目录/manifest 替换父目录允许该用户写；`runtime/models`、`runtime/research`、`runtime/data/model_ready`、`runtime/data/metadata` 保持管理员持有且不可写。不要递归把整个产品 `chown` 给服务用户。
3. 在该 release 内建立 Python 3.11 `.venv` 并安装 `backend/requirements.txt`，运行包内资产校验。使用临时端口验证独立包启动、`/health/live`、`/health/ready`、行情、决策、研究 API，不启动采集。
4. 将 `runtime.env.example` 复制到 `/etc/agriscope/runtime.env`，文件由 root 持有并 `chmod 600`。systemd 由管理器读取该文件再传给专用服务用户；无需让该用户直接读取 Secret 文件。修改真实域名、允许来源和明确的产品/worker 路径。LLM 可选：配置匹配的 HTTPS 地址、模型与密钥后启用，实际 Secret 不进入源码、日志或交付包。
5. 固定的 `/opt/agriscope` 可指向已核验 release。只安装 `deploy/agriscope-api.service`；`backend/deploy` 是兼容拷贝，不能同时安装另一 API。API 监听 127.0.0.1:8787，单 worker。服务使用只读系统、专用缓存/日志目录，权限不足必须纠正明确的写区，不能关闭所有保护。
6. Nginx 与 API 同源。先替换 `YOUR_DOMAIN`；公开服务使用 `nginx.https.conf.example` 并准备真实证书，执行 `nginx -t` 后再 reload。HTTP 示例用于预检；没有证书时不能宣称 HTTPS 就绪。HTML 不缓存，构建 hash 资源长期缓存，未知 `/assets/` 返回 404，业务深链回到 SPA。API、health 不缓存；设置有限连接/读写超时。
7. API 就绪验证通过后，先在隔离 worker 中验证一次采集与严格发布，再决定是否启用每日链路。预建 `runtime/data/processed/daily/publications`、`runtime/data/market/publications` 与 `runtime/publication_history` 并给专用用户写权限；运行清单父目录须允许临时文件和原子替换，不能只把 `manifest.json` 一个文件设为可写。systemd 把其余 `runtime/data` 及模型、研究、LLM/注册表设为只读，只对两个 publication 子目录与 history 重新开放写入。独立 worker 所需输入与权限未准备好时，不能启用 timer。日历默认 Asia/Shanghai 20:30 与 23:30，是工程调度，不代表官方发布时间。
8. immutable 发布验证成功后，`agriscope-api-refresh.path` 观察 runtime manifest，`try-restart` 已运行 API 以重新绑定模型输入代；不会启动用户已经停止的 API。重启后的 ready 检查必须通过。刷新服务用有限60秒探针实际确认就绪，失败在systemd/journal中标红；已主动停止的API不被重新启动。

## 验收与失败处理

- `/health/live` 仅代表 HTTP 进程存活；运行资产损坏也应能返回存活结果。
- `/health/ready` 检查实际快照、数据集、模型文件、元数据和 Daily；缺模型不能声明 ready。
- 交付文件校验失败时，API 的 `ExecStartPre` 阻止启动；不以清空旧资产或补假数据绕过。
- LLM 使用 HTTPS、默认 TLS 校验、连接与总超时，服务端可回到既有统计方案；不会把传输异常或密钥回传前端。
- 部署环境默认 `AGRISCOPE_MARKET_POLICY=observed`，代码在该变量缺省时也采用observed，只有显式competition才启用旧比赛完整视图兼容。首个严格行情发布代产生前，API 返回明确的本地观测缺项，不读取旧比赛包的跨城市补值；首次发布必须先通过来源与完整性验证。当前正式每日采集仅配置沈阳，其余五城仍为 `not_configured`，这是六城每日更新的明确阻塞，不得宣称六城实时采集已完成。真实的既有同城、同商品、同口径记录可展示；不能借其他城市或其他价型包装成本地实时数据。
- 沈阳超市、集市响应同时包含按重量计价的蔬菜和按升/袋计价的其他商品。请求价格类型、观测日期、必需字段和有效价格仍逐行核验；无法确认重量换算的商品在原有质检中以 `UNIT_UNKNOWN` 拒收，原始响应保留。它们不会使同一响应中的有效蔬菜整批丢失，也不会被猜重量或进入批发模型。
- 云端 HTTPS、Nginx、systemd、实际机器轮子兼容与权限，只有在相应环境实测后才能标为通过。本机模板检查不能替代 `nginx -t`、`systemd-analyze verify` 与独立 release API 验证。

## 回滚

应用回滚以整个 release 为单位。先暂停该应用的更新 timer/path，不修改其他项目；保留失败 release、包 SHA、日志及新增原始证据。重新核验上一 release 的文件清单，再将 `/opt/agriscope` 入口原子切回上一完整 release，重启这一个 API 并核验 ready、API 与 SPA，最后恢复经过确认的更新任务。不要把新旧 frontend/dist、runtime、源码拼接使用。

数据发布代回滚使用产品已提供的 immutable publication/rollback 工具，保留 generation 目录与原始事实；不能手动覆盖冻结模型、研究资产或历史原始记录。应用源码 release 与数据代的版本必须在同一次验收里核对。


## 隔离 Linux 验证入口

本机已用独立Python环境与解包目录验证，但没有Linux容器运行器；正式安装前必须在临时Linux实例或CI容器运行以下检查。此过程不连接、不修改生产阿里云服务器。

```sh
python3 -m venv /tmp/agriscope-test-env
/tmp/agriscope-test-env/bin/pip install -r backend/requirements.txt
/tmp/agriscope-test-env/bin/python scripts/verify_assets.py
systemd-analyze verify deploy/*.service deploy/*.timer deploy/*.path
# 在临时测试目录将YOUR_DOMAIN/证书与路径替换为测试值，安装该配置后：
nginx -t
```

`systemd-analyze verify`需要临时环境中的真实用户、/opt/agriscope虚拟环境与目录；不能把缺失这些前提的告警算作正式unit失败或通过。完整worker验收使用独立PROJECT_ROOT，并将AGRISCOPE_ROOT指向独立release副本；禁用LLM外呼、保留原始证据与freeze hashes，只运行既有推理。API临时端口验证后，正常发布→重启→ready与回滚→重启→ready均需通过。Linux权限、证书、实际端口和域名为未实测外部条件。

## 七地区行情（Market Display V3）

每日链 `scripts/run_daily_chain.py` 现在包含一个**独立**的 market_feed 阶段，先采集七地区真实行情，
再执行沈阳 Daily 模型链；两者解耦：

1. `market_feed`：`python -m pipelines.daily.market_feed daily`，写入 `$PROJECT_ROOT/market_feed/`
   （原始证据 + SQLite + 快照 + 报表），单区失败不阻断其他区域。超时 `AGRISCOPE_MARKET_TIMEOUT_SECONDS`（默认 600s）。
2. `market_publication`：`product_bridge.publish_product()` 导出 checkpoint 快照并发布**不可变 V3 行情代**
   （原子 manifest 切换 + SHA256 + receipt + 可回滚），与沈阳模型成败无关。
3. `daily` → `long_horizon` → `runtime_publication`：沈阳模型链与 Daily Runtime 发布，不受行情失败影响。

- API 只读不可变行情代：`GET /api/market/display`（`schema_version="3"`，224 格，7×8×4）。
- `coverage.collection_status` 由真实成功运行推导，未验证地区为 `not_configured`。
- 采集阶段的写权限已包含在 `/srv/agriscope-worker`（chain unit 的 `ReadWritePaths`）；行情发布写
  `runtime/data/market/publications` 与 `runtime/publication_history`（chain unit 已授权）。
- 不再单独安装 market-feed 定时器，避免与链重复写入同一观测库。
