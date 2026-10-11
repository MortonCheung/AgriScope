import { useId } from 'react';
import './controls.css';

/** The range indexes supported nodes: the browser cannot invent 8 or 31 days. */
export function DiscreteHorizonSlider({ label, nodes, value, onChange, disabled = false }: {
  label: string; nodes: readonly number[]; value: number | null; onChange: (days: number) => void; disabled?: boolean;
}) {
  const id = useId();
  const index = value === null ? -1 : nodes.indexOf(value);
  return <div className="discrete-horizon" data-horizon={index >= 0 ? value : 'unselected'}>
    <label htmlFor={id}>{label}<output>{index >= 0 ? `${value} 天` : '请按计划选择'}</output></label>
    <input id={id} type="range" min="0" max={Math.max(0, nodes.length - 1)} step="1" value={Math.max(0, index)}
      disabled={disabled || !nodes.length} aria-label={label} aria-valuetext={index >= 0 ? `${value} 天` : '尚未选择期限'}
      onChange={event => { const days = nodes[Number(event.target.value)]; if (days !== undefined) onChange(days); }}
      onKeyDown={event => { if (index < 0 && (['Home','End','ArrowLeft','ArrowRight','ArrowDown','ArrowUp'].includes(event.key))) { event.preventDefault(); const days=event.key==='End'?nodes.at(-1):nodes[0];if(days!==undefined)onChange(days); } }}
      onPointerUp={event => { if (index < 0) { const days = nodes[Number(event.currentTarget.value)]; if (days !== undefined) onChange(days); } }}/>
    <div className="discrete-horizon__ticks" aria-hidden="true">{nodes.map(days => <span key={days}>{days}</span>)}</div>
  </div>;
}
