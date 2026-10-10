export interface ClimateYear {
  year: number;
  precipitation_mm: number;
  mean_temp_c: number;
  growing_season_precipitation_mm: number;
  growing_season_mean_temp_c: number;
}
export interface CityObservation {
  contract_version: '1'; scope: 'city'; city_id: string; city_name: string;
  production: { available: boolean; period_start: number | null; period_end: number | null; latest_year: number | null; scope: string; unit: 'ha'; items: {crop: string; area_ha: number; share: number | null}[]; source_paths: string[]; limitations: string[] };
  climate: { available: boolean; period_start: number | null; period_end: number | null; complete_year: number | null; series: ClimateYear[]; source_paths: string[]; limitations: string[] };
}
export interface ProvinceObservation {
  contract_version: '1'; scope: 'six_city_research_area'; cities: CityObservation[];
  summary: { city_count: number; climate_year: number | null; precipitation_range_mm: {min: number; max: number} | null; mean_temp_range_c: {min: number; max: number} | null };
  limitations: string[];
}
