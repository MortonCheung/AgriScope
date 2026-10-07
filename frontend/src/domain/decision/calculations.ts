import type { DecisionCandidate, ScenarioRange, StressScenario } from './types';

export const unknownRange = (unit: ScenarioRange['unit'], isMock = false): ScenarioRange => ({
  low: null, base: null, high: null, unit, semantics: 'formula_scenario', is_calibrated_interval: false, is_mock: isMock,
});
/** Operating arithmetic only. No price/risk/confidence model in the UI. */
export function operatingProfit(price: number | null, area: number, yieldPerMu: number | null, costPerMu: number | null): number | null {
  if (price === null || yieldPerMu === null || costPerMu === null) return null;
  const profit = area * (price * yieldPerMu - costPerMu);
  return Number.isFinite(profit) ? profit : null;
}
export function formulaStress(candidate: DecisionCandidate, changes: StressScenario['changes'], label: string, id = 'custom'): StressScenario {
  const { cost_per_mu: cost, yield_kg_per_mu: yieldPerMu } = candidate.inputs;
  const priceFactor = 1 + changes.price_pct / 100;
  const yieldFactor = 1 + changes.yield_pct / 100;
  const costFactor = 1 + changes.cost_pct / 100;
  const unavailable = changes.delay_days !== 0;
  const profit = unknownRange('CNY', true);
  if (!unavailable && cost !== null && yieldPerMu !== null) {
    profit.low = operatingProfit(candidate.price.low === null ? null : candidate.price.low * priceFactor, candidate.area_mu, yieldPerMu * yieldFactor, cost * costFactor);
    profit.base = operatingProfit(candidate.price.base === null ? null : candidate.price.base * priceFactor, candidate.area_mu, yieldPerMu * yieldFactor, cost * costFactor);
    profit.high = operatingProfit(candidate.price.high === null ? null : candidate.price.high * priceFactor, candidate.area_mu, yieldPerMu * yieldFactor, cost * costFactor);
  }
  const totalCost = cost === null ? null : cost * costFactor * candidate.area_mu;
  return {
    id, label, changes, profit,
    roi: profit.base === null || totalCost === null || totalCost <= 0 ? null : profit.base / totalCost,
    delta_cny: profit.base === null || candidate.profit.base === null ? null : profit.base - candidate.profit.base,
    is_mock: true,
    note: unavailable ? '没有延迟后的价格样例，暂不估算收益变化。' : '公式情景：收入减成本；未重新运行价格、风险或推荐模型。',
  };
}

export function stressPresets(candidate: DecisionCandidate) {
  const neutral=formulaStress(candidate,{price_pct:0,yield_pct:0,cost_pct:0,delay_days:0},'正常','normal');
  neutral.profit=candidate.profit;neutral.roi=candidate.roi.base;neutral.delta_cny=candidate.profit.base===null?null:0;
  neutral.is_mock=candidate.profit.is_mock;neutral.note='原方案基准。';
  const presets=[neutral];
  for(const [id,label,changes] of [
    ['price_-20%','市场转弱',{price_pct:-20,yield_pct:0,cost_pct:0,delay_days:0}],
    ['yield_-20%','生产受损',{price_pct:0,yield_pct:-20,cost_pct:0,delay_days:0}],
    ['combined','综合压力',{price_pct:-20,yield_pct:-20,cost_pct:20,delay_days:0}],
  ] as const){
    const source=candidate.stress_scenarios.find((s)=>Object.entries(changes).every(([key,value])=>s.changes[key as keyof typeof changes]===value));
    presets.push(source?{...source,id,label}:formulaStress(candidate,changes,label,id));
  }
  return presets;
}
