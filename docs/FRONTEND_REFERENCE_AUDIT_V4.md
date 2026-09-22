# FRONTEND_REFERENCE_AUDIT_V4

V4 施工前的设计参考审计。**本地参考库已逐项打开阅读**；外部站点为客户端渲染，本轮只能取到作品索引，故其结论沿用 V2 已落库的审计（`docs/INTERACTION_REFERENCE_AUDIT.md`），并在下表注明读取状态。

本地参考库：`/Users/morton_cheung/Desktop/比赛/大数据分析/frontedpage/design-references`
（顶层 14 项：`anime` `archify` `awesome-design-md` `gsap-skills` `GSAP` `impeccable` `inspira-ui` `lottie-web` `morphicons` `motion` `ponytail` `taste-skill` `ui-ux-pro-max-skill` `video-shotcraft`）

| Reference | 学习什么 | 不学什么 | 应用位置 |
|---|---|---|---|
| **Claude**（claude.com，暖白编辑感）<br>状态：沿用 V2 审计 | 暖白纸面、编辑感排版、Serif 大标题、低饱和、克制 | 对话产品的内容结构、营销区块 | 全站色板与排版（`tokens.css` / `typography.css`）；Opening 的品牌区 |
| **Apple Help**（固定阅读外壳）<br>状态：沿用 V2 审计 | 固定窗口 + 左目录 + 右正文、双内部滚动、层级定位 | 具体控件皮肤、Toolbar 图标画法 | City Reader 外壳（`city-space.css`）、Research Workspace 三栏（`research-workspace.css`） |
| **Gil Huybrecht**<br>状态：本轮已抓取（客户端渲染，仅得作品索引） | 对象连续性（同一对象进入下一状态）、Focus / Expand / Reverse、Editorial motion、轻微 Overshoot | 作品集内容结构、其字体与配色 | `‹ › ^` NavigationControls 的 hover 位移；Figure Focus（当前元素自己进入 focus）；Opening → Liaoning 同一组 Mesh |
| **Awwwards / Illoca (unseen.co)**<br>状态：沿用 V2 审计 | 强视觉事件、3D 与鼠标联动、纸张/草图质感、精确微动画 | 炫技式的整站动效密度 | Opening 的 Sketch → Assembly；辽宁沙盘的 Parallax 生命感 |
| **impeccable**（本地）<br>状态：**已阅读 `DESIGN.md`** | ① 枚举式字号阶梯（每个字号都落在固定档位上，允许 ±0.5px），避免 86 个近似字号；② rule 类 token 用 alpha-friendly 基色（`oklch(78% 0 0 / 0.16)`）；③ 「restraint in chrome, brilliance in texture」——克制外壳、精彩质感 | kinpaku 金/铜配色、暗色漆底、terminal 圆点等与本项目无关的皮肤 | 复核 `typography.css` 字号是否都在档位上；`tokens.css` 的结构线/边界线统一用 alpha 基色 |
| **ponytail**（本地）<br>状态：**已阅读 `AGENTS.md`** | 惰性阶梯：① 需要做吗 ② 已有可复用吗 ③ 标准库够吗 ④ 平台原生够吗 ⑤ 已装依赖够吗；根因修复而非症状修复；删除优于新增；最短可用 diff | 「少写就等于好」的极端简化；牺牲无障碍/错误处理 | V4 全程：删文案/删按钮/删重复入口优先；Parallax 用已有 `useThree().invalidate` 而不引入物理引擎 |
| **taste-skill**（本地）<br>状态：已阅读 `README` | 反 slop 立场：拒绝模板化的 AI 味界面 | 其赞助/推广内容 | 全站：拒绝 Badge/卡片/提示语堆砌（对应 §五） |
| **motion**（本地，motion 库源码）<br>状态：局部阅读 | `layoutId` 共享元素、`layout` FLIP、`useReducedMotion`、spring 参数 | 库内部实现细节 | Tab 底线、Research Tree 选中块、Figure Focus 放大 |
| **gsap-skills / GSAP**（本地）<br>状态：仅确认存在 | （V4 明确不用 GSAP：正则与既有 motion 足够） | 全部 | 不引入 |
| **archify / morphicons / inspira-ui / lottie-web / awesome-design-md / anime / ui-ux-pro-max-skill / video-shotcraft** | 仅作旁证：无一项解决 V4 的 6 个 P0 | 全部（避免引入新依赖） | 不引入 |

## 结论

1. V4 的四类职责分工（Claude=纸面编辑 / Apple Help=信息结构 / Gil=对象连续性 / Awwwards=视觉事件）**不变**，与 V2/V3 的设计母题一致。
2. 本轮最强的可执行启示来自 **ponytail**：V4 的 Phase 5/8/9 本质是「删除」，应先删再补。
3. **不引入任何新依赖**（GSAP / anime / lottie 一律不用）。

## 未能完成的部分（如实记录）

- `claude.com`、`illoca.unseen.co`、Awwwards 三个站点本轮**未重新抓取**（客户端渲染 + 网络不稳定），其结论沿用 `docs/INTERACTION_REFERENCE_AUDIT.md`。
- `gilhuybrecht.com` 仅取到作品索引（项目名 + 图片地址），未能取到动效参数，动效结论同样沿用 V2 审计。
