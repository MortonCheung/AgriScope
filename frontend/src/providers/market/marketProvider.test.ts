// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HttpMarketProvider, validateMarketObservation } from './index';
import type { MarketObservation } from '../../domain/market/types';

const observation = (): MarketObservation => ({cityId:'chaoyang',cityName:'朝阳',unit:'元/kg',available:true,
  selectedCrop:'土豆',snapshotVersion:'published',crops:['土豆'],series:[{id:'real',crop:'土豆',productName:'土豆',
    marketName:'朝阳市监测点平均',priceLevel:'market_average',source:{name:'发改委',url:'https://example.gov.cn/'},notes:[],
    observations:[{date:'2026-01-01',pricePerKg:2},{date:'2026-01-06',pricePerKg:3}]}]});
afterEach(()=>vi.unstubAllGlobals());

describe('正式市场观测 provider',()=>{
  it('保留实际日期缺口、严格本城本品种和单位，不改写为预测',()=>{
    const data=observation();
    expect(validateMarketObservation(data,'chaoyang','土豆')).toBe(data);
    expect(()=>validateMarketObservation(data,'shenyang')).toThrow();
    expect(()=>validateMarketObservation(data,'chaoyang','黄瓜')).toThrow();
    expect(()=>validateMarketObservation({...data,unit:'元/斤'},'chaoyang')).toThrow();
    data.series[0].observations[1].date='2026-01-01';
    expect(()=>validateMarketObservation(data,'chaoyang')).toThrow();
  });
  it('拒绝不存在的观测日期，不能在图表中自动滚到次月',()=>{
    const data=observation();
    data.series[0].observations[1].date='2026-02-30';
    expect(()=>validateMarketObservation(data,'chaoyang')).toThrow();
  });
  it('请求携带城市作物与可取消信号，HTTP失败不借用历史或演示',async()=>{
    const fetcher=vi.fn().mockResolvedValue({ok:true,json:async()=>observation()});
    vi.stubGlobal('fetch',fetcher);
    await expect(new HttpMarketProvider().observations('chaoyang','土豆')).resolves.toMatchObject({cityId:'chaoyang'});
    const [url,options]=fetcher.mock.calls[0];
    expect(String(url)).toContain('city=chaoyang');
    expect(new URL(String(url)).searchParams.get('crop')).toBe('土豆');
    expect(options.cache).toBe('no-store');expect(options.signal).toBeInstanceOf(AbortSignal);
    fetcher.mockResolvedValue({ok:false});
    await expect(new HttpMarketProvider().observations('chaoyang')).rejects.toThrow('无法加载');
  });
});
