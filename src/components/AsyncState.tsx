import type { ReactNode } from 'react';
import type { AsyncState } from '../services/useCityResearch';

export function LoadingState({ label = '正在读取研究内容' }: { label?: string }) {
  return <div className="ag-state" role="status">{label}…</div>;
}

export function ErrorState({ error, onRetry }: { error: string; onRetry?: () => void }) {
  return (
    <div className="ag-state ag-state--error" role="alert">
      <p>{error}</p>
      {onRetry && <button type="button" className="ag-button" onClick={onRetry}>重试</button>}
    </div>
  );
}

export function AsyncBoundary<T>({ state, children, label }: { state: AsyncState<T>; children: (data: T) => ReactNode; label?: string }) {
  if (state.status === 'loading') return <LoadingState label={label} />;
  if (state.status === 'error') return <ErrorState error={state.error} />;
  return <>{children(state.data)}</>;
}
