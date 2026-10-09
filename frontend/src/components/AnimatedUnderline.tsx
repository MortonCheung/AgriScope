import './animated-underline.css';

/**
 * 全站统一的“当前状态线”（V3 §8/§9，§37 修复）。
 *
 * 不再使用 `layoutId` / 共享布局：共享布局在“旧元素卸载、新元素首帧尚未测量”时，
 * 会失去参考矩形而从默认位置（视口底部/左上角）补间飞入——这正是按钮下划线
 * “从屏幕底部飞到按钮”的根因（V3 §36）。React StrictMode 双挂载与路由切换
 * 会放大这一现象。
 *
 * 改为元素自持的过渡：位置完全由宿主决定（宿主需 position: relative），
 * 动画只做 `transform: scaleX(0 → 1)`，不依赖任何跨元素、跨路由或视口测量。
 * 每个宿主常驻渲染本组件，用 `active` 切换状态即可获得“生长/收起”观感。
 */
export function AnimatedUnderline({ active = true, tone = 'ink' }: {
  active?: boolean;
  tone?: 'ink' | 'soft';
}) {
  const className = ['ag-underline', `ag-underline--${tone}`].join(' ');
  return <span aria-hidden className={className} data-active={active || undefined} />;
}
