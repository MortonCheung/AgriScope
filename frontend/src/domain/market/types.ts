export interface MarketSeries {
  id: string;
  crop: string;
  productName: string;
  marketName: string;
  priceLevel: 'wholesale' | 'market_average';
  source: { name: string; url: string | null };
  observations: { date: string; pricePerKg: number }[];
  notes: string[];
}
export interface MarketObservation {
  cityId: string;
  cityName: string;
  unit: '元/kg';
  available: boolean;
  selectedCrop: string | null;
  snapshotVersion: string | null;
  crops: string[];
  series: MarketSeries[];
}
export interface MarketProvider {
  observations(cityId: string, crop?: string, options?: { signal?: AbortSignal }): Promise<MarketObservation>;
}
