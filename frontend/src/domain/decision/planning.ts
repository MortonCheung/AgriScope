import { cropIdentity, sameCrop } from './cropIdentity';
/** 经营工具只核算用户条件；不从生产面积推导亩产或未来价格。 */
export interface PlanningDraft {
  areaMu: string; yieldKgPerMu: string; costPerMu: string;
  pricePerKg: string; salePercent: string;
}
export interface PlanningInputs {
  areaMu: number; yieldKgPerMu: number; costPerMu: number;
  pricePerKg: number; saleFraction: number;
}
export interface PlanningResult {
  productionKg: number; soldKg: number; revenueCny: number; costCny: number;
  profitCny: number; breakEvenPrice: number | null; breakEvenYield: number | null;
}
export type PlanningErrors = Partial<Record<keyof PlanningDraft | 'crop' | 'calculation', string>>;
export const emptyPlanningDraft = (): PlanningDraft => ({ areaMu: '', yieldKgPerMu: '', costPerMu: '', pricePerKg: '', salePercent: '' });
export const PLANNING_FIELDS = [
  { key: 'areaMu', label: '种植面积', unit: '亩' },
  { key: 'yieldKgPerMu', label: '预计亩产', unit: 'kg/亩' },
  { key: 'costPerMu', label: '每亩总成本', unit: '元/亩' },
  { key: 'pricePerKg', label: '假设销售价格', unit: '元/kg' },
  { key: 'salePercent', label: '可销售比例', unit: '%' },
] as const;

export function validatePlanningDraft(draft: PlanningDraft, crop: string): { inputs: PlanningInputs | null; errors: PlanningErrors } {
  const errors: PlanningErrors = {};
  const numbers: Partial<Record<keyof PlanningDraft, number>> = {};
  if (!crop.trim()) errors.crop = '请选择或填写作物。';
  for (const { key, label } of PLANNING_FIELDS) {
    const text = draft[key].trim();
    const n = Number(text);
    if (!text) errors[key] = `请填写${label}。`;
    else if (!Number.isFinite(n)) errors[key] = `${label}必须是有限数字。`;
    else if (n < 0) errors[key] = `${label}不能为负数。`;
    else if (key === 'areaMu' && n === 0) errors[key] = '种植面积必须大于 0。';
    else if (key === 'salePercent' && n > 100) errors[key] = '可销售比例应在 0–100% 之间。';
    else numbers[key] = n;
  }
  if (Object.keys(errors).length) return { inputs: null, errors };
  return { inputs: { areaMu: numbers.areaMu!, yieldKgPerMu: numbers.yieldKgPerMu!, costPerMu: numbers.costPerMu!, pricePerKg: numbers.pricePerKg!, saleFraction: numbers.salePercent! / 100 }, errors };
}

export function calculatePlanning(inputs: PlanningInputs): PlanningResult | null {
  const { areaMu, yieldKgPerMu, costPerMu, pricePerKg, saleFraction } = inputs;
  if (![areaMu, yieldKgPerMu, costPerMu, pricePerKg, saleFraction].every(n => Number.isFinite(n) && n >= 0) || areaMu === 0 || saleFraction > 1) return null;
  const productionKg = areaMu * yieldKgPerMu;
  const soldKg = productionKg * saleFraction;
  const revenueCny = soldKg * pricePerKg;
  const costCny = areaMu * costPerMu;
  const result = {
    productionKg, soldKg, revenueCny, costCny, profitCny: revenueCny - costCny,
    breakEvenPrice: yieldKgPerMu * saleFraction > 0 ? costPerMu / (yieldKgPerMu * saleFraction) : null,
    breakEvenYield: pricePerKg * saleFraction > 0 ? costPerMu / (pricePerKg * saleFraction) : null,
  };
  return Object.values(result).every(n => n === null || Number.isFinite(n)) ? result : null;
}

