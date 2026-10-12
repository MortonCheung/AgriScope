import { getCity, STUDY_CITY_IDS } from '../../domain/geography/cities';
import { ChoiceButtons } from './ChoiceButtons';

const choices = STUDY_CITY_IDS.map(value => ({ value, label: getCity(value)!.shortName }));
export function CityChoices({ value, onChange }: { value: string | null; onChange: (cityId: string | null) => void }) {
  return <ChoiceButtons label="城市" options={choices} value={value ?? ''} onChange={id => onChange(id || null)}/>;
}
