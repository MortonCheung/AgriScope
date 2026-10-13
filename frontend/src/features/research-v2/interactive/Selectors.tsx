import { SelectControl } from '../../../components/controls/SelectControl';
import { columnLabel, valueLabel } from '../../../domain/research/v2/metrics';
import { uniqueValuesInSourceOrder, type DataRow } from '../../../domain/research/v2/selectors';

/**
 * 维度选择器（本轮 §33/§45/§38）。
 *
 * 视觉沿用 v1 的编辑式语言：Label + 文字选项 + 细线 active，直角；
 * 选项多时使用共享可访问选择器；保持直角、细线与键盘操作。
 * 研究点数据模块与方向页 Explorer 共用同一套控件。
 */

/** 选项少 → 文字选项；选项多 → 共享选择器。 */
const INLINE_OPTION_LIMIT = 4;

function Selector({ column, options, value, onChange }: {
  column: string;
  options: string[];
  value: string | undefined;
  onChange: (value: string) => void;
}) {
  const label = columnLabel(column) ?? column;

  if (options.length > INLINE_OPTION_LIMIT) {
    return (
      <SelectControl className="module-selector" label={label} value={value ?? ''}
        options={options.map(option => ({ value: option, label: valueLabel(column, option) }))} onChange={onChange}/>

    );
  }

  return (
    <div className="module-selector" role="group" aria-label={label}>
      <span className="module-selector__label">{label}</span>
      <div className="module-selector__options">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            className="module-selector__option"
            aria-pressed={option === value}
            onClick={() => onChange(option)}
          >
            {valueLabel(column, option)}
          </button>
        ))}
      </div>
    </div>
  );
}

/** 一行选择器；`rows` 用来推导每个维度的可选取值（源顺序去重，§34）。 */
export function SelectorRow({ selectors, rows, selected, onChange }: {
  selectors: string[];
  rows: DataRow[];
  selected: Record<string, string>;
  onChange: (column: string, value: string) => void;
}) {
  if (selectors.length === 0) return null;
  return (
    <div className="module__selectors">
      {selectors.map((column) => (
        <Selector
          key={column}
          column={column}
          options={uniqueValuesInSourceOrder(rows, column)}
          value={selected[column]}
          onChange={(value) => onChange(column, value)}
        />
      ))}
    </div>
  );
}
