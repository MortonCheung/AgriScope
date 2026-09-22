import type { ReactNode } from 'react';
import './widgets.css';

/** 通用筛选器：作物 / 变量 / 选项 / 时间。统一 chip 语义，不堆叠下拉框。 */

export function SelectorGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="selector">
      <span className="selector__label">{label}</span>
      <div className="selector__options" role="group" aria-label={label}>{children}</div>
    </div>
  );
}

export function OptionChip({ active, onClick, children, disabled }: { active: boolean; onClick: () => void; children: ReactNode; disabled?: boolean }) {
  return (
    <button type="button" className="ag-chip" aria-pressed={active} data-active={active || undefined} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

export function CropSelector({ crops, value, onChange, label = '品种' }: { crops: string[]; value: string; onChange: (crop: string) => void; label?: string }) {
  return (
    <SelectorGroup label={label}>
      {crops.map((crop) => (
        <OptionChip key={crop} active={crop === value} onClick={() => onChange(crop)}>{crop}</OptionChip>
      ))}
    </SelectorGroup>
  );
}

export function VariableSelector<T extends string>({ options, value, onChange, label = '变量' }: { options: { id: T; label: string }[]; value: T; onChange: (value: T) => void; label?: string }) {
  return (
    <SelectorGroup label={label}>
      {options.map((option) => (
        <OptionChip key={option.id} active={option.id === value} onClick={() => onChange(option.id)}>{option.label}</OptionChip>
      ))}
    </SelectorGroup>
  );
}

export function OptionSelector<T extends string>({ options, value, onChange, label }: { options: { id: T; label: string; disabled?: boolean }[]; value: T; onChange: (value: T) => void; label: string }) {
  return (
    <SelectorGroup label={label}>
      {options.map((option) => (
        <OptionChip key={option.id} active={option.id === value} onClick={() => onChange(option.id)} disabled={option.disabled}>{option.label}</OptionChip>
      ))}
    </SelectorGroup>
  );
}

/**
 * 时间控制器：拖动即联动图表、事件标注与关键数字；可暂停/继续播放。
 * 边界使用真实日期标签，而不是装饰性刻度。
 */
export function TimeScrubber({ min, max, step = 1, value, onChange, label, playing, onTogglePlay }: {
  min: number;
  max: number;
  step?: number;
  value: number;
  onChange: (value: number) => void;
  label: (value: number) => string;
  playing?: boolean;
  onTogglePlay?: () => void;
}) {
  return (
    <div className="scrubber">
      {onTogglePlay && (
        <button type="button" className="scrubber__play" onClick={onTogglePlay} aria-pressed={playing}>
          {playing ? '暂停' : '播放'}
        </button>
      )}
      <span className="scrubber__bound ag-meta">{label(min)}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        aria-label="时间"
        aria-valuetext={label(value)}
        className="scrubber__input"
      />
      <span className="scrubber__bound ag-meta">{label(max)}</span>
      <output className="scrubber__value ag-number">{label(value)}</output>
    </div>
  );
}
