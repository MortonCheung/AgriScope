import { columnMeta, formatMetricValue, valueLabel } from '../domain/research/v2/metrics';
import './metric-value.css';

export interface MetricValueViewProps {
  /** 指标 / 列 id；决定单位、精度与中文名。 */
  metricId: string;
  value: string | number | null | undefined;
  /** 分类列（品种、天气事件…）用受控中文取值。 */
  categorical?: boolean;
}

/**
 * 统一数值呈现（V5 §16）。
 *
 * 一处处理：单位、精度、百分号、布尔、缺失值。
 * 未登记的列**不显示原始 key**（§36），只显示「—」并在开发模式提示补登记。
 */
export function MetricValueView({ metricId, value, categorical = false }: MetricValueViewProps) {
  const meta = columnMeta(metricId);
  if (!meta) {
    if (import.meta.env.DEV) console.info(`未登记的列（需补 COLUMN_META）：${metricId}`);
    return <span className="ag-metric ag-metric--missing">—</span>;
  }
  const missing = value === null || value === undefined || value === '';
  const text = missing
    ? '—'
    : categorical
      ? valueLabel(metricId, String(value))
      : formatMetricValue(value, meta);

  return (
    <span className="ag-metric" data-kind={meta.kind} data-missing={missing || undefined}>
      {text}
    </span>
  );
}
