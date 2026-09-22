import { useEffect, useState } from 'react';
import type { AsyncState } from './useCityResearch';

/**
 * 带同步缓存命中的资源 hook（V4 §四十四）。
 *
 * 与朴素 async hook 的差别只有一处：`peek()` 命中时**同步**进入 ready，
 * 不再先渲染一帧 loading 再替换 —— 这正是"切换研究点像刷新了一遍"的来源。
 *
 * `keepPrevious` 为真时，未命中缓存也不清空当前内容（保留旧正文），
 * 等新数据到达再交给调用方 crossfade；只对**同一语义位置**的内容使用，
 * 例如同一篇位置上的研究原文。研究表不使用：短暂显示另一张表的数字
 * 比短暂骨架更危险。
 */
export function useCachedResource<T>({
  key,
  peek,
  load,
  missingMessage,
  keepPrevious = false,
}: {
  key: string | null;
  peek: () => T | null;
  load: () => Promise<T>;
  missingMessage: string;
  keepPrevious?: boolean;
}): AsyncState<T> {
  const [state, setState] = useState<AsyncState<T>>(() => {
    if (!key) return { status: 'error', error: missingMessage };
    const cached = peek();
    return cached === null ? { status: 'loading' } : { status: 'ready', data: cached };
  });

  useEffect(() => {
    if (!key) { setState({ status: 'error', error: missingMessage }); return; }
    const cached = peek();
    if (cached !== null) { setState({ status: 'ready', data: cached }); return; }
    let alive = true;
    setState((previous) => (
      keepPrevious && previous.status === 'ready' ? previous : { status: 'loading' }
    ));
    load()
      .then((data) => { if (alive) setState({ status: 'ready', data }); })
      .catch((error: unknown) => {
        if (alive) setState({ status: 'error', error: error instanceof Error ? error.message : '加载失败' });
      });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, keepPrevious]);

  return state;
}
