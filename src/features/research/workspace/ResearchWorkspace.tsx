import type { ReactNode } from 'react';
import './research-workspace.css';

/**
 * 研究工作台（V3 §21/§47）。
 *
 * 桌面三栏：Research Tree（230px）│ Research Workspace（minmax(0,1fr)）│ Evidence Rail（210–240px）。
 * 正文保持 66ch 的可读行宽，图表可以突破正文宽度铺满中栏（§22）。
 *
 * 两种宿主：
 *   - `fixed`：城市研究阅读器内部，整壳固定、各栏内部滚动（§31/§32）；
 *   - `page`：研究点页，页面自然纵向滚动，左右两栏 sticky（§87）。
 */
export function ResearchWorkspace({ tree, rail, variant = 'page', children }: {
  tree: ReactNode;
  rail?: ReactNode;
  variant?: 'fixed' | 'page';
  children: ReactNode;
}) {
  return (
    <div className="research-workspace" data-variant={variant} data-with-rail={rail ? true : undefined}>
      <aside className="research-workspace__tree" aria-label="研究目录">{tree}</aside>
      <div className="research-workspace__main">{children}</div>
      {rail ? <aside className="research-workspace__rail" aria-label="研究信息">{rail}</aside> : null}
    </div>
  );
}

/** 中栏里的正文块：限制在 66ch，图表放在它外面就能自然变宽（§22）。 */
export function ResearchProse({ children }: { children: ReactNode }) {
  return <div className="research-workspace__prose">{children}</div>;
}
