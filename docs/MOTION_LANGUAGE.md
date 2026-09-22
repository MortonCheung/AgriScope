# AgriScope Motion Language

AgriScope 的动画只有一个目的：**帮助用户理解数据与空间关系**。删掉某段动画后，如果用户不会更难理解数据、层级或空间位置，它就不应该存在。

一个判断标准贯穿全文：动画要么解释「我现在在哪里」，要么解释「我刚刚看到的东西和新东西是同一个东西」。如果两者都不是，它就是装饰，应当删除。

所有时长与缓动都来自 [src/design/motion.ts](../src/design/motion.ts)，CSS 侧使用 [src/design/tokens.css](../src/design/tokens.css) 中一一对应的 `--ag-dur-*` 变量。**组件里不允许出现散落的 `180ms` / `260ms` / `760ms` / `410ms`。**

---

## 六类动画

### 1. Hover — 指针经过时的本地反馈

- **要回答的问题**：这个元素可以被操作吗？我现在指着的是哪一个？
- **令牌**：`MOTION_DURATION.underline`（`--ag-dur-underline`）、`MOTION_DURATION.hoverLift`（`--ag-dur-hover-lift`），缓动 `MOTION_EASE.out`（`--ag-ease`）。
- **形态**：
  - 文字/导航：细线从左侧 `scaleX(0) → scaleX(1)`，`transform-origin: left`。统一由 [AnimatedUnderline](../src/components/AnimatedUnderline.tsx) 提供（§41/§43）。
  - 3D 城市：鼠标进入时区块沿 Y 轴轻微抬起，指针离开时落回。
- **铁律**（对应 §92/§105）：
  1. hover 动画必须**可中断**：指针离开时立刻反向，不能等上一次播完。
  2. hover 动画**只发生一次**，不循环、不脉冲；停下后保持终态。
  3. 不存在交互死区：相邻可点击元素之间的缝隙不能导致 `pointerleave` 抖动（用容器级 `onPointerLeave` + `gap: 0` + 内边距实现）。

### 2. Selection — 从旧选中项移动到新选中项

- **要回答的问题**：当前选中的是哪一个？它和刚才选中的是同一类东西吗？
- **令牌**：`MOTION_DURATION.selection`（`--ag-dur-selection`）、`MOTION_SPRING.soft` / `MOTION_SPRING.direct`。
- **形态**：使用 `motion` 的 `layoutId` 让同一个指示物在元素之间**连续滑动**，而不是旧块消失、新块出现（§44/§45）。
  - 顶部导航：`layoutId="main-nav-indicator"`。
  - 研究侧栏：`layoutId="reader-selection"`。
  - 研究点 tab：`layoutId="research-point-tab"`。
- **铁律**：同一屏内同类选中态**共享同一个 `layoutId`**；不要用 `[data-active]::after` 的瞬间切换（§42）。

### 3. Route — 页面之间的位移

- **要回答的问题**：我是「进入」还是「返回」？新页面从哪个方向来？
- **令牌**：`MOTION_DURATION.route`（`--ag-dur-route`）；旧浏览器的降级入口用 `MOTION_DURATION.normal`。
- **形态**：
  - 浏览器支持 View Transitions 时，由 [route-transitions.css](../src/app/route-transitions.css) 驱动 `route-page` 的进入 / 后退 / 侧移。
  - 不支持时，[RouteTransition.tsx](../src/app/RouteTransition.tsx) 给同一组件树一次很轻的入口位移。
  - 方向由 `data-route-direction`（`forward` / `back` / `lateral`）表达，不新建路由框架。
- **铁律**：同一时刻**只有一个活的 Canvas**；导航栏是稳定宿主，动画期间不重跑。

### 4. Camera — 空间中的移动

- **要回答的问题**：我从辽宁的哪一块，移动到了哪一块？我还能不能回到全局？
- **令牌**：`MOTION_DURATION.camera`（`.82s`）。
- **形态**：`camera-controls` 的 `setLookAt(..., true)` 平滑推近；`rest` 事件触发后才切换路由。省 → 市与市 → 省共用同一个 `cityView()` 终点，保证路由切换瞬间相机不跳变。
- **铁律**：
  1. `frameloop="demand"` 下，命令式相机动画必须自己泵帧（[useAnimationFrames](../src/features/liaoning/useAnimationFrames.ts) 调 `invalidate()`），否则既不启动也不结束。
  2. 必须设置看门狗超时（`camera * 2.5`），`rest` 若未触发也能收尾，避免用户被卡在中间态。

### 5. Chart — 图表沿数据展开

- **要回答的问题**：这张图的顺序、范围、趋势是什么？
- **令牌**：`MOTION_DURATION.chartReveal`（`1.2s`）、`CHART_REVEAL_STAGGER`（`.06s`）。
- **形态**：折线沿 x 轴绘制、事件标注逐条出现，配合可拖动的时间轴 scrubber。
- **铁律**：图表揭示**不得改变数值**；动画结束后图形必须与静态图完全一致；`prefers-reduced-motion` 下直接显示终态。

### 6. Opening — 二维图纸变成三维模型

- **要回答的问题**：辽宁是怎么从一张纸，变成一个可以进入的世界的？
- **令牌**：`MOTION_DURATION.opening`（`2.1s`），总时长控制在 `1.8–2.4s`（§62，不超过 3s）。
- **形态**：
  1. 暖白纸面；
  2. 辽宁轮廓线开始绘制；
  3. 城市边界逐步出现；
  4. 轮廓获得厚度（`scale.y` 从 `0.02 → 1`，描边 `setDrawRange` 展开）；
  5. 相机轻微调整；
  6. 「穹衡 / AgriScope」出现；
  7. 「查看辽宁」入口。
- **铁律**（§63）：
  - 只在**首次**进入时完整播放（[openingSession.ts](../src/features/opening/openingSession.ts) 记录 sessionStorage），之后直接进入。
  - 任意输入（`pointerdown` / `wheel` / `keydown` / `scroll` / `touchstart`）都**立即打断**并跳到终态。

---

## 通用约束

- `prefers-reduced-motion: reduce` 下，所有动画降级为**瞬时**（`motionDuration()` 返回 0），而不是换一段更短的动画。
- 所有时长只能取自 `src/design/motion.ts` 与 `--ag-dur-*`；新增令牌需谨慎，避免无限扩张（§48/§49）。
- 缓动统一使用 `MOTION_EASE.out` / `MOTION_EASE.standard`；弹簧使用 `MOTION_SPRING.direct`（小元件、快速）与 `MOTION_SPRING.soft`（大块、柔和）。

## 与参考的关系

这套语言的来源与取舍记录在 [INTERACTION_REFERENCE_AUDIT.md](./INTERACTION_REFERENCE_AUDIT.md)。核心借鉴 Gil Huybrecht 的 Motion Language：**对象连续性**（`layoutId`）、**Focus**（相机/层级聚焦）、**反向动画**（返回时播放逆向语义）、**克制的 overshoot**（只在小元件上轻微回弹，绝不夸张）。
