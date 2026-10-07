/** Synthetic contract data for tests only; production never imports this module. */
export const DAILY_TEST_NOW = new Date('2026-10-07T04:00:00Z');

export function dailyTestRaw(dataDate: string | null = '2026-10-07') {
  return {
    schema_version: '1.1.0', daily_pipeline_version: '1.1.0', data_version: 'daily-data-test',
    model_version: 'final_v1', generated_at: '2026-10-07 12:00:00', timezone: 'Asia/Shanghai',
    date: '2026-10-07', city: '沈阳', status: 'partial', latest_data_date: dataDate,
    data_freshness: 'FRESH', crawl_status: 'SUCCESS', recommendation: null, contract_valid: true,
    snapshot_hash: 'published-snapshot-hash',
    model: { model_status: 'FINAL', final_code_fingerprint: 'published-daily-fingerprint' },
    sources: [{ source_id: 'official-source', name: '官方价格来源', url: 'https://example.org/prices', price_level: 'wholesale', city: '沈阳' }],
    crops: [{
      crop: '西红柿', unit: '元/公斤', price_level: 'wholesale', data_date: dataDate,
      latest_price: 4.4, change_1d: -0.035088, change_7d: 0.043243, change_30d: 0.189189,
      historical_percentile: 0.5, hri: 52, market_risk: 42, daily_signal: 'WATCH', confidence: 70,
      warnings: ['缺少种植输入'], data_freshness: 'FRESH', source: 'official-source',
      model_status: 'FINAL', final_status: 'USER_INPUT_REQUIRED',
    }],
  };
}