export const SENSITIVITY_CHANGES = [-20, -10, 0, 10, 20] as const;
export type SensitivityVariable = 'pricePerKg' | 'yieldKgPerMu' | 'costPerMu';
export interface SensitivityLine { variable: SensitivityVariable; label: string; points: { change: number; profitCny: number }[] }
export function planningSensitivity(inputs: PlanningInputs): SensitivityLine[] | null {
  const variables = [{ variable: 'pricePerKg', label: '价格变化' }, { variable: 'yieldKgPerMu', label: '亩产变化' }, { variable: 'costPerMu', label: '成本变化' }] as const;
  const lines: SensitivityLine[] = [];
  for (const { variable, label } of variables) {
    const points = [];
    for (const change of SENSITIVITY_CHANGES) {
      const result = calculatePlanning({ ...inputs, [variable]: inputs[variable] * (1 + change / 100) });
      if (!result) return null;
      points.push({ change, profitCny: result.profitCny });
    }
    lines.push({ variable, label, points });
  }
  return lines;
}

export interface PlanningSnapshot { crop: string; draft: PlanningDraft }
export const PLANNING_CLIMATE_METRICS = ['precipitation_mm', 'growing_season_precipitation_mm', 'mean_temp_c', 'growing_season_mean_temp_c'] as const;
export type PlanningClimateMetric = typeof PLANNING_CLIMATE_METRICS[number];
export interface PlanningSession {
  activeCrop: string; customCrop: string; drafts: Record<string, PlanningDraft>;
  budgetCny?: string; target?: 'conservative' | 'balanced' | 'aggressive'; saleDate?: string;
  /** The product may refresh an untouched market price; explicit user prices stay fixed. */
  priceOverrides?: string[];
  /** 只保存有效输入条件，恢复时重新核算，不保存可被篡改的结果数字。 */
  calculatedDrafts: Record<string, PlanningDraft>;
  baseline: PlanningSnapshot | null; climateMetric: PlanningClimateMetric;
  /** Whole alias records survive migration; never combine unrelated draft fields. */
  cropAliasBackup?: Record<string, { draft?: PlanningDraft; calculatedDraft?: PlanningDraft; priceOverride: boolean }>;
}
const blankSession = (): PlanningSession => ({ activeCrop: '', customCrop: '', drafts: {}, calculatedDrafts: {}, baseline: null, climateMetric: 'precipitation_mm', budgetCny: '', target: 'balanced', saleDate: '', priceOverrides: [] });
const isDraft = (raw: unknown): raw is PlanningDraft => Boolean(raw && typeof raw === 'object' && PLANNING_FIELDS.every(({ key }) => typeof (raw as PlanningDraft)[key] === 'string'));
const isSnapshot = (raw: unknown): raw is PlanningSnapshot => Boolean(raw && typeof raw === 'object' && typeof (raw as PlanningSnapshot).crop === 'string' && isDraft((raw as PlanningSnapshot).draft));
export function validPlanningSaleDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export const samePlanningDraft = (a: PlanningDraft, b: PlanningDraft) => PLANNING_FIELDS.every(({ key }) => a[key] === b[key]);
export function validPlanningCalculation(draft: PlanningDraft, crop: string): boolean {
  const { inputs } = validatePlanningDraft(draft, crop);
  return Boolean(inputs && calculatePlanning(inputs) && planningSensitivity(inputs));
}
/** 有效核算后编辑会实时重算；无效编辑撤销当前作物快照，避免返回时展示旧结果。 */
export function updatePlanningDraft(session: PlanningSession, crop: string, draft: PlanningDraft, calculate: boolean): PlanningSession {
  const calculatedDrafts = { ...session.calculatedDrafts };
  if (calculate && validPlanningCalculation(draft, crop)) calculatedDrafts[crop] = { ...draft };
  else delete calculatedDrafts[crop];
  return { ...session, drafts: { ...session.drafts, [crop]: draft }, calculatedDrafts };
}
const sessionKey = (cityId: string) => `agriscope:v4:planning:${cityId}`;
export function migratePlanningCrops(session: PlanningSession, preferred?: string | null): PlanningSession {
  const active = session.activeCrop === '__custom__' ? session.activeCrop : cropIdentity(session.activeCrop);
  const customCrop = sameCrop(session.customCrop.trim(), '土豆') ? '土豆' : session.customCrop;
  const normalized = { ...session, activeCrop: active, customCrop,
    baseline: session.baseline ? { ...session.baseline, crop: cropIdentity(session.baseline.crop) } : null };
  // Once migrated, canonical edits win; the original aliases remain recovery records.
  if (session.cropAliasBackup) return normalized;
  const aliases = ['土豆', '马铃薯'];
  const backup = Object.fromEntries(aliases.filter(alias => session.drafts[alias]).map(alias => [alias, {
    draft: session.drafts[alias], calculatedDraft: session.calculatedDrafts[alias], priceOverride: session.priceOverrides?.includes(alias) ?? false,
  }]));
  const requested = preferred && aliases.includes(preferred) ? preferred : session.activeCrop === '__custom__' ? session.customCrop.trim() : session.activeCrop;
  const winner = aliases.includes(requested) && session.drafts[requested] ? requested : session.drafts['土豆'] ? '土豆' : '马铃薯';
  if (!session.drafts[winner]) return normalized;
  const calculatedDrafts = { ...session.calculatedDrafts };
  if (session.calculatedDrafts[winner]) calculatedDrafts['土豆'] = session.calculatedDrafts[winner]; else delete calculatedDrafts['土豆'];
  const overrides = (session.priceOverrides ?? []).filter(crop => !sameCrop(crop, '土豆'));
  if (session.priceOverrides?.includes(winner)) overrides.push('土豆');
  return { ...normalized, drafts: { ...session.drafts, 土豆: session.drafts[winner] }, calculatedDrafts,
    priceOverrides: overrides, cropAliasBackup: backup };
}
export function readPlanningSession(cityId: string, preferred?: string | null): PlanningSession {
  try {
    const raw: unknown = JSON.parse(sessionStorage.getItem(sessionKey(cityId)) ?? 'null');
    if (!raw || typeof raw !== 'object') return blankSession();
    const value = raw as PlanningSession;
    if (typeof value.activeCrop !== 'string' || typeof value.customCrop !== 'string' || !value.drafts || typeof value.drafts !== 'object' || Array.isArray(value.drafts)) return blankSession();
    const drafts = Object.fromEntries(Object.entries(value.drafts).filter(([key, draft]) => key !== '__proto__' && isDraft(draft)));
    const calculatedDrafts = value.calculatedDrafts && typeof value.calculatedDrafts === 'object' && !Array.isArray(value.calculatedDrafts)
      ? Object.fromEntries(Object.entries(value.calculatedDrafts).filter(([crop, draft]) => crop !== '__proto__' && isDraft(draft) && Object.prototype.hasOwnProperty.call(drafts, crop) && samePlanningDraft(draft, drafts[crop]) && validPlanningCalculation(draft, crop))) : {};
    const saleDate = validPlanningSaleDate(value.saleDate) ? value.saleDate : '';
    return migratePlanningCrops({ activeCrop: value.activeCrop, customCrop: value.customCrop, drafts, calculatedDrafts,
      budgetCny: typeof value.budgetCny === 'string' ? value.budgetCny : '',
      target: ['conservative', 'balanced', 'aggressive'].includes(value.target ?? '') ? value.target : 'balanced', saleDate,
      priceOverrides: Array.isArray(value.priceOverrides) ? value.priceOverrides.filter((crop): crop is string => typeof crop === 'string' && crop !== '__proto__') : Object.keys(drafts),
      baseline: isSnapshot(value.baseline) && validPlanningCalculation(value.baseline.draft, value.baseline.crop) ? value.baseline : null,
      cropAliasBackup: value.cropAliasBackup && typeof value.cropAliasBackup === 'object' ? value.cropAliasBackup : undefined,
      climateMetric: PLANNING_CLIMATE_METRICS.includes(value.climateMetric) ? value.climateMetric : 'precipitation_mm' }, preferred);
  } catch { return blankSession(); }
}
export function writePlanningSession(cityId: string, value: PlanningSession): void {
  try { sessionStorage.setItem(sessionKey(cityId), JSON.stringify(value)); } catch { /* 禁用存储时仍可完成核算。 */ }
}
