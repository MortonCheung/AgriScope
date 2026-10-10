import type { MarketObservation, MarketProvider } from '../../domain/market/types';

export function validateMarketObservation(value: unknown, cityId: string, crop?: string): MarketObservation {
  const data = value as MarketObservation;
  const fail = () => { throw new Error('本城市场观测格式不完整。'); };
  if (!data || data.cityId !== cityId || typeof data.cityName !== 'string' || data.unit !== '元/kg'
      || typeof data.available !== 'boolean' || !Array.isArray(data.crops) || !Array.isArray(data.series)
      || data.crops.some(x => typeof x !== 'string' || !x)) fail();
  if (!data.available) {
    if (data.series.length || data.crops.length || data.selectedCrop !== null) fail();
    return data;
  }
  if (!data.selectedCrop || !data.crops.includes(data.selectedCrop) || typeof data.snapshotVersion !== 'string' || !data.snapshotVersion
      || (crop && data.selectedCrop !== crop) || !data.series.length) fail();
  for (const series of data.series) {
    if (!series.id || series.crop !== data.selectedCrop || !series.marketName || !series.productName
        || !['wholesale', 'market_average'].includes(series.priceLevel) || !series.source?.name
        || !Array.isArray(series.notes) || series.notes.some(note => typeof note !== 'string')
        || !Array.isArray(series.observations) || !series.observations.length) fail();
    if (series.source.url && !/^https?:\/\//.test(series.source.url)) fail();
    let last = '';
    for (const point of series.observations) {
      const time = Date.parse(`${point.date}T00:00:00Z`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(point.date) || !Number.isFinite(time)
          || new Date(time).toISOString().slice(0, 10) !== point.date || point.date <= last
          || !Number.isFinite(point.pricePerKg) || point.pricePerKg <= 0) fail();
      last = point.date;
    }
  }
  return data;
}

export class HttpMarketProvider implements MarketProvider {
  constructor(private readonly endpoint = '/api/market/observations') {}
  async observations(cityId: string, crop?: string, options: { signal?: AbortSignal } = {}): Promise<MarketObservation> {
    const controller = new AbortController();
    const abort = () => controller.abort();
    options.signal?.addEventListener('abort', abort, { once: true });
    if (options.signal?.aborted) controller.abort();
    const timer = window.setTimeout(abort, 10_000);
    try {
      const url = new URL(this.endpoint, window.location.origin);
      if (!['https:', 'http:'].includes(url.protocol)) throw new Error('市场观测接口配置有误。');
      url.searchParams.set('city', cityId);
      if (crop) url.searchParams.set('crop', crop);
      const response = await fetch(url, { signal: controller.signal, cache: 'no-store', headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error('本城市场观测暂时无法加载。');
      return validateMarketObservation(await response.json(), cityId, crop);
    } catch (error) {
      if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      if (controller.signal.aborted) throw new Error('市场观测响应超时，请稍后重试。');
      throw error;
    } finally {
      window.clearTimeout(timer);
      options.signal?.removeEventListener('abort', abort);
    }
  }
}

const provider: MarketProvider = new HttpMarketProvider();
export function getMarketProvider(): MarketProvider { return provider; }
