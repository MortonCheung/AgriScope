// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { resetAppContext, useAppContext } from './appContext';
import { navigationContext, primaryNavigationTarget, rememberReportLocation } from './navigationContext';

beforeEach(() => { window.sessionStorage.clear(); resetAppContext(); });
const context = { cityId: 'shenyang', crop: '黄瓜', horizon: 14 as const, asOf: '2026-10-06' };

describe('全局任务入口保留实际观察上下文', () => {
  it('路径城市优先于query和旧上下文；正式条件从当前URL取', () => {
    const location = { pathname: '/cities/dandong/decision', search: '?city=chaoyang&crop=玉米&horizon=30&as_of=2026-09-14' };
    expect(navigationContext(location, context)).toEqual({ cityId: 'dandong', crop: '玉米', horizon: 30, asOf: '2026-09-14' });
    const target = primaryNavigationTarget('decision', location, context);
    expect(target.split('?')[0]).toBe('/cities/dandong/decision');
    expect(Object.fromEntries(new URLSearchParams(target.split('?')[1]))).toEqual({ city: 'dandong', crop: '玉米', horizon: '30', as_of: '2026-09-14' });
  });

  it('无选城主页不继承上次沈阳；选城主页和其他任务保留明确选择', () => {
    expect(primaryNavigationTarget('decision', { pathname: '/liaoning', search: '' }, context)).toBe('/decision');
    expect(primaryNavigationTarget('reports', { pathname: '/', search: '' }, context)).toBe('/reports');
    expect(primaryNavigationTarget('home', { pathname: '/cities/dandong/decision', search: '' }, context)).toBe('/liaoning?city=dandong');
    expect(primaryNavigationTarget('decision', { pathname: '/liaoning', search: '?city=tieling' }, context)).toContain('/cities/tieling/decision?');
  });
  it('辽宁报告的路径范围优先于上一城市和 query，城市报告仍以路径为准', () => {
    expect(navigationContext({ pathname: '/reports/liaoning', search: '?city=dalian' }, context).cityId).toBeNull();
    expect(primaryNavigationTarget('home', { pathname: '/reports/liaoning', search: '' }, context)).toBe('/liaoning');
    expect(navigationContext({ pathname: '/reports/tieling', search: '?city=dalian' }, context).cityId).toBe('tieling');
  });

  it('报告任务直达当前城市，不经过省域中转，也不继承旧研究点、阅读模式或决策 plan', () => {
    rememberReportLocation({ pathname: '/cities/shenyang/research/A2.2', search: '?mode=article&city=dandong&plan=old' });
    rememberReportLocation({ pathname: '/cities/dandong/research/A7', search: '?mode=article&research=A2.2&view=result' });
    const sy = primaryNavigationTarget('reports', { pathname: '/cities/shenyang/decision', search: '?crop=西红柿&horizon=30' }, context);
    expect(sy.split('?')[0]).toBe('/reports/shenyang');
    const query = new URLSearchParams(sy.split('?')[1]);
    expect(query.has('mode')).toBe(false);
    expect(query.get('crop')).toBe('西红柿');
    expect(query.has('plan')).toBe(false);
    const dd = primaryNavigationTarget('reports', { pathname: '/cities/dandong/decision', search: '' }, context);
    expect(dd.split('?')[0]).toBe('/reports/dandong');
    expect(new URLSearchParams(dd.split('?')[1]).get('city')).toBe('dandong');
    expect(new URLSearchParams(dd.split('?')[1]).has('research')).toBe(false);
    expect(primaryNavigationTarget('reports', { pathname: '/cities/tieling/decision', search: '' }, context).split('?')[0]).toBe('/reports/tieling');
  });

  it('旧研究定位仍登记，但不会改变新报告任务入口', () => {
    rememberReportLocation({ pathname: '/cities/shenyang', search: '?research=A3.9&mode=article' });
    rememberReportLocation({ pathname: '/cities/shenyang/decision', search: '?view=compare' });
    const target = primaryNavigationTarget('reports', { pathname: '/decision', search: '' }, context);
    const query = new URLSearchParams(target.split('?')[1]);
    expect(query.has('research')).toBe(false);
    expect(query.has('mode')).toBe(false);
    expect(query.get('city')).toBe('shenyang');
    expect(query.has('view')).toBe(false);
  });

  it('非法城市和外部报告定位不能成为正式导航目标', () => {
    useAppContext.setState(context);
    expect(primaryNavigationTarget('decision', { pathname: '/cities/unknown', search: '' })).toBe('/decision');
    window.sessionStorage.setItem('agriscope.report-locations.v4-final', JSON.stringify({ shenyang: 'https://example.org', dandong: '/cities/shenyang/research/A2' }));
    expect(primaryNavigationTarget('reports', { pathname: '/cities/shenyang/decision', search: '' }).split('?')[0]).toBe('/reports/shenyang');
  });
});
