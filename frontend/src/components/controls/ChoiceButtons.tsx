import './controls.css';

export interface Choice { value: string; label: string; disabled?: boolean }

/** Native buttons retain Enter/Space support; wrapping never changes tab order. */
export function ChoiceButtons({ label, options, value, onChange }: {
  label: string; options: readonly Choice[]; value: string | readonly string[]; onChange: (value: string) => void;
}) {
  return <fieldset className="choice-buttons"><legend>{label}</legend><div className="choice-buttons__items">
    {options.map(option => <button type="button" key={option.value} disabled={option.disabled}
      aria-pressed={typeof value === 'string' ? value === option.value : value.includes(option.value)}
      onClick={() => onChange(option.value)}>{option.label}</button>)}
  </div></fieldset>;
}
