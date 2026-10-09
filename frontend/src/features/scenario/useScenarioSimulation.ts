import { useEffect, useState } from 'react';
import { getLongHorizonProvider } from '../../providers/longHorizon';
import type {
  LongHorizonCapability, LongHorizonCropCap, LongHorizonStatus, LongHorizonEntry,
} from '../../domain/longHorizon/types';

/**
 * 情景模拟的数据（Frontend V3 §16）。
 *
 * 「现实世界」用 `/api/daily/latest` 的已发布观测；
 * 「模拟世界」用 `/api/forecast/long-horizon` 的**情景化**估计（生产状态 SCENARIO_ONLY…）。
 * 只调正式模型真正支持的变量（作物 × 评估跨度）；取不到就如实标 missing / error。
 */

export type LayerState<T> =
  | { status: 'loading' }
  | { status: 'ready'; data: T }
  | { status: 'missing'; note: string }
  | { status: 'error'; note: string };

export interface ScenarioPoint {
  horizon: number;
  productionStatus: LongHorizonStatus;
  point: number | null;
  low: number | null;
  high: number | null;
  rangeType: LongHorizonEntry['rangeType'];
  method: string | null;
  confidence: string | null;
  unit: string;
}

export interface ScenarioSeries {
  crop: string;
  points: ScenarioPoint[];
  /** 观测基准日（长期快照的 anchor_observation_date，取不到为 null——不臆造）。 */
  anchorDate: string | null;
  asOf: string | null;
  modelVersion: string;
  dataVersion: string;
}

export interface ScenarioSimulation {
  capability: LayerState<LongHorizonCapability>;
  crop: string | null;
  cropCap: LongHorizonCropCap | null;
  series: LayerState<ScenarioSeries>;
}

const MAX_HORIZONS = 6;

function pickCrop(capability: LongHorizonCapability, preferred?: string): LongHorizonCropCap | null {
  if (capability.crops.length === 0) return null;
  return capability.crops.find((item) => item.id === preferred) ?? capability.crops[0] ?? null;
}

export function useScenarioSimulation(cityId: string, preferredCrop?: string): ScenarioSimulation {
  const [capability, setCapability] = useState<LayerState<LongHorizonCapability>>({ status: 'loading' });
  const [series, setSeries] = useState<LayerState<ScenarioSeries>>({ status: 'loading' });

  useEffect(() => {
    let alive = true;
    const provider = getLongHorizonProvider();
    setCapability({ status: 'loading' });
    setSeries({ status: 'loading' });
    provider.capabilities(cityId).then(
      (value) => { if (alive) setCapability({ status: 'ready', data: value }); },
      (error: unknown) => {
        if (!alive) return;
        setCapability({ status: 'missing', note: error instanceof Error ? error.message : '长期情景能力暂时无法加载。' });
        setSeries({ status: 'missing', note: '该城市暂不支持长期情景模型。' });
      },
    );
    return () => { alive = false; };
  }, [cityId]);

  const cropCap = capability.status === 'ready' ? pickCrop(capability.data, preferredCrop) : null;
  const crop = cropCap?.id ?? null;
  const horizons = cropCap ? cropCap.horizons.map((item) => item.days).slice(0, MAX_HORIZONS) : [];
  const horizonKey = horizons.join(',');

  useEffect(() => {
    let alive = true;
    if (capability.status !== 'ready' || !cropCap || horizons.length === 0) {
      setSeries(capability.status === 'loading' ? { status: 'loading' } : { status: 'missing', note: '该作物暂无已登记的情景跨度。' });
      return;
    }
    const provider = getLongHorizonProvider();
    setSeries({ status: 'loading' });
    Promise.all(horizons.map((days) => provider.forecast({ cityId, crop: cropCap.id, horizonDays: days })))
      .then((entries) => {
        if (!alive) return;
        const points: ScenarioPoint[] = entries.map((entry) => ({
          horizon: entry.horizon,
          productionStatus: entry.productionStatus,
          point: entry.pointForecast,
          low: entry.rangeLow,
          high: entry.rangeHigh,
          rangeType: entry.rangeType,
          method: entry.method,
          confidence: entry.confidence,
          unit: entry.unit,
        }));
        const first = entries[0];
        setSeries({
          status: 'ready',
          data: {
            crop: cropCap.id,
            points,
            anchorDate: first?.anchorDate ?? null,
            asOf: first?.asOf ?? null,
            modelVersion: capability.data.modelVersion,
            dataVersion: capability.data.dataVersion,
          },
        });
      })
      .catch((error: unknown) => {
        if (alive) setSeries({ status: 'error', note: error instanceof Error ? error.message : '情景估计暂时无法加载。' });
      });
    return () => { alive = false; };
    // horizonKey 覆盖全部跨度；capability 变化时重新取。
  }, [cityId, capability, cropCap, horizonKey]);

  return { capability, crop, cropCap, series };
}