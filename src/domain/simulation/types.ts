/**
 * 情景研究领域模型。
 *
 * 情景结果一律标记为"实验性"：当前平行世界模型未达到可靠反事实预测门槛，
 * 因此前端只把它呈现为情景实验，而不是预测。
 */

export type ScenarioTarget = 'price' | 'volume';

export type ScenarioWorldId = 'actual' | 'no-disaster' | 'severity-up' | 'buffer-up';

export interface ScenarioWorld {
  id: ScenarioWorldId;
  label: string;
  description: string;
  /** 该世界属于实际观测、模型估计还是情景模拟 */
  provenance: 'observed' | 'model' | 'scenario';
}

export interface ScenarioParameter {
  id: string;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  value: number;
  description: string;
}

export interface ScenarioResult {
  worldId: ScenarioWorldId;
  target: ScenarioTarget;
  crops: string[];
  /** 与基准世界的缺口，单位为主线图的 z 口径 */
  gapZ: number;
  gapPct: number;
  ciLowZ: number | null;
  ciHighZ: number | null;
  perCrop: { crop: string; gapZ: number; gapPct: number }[];
}

export interface CounterfactualGate {
  target: ScenarioTarget;
  n: number;
  r2SimVsActual: number;
  gateMinR2: number;
  gatePass: boolean;
}

export interface CounterfactualExperiment {
  id: string;
  cityId: string;
  title: string;
  status: 'experimental';
  /** 模型可信边界说明，必须在 UI 中可见 */
  trustNote: string;
  gate: CounterfactualGate[];
  analogReference: Record<string, string | number>;
  worlds: ScenarioWorld[];
  parameters: ScenarioParameter[];
  results: ScenarioResult[];
}
