import { useEffect, useState } from 'react';
import { buildLiaoningSolidModel, type GeoCollection, type LiaoningSolidModel } from './liaoningGeometry';

let modelPromise: Promise<LiaoningSolidModel> | null = null;

/** 省域几何只解析一次，全应用共享。 */
export function loadLiaoningModel(): Promise<LiaoningSolidModel> {
  modelPromise ??= fetch('/geo/liaoning.json')
    .then((response) => {
      if (!response.ok) throw new Error(`辽宁几何加载失败：${response.status}`);
      return response.json() as Promise<GeoCollection>;
    })
    .then((collection) => buildLiaoningSolidModel(collection));
  return modelPromise;
}

export type LiaoningModelState =
  | { status: 'loading' }
  | { status: 'ready'; model: LiaoningSolidModel }
  | { status: 'error'; error: string };

export function useLiaoningModel(): LiaoningModelState {
  const [state, setState] = useState<LiaoningModelState>({ status: 'loading' });
  useEffect(() => {
    let alive = true;
    loadLiaoningModel()
      .then((model) => { if (alive) setState({ status: 'ready', model }); })
      .catch((error: unknown) => { if (alive) setState({ status: 'error', error: error instanceof Error ? error.message : '加载失败' }); });
    return () => { alive = false; };
  }, []);
  return state;
}
