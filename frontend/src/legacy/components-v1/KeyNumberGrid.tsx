import type { ResearchKeyNumber } from '../domain/research/types';

/** 核心数据：研究点自带的 key_numbers，直接呈现，不做换算。 */
export function KeyNumberGrid({ numbers }: { numbers: ResearchKeyNumber[] }) {
  if (numbers.length === 0) return null;
  return (
    <dl className="ag-keynumbers">
      {numbers.map((entry) => (
        <div key={entry.label} className="ag-keynumbers__item">
          <dt>{entry.label}</dt>
          <dd className="ag-number">{entry.value}</dd>
        </div>
      ))}
    </dl>
  );
}
