// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { PlanningWorkbench } from './PlanningWorkbench';
import { useProductDecision } from './useProductDecision';
import type { ProductDecisionResponse } from '../../domain/decision/productApi';
vi.mock('./useProductDecision', () => ({useProductDecision:vi.fn()}));
import { STUDY_CITY_IDS } from '../../domain/geography/cities';
import { resetAppContext, useAppContext } from '../../app/context/appContext';
import { useMarketObservation } from './useMarketObservation';
import { productCropOptions } from '../../domain/decision/productDecision';
vi.mock('./useMarketObservation', () => ({ useMarketObservation: vi.fn() }));
beforeEach(() => {
  sessionStorage.clear(); resetAppContext(); vi.mocked(useProductDecision).mockReturnValue(null);
  vi.mocked(useMarketObservation).mockReturnValue({ status: 'error', error: 'connection', retry: vi.fn() });
});
afterEach(cleanup);
const view = (cityId: string) => <MemoryRouter><PlanningWorkbench cityId={cityId}/></MemoryRouter>;
function choose(crop: string) { fireEvent.click(within(screen.getByRole('group', { name: '作物' })).getByRole('button', { name: crop })); }
function change(label: RegExp | string, input: string) { fireEvent.change(screen.getByLabelText(label), { target: { value: input } }); }
function fill(price = '4') {
  choose('玉米'); change(/^种植面积/, '10'); change(/^预计亩产/, '500'); change(/^每亩总成本/, '1000'); change(/^假设销售价格/, price); change(/^可销售比例/, '80');
}
const results = () => within(screen.getByRole('region', { name: '农业决策结果' }));
const profit = () => results().getByText('预计收益').nextElementSibling?.textContent;
describe('six-city live decision workbench', () => {
  it.each(STUDY_CITY_IDS)('shows inputs and updates results without submit in %s', city => {
    const { container } = render(view(city));
    expect((screen.getByLabelText(/^种植面积/) as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText(/^预计亩产/) as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText(/^每亩总成本/) as HTMLInputElement).value).toBe('');
    expect(results().queryByText('预计收益')).toBeNull();
    fill(); expect(profit()).toBe('6,000 元');
    change(/^假设销售价格/, '5'); expect(profit()).toBe('10,000 元');
    expect(screen.getByRole('img', { name: /利润敏感性/ })).toBeTruthy();
    expect(container.querySelector('details, [type="submit"], select')).toBeNull();
    expect(container.textContent).not.toMatch(/模拟数据|情景估算|暂未接入|模型冻结|方法与数据/);
  });
  it('invalidates stale results for invalid edits and never renders NaN/Infinity', () => {
    render(view('jinzhou')); fill();
    change(/^种植面积/, '0'); expect(screen.getByRole('alert').textContent).toContain('必须大于 0'); expect(results().queryByText('预计收益')).toBeNull();
    change(/^种植面积/, '10'); change(/^每亩总成本/, '-10'); change(/^可销售比例/, '101');
    expect(screen.getAllByRole('alert').map(alert => alert.textContent).join(' ')).toMatch(/不能为负数.*0–100%/);
    change(/^每亩总成本/, '1000'); change(/^可销售比例/, '0'); expect(profit()).toBe('-10,000 元');
    expect(results().getAllByText('—')).toHaveLength(2); expect(screen.queryByText(/Infinity|NaN/)).toBeNull();
    change(/^种植面积/, '1e308'); expect(screen.getByRole('alert').textContent).toContain('数值过大'); expect(results().queryByText('预计收益')).toBeNull();
  });
  it('reacts to budget, goal and the selected sale date without claiming an optimal window', () => {
    render(view('dandong')); fill();
    change(/^可用预算/, '9000'); expect(results().getByText('调整种植规模')).toBeTruthy(); expect(results().getByText('预算缺口 1,000 元')).toBeTruthy();
    change(/^可用预算/, '20000'); expect(results().queryByText(/预算缺口/)).toBeNull();
    change('销售时间', '2026-11-10'); expect(results().getByText('2026-11-10')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '收益优先' })); expect(results().getByText('保障产量与销售')).toBeTruthy();
    change(/^可用预算/, '-1'); expect(screen.getByRole('alert').textContent).toContain('可用预算'); expect(results().queryByText('预计收益')).toBeNull();
  });
  it('retains every crop across market errors and loading, including after custom errors', () => {
    const rendered = render(view('tieling'));
    const choices = () => within(screen.getByRole('group', { name: '作物' })).getAllByRole('button').map(button => button.textContent);
    expect(choices()).toEqual([...productCropOptions(), '自定义作物']);
    choose('自定义作物'); change('作物名称', 'bad!'); expect(screen.getByRole('alert').textContent).toContain('作物名');
    choose('大豆'); expect(choices()).toEqual([...productCropOptions(), '自定义作物']);
    vi.mocked(useMarketObservation).mockReturnValue({ status: 'loading', retry: vi.fn() }); rendered.rerender(view('tieling')); expect(choices()).toEqual([...productCropOptions(), '自定义作物']);
  });
  it('keeps city and crop drafts independent and restores custom input after switching cities', () => {
    const rendered = render(view('dalian')); fill();
    choose('大豆'); expect((screen.getByLabelText(/^种植面积/) as HTMLInputElement).value).toBe(''); change(/^种植面积/, '20');
    choose('玉米'); expect(profit()).toBe('6,000 元');
    rendered.rerender(view('tieling')); choose('自定义作物'); change('作物名称', '草莓'); change(/^种植面积/, '8');
    rendered.rerender(view('dalian')); expect(profit()).toBe('6,000 元');
    rendered.rerender(view('tieling')); expect((screen.getByLabelText('作物名称') as HTMLInputElement).value).toBe('草莓'); expect((screen.getByLabelText(/^种植面积/) as HTMLInputElement).value).toBe('8');
  });
  it('persists all input conditions and recalculates after a route unmount', () => {
    const rendered = render(view('chaoyang')); fill(); change(/^可用预算/, '18000'); change('销售时间', '2026-11-11'); fireEvent.click(screen.getByRole('button', { name: '控制风险' }));
    rendered.unmount(); render(view('chaoyang'));
    expect(profit()).toBe('6,000 元'); expect((screen.getByLabelText(/^可用预算/) as HTMLInputElement).value).toBe('18000'); expect((screen.getByLabelText('销售时间') as HTMLInputElement).value).toBe('2026-11-11');
    expect(screen.getByRole('button', { name: '控制风险', pressed: true })).toBeTruthy(); expect(useAppContext.getState()).toMatchObject({ cityId: 'chaoyang', crop: '玉米' });
  });
  it('preserves an explicit user price when a local market response refreshes', () => {
    const rendered = render(view('jinzhou')); fill('6'); expect(profit()).toBe('14,000 元');
    vi.mocked(useMarketObservation).mockReturnValue({ status: 'ready', available: true, retry: vi.fn(), data: { cityId: 'jinzhou', cityName: '锦州', available: true, selectedCrop: '玉米', crops: ['玉米'], snapshotVersion: 's', unit: '元/kg', series: [{ id: 'corn', crop: '玉米', productName: '玉米', marketName: '本城市场', priceLevel: 'market_average', source: { name: '记录', url: null }, observations: [{ date: '2026-10-10', pricePerKg: 2.7 }], notes: [] }] } });
    rendered.rerender(view('jinzhou')); expect((screen.getByLabelText(/^假设销售价格/) as HTMLInputElement).value).toBe('6'); expect(profit()).toBe('14,000 元');
  });
  it('updates untouched market prices, then honors explicit clearing without stale output', () => {
    const rendered = render(view('jinzhou')); fill();
    // A new crop has no explicit price yet.
    choose('大豆'); change(/^种植面积/, '1'); change(/^预计亩产/, '100'); change(/^每亩总成本/, '50');
    vi.mocked(useMarketObservation).mockReturnValue({ status: 'ready', available: true, retry: vi.fn(), data: { cityId: 'jinzhou', cityName: '锦州', available: true, selectedCrop: '大豆', crops: ['大豆'], snapshotVersion: 's', unit: '元/kg', series: [{ id: 'soy', crop: '大豆', productName: '大豆', marketName: '本城市场', priceLevel: 'market_average', source: { name: '记录', url: null }, observations: [{ date: '2026-10-10', pricePerKg: 5 }], notes: [] }] } });
    rendered.rerender(view('jinzhou')); expect((screen.getByLabelText(/^假设销售价格/) as HTMLInputElement).value).toBe('5'); expect(profit()).toBe('450 元');
    change(/^假设销售价格/, ''); expect(results().queryByText('预计收益')).toBeNull(); rendered.rerender(view('jinzhou')); expect((screen.getByLabelText(/^假设销售价格/) as HTMLInputElement).value).toBe('');
  });
  it('clears invalid custom crop context, preserves other URL conditions, and restores option choices', () => {
    function Probe() { const location = useLocation(); return <output aria-label="路由">{location.search}</output>; }
    render(<MemoryRouter initialEntries={['/cities/tieling/decision?city=tieling&horizon=7&as_of=2026-09-14']}><Probe/><PlanningWorkbench cityId="tieling"/></MemoryRouter>);
    choose('自定义作物'); change('作物名称', '草莓'); expect(useAppContext.getState().crop).toBe('草莓');
    change('作物名称', 'bad!'); expect(useAppContext.getState().crop).toBeNull(); expect(new URLSearchParams(screen.getByLabelText('路由').textContent!).has('crop')).toBe(false);
    choose('玉米'); expect(useAppContext.getState()).toMatchObject({ cityId: 'tieling', crop: '玉米', horizon: 7, asOf: '2026-09-14' });
    expect(new URLSearchParams(screen.getByLabelText('路由').textContent!).get('crop')).toBe('玉米');
  });
});

