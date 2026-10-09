# AgriScope 部署准备（RC3）

**当前状态：未部署。** 本目录是**可一键执行的部署准备**，不是已部署声明。

## 0. 已确证的外部阻塞（SSH）

- 目标主机 `root@39.105.27.85`（阿里云）可达；
- `ssh -i ~/.ssh/morton_aliyun_ed25519 root@39.105.27.85` 在 `Server accepts key` 之后返回
  `Permission denied (publickey)`；
- 私钥 `~/.ssh/morton_aliyun_ed25519` **受 passphrase 保护**：`ssh-keygen -y -P "" -f <key>`
  报 `incorrect passphrase supplied to decrypt private key`；
- `ssh-add -l` 显示 `The agent has no identities`。

结论：无法在**非交互自动化**中完成认证。按 §40 属合法阻塞，本机侧工作全部完成，
服务器侧需人工解阻后再执行第 1–7 步。**不得伪造"已部署"。**

### 解阻条件（二者其一，需人工）

1. 把密钥加入 agent 并输入口令：`ssh-add ~/.ssh/morton_aliyun_ed25519`；或
2. 在服务器 `~/.ssh/authorized_keys` 中追加 `~/.ssh/morton_aliyun_ed25519.pub` 后重试。

## 1. 前置依赖

服务器需 Python 3.9+、Node/npm、systemd、nginx。域名与 TLS 由服务器管理员配置。

## 2. 部署步骤

1. 从唯一正式仓库 clone 到 `/opt/agriscope`，恢复 `runtime/manifest.json` 中资产，
   或解开 `python3 scripts/build_deploy_bundle.py` 生成的部署包。
2. 创建专用 `agriscope` 用户，使其拥有 `data/processed` 与 `llm/artifacts` 写权限；
   源码与模型目录只读。
3. `python3 -m venv .venv`；`.venv/bin/pip install -r backend/requirements.txt`；
   `cd frontend && npm ci && npm run build`。
4. 复制 `runtime.env.example` 到 `/etc/agriscope/runtime.env`，修改路径、域名、允许来源，
   权限 `600`。**不要提交 Secret。** 无 LLM Key 时统计情景链路仍正常运行。
   - 环境变量加载：项目根 `agriscope_env.py` 是唯一 loader。**系统环境变量优先**，
     `backend/.env` 仅作兜底，不会覆盖已存在的进程环境；`.env` 中的过期
     `AGRISCOPE_ROOT`/`PROJECT_ROOT` 会被拒绝注入（哨兵文件校验）。
5. `.venv/bin/python scripts/verify_assets.py`、`./scripts/acceptance.sh`、
   `python3 scripts/smoke_rc2.py --base-url http://127.0.0.1:8787`。
6. 把本目录 `*.service`、`*.timer`、`*.path` 复制到 `/etc/systemd/system/`，
   `systemctl daemon-reload`，启用 API、`agriscope-daily-chain.timer`、
   `agriscope-api-refresh.path`；nginx 改域名后先 `nginx -t` 再 reload。
7. 只读核对既有负载后再动服务：`docker ps`（若服务器运行 astrbot/napcat 等既有容器，
   一律不得中断或改端口）。

## 3. 运行约定

- 20:30 主任务与 23:30 安全网按 Asia/Shanghai 触发。外围编排**仅在 Daily 发布有效成功快照后**
  运行长期推理；crawl FAILED、dry-run、无快照不触发。长期失败返回编排退出码 5 并写
  `chain_status.json`，Daily 成功快照不受影响；长期 Job 可单独重跑。
- 同一运行历史、Registry 与模型版本生成相同 `snapshot_hash`，重跑不改 latest 生成时间。
- 长期 Job 独立 flock，`temp/flush/fsync/replace` 发布，backfill 不回退 latest。
- 每日推理不 fit；人工模型更新仅允许显式
  `PYTHONPATH=models/src:models:. python3 -m long_horizon.v2 --retrain`。
- 每日数据更新后需**重启后端**以重新绑定推理快照；后端为单 worker + 启动时绑定快照 + 推理锁。

## 4. 服务器侧验收清单

- [ ] `systemctl status agriscope-api` 为 active，`curl -s http://127.0.0.1:8787/health` 返回 ok。
- [ ] `python3 scripts/smoke_rc2.py --base-url http://127.0.0.1:8787` 通过。
- [ ] `./scripts/acceptance.sh` 全项通过；`pytest backend/tests/test_e2e.py` 通过。
- [ ] `systemctl list-timers | grep agriscope` 显示 daily-chain 与 api-refresh 已排程。
- [ ] `journalctl -u agriscope-daily-chain` 无 FAILED；`chain_status.json` 状态正常。
- [ ] Daily latest_data_date 与长期 latest_data_date 均前进，无 `LONG_HORIZON_STALE`。
- [ ] nginx 反代可达，前端静态资源 200，`ALLOWED_ORIGINS` 已收紧。
- [ ] `llm/artifacts` 与 `runtime snapshots` 权限仅 `agriscope` 可写。

## 5. 恢复

监控 `journalctl -u agriscope-daily-chain`、Daily/长期 `latest_data_date`、
`LONG_HORIZON_STALE`、`chain_status.json`。恢复时保留旧模型包与快照，停止 timer，
恢复旧完整 bundle 并校验，再启动 API；**不要覆盖历史原始事实或移动 rc1/rc2**。

## 6. 诚实性边界

独立最终评估证据未到门槛时，部署仅提供情景参考，**不得给生产点预测或强推荐**。
LLM/Hybrid 数值若未通过校准与门禁，一律停留在 `RESEARCH_ONLY`，不进入生产 Registry。