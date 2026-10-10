import { STUDY_CITY_IDS } from '../../domain/geography/cities';
import { useAppContext, writeContextToSearch } from './appContext';

export function selectedCityFromSearch(search: string): string | null {
  const city = new URLSearchParams(search).get('city');
  return city && (STUDY_CITY_IDS as readonly string[]).includes(city) ? city : null;
}
export function provinceUrl(cityId: string | null): string {
  return cityId ? `/liaoning?${new URLSearchParams({ city: cityId })}` : '/liaoning';
}
/** Explicit business navigation carries crop/date/horizon without polluting the map URL. */
export function cityContextUrl(path: string, cityId: string): string {
  const state = useAppContext.getState();
  return `${path}?${writeContextToSearch('', { cityId, crop: state.crop, horizon: state.horizon, asOf: state.asOf })}`;
}
