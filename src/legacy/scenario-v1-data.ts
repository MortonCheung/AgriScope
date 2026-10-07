import type { ResearchTable } from '../../domain/research/types';
import { numeric } from '../../services/csv';

/**
 * 平行世界实验室的数据层：只做真实研究表的解析与"对齐到表中真实取值"的工具，
 * 不在前端插值、外推或生成任何反事实数字。
 */

export interface SeverityRow {
  crop: string;
  severityMult: number;
  volumeZ: number;
  priceZ: number;
  volumePct: number;
  pricePct: number;
}

export interface BufferRow {
  crop: string;
  bufferFrac: number;
  priceGapZRemaining: number;
  priceImpactAvoidedZ: number;
  avoidedFraction: number;
}

export interface GapRow {
  crop: string;
  method: string;
  window: string;
  target: 'price' | 'volume';
  nDays: number;
  meanGapZ: number;
  meanGapPct: number;
  ciLowZ: number | null;
  ciHighZ: number | null;
}

export interface GateRow {
  target: string;
  n: number;
  r2: number;
  gateMin: number;
  pass: boolean;
}

export function parseSeverity(table: ResearchTable): SeverityRow[] {
  return table.rows
    .filter((row) => Boolean(row.crop))
    .map((row) => ({
      crop: row.crop,
      severityMult: numeric(row.severity_mult) ?? 0,
      volumeZ: numeric(row.mean_gap_volume_z) ?? 0,
      priceZ: numeric(row.mean_gap_price_z) ?? 0,
      volumePct: numeric(row.mean_gap_volume_pct) ?? 0,
      pricePct: numeric(row.mean_gap_price_pct) ?? 0,
    }));
}

export function parseBuffer(table: ResearchTable): BufferRow[] {
  return table.rows
    .filter((row) => Boolean(row.crop))
    .map((row) => ({
      crop: row.crop,
      bufferFrac: numeric(row.buffer_frac) ?? 0,
      priceGapZRemaining: numeric(row.price_gap_z_remaining) ?? 0,
      priceImpactAvoidedZ: numeric(row.price_impact_avoided_z) ?? 0,
      avoidedFraction: numeric(row.avoided_fraction) ?? 0,
    }));
}

export function parseGapSummary(table: ResearchTable): GapRow[] {
  return table.rows
    .filter((row) => Boolean(row.crop))
    .map((row) => ({
      crop: row.crop,
      method: row.method,
      window: row.window,
      target: row.target === 'volume' ? 'volume' : 'price',
      nDays: numeric(row.n_days) ?? 0,
      meanGapZ: numeric(row.mean_gap_z) ?? 0,
      meanGapPct: numeric(row.mean_gap_pct) ?? 0,
      ciLowZ: numeric(row.ci_low_z),
      ciHighZ: numeric(row.ci_high_z),
    }));
}

export function parseGate(table: ResearchTable): GateRow[] {
  return table.rows.map((row) => ({
    target: row.target,
    n: numeric(row.n) ?? 0,
    r2: numeric(row.r2_sim_vs_actual) ?? 0,
    gateMin: numeric(row.gate_min_r2) ?? 0,
    pass: row.gate_pass === 'True',
  }));
}

/** 列出去重后的真实取值（升序），用于参数可选集合。 */
export function numericOptions(values: number[]): number[] {
  return [...new Set(values)].sort((a, b) => a - b);
}

/** 把任意取值对齐到表中真实出现的最近取值；不做插值。 */
export function clampToNearest(value: number, options: number[]): number {
  if (options.length === 0) return value;
  return options.reduce((best, option) => (Math.abs(option - value) < Math.abs(best - value) ? option : best), options[0]);
}

export function isClamped(value: number, clamped: number): boolean {
  return Math.abs(value - clamped) > 1e-9;
}
