import type { DecisionRequest } from '../../domain/decision/types';
import { validateRequest } from '../../domain/decision/validation';
import { normalizeLegacyRequest, type LegacyFixture, type LegacyRequest } from './legacyAdapter';

export interface DecisionSample { id: string; label: string; request: DecisionRequest }
interface Manifest { samples: { id: string; label: string; request: LegacyRequest }[] }
let manifest: Manifest | null = null;
const fixtures = new Map<string, LegacyFixture>();
async function readJson(url: string, signal?: AbortSignal): Promise<unknown> {
  const response = await fetch(url,{signal});
  if (!response.ok) throw new Error('历史决策样例暂时无法加载。');
  return response.json();
}
export async function getDecisionSamples(signal?: AbortSignal): Promise<DecisionSample[]> {
  if (!manifest) {
    const data = await readJson('/decision/legacy-v2/manifest.json',signal) as Manifest;
    if (!data || !Array.isArray(data.samples) || !data.samples.length || !data.samples.every((s) => /^[a-z]+-\d+$/.test(s.id) && typeof s.label === 'string' && !validateRequest(normalizeLegacyRequest(s.request)).length)) throw new Error('历史决策样例清单不完整。');
    manifest = data;
  }
  signal?.throwIfAborted();
  return manifest.samples.map((sample) => ({id:sample.id,label:sample.label,request:normalizeLegacyRequest(sample.request)}));
}
export async function readLegacyFixture(id: string, signal?: AbortSignal): Promise<LegacyFixture> {
  const samples = await getDecisionSamples(signal);
  if (!samples.some((s) => s.id === id)) throw new Error('没有对应的历史决策样例。');
  const cached = fixtures.get(id);
  if (cached) return structuredClone(cached);
  const fixture = await readJson(`/decision/legacy-v2/${id}.json`,signal) as LegacyFixture;
  if (fixture?.id !== id || !fixture.output?.recommended_plan) throw new Error('历史决策样例不完整。');
  fixtures.set(id,fixture);
  return structuredClone(fixture);
}
export function sameConditions(a: DecisionRequest, b: DecisionRequest): boolean {
  if(a.contract_version!=='0'||b.contract_version!=='0')return false;
  const x=a.user_context,y=b.user_context;
  return x.city_id===y.city_id && x.area_mu===y.area_mu && x.budget_cny===y.budget_cny && x.risk_preference===y.risk_preference &&
    x.planting_window.start===y.planting_window.start && x.planting_window.end===y.planting_window.end &&
    x.harvest_window.start===y.harvest_window.start && x.harvest_window.end===y.harvest_window.end &&
    JSON.stringify([...x.crop_preferences].sort())===JSON.stringify([...y.crop_preferences].sort()) &&
    Object.keys(x.actual_inputs).length===0 && Object.keys(y.actual_inputs).length===0;
}
