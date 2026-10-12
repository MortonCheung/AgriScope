import { getCity, STUDY_CITY_IDS } from '../../domain/geography/cities';
/** The map's accessible city selection survives WebGL or asset failure. */
export function CityMapFallback({ onSelectCity, selectedCityId }: { onSelectCity: (city: string) => void; selectedCityId: string | null }) {
  return <nav className="liaoning-map-fallback" aria-label="地图城市选择">{STUDY_CITY_IDS.map(city => <button key={city} type="button" className="ag-button" aria-pressed={selectedCityId === city} onClick={() => onSelectCity(city)}>{getCity(city)?.shortName}</button>)}</nav>;
}
