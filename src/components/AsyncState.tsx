import type { ReactNode } from 'react';
import type { AsyncState } from '../services/useCityResearch';

/**
 * 加载态（V4 §三十九/§四十四）。
 *
 * 前端不再向用户输出「正在读取研究索引 / 研究原文 / 研究表」这类过程文案：
 * 正常切换不出现读取提示，加载只在局部以骨架条呈现（无文字）。
 * 这里仍保留 role=status，屏幕阅读器通过 aria-label 得知正在加载。
 */
export function LoadingState() {
  return (
    <div className="ag-state ag-state--loading" role="status" aria-label="加载中">
      <span className="ag-skeleton" aria-hidden="true" />
      <span className="ag-skeleton" aria-hidden="true" />
      <span className="ag-skeleton" aria-hidden="true" />
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: string; onRetry?: () => void }) {
  return (
    <div className="ag-state ag-state--error" role="alert">
      <p>{error}</p>
      {onRetry && <button type="button" className="ag-button" onClick={onRetry}>重试</button>}
    </div>
  );
}

export function AsyncBoundary<T>({ state, children }: { state: AsyncState<T>; children: (data: T) => ReactNode }) {
  if (state.status === 'loading') return <LoadingState />;
  if (state.status === 'error') return <ErrorState error={state.error} />;
  return <>{children(state.data)}</>;
}
