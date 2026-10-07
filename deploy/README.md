# RC2 部署准备

没有发现已配置且授权的服务器地址/SSH部署环境。本目录是可执行部署准备，不能称已部署。服务器需 Python 3.9+、Node/npm、systemd、nginx；配置实际域名和 TLS 由服务器管理员完成。

1. 从唯一正式仓库 clone 到 `/opt/agriscope`，恢复 `runtime/manifest.json` 中资产或解开 `python3 scripts/build_deploy_bundle.py` 生成的部署包。
2. 创建专用 `agriscope` 用户，使其拥有 data/processed 与 llm/artifacts 的写权限；源码和模型只读。
3. `python3 -m venv .venv`，`.venv/bin/pip install -r backend/requirements.txt`；`cd frontend && npm ci && npm run build`。
4. 复制 `runtime.env.example` 到 `/etc/agriscope/runtime.env`，修改路径、域名、允许来源，权限设为 600。不要提交 Secret。无 LLM Key 统计情景链路仍正常。
5. `.venv/bin/python scripts/verify_assets.py`，`./scripts/acceptance.sh`，`python3 scripts/smoke_rc2.py --base-url http://127.0.0.1:8787`。
6. 把本目录 `*.service`、`*.timer`、`*.path` 复制到 `/etc/systemd/system/`，daemon-reload，启用 API、daily-chain.timer、api-refresh.path。nginx 修改域名后先 `nginx -t`。

20:30 主任务和 23:30 安全网均按 Asia/Shanghai 触发。外围编排仅在 Daily 发布有效成功快照后运行长期推理；crawl FAILED、dry-run、无快照不会触发。长期失败返回编排退出码5并写 chain_status.json，Daily 成功快照不受影响。可单独重跑长期 Job。

同一运行历史、Registry 和模型版本生成相同 snapshot_hash，重跑不改 latest 的生成时间。长期 Job 独立 flock，temp/flush/fsync/replace 发布，backfill 不回退 latest。每日推理没有 fit；人工模型更新只允许显式 `PYTHONPATH=models/src:models:. python3 -m long_horizon.v2 --retrain`。

监控 `journalctl -u agriscope-daily-chain`、Daily latest_data_date、长期 latest_data_date、`LONG_HORIZON_STALE`、`chain_status.json`。恢复时保留旧模型包与快照，停止 timer，恢复旧完整 bundle 并校验，再启动 API；不要覆盖历史原始事实或移动 rc1。

独立最终评估证据未到门槛时，部署仍仅提供情景参考，不得给生产点预测或强推荐。
