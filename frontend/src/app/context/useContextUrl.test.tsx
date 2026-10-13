// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { useContextUrlSync } from './useContextUrl';
import { resetAppContext, useAppContext } from './appContext';
import { provinceUrl, selectedCityFromSearch } from './provinceSelection';
import { StrictMode } from 'react';
function Bridge() {
  useContextUrlSync();
  const location = useLocation();
  const navigate = useNavigate();
  const city = useAppContext(s => s.cityId);
  return <><output data-testid="url">{location.pathname}{location.search}</output><output data-testid="city">{city ?? 'province'}</output><button onClick={() => navigate(provinceUrl('chaoyang'))}>朝阳</button><button onClick={() => navigate(provinceUrl('jinzhou'))}>锦州</button><button onClick={() => navigate(provinceUrl(null))}>全省</button><button onClick={() => navigate(-1)}>后退</button><button onClick={() => navigate(1)}>前进</button></>;
}
const open = (url: string) => render(<StrictMode><MemoryRouter initialEntries={[url]}><Bridge /></MemoryRouter></StrictMode>);
beforeEach(() => { cleanup(); resetAppContext(); });
describe('V4 路由单向恢复', () => {
  it.each(['/', '/liaoning'])('无参数 %s 保持纯净且清除旧城市', url => {
    useAppContext.getState().setCity('shenyang');
    open(url);
    expect(screen.getByTestId('url').textContent).toBe(url);
    expect(screen.getByTestId('city').textContent).toBe('province');
  });
  it('路径城市优先于冲突 query，决策条件完整恢复', () => {
    open('/cities/dandong/decision?city=shenyang&crop=玉米&horizon=30&as_of=2026-09-14');
    expect(screen.getByTestId('city').textContent).toBe('dandong');
    expect(useAppContext.getState()).toMatchObject({ crop: '玉米', horizon: 30, asOf: '2026-09-14' });
    expect(screen.getByTestId('url').textContent).toContain('city=shenyang'); // no competing write effect
  });
  it.each(['shenyang', 'dalian', 'tieling'])('直接进入 %s 报告路径恢复共享城市，优先于旧状态和冲突 query', city => {
    useAppContext.getState().setCity('dandong');
    open(`/reports/${city}?city=chaoyang&crop=土豆&horizon=30`);
    expect(screen.getByTestId('city').textContent).toBe(city);
    expect(useAppContext.getState()).toMatchObject({ crop: '土豆', horizon: 30 });
  });
  it('辽宁综合报告明确恢复省级，不继承上一次城市或冲突 query', () => {
    useAppContext.getState().setCity('shenyang');
    open('/reports/liaoning?city=dalian');
    expect(screen.getByTestId('city').textContent).toBe('province');
  });
  it('连续切城、返回全省、POP 与前进准确恢复，无周期注入', () => {
    open('/liaoning');
    fireEvent.click(screen.getByText('朝阳'));
    fireEvent.click(screen.getByText('锦州'));
    expect(screen.getByTestId('city').textContent).toBe('jinzhou');
    fireEvent.click(screen.getByText('全省'));
    expect(screen.getByTestId('url').textContent).toBe('/liaoning');
    fireEvent.click(screen.getByText('后退'));
    expect(screen.getByTestId('url').textContent).toBe('/liaoning?city=jinzhou');
    fireEvent.click(screen.getByText('后退'));
    expect(screen.getByTestId('city').textContent).toBe('chaoyang');
    fireEvent.click(screen.getByText('前进'));
    expect(screen.getByTestId('city').textContent).toBe('jinzhou');
  });
  it('非法 city 不产生隐藏默认城市', () => {
    expect(selectedCityFromSearch('?city=unknown')).toBeNull();
    open('/liaoning?city=unknown');
    expect(screen.getByTestId('city').textContent).toBe('province');
  });
});
