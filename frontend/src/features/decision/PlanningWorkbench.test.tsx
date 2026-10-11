// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { PlanningWorkbench } from './PlanningWorkbench';
import { STUDY_CITY_IDS, getCity } from '../../domain/geography/cities';
import type { ProvinceObservation } from '../../domain/observations/types';
import { useObservations } from '../../domain/observations/useObservations';
import { resetAppContext, useAppContext } from '../../app/context/appContext';
import { useContextUrlSync } from '../../app/context/useContextUrl';
import { cityContextUrl } from '../../app/context/provinceSelection';
vi.mock('../../domain/observations/useObservations', () => ({ useObservations: vi.fn() }));
vi.mock('../evidence/EvidenceDrawer', () => ({ EvidenceDrawer: ({ open, context }: { open: boolean; context: { cityId: string; topic: string } }) => open ? <aside aria-label="证据抽屉">{context.cityId} · {context.topic}</aside> : null }));

const observations: ProvinceObservation = {
  contract_version: '1', scope: 'six_city_research_area', limitations: [],
  summary: { city_count: 6, climate_year: 2025, precipitation_range_mm: { min: 500, max: 1000 }, mean_temp_range_c: { min: 10, max: 12 } },
  cities: STUDY_CITY_IDS.map((city_id, index) => ({
    contract_version: '1', scope: 'city', city_id, city_name: getCity(city_id)!.shortName,
    production: { available: true, period_start: 2018, period_end: 2024, latest_year: 2024, scope: 'published_observation', unit: 'ha', items: [{ crop: '玉米', area_ha: 1000 + index, share: null }, { crop: '大豆', area_ha: 500 + index, share: .25 }], source_paths: [], limitations: ['各城生产统计口径不同。'] },
    climate: { available: true, period_start: 2010, period_end: 2025, complete_year: 2025, series: Array.from({ length: 16 }, (_, n) => ({ year: 2010 + n, precipitation_mm: 500 + n * 10 + index, mean_temp_c: 10 + n / 10, growing_season_precipitation_mm: 400 + n * 10, growing_season_mean_temp_c: 20 + n / 10 })), source_paths: [], limitations: ['再分析气候。'] },
  })),
};
beforeEach(() => {
  sessionStorage.clear();
  resetAppContext();
  vi.mocked(useObservations).mockReturnValue({ status: 'ready', data: observations });
});
afterEach(() => cleanup());
const view = (cityId: string) => <MemoryRouter><PlanningWorkbench cityId={cityId}/></MemoryRouter>;
function change(label: RegExp | string,value:string){if(label==='计划作物'||label==='历史气候指标'){const names:Record<string,string>={__custom__:'自定义作物',mean_temp_c:'全年平均气温',growing_season_mean_temp_c:'生长季平均气温'};fireEvent.click(within(screen.getByRole('group',{name:label})).getByRole('button',{name:names[value]??value}));}else fireEvent.change(screen.getByLabelText(label),{target:{value}});}
function openDetails(){document.querySelectorAll('details').forEach(d=>d.open=true);}
function fill(price = '4') {
  change('计划作物', '玉米');
  change(/^种植面积/, '10'); change(/^预计亩产/, '500'); change(/^每亩总成本/, '1000'); change(/^假设销售价格/, price); change(/^可销售比例/, '80');
  fireEvent.click(screen.getByRole('button', { name: '核算我的计划' }));openDetails();
}
const results = () => within(screen.getByRole('region', { name: '经营核算结果' }));
describe('six-city planning interactions', () => {
  it.each(STUDY_CITY_IDS)('calculates user conditions in %s without relying on a price model', city => {
    const index = STUDY_CITY_IDS.indexOf(city);
    render(view(city));
    expect((screen.getByLabelText(/^种植面积/) as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText(/^可销售比例/) as HTMLInputElement).value).toBe('');
    expect(results().queryByText('销售收入')).toBeNull();
    fill(String(4 + index));
    expect(results().getByText('利润').nextElementSibling?.textContent).toBe(`${(6000 + index * 4000).toLocaleString('zh-CN')} 元`);
    expect(screen.getByRole('img', { name: /利润敏感性/ })).toBeTruthy();
    expect(screen.getByRole('img', { name: '2010至2025年全年降水历史序列，单位mm' })).toBeTruthy();
    expect(screen.getByText('情景估算 · 用户假设')).toBeTruthy();
  });
  it('validates blank, negative, zero area and invalid sale proportion without stale results', () => {
    render(view('jinzhou'));
    fireEvent.click(screen.getByRole('button', { name: '核算我的计划' }));
    expect(screen.getAllByRole('alert')).toHaveLength(6);
    fill();
    change(/^种植面积/, '0');
    expect(screen.getByRole('alert').textContent).toContain('必须大于 0');
    expect(results().queryByText('利润')).toBeNull();
    change(/^种植面积/, '10'); change(/^每亩总成本/, '-10'); change(/^可销售比例/, '101');
    expect(screen.getAllByRole('alert').map(a => a.textContent).join(' ')).toMatch(/不能为负数.*0–100%/);
    change(/^每亩总成本/, '1000'); change(/^可销售比例/, '0');
    expect(results().getByText('-10,000 元')).toBeTruthy();
    expect(results().getAllByText('无法计算')).toHaveLength(2);
    expect(screen.queryByText(/Infinity|NaN/)).toBeNull();
  });
  it('rejects multiplication overflow instead of exposing Infinity', () => {
    render(view('dandong')); fill(); change(/^种植面积/, '1e308');
    expect(screen.getByRole('alert').textContent).toContain('数值过大');
    expect(results().queryByText('利润')).toBeNull();
  });
  it('keeps independent drafts by city and crop, including a custom crop', () => {
    const rendered = render(view('dalian')); fill();
    change('计划作物', '大豆');
    expect((screen.getByLabelText(/^种植面积/) as HTMLInputElement).value).toBe('');
    change(/^种植面积/, '20');
    change('计划作物', '玉米');
    expect((screen.getByLabelText(/^种植面积/) as HTMLInputElement).value).toBe('10');
    rendered.rerender(view('tieling'));
    expect(within(screen.getByRole('group',{name:'计划作物'})).queryByRole('button',{pressed:true})).toBeNull();
    change('计划作物', '__custom__'); change('作物名称', '草莓'); change(/^种植面积/, '8');
    rendered.rerender(view('dalian'));
    expect(within(screen.getByRole('group',{name:'计划作物'})).getByRole('button',{name:'玉米',pressed:true})).toBeTruthy();
    expect((screen.getByLabelText(/^种植面积/) as HTMLInputElement).value).toBe('10');
    rendered.rerender(view('tieling'));
    expect((screen.getByLabelText('作物名称') as HTMLInputElement).value).toBe('草莓');
    expect((screen.getByLabelText(/^种植面积/) as HTMLInputElement).value).toBe('8');
  });
  it('saves A, compares a changed current result, and restores A from the city session', () => {
    const rendered = render(view('chaoyang')); fill();
    fireEvent.click(screen.getByRole('button', { name: '保存为方案 A' }));
    change(/^假设销售价格/, '5');
    openDetails();const table = screen.getByRole('table', { name: '两方案经营结果比较' });
    const profitRow = within(table).getByRole('row', { name: /利润/ });
    expect(profitRow.textContent).toContain('6,000 元');
    expect(profitRow.textContent).toContain('10,000 元');
    expect(profitRow.textContent).toContain('4,000 元');
    rendered.unmount(); render(view('chaoyang'));
    expect(screen.getByRole('table', { name: '两方案经营结果比较' })).toBeTruthy();
    expect((screen.getByLabelText(/^假设销售价格/) as HTMLInputElement).value).toBe('5');
  });
  it('opens evidence in the same city and changes the historical chart metric', () => {
    render(view('chaoyang'));openDetails();
    fireEvent.click(screen.getByRole('button', { name: '查看本城数据依据' }));
    expect(screen.getByLabelText('证据抽屉').textContent).toContain('chaoyang');
    expect(screen.queryByRole('button',{name:'为什么？看历史气候依据'})).toBeNull();
    change('历史气候指标', 'mean_temp_c');
    expect(screen.getByRole('img', { name: '2010至2025年全年平均气温历史序列，单位℃' })).toBeTruthy();
  });
  it('supports self-entered plans when observations fail without inventing local facts', () => {
    vi.mocked(useObservations).mockReturnValue({ status: 'error', error: '观测连接失败。' });
    render(view('jinzhou'));
    expect(screen.getByRole('alert').textContent).toContain('仍可填写自定义作物');
    change('计划作物', '__custom__'); change('作物名称', '土豆');
    change(/^种植面积/, '1'); change(/^预计亩产/, '100'); change(/^每亩总成本/, '50'); change(/^假设销售价格/, '1'); change(/^可销售比例/, '100');
    fireEvent.click(screen.getByRole('button', { name: '核算我的计划' }));
    expect(results().getByText('土豆 · 1 亩')).toBeTruthy();
    expect(results().getAllByText('50 元')).toHaveLength(2);
    expect(screen.queryByRole('img', { name: /历史序列/ })).toBeNull();
  });

  it('restores the current calculated result and historical metric after unmounting, without needing another submit', () => {
    const rendered = render(view('dandong')); fill();
    change('历史气候指标', 'growing_season_mean_temp_c');
    rendered.unmount(); render(view('dandong'));openDetails();
    expect(results().getByText('利润').nextElementSibling?.textContent).toBe('6,000 元');
    expect(screen.getByRole('img', { name: /利润敏感性/ })).toBeTruthy();
    expect(within(screen.getByRole('group',{name:'历史气候指标'})).getByRole('button',{name:'生长季平均气温',pressed:true})).toBeTruthy();
    expect(useAppContext.getState()).toMatchObject({ cityId: 'dandong', crop: '玉米' });
  });

  it('restores each crop calculation independently and never revives stale output after invalid editing', () => {
    const rendered = render(view('jinzhou')); fill();
    change('计划作物', '大豆');
    expect(results().queryByText('利润')).toBeNull();
    change('计划作物', '玉米');
    expect(results().getByText('利润').nextElementSibling?.textContent).toBe('6,000 元');
    change(/^假设销售价格/, '-1');
    expect(results().queryByText('利润')).toBeNull();
    rendered.unmount(); render(view('jinzhou'));
    expect(results().queryByText('利润')).toBeNull();
    expect(screen.queryByRole('img', { name: /利润敏感性/ })).toBeNull();
    expect((screen.getByLabelText(/^假设销售价格/) as HTMLInputElement).value).toBe('-1');
  });

  it('rejects a mismatched persisted calculation snapshot while preserving editable user conditions', () => {
    const rendered = render(view('dalian')); fill();
    rendered.unmount();
    const stored = JSON.parse(sessionStorage.getItem('agriscope:v4:planning:dalian')!);
    stored.drafts['玉米'].pricePerKg = '6'; // 当前条件变化，旧核算标记不得复用
    sessionStorage.setItem('agriscope:v4:planning:dalian', JSON.stringify(stored));
    render(view('dalian'));
    expect(results().queryByText('利润')).toBeNull();
    expect((screen.getByLabelText(/^假设销售价格/) as HTMLInputElement).value).toBe('6');
    fireEvent.click(screen.getByRole('button', { name: '核算我的计划' }));
    expect(results().getByText('利润').nextElementSibling?.textContent).toBe('14,000 元');
  });

  it('persists recalculated edits and carries crop/date/horizon through an actual research round trip', () => {
    function RouteBridge() {
      useContextUrlSync();
      const location = useLocation();
      const navigate=useNavigate();return <><output aria-label="当前路由">{location.pathname}{location.search}</output><button onClick={()=>navigate(cityContextUrl('/cities/chaoyang','chaoyang'))}>进入朝阳正式研究 →</button></>;
    }
    function ResearchReturn() {
      const navigate = useNavigate();
      return <button onClick={() => navigate(cityContextUrl('/cities/chaoyang/decision', 'chaoyang'))}>返回经营计划</button>;
    }
    const initial = '/cities/chaoyang/decision?city=chaoyang&horizon=30&as_of=2026-09-14&view=planning';
    const routeTree = <><RouteBridge/><Routes><Route path="/cities/chaoyang/decision" element={<PlanningWorkbench cityId="chaoyang"/>}/><Route path="/cities/chaoyang" element={<ResearchReturn/>}/></Routes></>;
    const rendered = render(<MemoryRouter initialEntries={[initial]}>{routeTree}</MemoryRouter>);
    fill();
    const query = new URLSearchParams(screen.getByLabelText('当前路由').textContent!.split('?')[1]);
    expect(query.get('crop')).toBe('玉米'); expect(query.get('horizon')).toBe('30');
    expect(query.get('as_of')).toBe('2026-09-14'); expect(query.get('view')).toBe('planning');
    expect(useAppContext.getState()).toMatchObject({ cityId: 'chaoyang', crop: '玉米', horizon: 30, asOf: '2026-09-14' });
    fireEvent.click(screen.getByRole('button', { name: '保存为方案 A' }));
    change(/^假设销售价格/, '5');
    change('历史气候指标', 'mean_temp_c');
    fireEvent.click(screen.getByRole('button', { name: '进入朝阳正式研究 →' }));
    expect(screen.queryByRole('region', { name: '经营核算结果' })).toBeNull();
    const researchQuery = new URLSearchParams(screen.getByLabelText('当前路由').textContent!.split('?')[1]);
    expect(researchQuery.get('crop')).toBe('玉米'); expect(researchQuery.get('horizon')).toBe('30'); expect(researchQuery.get('as_of')).toBe('2026-09-14');
    fireEvent.click(screen.getByRole('button', { name: '返回经营计划' }));openDetails();
    expect(results().getByText('利润').nextElementSibling?.textContent).toBe('10,000 元');
    expect(screen.getByRole('table', { name: '两方案经营结果比较' })).toBeTruthy();
    expect(within(screen.getByRole('group',{name:'历史气候指标'})).getByRole('button',{name:'全年平均气温',pressed:true})).toBeTruthy();
    const returnUrl = screen.getByLabelText('当前路由').textContent!;
    rendered.unmount();
    render(<MemoryRouter initialEntries={[returnUrl]}>{routeTree}</MemoryRouter>);
    expect(results().getByText('利润').nextElementSibling?.textContent).toBe('10,000 元');
    expect(screen.getByLabelText('当前路由').textContent).toBe(returnUrl); // 无反向 effect 注入或覆盖参数
  });

  it('synchronizes self-entered crop choice and removes the previous crop on clearing', () => {
    function LocationProbe() { const location = useLocation(); return <output aria-label="当前路由">{location.search}</output>; }
    render(<MemoryRouter initialEntries={['/cities/tieling/decision?city=tieling&horizon=7&as_of=2026-09-14']}><LocationProbe/><PlanningWorkbench cityId="tieling"/></MemoryRouter>);
    change('计划作物', '__custom__'); change('作物名称', '草莓');
    expect(useAppContext.getState()).toMatchObject({ cityId: 'tieling', crop: '草莓', horizon: 7, asOf: '2026-09-14' });
    expect(new URLSearchParams(screen.getByLabelText('当前路由').textContent!).get('crop')).toBe('草莓');
    change('作物名称', '');
    expect(useAppContext.getState().crop).toBeNull();
    expect(new URLSearchParams(screen.getByLabelText('当前路由').textContent!).has('crop')).toBe(false);
  });
});