describe('model/API recommendations preserve user conditions',()=>{
 it('uses the selected smaller plan and recomputes displayed amounts without rewriting fields',()=>{
  const view=render(<MemoryRouter><PlanningWorkbench cityId="tieling"/></MemoryRouter>);fill();
  expect(profit()).toBe('6,000 元');
  vi.mocked(useProductDecision).mockReturnValue({contract_version:'product-1',request:vi.mocked(useProductDecision).mock.calls.at(-1)![0]!,context_hash:'f'.repeat(64),candidates:[{id:'reserve',crop:'玉米',area_mu:8,price_per_kg:4,horizon_days:null,sales_window:null,revenue_cny:12800,cost_cny:8000,profit_cny:4800,break_even_price:2.5,risk:'低',reasons:['保留经营余量。']}],recommendation:{candidate_id:'reserve',reasons:['保留经营余量。']},origin:{source_city:null,target_city:'tieling',route:'formula',model_id:null,transfer_policy:null,llm_used:true,forecasts:[]}} as ProductDecisionResponse);
  view.rerender(<MemoryRouter><PlanningWorkbench cityId="tieling"/></MemoryRouter>);
  expect(profit()).toBe('4,800 元');
  expect(results().getByText('玉米 · 8 亩')).toBeTruthy();
  expect((screen.getByLabelText(/^种植面积/) as HTMLInputElement).value).toBe('10');
  expect((screen.getByLabelText(/^假设销售价格/) as HTMLInputElement).value).toBe('4');
 });
 it.each(['土豆','马铃薯'])('one potato choice remains on a %s deep link',alias=>{
  render(<MemoryRouter initialEntries={[`/cities/shenyang/decision?city=shenyang&crop=${alias}`]}><PlanningWorkbench cityId="shenyang"/></MemoryRouter>);
  const group=within(screen.getByRole('group',{name:'作物'}));
  expect(group.getAllByRole('button',{name:'土豆'})).toHaveLength(1);
  expect(group.queryByRole('button',{name:'马铃薯'})).toBeNull();
  expect(group.getByRole('button',{name:'土豆',pressed:true})).toBeTruthy();
 });
});
