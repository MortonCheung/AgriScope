import { getCity, STUDY_CITY_IDS } from '../../domain/geography/cities';

/** One semantic city entry survives rendering failure and appears on keyboard focus. */
export function CityMapNavigation({ onSelectCity, onHoverCity, selectedCityId, fallback }: {
  onSelectCity: (city: string) => void;
  onHoverCity: (city: string | null) => void;
  selectedCityId: string | null;
  fallback: boolean;
}) {
  return <nav className="liaoning-map-navigation ag-sr-only" aria-label="地图城市选择" data-fallback={fallback || undefined}>
    {STUDY_CITY_IDS.map(city => <button key={city} type="button" className="ag-button" aria-pressed={selectedCityId === city}
      onFocus={() => onHoverCity(city)} onBlur={() => onHoverCity(null)} onClick={() => onSelectCity(city)}>{getCity(city)?.shortName}</button>)}
  </nav>;
}
