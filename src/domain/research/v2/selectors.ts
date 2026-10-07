import type { ResearchDataBinding } from '../catalog/types';

/**
 * 行筛选与 selector 契约（本轮 §33/§34/§36）。
 *
 * 这一层**只做行筛选**，绝不重算研究数字：
 *   · `filterRows`        沿用它原有的语义（只选已有行，§17）；
 *   · selector 的默认值    取"静态 filter 后、数据源原始行顺序去重"的第一个（§34，确定性）；
 *   · `buildDisplayFilter` 把 `filter` 与当前 selector 值合并成真正的 display filter（§33）。
 *
 * 与 `scripts/verify-research-integrity.mjs` 里的同名逻辑保持一致：
 * 分类轴唯一性正是在这套规则下被机械校验的（§36）。
 */

export type DataRow = Record<string, string>;

/** 按静态 filter 取行；空的 filter 表示全取。 */
export function filterRows(rows: DataRow[], filter: Record<string, string[]>): DataRow[] {
  const entries = Object.entries(filter ?? {});
  if (entries.length === 0) return rows;
  return rows.filter((row) => entries.every(([column, allowed]) => allowed.includes(row[column] ?? '')));
}

/**
 * 原始行顺序去重（§34）：确定性，返回的第一个值即默认值。
 * 空值不参与（空字符串不是一个合法分类取值）。
 */
export function uniqueValuesInSourceOrder(rows: DataRow[], column: string): string[] {
  const seen = new Set<string>();
  const values: string[] = [];
  for (const row of rows) {
    const value = row[column] ?? '';
    if (value === '' || seen.has(value)) continue;
    seen.add(value);
    values.push(value);
  }
  return values;
}

/** 默认 selector：每列取"静态 filter 后、源顺序第一个"的取值。 */
export function defaultSelectorValues(rows: DataRow[], selectors: readonly string[]): Record<string, string> {
  const values: Record<string, string> = {};
  for (const column of selectors) {
    const first = uniqueValuesInSourceOrder(rows, column)[0];
    if (first !== undefined) values[column] = first;
  }
  return values;
}

/** display filter = binding.filter + 当前 selector 值（§33）。 */
export function buildDisplayFilter(
  binding: Pick<ResearchDataBinding, 'filter' | 'selectors'>,
  selected: Record<string, string>,
): Record<string, string[]> {
  const display: Record<string, string[]> = { ...(binding.filter ?? {}) };
  for (const column of binding.selectors ?? []) {
    const value = selected[column];
    if (value !== undefined) display[column] = [value];
  }
  return display;
}
