# Final Model / Daily 只读 API 桥

桥接只负责 HTTP、输入校验和模型调用，不训练、不修改模型/数据、不自行排序推荐、不回退历史样例或 Mock。
Python 标准库提供 HTTP；模型仍使用其已有 Python 依赖。当前机器已核实 `python3` 可加载 Final Model，`models/.venv` 不存在。

从 `AgriScope/` 启动：

```bash
python3 -B server/agriscope_api.py --allow-origin http://localhost:5173 --allow-origin http://127.0.0.1:5173
```

默认监听 `127.0.0.1:8787`。开发服务器应将 `/api` 代理至该地址，浏览器保持同源请求；桥不开放跨站 CORS。
反向代理的正式站点使用 `--allow-origin https://你的域名` 指定浏览器 Origin。

可选直接提供构建结果，同一服务运行正式网页和 API：

```bash
python3 -B server/agriscope_api.py --frontend dist
```

模型工作区默认是 AgriScope 的父目录，也可设置 `AG_SCOPE_WORKSPACE_ROOT` 或 `--workspace-root`。
这是服务器配置，不进入前端 bundle。当前模型 `common.py` 的机器路径会在**进程内**配置后才加载 Final 模块，磁盘文件不改动。
模型首次请求加载，随后复用一个引擎；锁保护 Final 共享缓存。冻结元数据变更时拒绝混用旧缓存，需重启桥。
所有 API 响应为 `Cache-Control: no-store`；JSON 请求最多 64 KB。服务不记录输入或绝对文件路径，内部异常只返回克制错误。

## 接口

- `GET /api/decision/capabilities?city=shenyang`：正式城市/作物/horizon 能力、模型版本和真实数据末日。作物 ID 直接使用模型规范名称，如 `西红柿`。不支持城市返回 `supported=false`，不借沈阳数字。
- `POST /api/decision`：接受前端 Contract v1，返回原请求、正式 `evaluate_many()` 的 `batch` 与模型版本信息。原始 `ranking/all/status` 均保留；没有利润输入时，`all` 中价格/风险仍可能可用。
- `POST /api/decision/stress`：接受 `{request,candidate_id,changes}`，重新调用同作物 Final `evaluate()`，再调用 Final 原生 `_scenario_profit()`；不调用会写报告的 `run_stress_regret()`。
- `GET /api/daily/latest?city=shenyang`：每次读取 `data/processed/daily/snapshots/latest.json`，原样保留 `latest_data_date` 与 freshness。其他城市 404。没有采集、特征计算或 Daily CLI 操作。

Decision 请求结构：

```json
{
  "contract_version": "1",
  "user_context": {
    "city_id": "shenyang",
    "area_mu": 60,
    "budget_cny": 300000,
    "risk_preference": "balanced",
    "crop_preferences": ["西红柿"],
    "actual_inputs": {
      "西红柿": {"cost_per_mu": 20000, "yield_kg_per_mu": 4000}
    },
    "market_context": {"as_of": "2026-09-14", "horizon_days": 30, "harvest_date": null}
  },
  "input_source": {"kind": "structured"}
}
```

`as_of` 必须取 capability 给出的可用模型日期或更早日期，不能以网页今天代替；示例日期以部署的实际能力为准。
`horizon_days` 是模型比较周期。`harvest_date` 仅给历史气候月份参照，不是任意未来销售日价格模型。
桥将 `plant_date=as_of` 作为模型默认气候参照日期，不声明农事种植窗口。当前 Final 只回显 budget，并没有预算/农事窗口优化能力；桥不伪造该能力。

正式压力支持单轴价格/亩产/成本变化，以及两组模型原生组合：

- mild：价格 -10%、亩产 -5%、成本 +10%。
- severe：价格 -20%、亩产 -15%、成本 +20%。

`delay_days>0` 或其他多轴组合返回 `available=false`，各结果值为 null。
源函数只返回基准利润，因此 HTTP 结果中的 ROI 为 null，不能由浏览器补算成正式结果。
尚无不写报告的在线 Minimax Regret 接口，桥不把离线代表 cut-off 产物当用户方案结果。

## 验证

```bash
python3 -B -m unittest discover -s server/tests -v
AG_SCOPE_RUN_MODEL_TESTS=1 python3 -B -m unittest discover -s server/tests -v
```

默认测试用注入的模型边界验证 HTTP/校验/调用归属，隔离外部数据。第二条额外真实调用现有 Final Model 和压力函数，仍然只读。
