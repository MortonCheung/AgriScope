import { useEffect, useState } from 'react';
import { ResearchRepository } from '../../../services/ResearchRepository';
import type { AsyncState } from '../../../services/useCityResearch';
import type { ResearchTable } from '../../../domain/research/types';

/** 按需读取一张研究表；同一路径全应用共享缓存。 */
export function useTable(src: string | null): AsyncState<ResearchTable> {
  const [state, setState] = useState<AsyncState<ResearchTable>>({ status: 'loading' });
  useEffect(() => {
    if (!src) { setState({ status: 'error', error: '缺少数据来源' }); return; }
    let alive = true;
    setState({ status: 'loading' });
    ResearchRepository.getResearchTable(src)
      .then((data) => { if (alive) setState({ status: 'ready', data }); })
      .catch((error: unknown) => { if (alive) setState({ status: 'error', error: error instanceof Error ? error.message : '加载失败' }); });
    return () => { alive = false; };
  }, [src]);
  return state;
}

/** 同时读取多张表。 */
export function useTables(sources: (string | null)[]): AsyncState<ResearchTable[]> {
  const key = sources.filter(Boolean).join('|');
  const [state, setState] = useState<AsyncState<ResearchTable[]>>({ status: 'loading' });
  useEffect(() => {
    const list = sources.filter((src): src is string => Boolean(src));
    if (list.length === 0) { setState({ status: 'error', error: '缺少数据来源' }); return; }
    let alive = true;
    setState({ status: 'loading' });
    Promise.all(list.map((src) => ResearchRepository.getResearchTable(src)))
      .then((data) => { if (alive) setState({ status: 'ready', data }); })
      .catch((error: unknown) => { if (alive) setState({ status: 'error', error: error instanceof Error ? error.message : '加载失败' }); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return state;
}
