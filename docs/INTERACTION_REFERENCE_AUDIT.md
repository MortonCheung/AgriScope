# AgriScope 交互参考审计

本文回答一件事：**每个参考各自只负责一种东西，我们学它什么、不学它什么，落在哪些文件里。**

用途有二：

1. 施工前对齐"该学谁"的边界，避免把几个参考网站直接拼接（V2 §3）；
2. 每个 Phase 开工前，从这里找出对应的参考与既有约束（V2 §111/§112）。

> 记录规则：只写**已核实**的结论。外部站点未逐帧核对的，标注"待实站核对"，
> 不用印象填补；本地参考库的结论都来自实际读到的文件。

---

## 1. Gil Huybrecht

```text
参考   https://gilhuybrecht.com
```

**学什么（Learn）**

```text
Object continuity      对象不消失重来，而是移动/缩放/展开成下一个对象
Shared-object transition  同一对象在两个状态间连续插值
Focus                  降低其他信息权重，而不是放大当前对象
Reverse transition     返回是进入的逆动画
Contextual back        在明确的大型 focus 层里，外围空白可以提示返回
Subtle overshoot       只在大型对象上有极轻的惯性
Motion as layout       用运动表达布局关系，而不是加装饰
```

**不学什么（Do not learn）**

```text
杂志题材与栏目结构
它的具体字体与排版度量
它的配色
作品集式信息架构
```

**应用到（Apply，真实文件）**

```text
City Research Reader 入场与收回     features/city/CityResearchSpacePage.tsx · city-space.css
Research Summary focus 态           features/research/**（选择态与展开）
Interactive Research 进入            features/research/ResearchPointPage.tsx
Back 逆动画                          app/RouteTransition.tsx · app/appHistory.ts
导航微动效                           app/AppHeader.tsx
```

**与本项目已实现部分的对应**

- 省域推近城市时"相机终点 = 城市路由终点"（`LiaoningCanvas.tsx` 的 `cityView()`），
  正是共享对象连续性的空间版本：路由切换时相机不再跳。
- 返回省域时不重放完整入场，只把相机退回省域视角（`CameraRig` 的 province 分支）。

> 待实站核对：Gil 站点自身的过冲数值、返回时长与光标提示的触发范围。本文先按
> 任务书（补充要求 B §7–§27）给出的原则执行，数值以本项目视觉调试为准。

---

## 2. Claude

**学什么**：暖白阅读环境、编辑出版感、大留白、克制正文排版、低饱和、安静。
**不学什么**：不照搬其正文比例与具体字体。
**应用到**：`design/tokens.css`（暖白纸面 + 近黑正文 + 暖灰层级）、`features/research/*` 文章排版。

---

## 3. Apple Help / Mac 使用手册

**学什么**：固定窗口、左目录右正文、明确层级、内部独立滚动、稳定阅读位置——**整张纸不滚**。
**不学什么**：macOS 交通灯、系统控件外观、Apple 蓝。
**应用到**：`features/city/CityResearchSpacePage.tsx`、`features/city/city-space.css`（Phase 4）。
**与 Gil 的关系**（V2 §33）：Apple 决定**结构**，Gil 决定**结构之间怎么移动**，两者不冲突。

---

## 4. Awwwards Annual Awards

**学什么**：文字下划线动画、鼠标悬停联动、3D 对象对光标的反馈、动画节奏、做减法、状态连续。
**不学什么**：它的颜色、字体、品牌风格、炫技程度。
**应用到**：`app/AppHeader.tsx`（`layoutId` 滑动指示线 + hover 局部下划线）、
`features/liaoning/LiaoningPage.tsx`（城市按钮 hover 与地图联动）。

---

## 5. Illoca / Unseen

**学什么**：整个网站围绕**一个视觉母题**展开。
**AgriScope 的母题不是**农业/田地/叶子/绿色，**而是**研究/纸张/图谱/档案/证据/地理/注释。
**允许出现但要克制**：页码、图号、研究编号、经纬度、注释线、脚注、章节编号、数据来源、极微弱纸面颗粒。
**应用到**：全站（`design/*` + 各研究页页眉与出处标注）。

---

## 6. 本地参考库 `frontedpage/design-references`

### 6.1 `impeccable/reference/animate.md`（动效方法论，最高价值）

**学什么**（原文结论，可直接当作本项目动效准则）：

```text
"motion serves feedback, state, and continuity. Keep routine transitions fast
 and do not make users wait through page-load choreography."
  → 常规转场必须快，不能让用户等待编排。这正是 Bug 1 的根因（用户白等 760ms）。

时长语义表
  100–150ms  即时反馈
  150–300ms  常规状态变化
  300–500ms  布局 / 覆盖层 / 视图转场
  500–800ms  刻意编排的焦点入场
  → 本项目 MOTION_DURATION 已按此分档：fast .18 / normal .28 / slow .44 / route .42
    / camera .82 / chartReveal 1.2 / opening 2.1

"Exit faster than entrance."
"Use natural deceleration such as cubic-bezier(0.16, 1, 0.3, 1)…
 do not use bounce or elastic curves by reflex."
  → 与 design/motion.ts 的 MOTION_EASE.out = [0.16, 1, 0.3, 1] 一致

"Continuity and relationship: shared-element motion, FLIP-style transforms,
 view transitions, or deliberate spatial movement."
  → 支持用 layoutId / View Transition 做 Research Reader 与导航指示线（V2 §18/§19/§42）

"Do not add a dependency for an effect the existing stack can express cleanly."
  → 不引入 GSAP（与 V2 §12、§110 一致）

"Do not animate a static area merely because it exists."
"Decoration without purpose is animation debt."
  → 与 V2 §120 的三问一致
```

