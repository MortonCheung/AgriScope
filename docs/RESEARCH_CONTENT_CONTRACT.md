# 研究内容契约（RESEARCH_CONTENT_CONTRACT）

本文件定义"研究工程需要产出什么，前端最好接"，作为后续五城统一标准。

## 1. 城市研究索引 `reports/03_沈阳研究索引.json`（同步为 `<city>/index.json`）

```jsonc
{
  "city": "沈阳",                      // 展示名
  "title": "…研究",                    // 全称
  "window": "2021-01-01 ~ 2026-09-14", // 数据窗口
  "panel": "10 品种 × 1,410 交易日 = 14,100 行日度面板",
  "crops": ["土豆", "…"],
  "n_crops": 10,
  "price_unit": "元/500g",
  "volume_unit": "unknown（禁止写作吨，仅 z / % / 相对口径）",
  "evidence_levels": { "A": "直接观测", "B": "统计关联（含阴性结果）", "C": "机制一致证据", "D": "模型或情景推演", "Unsupported": "当前数据不支持" },
  "status_values": { "supported": "获得支持", "null_result": "阴性结果（正式结论）", "descriptive": "描述性（无统计支持）", "exploratory": "探索性（门控未过或待验证）", "unsupported": "CURRENT DATA NOT SUPPORTED" },
  "structure": { "layer1_basic_pairwise": "…", "layer2_complex": "…", "layer3_themes": "…", "layer4_city": "…" },
  "topics": [ /* 研究点，见下 */ ],
  "summary_blocks": [ { "id": "S1", "title": "…", "covers": ["G1"], "text": "…" } ],
  "city_conclusion": { "title": "…", "risk_profile": "…", "definition": "…", "qas": [ { "q": "…", "a": "…" } ], "caveats": ["…"] },
  "methodology_notes": ["…"],
  "red_lines": ["…"],
  "source_of_truth": { "research_doc": "01_沈阳研究总报告.md", "process_reports": "…", "lineage": "workspace/outputs/results_registry.csv" }
}
```

### 研究点（topics 数组元素）

| 字段 | 必需 | 说明 |
|---|---|---|
| `id` | ✔ | `G1…G10`、`C1…C7` 等，全局唯一；前端路由与文件名使用该 id |
| `title` / `question` | ✔ | 标题与研究问题 |
| `summary` / `conclusion` | ✔ | 直接进入前端，前端不改写 |
| `evidence_level` | ✔ | `Level A/B/C/D` 或 `Unsupported` |
| `status` | ✔ | 必须是 `status_values` 的键 |
| `key_numbers` | ✔ | `{ "标签": 数值或字符串 }`，原样展示 |
| `figures[]` / `tables[]` | ✔ | 相对研究工程根的路径；同步脚本按 basename 归一化 |
| `frontend_text` | 推荐 | 一句话解读（前端"现象"层首屏文案） |
| `method` / `data` / `why` | 推荐 | 进入"方法与限制"层 |
| `limitations[]` | 推荐 | 逐条展示，不合并 |
| `layer` / `category` | 可选 | 用于分类标签 |

### 硬性要求

1. `id` 必须与 `reports/01_沈阳研究总报告.md` 中 `## <id> …` 的标题一致，前端据此切分原文。
2. 所有 `figures` / `tables` 路径必须真实存在，否则同步脚本直接失败（不允许静默跳过）。
3. 阴性结果必须出现在索引中，且 `status: "null_result"`；前端不得删除或降级。
4. 数值一律以字符串或数值原样给出，前端不做单位换算、不做插值。

## 2. 研究正文 `reports/01_沈阳研究总报告.md`

- 按 `## <id> <标题>` 分节；节内固定使用 `### 研究问题 / 为什么研究 / 数据 / 方法 / 结果 / 结论 / 证据等级 / 局限 / 前端一句话`。
- 前端按研究点读取对应章节作"查看原文"，不重排、不改写。
- 表格用标准 Markdown 表格，图片用 `![alt](outputs/figures/Fxx.png)`（前端按文件名解析到 `reports/figures/`）。

## 3. 交互数据表（`reports/tables/*.csv`）

- 第一行为列名，UTF-8（可带 BOM），逗号分隔，无合并单元格。
- 推荐列命名（前端已按这些列名做通用绑定）：
  - 季节指数：`crop, month, month_label, seasonal_index, variable, unit`
  - 滞后扫描：`crop, response, exposure|hazard_key, label|hazard_label, lag_days|lag_day, effect_z_per_1sd|effect, ci_low, ci_high, p_value, fdr_p, n_obs`
  - 量价领先滞后：`crop, lead_k, direction, effect, ci_low, ci_high, fdr_p`
  - 事件研究：`offset, mean, count, ci_low, ci_high, group, response`
  - 反事实：`crop, severity_mult|buffer_frac, mean_gap_*_z, mean_gap_*_pct` + `POOLED` 行；门控表 `target, n, r2_sim_vs_actual, gate_min_r2, gate_pass`
- `response` 取值固定为 `price` / `volume`；`crop` 与索引 `crops` 一致。
- 命中"显著/不显著"的判定列请直接在表中给出（如 `fdr_p`、`sig_fdr05`），前端不重新判定。

## 4. 图表（`reports/figures/*.png`）

- 建议 ≥1600px 宽、白底、字体可读；前端按容器宽度缩放。
- 图名 `F<编号>_<主题>.png`；索引中通过 `figures[]` 引用。

## 5. 来源目录与交互补充表

研究工程按 `reports/`（给人看的成果）与 `workspace/`（分析工程工作区）分工，同步脚本按此顺序取源：

| 内容 | 首选 | 回退 |
|---|---|---|
| 研究索引 | `reports/03_沈阳研究索引.json` | `workspace/SHENYANG_RESEARCH_INDEX.json` |
| 研究正文 | `reports/01_沈阳研究总报告.md` | `workspace/SHENYANG_RESEARCH.md` |
| 图表 | `reports/figures/` | `workspace/outputs/figures/` |
| 数据表 | `reports/tables/` | `workspace/outputs/tables/` |

索引内部仍沿用分析工程的相对路径（`outputs/figures/Fxx.png`），同步脚本按 **basename** 在来源目录中解析，
因此研究工程重组目录结构时前端不需要跟着改。`manifest.json` 会记录本次实际使用的来源路径。

**交互补充表**：当某研究点的交互模块需要一张"研究体系已产出、但索引把引用登记在别的节点上"的表时，
可在同步脚本的 `INTERACTIVE_SUPPLEMENTS` 中显式声明（例如 `C2` 需要 `threshold_bins_explanatory.csv`
来做阈值分箱交互）。约束：

- 只能补充研究工程已经产出的表，不允许为做交互造表；
- 补充表会与索引原生表一并进入该研究点的 `tables[]`，并在界面上标注为来源；
- 每次补充都要在 `INTERACTIVE_SUPPLEMENTS` 的注释里写明用途。

## 6. 前端承诺（不做什么）

- 不新增、不修改任何研究结论；不删除阴性结果。
- 不把相关写成因果、不把模型/情景写成事实、不把成交量写成吨、不把再分析天气写成气象站实测。
- 不为页面效果编造阈值、数值或时间线；缺数据时如实写"交互数据正在接入"或使用真实静态图。
