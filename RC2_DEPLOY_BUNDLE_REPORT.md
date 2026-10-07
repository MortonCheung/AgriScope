# RC2 部署包独立目录验证

2026-10-08 实际构建 `output/rc2/agriscope-rc2-deploy.tar.gz`，验证包包含 1374 个文件，压缩大小 263,564,895 bytes。它包含源码、必需运行数据/权重、前端 dist、原 Daily 响应和回测核算证据，排除真实 .env、node_modules 与 LLM response cache。最终包会在完整报告提交之后重新生成。

解压到与源目录分开的 `output/rc2/portable-check/`，设置 PROJECT_ROOT/AGRISCOPE_ROOT/PYTHONPATH 指向解压位置后，真实运行：

- 资产校验 **722/722**，immutable 及 required 均通过，generated 漂移 0。
- 后端实际绑定解压包内 Daily extended_snapshot，正式验收 **19/19**、契约回归 **52 tests** 通过。
- Final live 源码指纹 b19b187268ee92db，**173/173** 冻结文件未变。
- 独立 Long-Horizon Job 成功加载包内权重，推理 **120** 双目标条目；没有训练，也没有借用原仓库模型路径。

此检查使用本机已安装的冻结版本 Python 依赖；未声称另一操作系统、新虚拟环境 cold install 或真实服务器验收。安装清单已补齐 Final/Daily 使用的 PyYAML，以及采集/解析依赖。前端 node_modules 需服务器 npm ci 安装，不在包中。

服务器配置在 deploy/README.md：Python 虚拟环境、专用用户、环境文件、单 worker API、20:30/23:30 Asia/Shanghai Daily timer、Daily 发布后 API refresh path、nginx SPA/API 代理及完整旧包回滚步骤。未提供实际服务器地址/权限，状态为 DEPLOYMENT_PREPARED_NOT_DEPLOYED。