**不学什么**：它的 Visitor mode 分档（Persuade/Operate/Read）与视觉世界设定按本项目重写。
**应用到**：`design/motion.ts`（令牌）、`features/liaoning/useAnimationFrames.ts`（帧策略）、
`docs/MOTION_LANGUAGE.md`（Phase 9 统一时落笔）。

### 6.2 `ui-ux-pro-max-skill`（按优先级的交互规则表）

**学什么**：它的优先级排序与"必须/反模式"清单，尤其：

```text
Priority 2  交互：最小 44×44px、间距 8px+、加载反馈
            反模式：只依赖 hover、0ms 瞬时状态变化
            → 本项目城市按钮保留 onFocus/onBlur，不把键盘用户排除在外

Priority 7  动效：时长贴上下文、动效承载意义、空间连续
            反模式：所有转场同一个时长、动画 width/height、没有 reduced-motion
            → 本项目有 motion token 分档 + prefers-reduced-motion 降级

Priority 9  导航：可预期的返回、深链接
            反模式：返回行为损坏
            → 与补充要求 B §15/§16 一致，Phase 1 已验证浏览器 Back
```

**不学什么**：它的配色/字体选型清单与本项目的美术方向无关。
**应用到**：Phase 2 导航、Phase 4 Reader 结构、Phase 9 统一动效时的自检清单。

### 6.3 `motion/`（Motion 官方仓库/文档）

**学什么**：`layoutId` 共享布局动画、`AnimatePresence`、`useReducedMotion` 的正确用法——
本项目已在使用（`RouteTransition.tsx`、`useReducedMotion`）。
**不学什么**：与本项目无关的示例场景。
**应用到**：Phase 5 Sidebar 选择态、Phase 9 Tab 与指示线。

### 6.4 `GSAP/`、`anime/`、`gsap-skills/`

**学什么**：只读**技术思路**——Flip（共享元素/布局过渡）、DrawSVG 与 `setDrawRange`（线条绘制）、
ScrollTrigger（滚动驱动）。
**不学什么**：不引入这些库（V2 §12/§110；impeccable 也不建议为已有能力加依赖）。
**应用到**：Phase 7 Opening 的"轮廓绘制"用 `liaoningGeometry` + `setDrawRange` 自行实现（V2 §65）。

### 6.5 `inspira-ui/`、`awesome-design-md/`、`archify/`

- `inspira-ui`：视觉组件灵感（Vue 实现），只取视觉方向，不移植代码。
- `awesome-design-md`：**DESIGN.md 文档格式**的参考（Google Stitch 概念，73 份真实站点设计系统分析）。
  本项目 token 已集中在 `design/`，如需对外说明设计系统，可采用该格式。
- `archify`：图表/架构图工具，与本轮交互方向无关。

---

## 7. 参考分工总结

```text
Claude        决定阅读氛围        → 暖白纸面、编辑排版、留白
Apple Help    决定信息结构        → 固定 Reader、左目录右正文、双内部滚动
Gil           决定结构之间怎么移动 → 对象连续性、Focus、逆动画、极轻过冲
Awwwards     决定微交互质感        → 下划线、悬停联动、3D 对光标反馈
Illoca/Unseen 决定视觉母题         → 研究 / 纸张 / 图谱 / 档案
impeccable    决定动效纪律与时长     → 分档时长、自然减速、不加依赖
ui-ux-pro-max 决定交互自检清单       → 44px、键盘、reduced-motion、返回可预期
```

---

## 8. 每个 Phase 开工前要回来看什么

| Phase | 先看 | 关心的结论 |
|---|---|---|
| 2 导航语义 | Awwwards 4 · ui-ux-pro-max 6.2 | 指示线用共享 layout；Active 优先于 Hover |
| 3 文案减法 | V2 §4/§5/§79 | "删掉后用户仍明白"即删 |
| 4 Reader 结构 | Apple 3 · Gil 1 | 整张纸不滚；进入/收回是同一对象的正反动画 |
| 5 Sidebar Motion | Gil 1 · motion 6.3 | `layoutId` 选择块、当前专题保持展开 |
| 6 Liaoning 3D | impeccable 6.1 · Awwwards 4 | 接触阴影必须测 FPS，掉帧就撤；hover 是同一个状态 |
| 7 Opening | V2 §59–§67 · GSAP 6.4（仅思路） | 平面成为空间；1.8–2.4s；不出现粒子/星空/HUD |
| 8 Scenario / Insight | V2 §76–§78 | 参数语义科学化；不伪装 Chatbot |
| 9 统一动效 | impeccable 6.1 · ui-ux-pro-max 6.2 | 六类动画写进 `docs/MOTION_LANGUAGE.md` |
