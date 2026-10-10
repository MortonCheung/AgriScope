import { describe, expect, it } from 'vitest';
import { DECISION_FEATURE_IDS, type DecisionCapability, type DecisionFeature } from '../../domain/decision/types';
import { parseCapability } from './index';
function feature(supported: boolean, result_type: DecisionFeature['result_type']): DecisionFeature {
  return { supported, result_type, data_sources: [], required_inputs: [], validated_model: false, limitations: [], horizons: [], crop_ids: [] };
}
function sixCityCapability(cityId: string): DecisionCapability {
  return { city_id: cityId, tier: 'INSUFFICIENT', supported: false, crops: [], market_as_of: null, model_version: 'v', data_version: 'd', code_fingerprint: 'f', limitation: null,
    features: Object.fromEntries(DECISION_FEATURE_IDS.map(key => [key, feature(key !== 'short_term_price' && key !== 'long_horizon_scenario', key === 'short_term_price' || key === 'long_horizon_scenario' ? 'NOT_SUPPORTED' : key === 'break_even' ? 'DETERMINISTIC_CALCULATION' : key === 'user_scenario' ? 'USER_ASSUMPTION_SCENARIO' : 'OBSERVATIONAL_ANALYSIS')])) as DecisionCapability['features'] };
}
describe('additive feature capability contract', () => {
  it.each(['shenyang','chaoyang','jinzhou','tieling','dandong','dalian'])('does not let legacy unsupported block user tools in %s', city => {
    const cap = parseCapability(sixCityCapability(city), city);
    expect(cap.supported).toBe(false); expect(cap.features?.break_even.supported).toBe(true);
    expect(cap.features?.user_scenario.result_type).toBe('USER_ASSUMPTION_SCENARIO');
  });
  it.each(['missing feature','nonfinite horizon','malformed sources','unsupported verified','wrong result type','observations marked validated','verified marked unvalidated','supported marked unavailable'])('rejects %s', problem => {
    const raw = sixCityCapability('dalian') as unknown as { features: Record<string, Record<string, unknown>> };
    if (problem === 'missing feature') delete raw.features.historical_climate;
    if (problem === 'nonfinite horizon') raw.features.short_term_price.horizons = [Infinity];
    if (problem === 'malformed sources') raw.features.production_structure.data_sources = [3];
    if (problem === 'unsupported verified') raw.features.long_horizon_scenario.validated_model = true;
    if (problem === 'wrong result type') raw.features.break_even.result_type = 'MODEL_PROFIT_GUARANTEE';
    if (problem === 'observations marked validated') raw.features.production_structure.validated_model = true;
    if (problem === 'verified marked unvalidated') { raw.features.short_term_price.result_type = 'VERIFIED_MODEL'; raw.features.short_term_price.supported = true; }
    if (problem === 'supported marked unavailable') raw.features.break_even.result_type = 'NOT_SUPPORTED';
    expect(() => parseCapability(raw, 'dalian')).toThrow('城市功能能力格式不完整');
  });
});
