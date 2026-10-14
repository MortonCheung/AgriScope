import './controls.css';
import { SelectionGroup } from './SelectionGroup';

export interface Choice { value: string; label: string; disabled?: boolean }

/** Native buttons retain Enter/Space support; wrapping never changes tab order. */
export function ChoiceButtons({ label, options, value, onChange }: {
  label: string; options: readonly Choice[]; value: string | readonly string[]; onChange: (value: string) => void;
}) {
  const buttons = options.map(option => <button type="button" key={option.value} disabled={option.disabled}
      data-selection-value={typeof value === 'string' ? option.value : undefined}
      aria-pressed={typeof value === 'string' ? value === option.value : value.includes(option.value)}
      onClick={() => onChange(option.value)}>{option.label}</button>);
  return <fieldset className="choice-buttons"><legend>{label}</legend>
    {typeof value === 'string' ? <SelectionGroup className="choice-buttons__items" value={value}>{buttons}</SelectionGroup>
      : <div className="choice-buttons__items">{buttons}</div>}
  </fieldset>;
}
