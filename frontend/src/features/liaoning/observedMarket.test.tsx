// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UNAVAILABLE_DISPLAY_MARKET, INITIAL_DISPLAY_MARKET, validateDisplayMarket, displayMarketFor } from '../../domain/market/displayMarket';
import { MarketOverview } from './MarketOverview';
import { createDisplayMarketStore } from './useDisplayMarket';
vi.mock('motion/react', () => ({ useReducedMotion: () => true }));
afterEach(cleanup);
const available = () => {
  const data = structuredClone(UNAVAILABLE_DISPLAY_MARKET);
  const observation = INITIAL_DISPLAY_MARKET.records.find(row => row.region === 'shenyang' && row.product === '黄瓜' && row.price_level === 'wholesale')!;
  data.records = [observation];
  data.missing = data.missing!.filter(row => !(row.region === observation.region && row.product === observation.product && row.price_level === observation.price_level));
  data.coverage!.shenyang.available_records = 1; data.coverage!.shenyang.latest_observation_date = observation.observation_date;
  return validateDisplayMarket(data);
};
describe('正式行情不冒充本地观测', () => {
  it('只有沈阳批发的真实样本不进入铁岭、超市或省级均价', () => {
    const data = available();
    expect(displayMarketFor(data, 'shenyang', 'wholesale').rows).toHaveLength(1);
    for (const [city, level] of [['tieling', 'wholesale'], ['shenyang', 'supermarket'], [null, 'wholesale']] as const) {
      const view = displayMarketFor(data, city, level); expect(view.rows).toHaveLength(0); expect(view.missing).toHaveLength(8);
    }
  });
  it('缺观测卡保留固定控制区和商品身份，不渲染价格、0值或趋势', () => {
    const { container } = render(<MarketOverview market={displayMarketFor(UNAVAILABLE_DISPLAY_MARKET, 'tieling', 'wholesale')} product="" onProductChange={() => {}} onPriceLevelChange={() => {}}/>);
    expect(screen.getAllByText('尚无本地观测')).toHaveLength(8);
    expect(container.querySelectorAll('.market-overview__price')).toHaveLength(8);
    expect(container.querySelector('.market-overview__value')).toBeNull();
    expect(container.querySelector('.market-overview__data svg')).toBeNull();
    expect(container.querySelector('.market-overview__toolbar')?.contains(screen.getByRole('combobox', { name: '商品' }))).toBe(true);
  });
  it('缺格、重复格、错误coverage均不能替换最后已验证发布', async () => {
    const good = available();
    const bad = structuredClone(good); bad.missing!.pop();
    expect(() => validateDisplayMarket(bad)).toThrow();
    const duplicate = structuredClone(good); duplicate.missing!.push(duplicate.missing![0]);
    expect(() => validateDisplayMarket(duplicate)).toThrow();
    const wrong = structuredClone(good); wrong.coverage!.tieling.collection_status = 'scheduled';
    expect(() => validateDisplayMarket(wrong)).toThrow();
    const store = createDisplayMarketStore(async () => bad, good); await store.refresh(); expect(store.getSnapshot()).toBe(good);
  });
  it('重复相同发布不通知订阅者，也不重初始化滚动节点', async () => {
    let time = 100000; vi.spyOn(Date, 'now').mockImplementation(() => time);
    const good = available(), notify = vi.fn(); const store = createDisplayMarketStore(async () => structuredClone(good), good);
    store.subscribe(notify); await store.refresh(); time += 60000; await store.refresh(); expect(notify).not.toHaveBeenCalled(); expect(store.getSnapshot()).toBe(good); vi.restoreAllMocks();
  });
});
